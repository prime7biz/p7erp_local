"""Read-only CM / fabric-loss metrics for Control Center & cost views (no voucher posting).

Feeds Management Performance / cost-at-completion callers with Decimal strings only.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CmCostActual, HourlyProductionEntry, Tenant
from app.modules.production.cutting_control_service import order_consumption_variance

HUNDRED = Decimal("100")
ZERO = Decimal("0")


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return ZERO


async def order_production_cost_snapshot(
    db: AsyncSession, *, tenant: Tenant, order_id: int
) -> dict[str, Any]:
    """Aggregate earned minutes, CM actuals (if any), and cutting variance — read only."""
    good = _d(
        (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant.id,
                    HourlyProductionEntry.order_id == order_id,
                    HourlyProductionEntry.department_type.ilike("%sew%"),
                )
            )
        ).scalar()
    )
    cm_rows = list(
        (
            await db.execute(
                select(CmCostActual).where(
                    CmCostActual.tenant_id == tenant.id,
                    CmCostActual.order_id == order_id,
                )
            )
        )
        .scalars()
        .all()
    )
    cm_total = sum((_d(getattr(r, "actual_cm_per_piece", None) or getattr(r, "cm_actual", None)) for r in cm_rows), ZERO)
    cutting = await order_consumption_variance(db, tenant=tenant, order_id=order_id)
    return {
        "order_id": order_id,
        "sewing_good_qty": f"{good:.3f}",
        "cm_actual_rows": len(cm_rows),
        "cm_actual_sum": f"{cm_total.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)}",
        "cutting": cutting,
        "posting": False,
    }
