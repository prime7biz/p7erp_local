"""Celery: daily Manufacturing Intelligence predictive job `mfg.predictive_daily` (Phase 4; plan 15 sections 10,
17.5, 17.17, 17.18). Scheduled 19:30 UTC (01:30 Asia/Dhaka).

Per active tenant with `manufacturing_intelligence_v1` AND `mfg_predictive_intelligence_v1` strictly true:
  bind_session_tenant, SET LOCAL statement_timeout = '120s', as_of = tenant business date, forecast at most 200
  confirmed orders (earliest delivery first; truncation logged), upsert today's snapshots, build findings ->
  upsert / clear (<= 500 OPEN) -> alert eligibility (top 20, <= 5 per department), resolve stale `mfg_*` alerts,
  measure due outcomes (<= 500), backfill snapshot outcomes, purge rows older than 400 days (<= 5,000 per table).
Tenants with the flag off: one bounded UPDATE resolving their active `mfg_*` alerts, nothing else.
Each tenant commits on its own; a failure is logged, rolled back and the job moves on (fail closed). No LLM call.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.common.tenant_feature_keys import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_predictive_intelligence_v1_enabled,
)
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.workers.async_runner import run_async
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)

MAX_ORDERS = 200
STATEMENT_TIMEOUT = "120s"


def predictive_enabled(flags: Any) -> bool:
    return is_manufacturing_intelligence_v1_enabled(flags) and is_mfg_predictive_intelligence_v1_enabled(flags)


async def _orders_to_forecast(db: AsyncSession, tenant_id: int) -> tuple[list[Any], bool]:
    from app.models import Order
    from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause

    rows = list(
        (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tenant_id, confirmed_status_clause())
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id)
                .limit(MAX_ORDERS + 1)
            )
        )
        .scalars()
        .all()
    )
    return rows[:MAX_ORDERS], len(rows) > MAX_ORDERS


async def run_tenant(db: AsyncSession, tenant_id: int, *, today: date | None = None) -> dict[str, Any]:
    """One enabled tenant in the caller's transaction (the caller commits or rolls back)."""
    from app.common.business_date import today_local
    from app.models import Tenant
    from app.modules.mfg_intelligence.bottleneck_service import build_findings
    from app.modules.mfg_intelligence.delivery_forecast_service import forecast_deliveries
    from app.modules.mfg_intelligence.flags import integrated_planning_on
    from app.modules.mfg_planning import predictive_writer as w

    await bind_session_tenant(db, tenant_id)
    await db.execute(text(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'"))
    tenant = await db.get(Tenant, tenant_id)
    as_of = today or today_local(tenant)
    orders, truncated = await _orders_to_forecast(db, tenant_id)
    if truncated:
        logger.warning("mfg_predictive_daily orders_truncated tenant=%s limit=%s", tenant_id, MAX_ORDERS)
    forecasts = await forecast_deliveries(db, tenant, orders, today=as_of, include_details=True)
    out: dict[str, Any] = {"tenant_id": tenant_id, "orders": len(orders), "orders_truncated": truncated}
    out["snapshots"] = await w.upsert_snapshots(db, tenant_id, forecasts, today=as_of)
    built = await build_findings(db, tenant, today=as_of, forecasts=forecasts)
    sync = await w.sync_findings(db, tenant_id, built, today=as_of)
    out["findings"] = {k: v for k, v in sync.items() if k != "eligible_natural_keys"}
    out["alerts_resolved"] = await w.resolve_stale_alerts(db, tenant_id, set(sync["eligible_natural_keys"]))
    out["outcomes"] = await w.measure_outcomes(
        db, tenant_id, today=as_of, integrated_planning=integrated_planning_on(tenant)
    )
    out["snapshot_outcomes"] = await w.backfill_snapshot_outcomes(db, tenant_id, today=as_of)
    out["purged"] = await w.purge_old_rows(db, tenant_id, today=as_of)
    return out


async def cleanup_disabled_tenant(db: AsyncSession, tenant_id: int) -> int:
    """Flag off: resolve the tenant's active `mfg_*` alerts (one bounded UPDATE), nothing else."""
    from app.models import AlertInstance
    from app.modules.mfg_planning.predictive_writer import ALERT_ACTIVE_STATUSES, MFG_RULE_KEYS, resolve_all_mfg_alerts

    await bind_session_tenant(db, tenant_id)
    active = (
        await db.execute(
            select(func.count())
            .select_from(AlertInstance)
            .where(
                AlertInstance.tenant_id == tenant_id,
                AlertInstance.alert_type.in_(MFG_RULE_KEYS),
                AlertInstance.status.in_(ALERT_ACTIVE_STATUSES),
            )
        )
    ).scalar()
    if not active:
        return 0
    return await resolve_all_mfg_alerts(db, tenant_id)


async def run_predictive_all_tenants(db: AsyncSession, *, today: date | None = None) -> dict[str, Any]:
    """Testable body: loops over active tenants on the given session."""
    results: list[dict[str, Any]] = []
    for tenant_id, flags in await active_tenant_rows(db):
        try:
            if predictive_enabled(flags):
                result = await run_tenant(db, tenant_id, today=today)
            else:
                result = {"tenant_id": tenant_id, "skipped": True,
                          "alerts_resolved": await cleanup_disabled_tenant(db, tenant_id)}
            await db.commit()
            if not result.get("skipped") or result.get("alerts_resolved"):
                logger.info("mfg_predictive_daily tenant=%s result=%s", tenant_id, result)
            results.append(result)
        except Exception:
            logger.exception("mfg_predictive_daily failed tenant=%s", tenant_id)
            await safe_async_session_rollback(db)
            results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


async def _run_all_tenants() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await run_predictive_all_tenants(db)


@celery_app.task(name="mfg.predictive_daily")
def mfg_predictive_daily() -> dict[str, Any]:
    return run_async(_run_all_tenants())
