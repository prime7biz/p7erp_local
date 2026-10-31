"""Line plan board, suggestions, readiness, pipeline, Gemini AI."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
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
from app.modules.production.line_reservation_service import (
    confirm_reservation_firm,
    confirm_reservation_soft,
    propose_line_reservation,
    release_reservation,
)
from app.modules.production.replan_service import shift_order_line_schedule
from app.modules.production.settings_router import _get_or_create_settings
from app.modules.production.suggest_service import suggest_assignments

router = APIRouter(prefix="/production", tags=["production-planning"])


class LineReservationProposeBody(BaseModel):
    order_id: int = Field(..., gt=0)


class MaterialDelayReplanBody(BaseModel):
    order_id: int = Field(..., gt=0)
    delay_days: int = Field(..., ge=1, le=365)


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
                "reservation_status": getattr(c, "reservation_status", None),
                "smv_per_piece": float(c.smv_per_piece) if getattr(c, "smv_per_piece", None) is not None else None,
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
        reservation_status="DRAFT",
        planned_qty=body.planned_qty,
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.post("/reservations/propose")
async def reservations_propose(
    body: LineReservationProposeBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await propose_line_reservation(db, tenant_id=tenant.id, order_id=body.order_id, user_id=user.id)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "reservation_status": row.reservation_status}


@router.post("/reservations/{config_id}/confirm-soft")
async def reservations_confirm_soft(
    config_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await confirm_reservation_soft(db, tenant_id=tenant.id, config_id=config_id, user_id=user.id)
    await db.commit()
    return {"id": row.id, "reservation_status": row.reservation_status}


@router.post("/reservations/{config_id}/confirm-firm")
async def reservations_confirm_firm(
    config_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await confirm_reservation_firm(db, tenant_id=tenant.id, config_id=config_id, user_id=user.id)
    await db.commit()
    return {"id": row.id, "reservation_status": row.reservation_status}


@router.post("/reservations/{config_id}/release")
async def reservations_release(
    config_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await release_reservation(db, tenant_id=tenant.id, config_id=config_id, user_id=user.id)
    await db.commit()
    return {"id": row.id, "reservation_status": row.reservation_status}


@router.post("/replan/material-delay")
async def replan_material_delay(
    body: MaterialDelayReplanBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    ids = await shift_order_line_schedule(
        db,
        tenant_id=tenant.id,
        order_id=body.order_id,
        delay_days=body.delay_days,
        user_id=user.id,
    )
    await db.commit()
    return {"shifted_config_ids": ids}


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


@router.get("/planning/predictive/defect-risk")
async def predictive_defect_risk(
    lookback_days: int = Query(default=14, ge=3, le=90),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Heuristic defect-risk suggestions from recent QC / hourly reject ratios (Phase 4 MVP)."""
    _ensure(user, tenant)
    from app.common.permissions import PERMISSION_AI_DEFECT_PREDICT, assert_soft_permission_allowed
    from app.modules.production.predictive_heuristic_service import build_defect_risk_suggestions

    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_AI_DEFECT_PREDICT)
    return await build_defect_risk_suggestions(db, tenant_id=tenant.id, lookback_days=lookback_days)


@router.get("/planning/predictive/line-balance")
async def predictive_line_balance(
    lookback_days: int = Query(default=7, ge=3, le=60),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Heuristic line-balance suggestions from hourly efficiency variance (Phase 4 MVP)."""
    _ensure(user, tenant)
    from app.common.permissions import PERMISSION_AI_LINE_BALANCE, assert_soft_permission_allowed
    from app.modules.production.predictive_heuristic_service import build_line_balance_suggestions

    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_AI_LINE_BALANCE)
    return await build_line_balance_suggestions(db, tenant_id=tenant.id, lookback_days=lookback_days)


@router.get("/planning/predictive/maintenance")
async def predictive_maintenance(
    lookback_days: int = Query(default=30, ge=7, le=120),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Heuristic maintenance risk from machines + MACHINE downtime (Phase 4 MVP)."""
    _ensure(user, tenant)
    from app.common.permissions import PERMISSION_AI_MAINTENANCE_PREDICT, assert_soft_permission_allowed
    from app.modules.production.predictive_heuristic_service import build_maintenance_risk_suggestions

    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_AI_MAINTENANCE_PREDICT
    )
    return await build_maintenance_risk_suggestions(db, tenant_id=tenant.id, lookback_days=lookback_days)


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


class ReleaseWorkOrdersBody(BaseModel):
    plan_id: int | None = Field(default=None, gt=0)
    order_ids: list[int] | None = None


@router.post("/planning/release-work-orders")
async def release_work_orders(
    body: ReleaseWorkOrdersBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk-update manufacturing work orders from planned → released (shop floor)."""
    _ensure(user, tenant)
    if body.plan_id is None and not body.order_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide plan_id and/or order_ids",
        )

    from app.models import ManufacturingProductionPlan, ManufacturingProductionPlanLine, ManufacturingWorkOrder

    stmt = select(ManufacturingWorkOrder).where(
        ManufacturingWorkOrder.tenant_id == tenant.id,
        ManufacturingWorkOrder.status == "planned",
    )

    if body.plan_id is not None:
        plan = await db.get(ManufacturingProductionPlan, body.plan_id)
        if not plan or plan.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Production plan not found")
        line_ids_r = await db.execute(
            select(ManufacturingProductionPlanLine.id).where(
                ManufacturingProductionPlanLine.tenant_id == tenant.id,
                ManufacturingProductionPlanLine.plan_id == body.plan_id,
            )
        )
        line_ids = [int(x) for x in line_ids_r.scalars().all()]
        if not line_ids:
            return {"released": 0, "work_order_ids": [], "message": "Plan has no lines"}
        stmt = stmt.where(ManufacturingWorkOrder.plan_line_id.in_(line_ids))

    if body.order_ids:
        order_ids = [int(x) for x in body.order_ids if int(x) > 0]
        if not order_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="order_ids must be positive")
        stmt = stmt.where(ManufacturingWorkOrder.order_id.in_(order_ids))

    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    released_ids: list[int] = []
    order_ids_touched: set[int] = set()
    for row in rows:
        row.status = "released"
        released_ids.append(int(row.id))
        if getattr(row, "order_id", None):
            order_ids_touched.add(int(row.order_id))
    material_estimate = 0
    if released_ids:
        # Best-effort material line estimate from linked order BOMs (advisory for UI modal/toast).
        try:
            from app.models import Bom, BomItem

            for oid in order_ids_touched:
                bom_id = (
                    await db.execute(
                        select(Bom.id).where(Bom.tenant_id == tenant.id, Bom.order_id == oid).limit(1)
                    )
                ).scalar_one_or_none()
                if bom_id:
                    material_estimate += int(
                        (
                            await db.execute(
                                select(func.count())
                                .select_from(BomItem)
                                .where(BomItem.tenant_id == tenant.id, BomItem.bom_id == bom_id)
                            )
                        ).scalar_one()
                        or 0
                    )
        except Exception:
            material_estimate = 0
        await db.commit()
        # Soft pipeline nudge only — does not replace existing pipeline rules.
        try:
            from app.modules.orders.pipeline_service import auto_advance_order_pipeline

            for oid in order_ids_touched:
                await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=oid)
            await db.commit()
        except Exception:
            pass
    return {
        "released": len(released_ids),
        "work_order_ids": released_ids,
        "material_count_estimate": material_estimate,
        "message": f"Released {len(released_ids)} work order(s) to shop floor",
    }
