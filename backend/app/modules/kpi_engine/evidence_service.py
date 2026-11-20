"""KPI evidence drill-down (paged, capped)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.pagination import MAX_PAGE_SIZE
from app.models.kpi_engine import KpiDefinition
from app.modules.kpi_engine.compute.service import OPEN_ORDER_EXCLUDED, compute_kpi


async def evidence_for_kpi(
    db: AsyncSession,
    tenant_id: int,
    definition: KpiDefinition,
    *,
    as_of: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    offset = max(0, offset)
    value = await compute_kpi(db, tenant_id, definition, as_of=as_of or date.today())
    rows: list[dict[str, Any]] = []
    total = 0
    code = definition.code

    if code in {"MKT-04", "MER-08", "COM-01", "COM-02", "MKT-02"}:
        from app.models.merch import Order

        base = select(Order).where(
            Order.tenant_id == tenant_id,
            func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED),
        )
        total = (
            await db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar_one()
        orders = (
            await db.execute(base.order_by(Order.id.desc()).limit(limit).offset(offset))
        ).scalars().all()
        for o in orders:
            rows.append(
                {
                    "type": "order",
                    "id": o.id,
                    "status": o.status,
                    "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
                    "href": f"/app/orders/{o.id}",
                }
            )
    elif code in {"MER-06", "MER-07", "PPC-04"}:
        from app.models.merch import OrderFollowupAction

        base = select(OrderFollowupAction).where(OrderFollowupAction.tenant_id == tenant_id)
        total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        actions = (
            await db.execute(base.order_by(OrderFollowupAction.id.desc()).limit(limit).offset(offset))
        ).scalars().all()
        for a in actions:
            rows.append(
                {
                    "type": "tna_action",
                    "id": a.id,
                    "planned_date": a.planned_date.isoformat() if a.planned_date else None,
                    "status": getattr(a, "status", None),
                }
            )
    else:
        rows = value.evidence[:limit]
        total = len(value.evidence)

    return {
        "code": code,
        "value": value.to_dict(),
        "evidence": rows,
        "total": int(total or 0),
        "limit": limit,
        "offset": offset,
    }
