"""Line plan board, suggestions, readiness, pipeline, Gemini AI."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.models import (
    FactoryCalendarOverride,
    ProductionShift,
    Role,
    SewingLine,
    SewingLineStyleConfig,
    Tenant,
    TenantProductionSettings,
    User,
)
from app.modules.production.calendar_service import add_working_days, count_working_days_between, net_shift_minutes
from app.modules.production.gemini_planning_service import (
    analyze_pipeline,
    get_ai_status,
    generate_risk_alerts,
    optimize_board,
    predict_move_consequences,
    suggest_allocation,
)
from app.modules.production.pipeline_service import build_pipeline
from app.modules.production.efficiency_ai_service import build_efficiency_forecast
from app.modules.production.readiness_service import get_order_chain_readiness, get_order_readiness
from app.modules.production.schemas import (
    AiPlanningSettingsResponse,
    AiPlanningSettingsUpdate,
    AiPredictMoveBody,
    AiSuggestAllocationBody,
    SewingLineStyleConfigCreate,
    SewingLineStyleConfigMove,
)
from app.modules.ai_tool.audit import log_ai_event
from app.modules.erp_ai_phases.feature_flags import require_phase
from app.modules.production.planning_advisory_service import build_capacity_and_sequencing_advisory
from app.modules.production.settings_router import _get_or_create_settings
from app.modules.production.suggest_service import suggest_assignments

router = APIRouter(prefix="/production", tags=["production-planning"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _calendar_map(db: AsyncSession, tenant_id: int) -> dict[date, str]:
    r = await db.execute(select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant_id))
    return {x.override_date: x.override_type for x in r.scalars().all()}


async def _tenant_ai_config(db: AsyncSession, tenant_id: int) -> dict | None:
    r = await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    row = r.scalar_one_or_none()
    if row and row.ai_provider_config and isinstance(row.ai_provider_config, dict):
        return row.ai_provider_config
    return None


async def _is_planning_admin(user: User, db: AsyncSession) -> bool:
    role = await db.get(Role, user.role_id)
    if not role:
        return False
    return role.name.lower() in {"admin", "super_admin", "superadmin", "owner"}


@router.get("/plan-board")
async def get_plan_board(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    from_date: date = Query(...),
    to_date: date = Query(...),
):
    _ensure(user, tenant)
    r = await db.execute(
        select(SewingLineStyleConfig)
        .where(SewingLineStyleConfig.tenant_id == tenant.id)
        .where(SewingLineStyleConfig.start_date <= to_date)
        .where(
            (SewingLineStyleConfig.planned_end_date.is_(None))
            | (SewingLineStyleConfig.planned_end_date >= from_date)
        )
    )
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "id": c.id,
                "line_id": c.line_id,
                "order_id": c.order_id,
                "style_id": c.style_id,
                "ob_id": c.ob_id,
                "start_date": c.start_date.isoformat(),
                "planned_end_date": c.planned_end_date.isoformat() if c.planned_end_date else None,
                "status": c.status,
                "planned_qty": float(c.planned_qty or 0),
                "completed_qty": float(c.completed_qty or 0),
                "machine_count": c.machine_count,
                "operator_count": c.operator_count,
            }
            for c in rows
        ]
    }


@router.post("/plan-board/assign")
async def assign_style(
    body: SewingLineStyleConfigCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    s = await _get_or_create_settings(db, tenant.id)
    weekend = list(s.weekend_days or [])
    ov = await _calendar_map(db, tenant.id)
    sd = date.fromisoformat(body.start_date)
    # default end = +5 working days if not computed (caller can PATCH later)
    planned_end = add_working_days(sd, 5, weekend_days=weekend, overrides=ov)
    row = SewingLineStyleConfig(
        tenant_id=tenant.id,
        line_id=body.line_id,
        order_id=body.order_id,
        style_id=body.style_id,
        ob_id=body.ob_id,
        machine_count=body.machine_count,
        operator_count=body.operator_count,
        helper_count=body.helper_count,
        target_efficiency_pct=body.target_efficiency_pct,
        shift_id=body.shift_id,
        start_date=sd,
        planned_end_date=planned_end,
        status="planned",
        planned_qty=body.planned_qty,
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.put("/plan-board/{config_id}/move")
async def move_config(
    config_id: int,
    body: SewingLineStyleConfigMove,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(SewingLineStyleConfig, config_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Not found")
    if body.line_id is not None:
        row.line_id = body.line_id
    if body.start_date:
        new_start = date.fromisoformat(body.start_date)
        old_start = row.start_date
        old_end = row.planned_end_date
        s = await _get_or_create_settings(db, tenant.id)
        weekend = list(s.weekend_days or [])
        ov = await _calendar_map(db, tenant.id)
        if new_start != old_start:
            if old_end is not None:
                wd_span = max(
                    1,
                    count_working_days_between(old_start, old_end, weekend_days=weekend, overrides=ov),
                )
                row.planned_end_date = add_working_days(new_start, wd_span, weekend_days=weekend, overrides=ov)
            else:
                row.planned_end_date = add_working_days(new_start, 5, weekend_days=weekend, overrides=ov)
        row.start_date = new_start
    await db.commit()
    return {"ok": True}


@router.get("/plan-board/suggest")
async def suggest_plan(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    start_date: date = Query(...),
):
    _ensure(user, tenant)
    s = await _get_or_create_settings(db, tenant.id)
    weekend = list(s.weekend_days or [])
    ov = await _calendar_map(db, tenant.id)
    r = await db.execute(
        select(ProductionShift).where(ProductionShift.tenant_id == tenant.id, ProductionShift.is_active.is_(True)).limit(1)
    )
    sh = r.scalar_one_or_none()
    if sh:
        net_min = net_shift_minutes(sh.start_time, sh.end_time, sh.break_minutes)
    else:
        net_min = 480.0
    items = await suggest_assignments(
        db,
        tenant.id,
        start_date=start_date,
        weekend_days=weekend,
        overrides=ov,
        target_efficiency_pct=65.0,
        net_minutes_per_day=net_min,
    )
    return {"suggestions": items}


@router.get("/plan-board/readiness/{order_id}")
async def readiness(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await get_order_readiness(db, tenant.id, order_id)


# --- Planning pipeline & Gemini AI ---


@router.get("/planning/pipeline")
async def get_planning_pipeline(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    group_by: str | None = Query(None, description="style | omit for flat orders"),
):
    _ensure(user, tenant)
    return await build_pipeline(db, tenant.id, group_by_style=(group_by or "").lower() == "style")


@router.get("/planning/pipeline/{order_id}/readiness")
async def get_planning_order_readiness(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await get_order_chain_readiness(db, tenant.id, order_id)


@router.post("/planning/ai/analyze")
async def ai_analyze_pipeline(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    payload = await build_pipeline(db, tenant.id, group_by_style=False)
    tcfg = await _tenant_ai_config(db, tenant.id)
    summary = await analyze_pipeline(db, tenant.id, payload, tcfg)
    return {"summary": summary, "pipeline_snapshot": payload}


@router.post("/planning/ai/suggest-allocation")
async def ai_suggest_allocation(
    body: AiSuggestAllocationBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    ch = await get_order_chain_readiness(db, tenant.id, body.order_id)
    if ch.get("error"):
        raise HTTPException(404, "Order not found")
    lr = await db.execute(
        select(SewingLine).where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True)).order_by(SewingLine.line_code)
    )
    lines = list(lr.scalars().all())
    lines_load = [{"id": ln.id, "line_code": ln.line_code, "name": ln.name} for ln in lines]
    ov = await _calendar_map(db, tenant.id)
    tcfg = await _tenant_ai_config(db, tenant.id)
    suggestion = await suggest_allocation(
        db,
        tenant.id,
        {"order_id": body.order_id, "readiness": ch},
        lines_load,
        {"calendar_overrides": {str(k): v for k, v in ov.items()}},
        tcfg,
    )
    return {"suggestion": suggestion}


@router.post("/planning/ai/predict-move")
async def ai_predict_move(
    body: AiPredictMoveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(SewingLineStyleConfig, body.config_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Plan row not found")
    lr = await db.execute(
        select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id).limit(200)
    )
    items = list(lr.scalars().all())
    board_snapshot = {
        "assignments": [
            {
                "id": c.id,
                "line_id": c.line_id,
                "order_id": c.order_id,
                "start_date": c.start_date.isoformat(),
                "planned_end_date": c.planned_end_date.isoformat() if c.planned_end_date else None,
            }
            for c in items
        ]
    }
    proposed = {
        "config_id": body.config_id,
        "target_line_id": body.target_line_id,
        "target_start_date": body.target_start_date,
    }
    tcfg = await _tenant_ai_config(db, tenant.id)
    ai_status = get_ai_status(tenant.id, tcfg)
    prediction = await predict_move_consequences(db, tenant.id, board_snapshot, proposed, tcfg)
    if prediction is None and ai_status.get("reason") == "ok":
        ai_status = {**ai_status, "reason": "no_response"}
    return {"prediction": prediction, "ai_status": ai_status}


@router.post("/planning/ai/optimize")
async def ai_optimize(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    lr = await db.execute(
        select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id).limit(500)
    )
    items = list(lr.scalars().all())
    board_snapshot = {
        "assignments": [
            {
                "id": c.id,
                "line_id": c.line_id,
                "order_id": c.order_id,
                "start_date": c.start_date.isoformat(),
                "planned_end_date": c.planned_end_date.isoformat() if c.planned_end_date else None,
            }
            for c in items
        ]
    }
    tcfg = await _tenant_ai_config(db, tenant.id)
    ai_status = get_ai_status(tenant.id, tcfg)
    moves = await optimize_board(db, tenant.id, board_snapshot, tcfg)
    if not moves and ai_status.get("reason") == "ok":
        ai_status = {**ai_status, "reason": "no_response"}
    return {"moves": moves or [], "ai_status": ai_status}


@router.get("/planning/ai/risk-alerts")
async def ai_risk_alerts(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    lr = await db.execute(
        select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant.id).limit(500)
    )
    items = list(lr.scalars().all())
    enriched = []
    for c in items:
        rd: dict = {}
        if c.order_id:
            rd = await get_order_chain_readiness(db, tenant.id, c.order_id)
        enriched.append(
            {
                "config_id": c.id,
                "line_id": c.line_id,
                "order_id": c.order_id,
                "start_date": c.start_date.isoformat(),
                "readiness": rd,
            }
        )
    tcfg = await _tenant_ai_config(db, tenant.id)
    alerts = await generate_risk_alerts(db, tenant.id, enriched, tcfg)
    return {"alerts": alerts or []}


@router.get("/planning/ai/efficiency-forecast")
async def ai_efficiency_forecast(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """30-day hourly production aggregates + Gemini narrative for next-week focus."""
    _ensure(user, tenant)
    return await build_efficiency_forecast(db, tenant.id)


class PlanningAdvisoryWindowBody(BaseModel):
    from_date: date
    to_date: date


@router.post("/planning/advisory/capacity-sequencing")
async def planning_advisory_capacity_sequencing(
    body: PlanningAdvisoryWindowBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 14: deterministic advisory capacity proxy vs sequencing hints (no mutations)."""
    _ensure(user, tenant)
    require_phase("production_planning_ai_enhanced", tenant=tenant)
    if body.to_date < body.from_date:
        raise HTTPException(status_code=400, detail="to_date must be >= from_date")
    payload = await build_capacity_and_sequencing_advisory(
        db, tenant_id=tenant.id, from_date=body.from_date, to_date=body.to_date
    )
    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="PRODUCTION_PLANNING_ADVISORY",
        resource="capacity_sequencing",
        details_json={"window": payload.get("window")},
        reason_code="PHASE14_ADVISORY",
    )
    await db.commit()
    return payload


@router.get("/planning/ai/settings", response_model=AiPlanningSettingsResponse)
async def get_ai_planning_settings(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    if not await _is_planning_admin(user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin only")
    gs = get_settings()
    tcfg = await _tenant_ai_config(db, tenant.id)
    eff_enabled = gs.gemini_enabled
    eff_model = gs.gemini_model
    if tcfg:
        if "enabled" in tcfg:
            eff_enabled = bool(tcfg["enabled"])
        if tcfg.get("model"):
            eff_model = str(tcfg["model"])
    return AiPlanningSettingsResponse(
        effective_enabled=eff_enabled,
        effective_model=eff_model,
        tenant_override=tcfg,
    )


@router.put("/planning/ai/settings", response_model=AiPlanningSettingsResponse)
async def put_ai_planning_settings(
    body: AiPlanningSettingsUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    if not await _is_planning_admin(user, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin only")
    s = await _get_or_create_settings(db, tenant.id)
    cfg = dict(s.ai_provider_config) if isinstance(s.ai_provider_config, dict) else {}
    if body.enabled is not None:
        cfg["enabled"] = body.enabled
    if body.model is not None:
        cfg["model"] = body.model.strip()
    s.ai_provider_config = cfg or None
    await db.commit()
    await db.refresh(s)
    gs = get_settings()
    eff_enabled = gs.gemini_enabled
    eff_model = gs.gemini_model
    if cfg:
        if "enabled" in cfg:
            eff_enabled = bool(cfg["enabled"])
        if cfg.get("model"):
            eff_model = str(cfg["model"])
    return AiPlanningSettingsResponse(
        effective_enabled=eff_enabled,
        effective_model=eff_model,
        tenant_override=cfg if cfg else None,
    )
