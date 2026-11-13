"""Plan revisions, tentative demand and planning settings (Manufacturing Intelligence Phase 2, run R3).

Prefix ``/api/v1/mfg-intelligence`` (shared with the read-only Phase 1 router and the allocation router).

Every endpoint:
1. needs ``production.planning.read`` (router level) plus the endpoint key listed in the table below
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 unless the tenant flags ``manufacturing_intelligence_v1`` AND ``mfg_integrated_planning_v1`` are true
4. checks tenant ownership of every id in the path / body (another tenant's id looks like "not found")

| Endpoint                                   | Extra permission           |
|--------------------------------------------|----------------------------|
| GET  /bookings                             | -                          |
| POST /plan-revisions/preview, POST /plan-revisions, POST /plan-revisions/{id}/cancel | production.planning.write |
| GET  /plan-revisions, GET /plan-revisions/{id} | -                      |
| POST /plan-revisions/{id}/approve, /reject | production.planning.approve |
| GET  /tentative-demand                     | -                          |
| POST /tentative-bookings, PATCH /tentative-bookings/{id}, POST /tentative-bookings/{id}/cancel | production.planning.write |
| GET  /planning-settings                    | - (read only, never inserts)|
| PUT  /planning-settings                    | production.planning.approve (+ finance gate for Phase 3 money keys) |

Planning settings also open (Phase 3 keys only) when `mfg_cost_intelligence_v1` or `mfg_financial_readiness_v1`
is on without integrated planning, and (Phase 5 keys `frozen_horizon_days`, `changeover_loss_pct` only) when
`mfg_advanced_planning_v1` is on.

Writes commit once at the end of each handler. Four-eyes (`mfg_plan_four_eyes`) is enforced inside the service, so it
applies even when RBAC is off.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.permissions import (
    MANAGER_ONLY_ROLES,
    get_user_role_for_tenant,
    internal_permission_granted,
    require_internal_permission,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    RBAC_MODE_ENFORCE,
    get_tenant_rbac_mode,
    is_mfg_plan_four_eyes_enabled,
)
from app.database import get_db
from app.models import Order, SewingLine, Tenant, User
from app.models.mfg_planning import MfgPlanRevision
from app.modules.mfg_intelligence.calendar_helpers import MAX_WINDOW_DAYS
from app.modules.mfg_intelligence.decimals import dec_str, to_dec
from app.modules.mfg_intelligence.finance_gate import assert_mfg_finance_view, may_view_mfg_finance
from app.modules.mfg_intelligence.flags import (
    advanced_planning_on,
    integrated_planning_on,
    phase3_any_on,
    require_integrated_enabled,
    require_mfg_intelligence_enabled,
)
from app.modules.mfg_intelligence.line_loading_service import MAX_PLAN_ROWS, fetch_live_plan_rows
from app.modules.mfg_intelligence.tentative_demand_service import list_tentative_demand
from app.modules.production import plan_revision_service as prs
from app.modules.production import planning_settings_service as pss
from app.modules.production import tentative_booking_service as tbs
from app.modules.production.plan_revision_service import RevisionItemIn

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-planning"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)

_WRITE = Depends(require_internal_permission("production.planning.write"))
_APPROVE = Depends(require_internal_permission("production.planning.approve"))
MAX_BOOKING_ROWS = 5000
MAX_LIST = 100


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_integrated_enabled(tenant)


async def _has_permission(db: AsyncSession, user: User, tenant: Tenant, key: str) -> bool:
    """Same RBAC modes as the route dependency: off / shadow = allowed, enforce = role must grant the key."""
    if get_tenant_rbac_mode(tenant.feature_flags) != RBAC_MODE_ENFORCE:
        return True
    role = await get_user_role_for_tenant(db, user, tenant.id)
    return internal_permission_granted(role=role, permission_key=key)


def _window(date_from: date, date_to: date) -> None:
    if date_to < date_from:
        raise HTTPException(status_code=422, detail="date_to must be on or after date_from")
    if (date_to - date_from).days + 1 > MAX_WINDOW_DAYS:
        raise HTTPException(status_code=422, detail=f"Date range must not exceed {MAX_WINDOW_DAYS} days")


# ------------------------------------------------------------------ schemas


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RevisionPreviewIn(_In):
    items: list[RevisionItemIn] = Field(..., min_length=1, max_length=50)


class RevisionProposeIn(RevisionPreviewIn):
    reason: str = Field(..., min_length=5, max_length=2000)
    title: str | None = Field(None, max_length=200)
    request_id: str | None = Field(None, min_length=8, max_length=64)

    @field_validator("request_id")
    @classmethod
    def _not_scheduler_prefix(cls, v: str | None) -> str | None:
        # the prefix marks scheduler revisions (frozen fence at approval, convert replay); only the server sets it
        if v is not None and v.startswith(prs.SCHEDULER_REQUEST_PREFIX):
            raise ValueError(f"request_id must not start with '{prs.SCHEDULER_REQUEST_PREFIX}'")
        return v


class RevisionApproveIn(_In):
    expected_lock_version: int = Field(..., ge=0)
    decision_note: str | None = Field(None, max_length=2000)


class RevisionRejectIn(_In):
    decision_note: str = Field(..., min_length=1, max_length=2000)


class StageProbabilityIn(_In):
    INQUIRY: Decimal | None = Field(None, ge=0, le=100)
    QUOTATION: Decimal | None = Field(None, ge=0, le=100)


class PlanningSettingsIn(_In):
    stage_probability: StageProbabilityIn | None = None
    tentative_default_expiry_days: int | None = Field(None, ge=1, le=pss.MAX_EXPIRY_DAYS)
    receipt_buffer_days: int | None = Field(None, ge=0, le=pss.MAX_RECEIPT_BUFFER_DAYS)
    # Phase 3 money / timing keys (need a Phase 3 flag and the finance gate in addition to planning approve)
    export_document_days: int | None = Field(None, ge=0, le=60)
    export_usance_days: int | None = Field(None, ge=0, le=365)
    btb_usance_days: int | None = Field(None, ge=0, le=365)
    cpm_override: Decimal | None = Field(None, gt=0, le=pss.MAX_CPM_OVERRIDE)
    # Phase 5 keys (need mfg_advanced_planning_v1)
    frozen_horizon_days: int | None = Field(None, ge=14, le=60)
    changeover_loss_pct: int | None = Field(None, ge=0, le=100)


_PHASE2_SETTING_KEYS = ("stage_probability", "tentative_default_expiry_days", "receipt_buffer_days")


# ------------------------------------------------------------------ serializers


async def _user_names(db: AsyncSession, tenant_id: int, ids: set[int | None]) -> dict[int, str]:
    real = {int(i) for i in ids if i}
    if not real:
        return {}
    out: dict[int, str] = {}
    for uid, first, last, username in (
        await db.execute(
            select(User.id, User.first_name, User.last_name, User.username).where(
                User.tenant_id == tenant_id, User.id.in_(real)
            )
        )
    ).all():
        name = " ".join(x for x in (first, last) if x).strip() or username or f"User {uid}"
        out[int(uid)] = name
    return out


async def _revision_out(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    rev: MfgPlanRevision,
    *,
    with_items: bool,
    can_approve_perm: bool | None = None,
) -> dict[str, Any]:
    names = await _user_names(db, tenant.id, {rev.proposed_by_user_id, rev.decided_by_user_id})
    if can_approve_perm is None:
        can_approve_perm = await _has_permission(db, user, tenant, "production.planning.approve")
    out: dict[str, Any] = {
        "id": rev.id,
        "revision_no": rev.revision_no,
        "status": rev.status,
        "title": rev.title,
        "reason": rev.reason,
        "request_id": rev.request_id,
        "proposed_by_user_id": rev.proposed_by_user_id,
        "proposed_by_name": names.get(rev.proposed_by_user_id or 0),
        "proposed_at": rev.proposed_at,
        "decided_by_user_id": rev.decided_by_user_id,
        "decided_by_name": names.get(rev.decided_by_user_id or 0),
        "decided_at": rev.decided_at,
        "decision_note": rev.decision_note,
        "applied_at": rev.applied_at,
        "impact": rev.impact_json,
        "lock_version": int(rev.lock_version or 0),
        "can_approve": prs.can_user_approve(tenant, user, rev, has_approve_permission=can_approve_perm),
    }
    if with_items:
        items = await prs.revision_items(db, tenant.id, rev.id)
        out["items"] = [
            {
                "id": i.id,
                "action": i.action,
                "config_id": i.config_id,
                "before": i.before_json,
                "after": i.after_json,
                "before_lock_version": i.before_lock_version,
                "applied_config_id": i.applied_config_id,
                "sort_order": i.sort_order,
            }
            for i in items
        ]
    return out


def _settings_out(raw: dict[str, Any], tenant: Tenant, *, can_view_finance: bool) -> dict[str, Any]:
    """Phase 3 keys appear only while a Phase 3 flag is on (Phase 2 output unchanged otherwise); the CPM override
    is money, so it is hidden from users who do not pass the finance gate."""
    out = dict(raw)
    if not advanced_planning_on(tenant):
        for key in pss.PHASE5_KEYS:
            out.pop(key, None)
    if not phase3_any_on(tenant):
        for key in pss.PHASE3_KEYS:
            out.pop(key, None)
    elif not can_view_finance:
        out[pss.CPM_OVERRIDE_KEY] = None
        out["cpm_override_hidden"] = True
    return out


def _guard_settings(user: User, tenant: Tenant) -> None:
    """Planning settings: integrated planning (Phase 2 keys), a Phase 3 flag (Phase 3 keys) or advanced planning
    (Phase 5 keys) must be on."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_mfg_intelligence_enabled(tenant)
    if not (integrated_planning_on(tenant) or phase3_any_on(tenant) or advanced_planning_on(tenant)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


# ------------------------------------------------------------------ bookings


@router.get("/planning-permissions")
async def planning_permissions(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """What the signed-in user may do on the planning tabs (UI hints only; every endpoint still checks itself)."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_mfg_intelligence_enabled(tenant)
    can_write = await _has_permission(db, user, tenant, "production.planning.write")
    can_approve = await _has_permission(db, user, tenant, "production.planning.approve")
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    return {
        "can_propose": can_write,
        "can_manage_tentative": can_write,
        "can_manage_assignments": can_write,
        "can_approve": can_approve,
        "can_manage_settings": can_approve,
        "can_edit_style_smv": can_approve,
        "can_allocate": await _has_permission(db, user, tenant, "inventory.items.approve"),
        "is_admin_or_manager": (role.name if role else "").strip().lower() in MANAGER_ONLY_ROLES,
        "four_eyes": is_mfg_plan_four_eyes_enabled(tenant.feature_flags),
        # Phase 3 money tabs (cost at completion, cash requirement): same rule as the endpoints, every RBAC mode
        "can_view_finance": await may_view_mfg_finance(db, user, tenant),
    }


@router.get("/bookings")
async def list_bookings(
    date_from: date = Query(...),
    date_to: date = Query(..., description="At most 180 days after date_from"),
    line_id: int | None = Query(None, ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Live line bookings (with `lock_version`) and, separately, tentative bookings in the window."""
    _guard(user, tenant)
    _window(date_from, date_to)
    rows, truncated = await fetch_live_plan_rows(
        db,
        tenant.id,
        window_start=date_from,
        window_end=date_to,
        line_ids=[line_id] if line_id else None,
        lookback_days=0,
    )
    order_ids = {int(r.order_id) for r in rows if r.order_id}
    orders: dict[int, tuple[str, str]] = {}
    if order_ids:
        for oid, code, st in (
            await db.execute(select(Order.id, Order.order_code, Order.status).where(Order.tenant_id == tenant.id, Order.id.in_(order_ids)))
        ).all():
            orders[int(oid)] = (code, st)
    line_ids = {int(r.line_id) for r in rows}
    line_codes: dict[int, str] = {}
    if line_ids:
        line_codes = {
            int(lid): code
            for lid, code in (
                await db.execute(
                    select(SewingLine.id, SewingLine.line_code).where(
                        SewingLine.tenant_id == tenant.id, SewingLine.id.in_(line_ids)
                    )
                )
            ).all()
        }
    bookings = [
        {
            "id": r.id,
            "line_id": r.line_id,
            "line_code": line_codes.get(int(r.line_id)),
            "order_id": r.order_id,
            "order_code": orders.get(int(r.order_id), (None, None))[0] if r.order_id else None,
            "order_status": orders.get(int(r.order_id), (None, None))[1] if r.order_id else None,
            "style_id": r.style_id,
            "ob_id": r.ob_id,
            "shift_id": r.shift_id,
            "reservation_status": (r.reservation_status or "").strip().upper(),
            "start_date": r.start_date,
            "planned_end_date": r.planned_end_date,
            "planned_qty": dec_str(to_dec(r.planned_qty), 3),
            "completed_qty": dec_str(to_dec(r.completed_qty), 3),
            "operator_count": int(r.operator_count or 0),
            "target_efficiency_pct": dec_str(to_dec(r.target_efficiency_pct), 2),
            "smv_per_piece": dec_str(to_dec(r.smv_per_piece), 4),
            "source_smv_type": r.source_smv_type,
            "lock_version": int(r.lock_version or 0),
            "schedule_version": int(r.schedule_version or 0),
        }
        for r in rows
    ][:MAX_BOOKING_ROWS]
    tentative = await list_tentative_demand(
        db, tenant.id, status="ACTIVE", date_from=date_from, date_to=date_to, limit=500, line_id=line_id
    )
    return {
        "date_from": date_from,
        "date_to": date_to,
        "bookings": bookings,
        "tentative_bookings": tentative["items"],
        "truncated": truncated or len(rows) > MAX_BOOKING_ROWS,
        "max_rows": min(MAX_BOOKING_ROWS, MAX_PLAN_ROWS),
    }


# ------------------------------------------------------------------ plan revisions


@router.post("/plan-revisions/preview", dependencies=[_WRITE])
async def preview_revision(
    body: RevisionPreviewIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate the items and show the impact (delivery, overload, material warning). Writes nothing."""
    _guard(user, tenant)
    return await prs.preview(db, tenant, body.items)


@router.post("/plan-revisions", dependencies=[_WRITE])
async def propose_revision(
    body: RevisionProposeIn,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Propose a revision. 201 when created, 200 when the same request_id + payload was already proposed."""
    _guard(user, tenant)
    rev, created = await prs.propose(
        db,
        tenant=tenant,
        user=user,
        items=body.items,
        reason=body.reason,
        title=body.title,
        request_id=body.request_id,
    )
    await db.commit()
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return await _revision_out(db, tenant, user, rev, with_items=True)


@router.get("/plan-revisions")
async def list_revisions(
    status_filter: Literal["PROPOSED", "APPLIED", "REJECTED", "CANCELLED"] | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=MAX_LIST),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    conds = [MfgPlanRevision.tenant_id == tenant.id]
    if status_filter:
        conds.append(MfgPlanRevision.status == status_filter)
    total = (await db.execute(select(func.count()).select_from(MfgPlanRevision).where(*conds))).scalar_one()
    revs = list(
        (
            await db.execute(
                select(MfgPlanRevision).where(*conds).order_by(MfgPlanRevision.id.desc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    perm = await _has_permission(db, user, tenant, "production.planning.approve")
    return {
        "items": [await _revision_out(db, tenant, user, r, with_items=False, can_approve_perm=perm) for r in revs],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


async def _get_revision(db: AsyncSession, tenant_id: int, revision_id: int) -> MfgPlanRevision:
    rev = (
        await db.execute(select(MfgPlanRevision).where(MfgPlanRevision.tenant_id == tenant_id, MfgPlanRevision.id == revision_id))
    ).scalar_one_or_none()
    if rev is None:
        raise HTTPException(status_code=404, detail="Plan revision not found")
    return rev


@router.get("/plan-revisions/{revision_id}")
async def get_revision(
    revision_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    rev = await _get_revision(db, tenant.id, revision_id)
    return await _revision_out(db, tenant, user, rev, with_items=True)


@router.post("/plan-revisions/{revision_id}/approve", dependencies=[_APPROVE])
async def approve_revision(
    revision_id: int,
    body: RevisionApproveIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply the revision in one transaction. 409 (nothing written) when a booking changed since it was proposed."""
    _guard(user, tenant)
    rev, applied_now = await prs.approve_and_apply(
        db,
        tenant=tenant,
        user=user,
        revision_id=revision_id,
        expected_lock_version=body.expected_lock_version,
        decision_note=body.decision_note,
    )
    if applied_now:
        await db.commit()
    out = await _revision_out(db, tenant, user, rev, with_items=True, can_approve_perm=True)
    out["applied_now"] = applied_now
    return out


@router.post("/plan-revisions/{revision_id}/reject", dependencies=[_APPROVE])
async def reject_revision(
    revision_id: int,
    body: RevisionRejectIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    rev, changed = await prs.reject(db, tenant=tenant, user=user, revision_id=revision_id, decision_note=body.decision_note)
    if changed:
        await db.commit()
    out = await _revision_out(db, tenant, user, rev, with_items=True, can_approve_perm=True)
    out["changed"] = changed
    return out


@router.post("/plan-revisions/{revision_id}/cancel", dependencies=[_WRITE])
async def cancel_revision(
    revision_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The proposer or an approver cancels a PROPOSED revision."""
    _guard(user, tenant)
    can_approve = await _has_permission(db, user, tenant, "production.planning.approve")
    rev, changed = await prs.cancel(db, tenant=tenant, user=user, revision_id=revision_id, can_approve=can_approve)
    if changed:
        await db.commit()
    out = await _revision_out(db, tenant, user, rev, with_items=True, can_approve_perm=can_approve)
    out["changed"] = changed
    return out


# ------------------------------------------------------------------ tentative demand


@router.get("/tentative-demand")
async def tentative_demand(
    status_filter: Literal["ACTIVE", "EXPIRED", "CANCELLED", "CONVERTED"] | None = Query(None, alias="status"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tentative bookings with the dedupe verdict (`counted`, `not_counted_reason`) and weighted minutes."""
    _guard(user, tenant)
    if date_from is not None and date_to is not None:
        _window(date_from, date_to)
    return await list_tentative_demand(
        db, tenant.id, status=status_filter, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )


async def _booking_out(db: AsyncSession, tenant_id: int, booking_id: int) -> dict[str, Any]:
    data = await list_tentative_demand(db, tenant_id, limit=1, booking_id=booking_id)
    if not data["items"]:
        raise HTTPException(status_code=404, detail="Tentative booking not found")
    return data["items"][0]

@router.post("/tentative-bookings", status_code=201, dependencies=[_WRITE])
async def create_tentative_booking(
    body: tbs.TentativeCreateIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    bk = await tbs.create_booking(db, tenant=tenant, user=user, data=body)
    await db.commit()
    return await _booking_out(db, tenant.id, bk.id)


@router.patch("/tentative-bookings/{booking_id}", dependencies=[_WRITE])
async def update_tentative_booking(
    booking_id: int,
    body: tbs.TentativeUpdateIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    bk = await tbs.update_booking(db, tenant=tenant, user=user, booking_id=booking_id, data=body)
    await db.commit()
    return await _booking_out(db, tenant.id, bk.id)


@router.post("/tentative-bookings/{booking_id}/cancel", dependencies=[_WRITE])
async def cancel_tentative_booking(
    booking_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    bk, changed = await tbs.cancel_booking(db, tenant=tenant, user=user, booking_id=booking_id)
    if changed:
        await db.commit()
    out = await _booking_out(db, tenant.id, bk.id)
    out["changed"] = changed
    return out


# ------------------------------------------------------------------ planning settings


@router.get("/planning-settings")
async def get_planning_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Read only: defaults when nothing is stored. Never inserts a settings row."""
    _guard_settings(user, tenant)
    can_view_finance = await may_view_mfg_finance(db, user, tenant) if phase3_any_on(tenant) else False
    return _settings_out(await pss.read_planning_settings(db, tenant.id), tenant, can_view_finance=can_view_finance)


@router.put("/planning-settings", dependencies=[_APPROVE])
async def put_planning_settings(
    body: PlanningSettingsIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 2 keys need `mfg_integrated_planning_v1`; Phase 3 money / timing keys need a Phase 3 flag and the
    finance gate (admin / manager, or finance.access + finance.mis_report.view granted) on top of planning approve."""
    _guard_settings(user, tenant)
    from app.modules.audit.service import log_action

    fields = body.model_fields_set
    phase3_fields = [k for k in pss.PHASE3_KEYS if k in fields]
    if any(k in fields for k in _PHASE2_SETTING_KEYS):
        require_integrated_enabled(tenant)
    if phase3_fields:
        if not phase3_any_on(tenant):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        await assert_mfg_finance_view(db, user, tenant)
    phase3: dict[str, Any] = {}
    for key in phase3_fields:
        value = getattr(body, key)
        if key != pss.CPM_OVERRIDE_KEY and value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
        phase3[key] = value
    phase5_fields = [k for k in pss.PHASE5_KEYS if k in fields]
    if phase5_fields and not advanced_planning_on(tenant):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    phase5: dict[str, Any] = {}
    for key in phase5_fields:
        value = getattr(body, key)
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
        phase5[key] = value
    before = await pss.read_planning_settings(db, tenant.id) if (phase3 or phase5) else {}
    stage = body.stage_probability.model_dump(exclude_unset=True) if body.stage_probability is not None else None
    out = await pss.update_planning_settings(
        db,
        tenant.id,
        stage_probability={k: (format(v, "f") if v is not None else None) for k, v in stage.items()} if stage is not None else None,
        tentative_default_expiry_days=body.tentative_default_expiry_days,
        receipt_buffer_days=body.receipt_buffer_days,
        phase3=phase3,
        phase5=phase5,
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="mfg_planning_settings.update",
        resource="tenant_production_settings",
        details=f"fields={','.join(sorted(body.model_fields_set))}"
        + "".join(f"; {k}: {before.get(k)} -> {out.get(k)}" for k in sorted({*phase3, *phase5})),
    )
    await db.commit()
    can_view_finance = await may_view_mfg_finance(db, user, tenant) if phase3_any_on(tenant) else False
    return _settings_out(out, tenant, can_view_finance=can_view_finance)
