"""Production KPI dashboard (shop-floor metrics)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    CmCostActual,
    CuttingBundle,
    HourlyProductionEntry,
    LineCrewDaily,
    SewingLine,
    Tenant,
    User,
)
from app.modules.production.schemas import ProductionDashboardResponse

router = APIRouter(prefix="/production", tags=["production-dashboard"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/dashboard", response_model=ProductionDashboardResponse)
async def production_dashboard(
    production_date: str = Query(..., description="YYYY-MM-DD"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)

    out_sum = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant.id,
                HourlyProductionEntry.production_date == d,
                HourlyProductionEntry.department_type == "sewing",
                HourlyProductionEntry.line_id.isnot(None),
            )
        )
    ).scalar_one()
    total_output = float(out_sum or 0)

    tgt_sum = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.target_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant.id,
                HourlyProductionEntry.production_date == d,
                HourlyProductionEntry.department_type == "sewing",
                HourlyProductionEntry.line_id.isnot(None),
            )
        )
    ).scalar_one()
    good_sum = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant.id,
                HourlyProductionEntry.production_date == d,
                HourlyProductionEntry.department_type == "sewing",
                HourlyProductionEntry.line_id.isnot(None),
            )
        )
    ).scalar_one()
    t = float(tgt_sum or 0)
    g = float(good_sum or 0)
    overall_eff = (g / t * 100.0) if t > 0 else None

    planned_sum = (
        await db.execute(
            select(func.coalesce(func.sum(LineCrewDaily.planned_count), 0)).where(
                LineCrewDaily.tenant_id == tenant.id,
                LineCrewDaily.production_date == d,
            )
        )
    ).scalar_one()
    actual_sum = (
        await db.execute(
            select(func.coalesce(func.sum(LineCrewDaily.actual_present), 0)).where(
                LineCrewDaily.tenant_id == tenant.id,
                LineCrewDaily.production_date == d,
            )
        )
    ).scalar_one()
    p = int(planned_sum or 0)
    a = int(actual_sum or 0)
    fill_rate = (a / p * 100.0) if p > 0 else None

    cm_alerts = (
        await db.execute(
            select(func.count(CmCostActual.id)).where(
                CmCostActual.tenant_id == tenant.id,
                CmCostActual.period_date == d,
                CmCostActual.alert_triggered.is_(True),
            )
        )
    ).scalar_one()
    cm_open = int(cm_alerts or 0)

    pending_b = (
        await db.execute(
            select(func.count(CuttingBundle.id)).where(
                CuttingBundle.tenant_id == tenant.id,
                CuttingBundle.status.in_(("cut", "pending")),
            )
        )
    ).scalar_one()
    issued_b = (
        await db.execute(
            select(func.count(CuttingBundle.id)).where(
                CuttingBundle.tenant_id == tenant.id,
                CuttingBundle.issued_to_line_id.isnot(None),
            )
        )
    ).scalar_one()

    lines = list(
        (
            await db.execute(
                select(SewingLine).where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    line_rows: list[dict] = []
    for line in lines:
        lo = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.production_date == d,
                    HourlyProductionEntry.line_id == line.id,
                )
            )
        ).scalar_one()
        lt = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.target_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.production_date == d,
                    HourlyProductionEntry.line_id == line.id,
                )
            )
        ).scalar_one()
        lg = float(lo or 0)
        ltt = float(lt or 0)
        eff_line = (lg / ltt * 100.0) if ltt > 0 else None
        line_rows.append(
            {
                "line_id": line.id,
                "line_code": line.line_code,
                "name": line.name,
                "output_good": lg,
                "target_qty": ltt,
                "efficiency_pct": eff_line,
            }
        )

    return ProductionDashboardResponse(
        production_date=d.isoformat(),
        total_output_today=total_output,
        overall_efficiency_pct=overall_eff,
        crew_fill_rate_pct=fill_rate,
        cm_alerts_open=cm_open,
        lines=line_rows,
        cutting_bundles_pending=int(pending_b or 0),
        cutting_bundles_issued=int(issued_b or 0),
    )
