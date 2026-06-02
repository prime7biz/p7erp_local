"""Merch alerts: persisted engine + saved views + legacy aggregate critical-alerts."""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import (
    AlertComment,
    AlertDefinition,
    AlertEscalationLog,
    AlertHistory,
    AlertInstance,
    AlertRelatedEntity,
    AlertSavedView,
    AlertScanLog,
    Followup,
    Order,
    Tenant,
    User,
)
from app.modules.merch.deps import ensure_tenant as _ensure_tenant
from app.modules.merch.permissions import (
    MERCH_PERMISSION_ALERT_ASSIGN,
    MERCH_PERMISSION_ALERT_DEFINITIONS,
    MERCH_PERMISSION_ALERT_SCAN,
    require_merch_permission,
)

router = APIRouter(tags=["merch"])

# ---------- Persisted alert engine (definitions, instances, views, scan) ----------

class AlertStatusUpdateBody(BaseModel):
    status: str = Field(
        ...,
        description="acknowledged | in_progress | waiting_on_buyer | waiting_on_supplier | resolved | closed | escalated | dismissed",
    )

    @field_validator("status")
    @classmethod
    def _status_allowed(cls, v: str) -> str:
        allowed = {
            "acknowledged",
            "in_progress",
            "waiting_on_buyer",
            "waiting_on_supplier",
            "resolved",
            "closed",
            "escalated",
            "dismissed",
            "open",
            "snoozed",
        }
        s = (v or "").strip().lower()
        if s not in allowed:
            raise ValueError(f"Invalid alert status. Allowed: {', '.join(sorted(allowed))}")
        return s


class AlertSnoozeBody(BaseModel):
    snoozed_until: datetime


class AlertAssignBody(BaseModel):
    assigned_to_id: int | None


class AlertMutationOut(BaseModel):
    id: int
    status: str
    assigned_to_id: int | None
    acknowledged_at: datetime | None
    acknowledged_by_id: int | None
    resolved_at: datetime | None
    resolved_by_id: int | None
    snoozed_until: datetime | None
    escalated_at: datetime | None
    escalation_level: int | None
    updated_at: datetime | None


def _alert_mutation_out(row: AlertInstance) -> AlertMutationOut:
    return AlertMutationOut(
        id=row.id,
        status=row.status,
        assigned_to_id=row.assigned_to_id,
        acknowledged_at=row.acknowledged_at,
        acknowledged_by_id=row.acknowledged_by_id,
        resolved_at=row.resolved_at,
        resolved_by_id=row.resolved_by_id,
        snoozed_until=row.snoozed_until,
        escalated_at=row.escalated_at,
        escalation_level=row.escalation_level,
        updated_at=row.updated_at,
    )


def _alert_priority_score(alert: AlertInstance, now: datetime) -> int:
    severity_weight = {
        "critical": 100,
        "high": 70,
        "medium": 40,
        "low": 20,
        "informational": 10,
    }.get((alert.severity or "").lower(), 10)
    age_hours = 0
    if alert.created_at:
        age_hours = max(0, int((now - alert.created_at).total_seconds() // 3600))
    escalation_weight = int(alert.escalation_level or 0) * 15
    return severity_weight + min(age_hours, 240) + escalation_weight


def _alert_sla_bucket(alert: AlertInstance, now: datetime) -> str:
    if (alert.status or "").lower() in {"resolved", "closed"}:
        return "met"
    age_hours = 0
    if alert.created_at:
        age_hours = max(0, int((now - alert.created_at).total_seconds() // 3600))
    sev = (alert.severity or "").lower()
    breach_hours = {"critical": 24, "high": 48, "medium": 72, "low": 120, "informational": 168}.get(sev, 72)
    return "breach" if age_hours > breach_hours else "at_risk"


class AlertDefinitionOut(BaseModel):
    id: int
    rule_key: str
    name: str
    description: str | None
    severity_default: str
    entity_type: str
    is_system: bool
    is_enabled: bool
    config_json: dict | None = None


class AlertDefinitionPatch(BaseModel):
    is_enabled: bool | None = None
    config_json: dict | None = None


@router.get("/alert-definitions", response_model=list[AlertDefinitionOut])
async def list_alert_definitions(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tenant-scoped alert rule definitions (enable/disable and JSON config per rule)."""
    from app.modules.merch.alert_engine import ensure_definitions_for_tenant as _seed_defs

    _ensure_tenant(user, tenant)
    await _seed_defs(db, tenant.id)
    result = await db.execute(
        select(AlertDefinition).where(AlertDefinition.tenant_id == tenant.id).order_by(AlertDefinition.rule_key)
    )
    rows = result.scalars().all()
    return [
        AlertDefinitionOut(
            id=r.id,
            rule_key=r.rule_key,
            name=r.name,
            description=r.description,
            severity_default=r.severity_default,
            entity_type=r.entity_type,
            is_system=r.is_system,
            is_enabled=r.is_enabled,
            config_json=r.config_json if isinstance(r.config_json, dict) else None,
        )
        for r in rows
    ]


@router.patch("/alert-definitions/{definition_id}", response_model=AlertDefinitionOut)
async def patch_alert_definition(
    definition_id: int,
    body: AlertDefinitionPatch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_ALERT_DEFINITIONS)),
):
    _ensure_tenant(user, tenant)
    row = await db.get(AlertDefinition, definition_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert definition not found")
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    if body.config_json is not None:
        row.config_json = body.config_json
    await db.flush()
    await db.refresh(row)
    return AlertDefinitionOut(
        id=row.id,
        rule_key=row.rule_key,
        name=row.name,
        description=row.description,
        severity_default=row.severity_default,
        entity_type=row.entity_type,
        is_system=row.is_system,
        is_enabled=row.is_enabled,
        config_json=row.config_json if isinstance(row.config_json, dict) else None,
    )


@router.get("/alerts")
async def list_alerts(
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    alert_type: str | None = Query(default=None, alias="alert_type"),
    entity_type: str | None = Query(default=None, alias="entity_type"),
    entity_id: int | None = Query(default=None, alias="entity_id"),
    order_id: int | None = Query(default=None),
    assigned_to_id: int | None = Query(default=None),
    min_priority_score: int | None = Query(default=None, ge=0),
    sla_bucket: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE, description="Max rows per page (Finding #3)"),
    sort: str = Query(default="-created_at"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List persisted alerts with filters and pagination."""
    _ensure_tenant(user, tenant)
    stmt = select(AlertInstance).where(AlertInstance.tenant_id == tenant.id)
    if entity_type:
        stmt = stmt.join(AlertDefinition, AlertInstance.definition_id == AlertDefinition.id).where(
            AlertDefinition.tenant_id == tenant.id,
            AlertDefinition.entity_type == entity_type.strip().lower(),
        )
    if entity_id is not None:
        rel_sub = select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant.id,
            AlertRelatedEntity.entity_id == entity_id,
        )
        if entity_type:
            rel_sub = rel_sub.where(AlertRelatedEntity.entity_type == entity_type.strip().lower())
        stmt = stmt.where(AlertInstance.id.in_(rel_sub))
    if severity:
        stmt = stmt.where(AlertInstance.severity == severity.lower())
    if status_filter:
        stmt = stmt.where(AlertInstance.status == status_filter.lower())
    if alert_type:
        stmt = stmt.where(AlertInstance.alert_type == alert_type)
    if assigned_to_id is not None:
        stmt = stmt.where(AlertInstance.assigned_to_id == assigned_to_id)
    if order_id is not None:
        sub = select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant.id,
            AlertRelatedEntity.entity_type == "order",
            AlertRelatedEntity.entity_id == order_id,
        )
        stmt = stmt.where(AlertInstance.id.in_(sub))
    # Exclude snoozed that are still in future (use timezone-aware now to match TIMESTAMPTZ created_at)
    now = datetime.now(timezone.utc)
    stmt = stmt.where(
        or_(
            AlertInstance.snoozed_until.is_(None),
            AlertInstance.snoozed_until <= now,
        )
    )
    needs_python_pagination = (
        min_priority_score is not None
        or (sla_bucket is not None and sla_bucket.strip() != "")
        or sort.lstrip("-") == "priority_score"
    )
    total_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = total_result.scalar() or 0
    sort_col = AlertInstance.created_at
    if sort.lstrip("-") == "created_at":
        sort_col = AlertInstance.created_at
    elif sort.lstrip("-") == "updated_at":
        sort_col = AlertInstance.updated_at
    elif sort.lstrip("-") == "severity":
        sort_col = AlertInstance.severity
    if sort.startswith("-"):
        stmt = stmt.order_by(sort_col.desc())
    else:
        stmt = stmt.order_by(sort_col.asc())
    if not needs_python_pagination:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    # Enrich with order_id / order_code from related_entity
    items = []
    normalized_sla_bucket = (sla_bucket or "").strip().lower() or None
    for r in rows:
        primary_rel_result = await db.execute(
            select(AlertRelatedEntity).where(
                AlertRelatedEntity.alert_id == r.id,
                AlertRelatedEntity.role == "primary",
            ).limit(1)
        )
        primary_rel = primary_rel_result.scalar_one_or_none()
        order_code = None
        link_order_id = None
        link_entity_type = primary_rel.entity_type if primary_rel else None
        link_entity_id = primary_rel.entity_id if primary_rel else None
        if primary_rel and primary_rel.entity_type == "order":
            link_order_id = primary_rel.entity_id
            order_row = await db.get(Order, primary_rel.entity_id)
            if order_row and order_row.tenant_id == tenant.id:
                order_code = order_row.order_code
        priority_score = _alert_priority_score(r, now)
        item_sla_bucket = _alert_sla_bucket(r, now)
        item = {
            "id": r.id,
            "natural_key": r.natural_key,
            "title": r.title,
            "description": r.description,
            "severity": r.severity,
            "status": r.status,
            "alert_type": r.alert_type,
            "assigned_to_id": r.assigned_to_id,
            "entity_type": link_entity_type,
            "entity_id": link_entity_id,
            "order_id": link_order_id,
            "order_code": order_code,
            "reason_text": r.reason_text,
            "recommended_action": r.recommended_action,
            "evidence_json": r.evidence_json,
            "priority_score": priority_score,
            "sla_bucket": item_sla_bucket,
            "snoozed_until": r.snoozed_until.isoformat() if r.snoozed_until else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        if min_priority_score is not None and priority_score < min_priority_score:
            continue
        if normalized_sla_bucket and normalized_sla_bucket != item_sla_bucket:
            continue
        items.append(item)
    if sort.lstrip("-") == "priority_score":
        items.sort(key=lambda x: x["priority_score"], reverse=sort.startswith("-"))
    if needs_python_pagination:
        total = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        items = items[start:end]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/alerts/summary")
async def get_alerts_summary(
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    alert_type: str | None = Query(default=None, alias="alert_type"),
    entity_type: str | None = Query(default=None, alias="entity_type"),
    entity_id: int | None = Query(default=None, alias="entity_id"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """KPI counts for alert center (critical, high, medium, low, total)."""
    _ensure_tenant(user, tenant)
    now = datetime.now(timezone.utc)
    stmt = select(AlertInstance.severity, func.count()).where(
        AlertInstance.tenant_id == tenant.id,
        or_(
            AlertInstance.snoozed_until.is_(None),
            AlertInstance.snoozed_until <= now,
        ),
    )
    if severity:
        stmt = stmt.where(AlertInstance.severity == severity)
    if status_filter:
        stmt = stmt.where(AlertInstance.status == status_filter)
    if alert_type:
        stmt = stmt.where(AlertInstance.alert_type == alert_type.strip())
    if entity_type:
        stmt = stmt.join(AlertDefinition, AlertInstance.definition_id == AlertDefinition.id).where(
            AlertDefinition.tenant_id == tenant.id,
            AlertDefinition.entity_type == entity_type.strip().lower(),
        )
    if entity_id is not None:
        rel_sub = select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant.id,
            AlertRelatedEntity.entity_id == entity_id,
        )
        if entity_type:
            rel_sub = rel_sub.where(AlertRelatedEntity.entity_type == entity_type.strip().lower())
        stmt = stmt.where(AlertInstance.id.in_(rel_sub))
    stmt = stmt.group_by(AlertInstance.severity)
    by_sev = await db.execute(stmt)
    counts = {row[0]: row[1] for row in by_sev.all()}
    total = sum(counts.values())
    last_scan = await db.scalar(
        select(func.max(AlertScanLog.finished_at)).where(
            AlertScanLog.tenant_id == tenant.id,
            AlertScanLog.status == "completed",
            AlertScanLog.finished_at.isnot(None),
        )
    )
    return {
        "by_severity": {
            "critical": counts.get("critical", 0),
            "high": counts.get("high", 0),
            "medium": counts.get("medium", 0),
            "low": counts.get("low", 0),
            "informational": counts.get("informational", 0),
        },
        "total": total,
        "last_completed_scan_at": last_scan.isoformat() if last_scan else None,
    }


# Static paths must be registered before /alerts/{alert_id} or "views" is parsed as alert_id (422).
@router.get("/alerts/views")
async def list_alert_views(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved filter views for current user."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(AlertSavedView)
        .where(
            AlertSavedView.tenant_id == tenant.id,
            AlertSavedView.user_id == user.id,
        )
        .order_by(AlertSavedView.name.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "filter_json": r.filter_json,
            "is_default": r.is_default,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/alerts/{alert_id}")
async def get_alert_detail(
    alert_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single alert for detail drawer."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    rels = await db.execute(
        select(AlertRelatedEntity).where(
            AlertRelatedEntity.alert_id == alert_id,
            AlertRelatedEntity.tenant_id == tenant.id,
        )
    )
    related = rels.scalars().all()
    order_id = None
    order_code = None
    for rel in related:
        if rel.entity_type == "order":
            order_id = rel.entity_id
            o = await db.get(Order, rel.entity_id)
            if o and o.tenant_id == tenant.id:
                order_code = o.order_code
            break
    now = datetime.now(timezone.utc)
    primary_et = None
    primary_eid = None
    for rel in related:
        if rel.role == "primary":
            primary_et = rel.entity_type
            primary_eid = rel.entity_id
            break
    return {
        "id": row.id,
        "natural_key": row.natural_key,
        "title": row.title,
        "description": row.description,
        "severity": row.severity,
        "status": row.status,
        "alert_type": row.alert_type,
        "assigned_to_id": row.assigned_to_id,
        "entity_type": primary_et,
        "entity_id": primary_eid,
        "order_id": order_id,
        "order_code": order_code,
        "reason_text": row.reason_text,
        "recommended_action": row.recommended_action,
        "evidence_json": row.evidence_json,
        "priority_score": _alert_priority_score(row, now),
        "sla_bucket": _alert_sla_bucket(row, now),
        "snoozed_until": row.snoozed_until.isoformat() if row.snoozed_until else None,
        "escalated_at": row.escalated_at.isoformat() if row.escalated_at else None,
        "escalation_level": row.escalation_level,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
    }


@router.patch("/alerts/{alert_id}/status", response_model=AlertMutationOut)
async def update_alert_status(
    alert_id: int,
    body: AlertStatusUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update alert status (acknowledged, in_progress, resolved, etc.)."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    old_status = row.status
    row.status = body.status
    if body.status in ("resolved", "closed"):
        row.resolved_at = datetime.now(timezone.utc)
        row.resolved_by_id = user.id
    elif body.status == "acknowledged":
        row.acknowledged_at = datetime.now(timezone.utc)
        row.acknowledged_by_id = user.id
    hist = AlertHistory(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        action="status_change",
        field_name="status",
        old_value=old_status,
        new_value=row.status,
    )
    db.add(hist)
    await db.flush()
    await db.refresh(row)
    return _alert_mutation_out(row)


@router.post("/alerts/{alert_id}/snooze", response_model=AlertMutationOut)
async def snooze_alert(
    alert_id: int,
    body: AlertSnoozeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Snooze alert until given datetime."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    row.status = "snoozed"
    row.snoozed_until = body.snoozed_until
    hist = AlertHistory(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        action="snoozed",
        field_name="snoozed_until",
        new_value=body.snoozed_until.isoformat() if body.snoozed_until else None,
    )
    db.add(hist)
    await db.flush()
    await db.refresh(row)
    return _alert_mutation_out(row)


@router.post("/alerts/{alert_id}/assign", response_model=AlertMutationOut)
async def assign_alert(
    alert_id: int,
    body: AlertAssignBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_ALERT_ASSIGN)),
):
    """Assign alert to a user."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    if body.assigned_to_id is not None:
        assignee = await db.get(User, body.assigned_to_id)
        if not assignee or assignee.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Assignee user not found in this tenant")
    old_val = str(row.assigned_to_id) if row.assigned_to_id else None
    row.assigned_to_id = body.assigned_to_id
    hist = AlertHistory(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        action="assigned",
        field_name="assigned_to_id",
        old_value=old_val,
        new_value=str(body.assigned_to_id) if body.assigned_to_id else None,
    )
    db.add(hist)
    await db.flush()
    await db.refresh(row)
    return _alert_mutation_out(row)


async def _run_scan_background(tenant_id: int) -> None:
    """Background task: run alert scan in its own DB session (avoids request timeout)."""
    from app.database import AsyncSessionLocal
    from app.modules.merch.alert_engine import run_scan
    async with AsyncSessionLocal() as db:
        try:
            await run_scan(db, tenant_id, trigger="manual")
            await db.commit()
        except Exception:
            await safe_async_session_rollback(db)
            raise


@router.post("/alerts/scan")
async def run_alerts_scan(
    background_tasks: BackgroundTasks,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_ALERT_SCAN)),
):
    """Start alert rule scan for current tenant (runs in background; returns immediately)."""
    _ensure_tenant(user, tenant)
    background_tasks.add_task(_run_scan_background, tenant.id)
    return JSONResponse(
        status_code=202,
        content={"status": "accepted", "message": "Scan started in background. List will update shortly."},
    )


class AlertCommentBody(BaseModel):
    body: str
    is_internal: bool = False


class AlertEscalateBody(BaseModel):
    to_level: int = 1
    assigned_to_id: int | None = None
    reason: str | None = None


class AlertSavedViewBody(BaseModel):
    name: str
    description: str | None = None
    filter_json: dict
    is_default: bool = False


@router.get("/alerts/{alert_id}/comments")
async def list_alert_comments(
    alert_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List comments for an alert (lazy-loaded in drawer)."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    result = await db.execute(
        select(AlertComment)
        .where(AlertComment.alert_id == alert_id, AlertComment.tenant_id == tenant.id)
        .order_by(AlertComment.created_at.asc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "user_id": r.user_id,
            "body": r.body,
            "is_internal": r.is_internal,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/alerts/{alert_id}/comments", status_code=201)
async def add_alert_comment(
    alert_id: int,
    body: AlertCommentBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to an alert."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    comment = AlertComment(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        body=body.body,
        is_internal=body.is_internal,
    )
    db.add(comment)
    await db.flush()
    hist = AlertHistory(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        action="comment",
        new_value=str(comment.id),
    )
    db.add(hist)
    await db.flush()
    await db.refresh(comment)
    return {
        "id": comment.id,
        "user_id": comment.user_id,
        "body": comment.body,
        "is_internal": comment.is_internal,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.get("/alerts/{alert_id}/history")
async def list_alert_history(
    alert_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Timeline/history for an alert (lazy-loaded in drawer)."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.alert_id == alert_id, AlertHistory.tenant_id == tenant.id)
        .order_by(AlertHistory.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": h.id,
            "user_id": h.user_id,
            "action": h.action,
            "field_name": h.field_name,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in rows
    ]


@router.post("/alerts/{alert_id}/escalate", response_model=AlertMutationOut)
async def escalate_alert(
    alert_id: int,
    body: AlertEscalateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Escalate alert to a level and optionally assign."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertInstance, alert_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Alert not found")
    if body.assigned_to_id is not None:
        assignee = await db.get(User, body.assigned_to_id)
        if not assignee or assignee.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Assignee user not found in this tenant")
    from_level = row.escalation_level
    row.status = "escalated"
    row.escalated_at = datetime.now(timezone.utc)
    row.escalation_level = body.to_level
    if body.assigned_to_id is not None:
        row.assigned_to_id = body.assigned_to_id
    log = AlertEscalationLog(
        tenant_id=tenant.id,
        alert_id=alert_id,
        from_level=from_level,
        to_level=body.to_level,
        assigned_to_id=body.assigned_to_id,
        reason=body.reason,
        created_by_id=user.id,
    )
    db.add(log)
    hist = AlertHistory(
        tenant_id=tenant.id,
        alert_id=alert_id,
        user_id=user.id,
        action="escalated",
        field_name="escalation_level",
        old_value=str(from_level) if from_level is not None else None,
        new_value=str(body.to_level),
    )
    db.add(hist)
    await db.flush()
    await db.refresh(row)
    return _alert_mutation_out(row)


@router.post("/alerts/views", status_code=201)
async def create_alert_view(
    body: AlertSavedViewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save current filter state as a named view."""
    _ensure_tenant(user, tenant)
    if body.is_default:
        default_rows = (await db.execute(
            select(AlertSavedView).where(
                AlertSavedView.tenant_id == tenant.id,
                AlertSavedView.user_id == user.id,
                AlertSavedView.is_default == True,
            )
        )).scalars().all()
        for r in default_rows:
            r.is_default = False
    row = AlertSavedView(
        tenant_id=tenant.id,
        user_id=user.id,
        name=body.name,
        description=body.description,
        filter_json=body.filter_json,
        is_default=body.is_default,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "filter_json": row.filter_json,
        "is_default": row.is_default,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/alerts/views/{view_id}", status_code=204)
async def delete_alert_view(
    view_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved view."""
    _ensure_tenant(user, tenant)
    row = await db.get(AlertSavedView, view_id)
    if not row or row.tenant_id != tenant.id or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved view not found")
    await db.delete(row)
    await db.flush()


@router.get("/critical-alerts")
async def get_critical_alerts(
    wastage_threshold_pct: float | None = Query(default=15.0, description="Include wastage alerts above this %"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Legacy aggregate: overdue simple follow-ups plus high-wastage rows from the wastage report."""
    from app.modules.merch.routers.wastage import get_wastage_report

    _ensure_tenant(user, tenant)
    overdue = await db.execute(
        select(Followup).where(
            and_(
                Followup.tenant_id == tenant.id,
                Followup.status != "DONE",
                Followup.due_date.is_not(None),
                Followup.due_date < date.today(),
            )
        )
    )
    rows = overdue.scalars().all()
    alerts: list[dict] = [
        {
            "id": f"followup-{r.id}",
            "severity": "critical" if (date.today() - r.due_date).days > 7 else "warning",
            "category": "Order Follow-up",
            "title": r.title,
            "description": f"Order #{r.order_id} overdue by {(date.today() - r.due_date).days} day(s)",
            "order_id": r.order_id,
        }
        for r in rows
        if r.due_date is not None
    ]
    wastage_rows = await get_wastage_report(
        order_id=None,
        style_id=None,
        date_from=None,
        date_to=None,
        threshold_pct=wastage_threshold_pct,
        tenant=tenant,
        user=user,
        db=db,
    )
    for r in wastage_rows:
        alerts.append({
            "id": f"wastage-{r.order_id}-{r.item_id}",
            "severity": "warning",
            "category": "High Wastage",
            "title": f"Order {r.order_code} · {r.item_code}",
            "description": f"Wastage vs BOM: {r.wastage_pct_vs_bom:+.1f}% (expected {r.expected_qty}, actual {r.actual_qty})",
            "order_id": r.order_id,
            "style_id": r.style_id,
            "item_id": r.item_id,
        })
    return {
        "summary": {
            "critical": len([a for a in alerts if a["severity"] == "critical"]),
            "warning": len([a for a in alerts if a["severity"] == "warning"]),
            "total": len(alerts),
        },
        "alerts": alerts,
    }
