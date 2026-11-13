"""Manufacturing Intelligence Phase 5 API (forward plan + scenarios): GET only, read-only, tenant scoped.

Prefix ``/api/v1/mfg-intelligence``. Every endpoint:
1. needs ``production.planning.read`` (router level) and the heavy rate limit
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 "Not found" unless ``manufacturing_intelligence_v1`` AND ``mfg_advanced_planning_v1`` are exactly true
4. runs with a 20 s Postgres ``statement_timeout`` (local to the transaction); a cancelled query rolls back and
   returns 503 ``FORWARD_PLAN_TIMEOUT``. More than 200 active lines: 422 ``TOO_MANY_LINES`` (choose a factory unit).
5. never writes

| Endpoint                              | Extra                                                                   |
|---------------------------------------|-------------------------------------------------------------------------|
| GET /forward-plan                     | -                                                                       |
| GET /forward-plan/compare             | <= 4 scenarios, no FINANCE_CONSTRAINED                                  |
| GET /forward-plan/forecast-demand     | -                                                                       |
| GET /forward-plan/finance-constrained | finance.access (route) + finance gate + mfg_financial_readiness_v1      |
| GET /scheduler/preview                | mfg_integrated_planning_v1; PLAN basis; <= 60 lines; proposal only      |
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any, Awaitable, Callable, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.mfg_intelligence import advanced_planning_schemas as schemas
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence.finance_gate import assert_mfg_finance_view
from app.modules.mfg_intelligence.flags import (
    integrated_planning_on,
    planning_math_v2_on,
    require_advanced_planning_enabled,
    require_financial_readiness_enabled,
    require_scheduler_enabled,
)
from app.modules.mfg_intelligence.forecast_demand_service import forecast_payload, load_forecast
from app.modules.mfg_intelligence.forward_plan_service import (
    MAX_LINES,
    TooManyLines,
    compare_payload,
    evaluate,
    load_inputs,
)
from app.modules.mfg_intelligence.router import _ensure_tenant_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-advanced-planning"],
    dependencies=[Depends(require_internal_permission("production.planning.read")), Depends(rate_limit_dependency("heavy"))],
)

STATEMENT_TIMEOUT_MS = "20000"
QUERY_CANCELED_SQLSTATE = "57014"
Bucket = Literal["week", "month"]


def _horizon(value: int) -> int:
    if value not in fp.HORIZONS:
        raise fp.coded_error(422, "HORIZON_NOT_ALLOWED", f"horizon_days must be one of {', '.join(map(str, fp.HORIZONS))}")
    return value


def _is_query_canceled(exc: BaseException) -> bool:
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if getattr(cur, "sqlstate", None) == QUERY_CANCELED_SQLSTATE or getattr(cur, "pgcode", None) == QUERY_CANCELED_SQLSTATE:
            return True
        if type(cur).__name__ in ("QueryCanceledError", "QueryCanceled"):
            return True
        cur = getattr(cur, "orig", None) or cur.__cause__
    return False


async def _with_statement_timeout(db: AsyncSession, run: Callable[[], Awaitable[Any]], *, max_lines: int = MAX_LINES) -> Any:
    previous = (await db.execute(select(func.current_setting("statement_timeout")))).scalar()
    await db.execute(select(func.set_config("statement_timeout", STATEMENT_TIMEOUT_MS, True)))
    try:
        result = await run()
    except TooManyLines as exc:
        await db.execute(select(func.set_config("statement_timeout", str(previous or "0"), True)))
        raise fp.coded_error(
            422, "TOO_MANY_LINES", f"{exc.count} active lines; at most {max_lines} - choose a factory_unit"
        ) from None
    except DBAPIError as exc:
        if _is_query_canceled(exc):
            await safe_async_session_rollback(db)
            raise fp.coded_error(503, "FORWARD_PLAN_TIMEOUT", "The forward plan took too long; choose a factory unit or a shorter horizon") from None
        raise
    await db.execute(select(func.set_config("statement_timeout", str(previous or "0"), True)))
    return result


def _log(endpoint: str, tenant_id: int, started: float, **counts: int) -> None:
    logger.info(
        "mfg_advanced_planning endpoint=%s tenant_id=%s duration_ms=%d %s",
        endpoint, tenant_id, int((time.perf_counter() - started) * 1000),
        " ".join(f"{k}={v}" for k, v in counts.items()),
    )


def _params(scenario: str, basis: str | None, ot: Decimal | None, absence: Decimal | None, extra: Decimal | None,
            virtual: int | None) -> fp.ForwardParams:
    return fp.build_params(scenario, efficiency_basis=basis, overtime_pct=ot, absence_pct=absence,
                           extra_operator_pct=extra, virtual_lines=virtual)


@router.get("/forward-plan", response_model=schemas.ForwardPlanOut)
async def mfg_forward_plan(
    horizon_days: int = Query(fp.DEFAULT_HORIZON),
    bucket: Bucket = Query(fp.BUCKET_WEEK),
    factory_unit: str | None = Query(None, max_length=64),
    scenario: str = Query(fp.BASE, max_length=32),
    efficiency_basis: str | None = Query(None, max_length=8),
    overtime_pct: Decimal | None = Query(None),
    absence_pct: Decimal | None = Query(None),
    extra_operator_pct: Decimal | None = Query(None),
    virtual_lines: int | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_advanced_planning_enabled(tenant)
    horizon = _horizon(horizon_days)
    params = _params(scenario, efficiency_basis, overtime_pct, absence_pct, extra_operator_pct, virtual_lines)
    if params.scenario == fp.FINANCE_CONSTRAINED:
        raise fp.coded_error(422, "USE_FINANCE_ROUTE", "Use /forward-plan/finance-constrained for this scenario")
    started = time.perf_counter()

    async def run() -> dict[str, Any]:
        inputs = await load_inputs(db, tenant, today=today_local(tenant), horizon_days=horizon, factory_unit=factory_unit,
                                   need_plan_basis=params.efficiency_basis != fp.BASIS_PLAN)
        return evaluate(inputs, params, bucket)

    payload = await _with_statement_timeout(db, run)
    _log("forward-plan", tenant.id, started, lines=payload["lines"], buckets=len(payload["buckets"]))
    return payload


@router.get("/forward-plan/compare", response_model=schemas.CompareOut)
async def mfg_forward_plan_compare(
    scenarios: str = Query(..., max_length=200),
    horizon_days: int = Query(fp.DEFAULT_HORIZON),
    bucket: Bucket = Query(fp.BUCKET_WEEK),
    factory_unit: str | None = Query(None, max_length=64),
    efficiency_basis: str | None = Query(None, max_length=8),
    overtime_pct: Decimal | None = Query(None),
    absence_pct: Decimal | None = Query(None),
    extra_operator_pct: Decimal | None = Query(None),
    virtual_lines: int | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Loads once and applies each scenario's parameter set in memory."""
    _ensure_tenant_user(user, tenant)
    require_advanced_planning_enabled(tenant)
    horizon = _horizon(horizon_days)
    names = fp.parse_compare(scenarios)
    params_list = [_params(n, efficiency_basis, overtime_pct, absence_pct, extra_operator_pct, virtual_lines) for n in names]
    started = time.perf_counter()

    async def run() -> dict[str, Any]:
        inputs = await load_inputs(db, tenant, today=today_local(tenant), horizon_days=horizon, factory_unit=factory_unit,
                                   need_plan_basis=any(p.efficiency_basis != fp.BASIS_PLAN for p in params_list))
        return compare_payload(inputs, params_list, bucket)

    payload = await _with_statement_timeout(db, run)
    _log("forward-plan-compare", tenant.id, started, scenarios=len(params_list))
    return payload


@router.get("/forward-plan/forecast-demand", response_model=schemas.ForecastDemandOut)
async def mfg_forward_plan_forecast_demand(
    horizon_days: int = Query(fp.DEFAULT_HORIZON),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Forecast availability, method, months and the residual per family (counted tentative bookings consume it)."""
    _ensure_tenant_user(user, tenant)
    require_advanced_planning_enabled(tenant)
    horizon = _horizon(horizon_days)
    started = time.perf_counter()

    async def run() -> dict[str, Any]:
        from datetime import timedelta

        from app.modules.mfg_intelligence.demand_layers import load_tentative_consumption

        today = today_local(tenant)
        end = today + timedelta(days=horizon - 1)
        integrated = integrated_planning_on(tenant)
        tentative = await load_tentative_consumption(db, tenant.id, today=today, end=end) if integrated else []
        result = await load_forecast(db, tenant.id, today=today, end=end, use_style_standard=integrated,
                                     tentative_rows=tentative)
        return forecast_payload(result, horizon)

    payload = await _with_statement_timeout(db, run)
    _log("forward-plan-forecast-demand", tenant.id, started, families=len(payload["families"]))
    return payload


@router.get("/scheduler/preview", response_model=schemas.SchedulerPreviewOut)
async def mfg_scheduler_preview(
    horizon_days: int = Query(fp.DEFAULT_HORIZON),
    factory_unit: str | None = Query(None, max_length=64),
    efficiency_basis: str | None = Query(None, max_length=8),
    material_delay_days: int = Query(0),
    btb_delay_days: int = Query(0),
    exclude_job_ids: str | None = Query(None, max_length=4000, description="Comma list of row:<id> / order:<id>"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Proposal only (writes nothing). Needs integrated planning; PLAN basis only; <= 60 candidate lines."""
    from app.modules.mfg_intelligence.scheduler_service import (
        MAX_LINES as SCHEDULER_MAX_LINES,
        build_scheduler_params,
        load_scheduler_inputs,
        run_scheduler,
    )

    _ensure_tenant_user(user, tenant)
    require_scheduler_enabled(tenant)
    params = build_scheduler_params(
        horizon_days=horizon_days, factory_unit=factory_unit, efficiency_basis=efficiency_basis,
        material_delay_days=material_delay_days, btb_delay_days=btb_delay_days,
        exclude_job_ids=(exclude_job_ids or "").split(","),
    )
    started = time.perf_counter()

    async def run() -> dict[str, Any]:
        inputs = await load_scheduler_inputs(db, tenant, params, today=today_local(tenant))
        return run_scheduler(inputs)

    payload = await _with_statement_timeout(db, run, max_lines=SCHEDULER_MAX_LINES)
    _log("scheduler-preview", tenant.id, started, jobs=payload["counts"]["jobs_total"], items=len(payload["items"]))
    return payload


@router.get(
    "/forward-plan/finance-constrained",
    response_model=schemas.FinanceConstrainedOut,
    dependencies=[Depends(require_internal_permission("finance.access"))],
)
async def mfg_forward_plan_finance_constrained(
    horizon_days: int = Query(fp.DEFAULT_HORIZON),
    factory_unit: str | None = Query(None, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Money: admin / manager, or finance.access + finance.mis_report.view explicitly granted, in every RBAC mode."""
    _ensure_tenant_user(user, tenant)
    require_advanced_planning_enabled(tenant)
    require_financial_readiness_enabled(tenant)
    await assert_mfg_finance_view(db, user, tenant)
    horizon = _horizon(horizon_days)
    started = time.perf_counter()

    async def run() -> dict[str, Any]:
        from app.modules.mfg_intelligence.finance_constrained_service import build_finance_constrained

        inputs = await load_inputs(db, tenant, today=today_local(tenant), horizon_days=horizon, factory_unit=factory_unit,
                                   need_plan_basis=True)
        return await build_finance_constrained(db, tenant, inputs, planning_math_v2=planning_math_v2_on(tenant))

    payload = await _with_statement_timeout(db, run)
    _log("forward-plan-finance-constrained", tenant.id, started, kept=len(payload["kept"]), cut=len(payload["cut"]))
    return payload
