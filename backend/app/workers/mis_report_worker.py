"""Celery: weekly MIS report snapshot generation (email recipients optional)."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_mis_reports_enabled
from app.database import AsyncSessionLocal
from app.models.tenant import Tenant
from app.modules.finance.comparative_statement_service import generate_comparative_balance_sheet
from app.modules.finance.fund_flow_service import generate_fund_flow
from app.modules.finance.ratio_analysis_service import calculate_ratios

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    today = date.today()
    async with AsyncSessionLocal() as db:
        tenants = list((await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all())
        for tenant in tenants:
            try:
                if not is_mis_reports_enabled(tenant.feature_flags):
                    results.append({"tenant_id": tenant.id, "skipped": True})
                    continue
                from_date = date(today.year, 1, 1)
                fund = await generate_fund_flow(db, tenant.id, from_date=from_date, to_date=today)
                ratios = await calculate_ratios(db, tenant.id, as_of_date=today)
                y2 = today.year
                y1 = y2 - 1
                comparative = await generate_comparative_balance_sheet(db, tenant.id, year1=y1, year2=y2)
                # Snapshot stored in logs for trend (no new table per sprint — read-only)
                logger.info(
                    "weekly_mis_report tenant=%s net_change=%s current_ratio=%s",
                    tenant.id,
                    fund.get("net_change"),
                    next((r["value"] for r in ratios["ratios"] if r["name"] == "current_ratio"), None),
                )
                results.append(
                    {
                        "tenant_id": tenant.id,
                        "fund_flow_net_change": fund.get("net_change"),
                        "ratio_count": len(ratios.get("ratios") or []),
                        "comparative_significant": comparative.get("significant_count"),
                        "email": "skipped_no_recipients_configured",
                    }
                )
                await db.commit()
            except Exception:
                logger.exception("weekly_mis_report failed tenant=%s", tenant.id)
                await db.rollback()
                results.append({"tenant_id": tenant.id, "error": True})
    return {"tenants": len(results), "results": results, "as_of": today.isoformat()}


@celery_app.task(name="finance.weekly_mis_report")
def weekly_mis_report() -> dict:
    return run_async(_run_all_tenants())
