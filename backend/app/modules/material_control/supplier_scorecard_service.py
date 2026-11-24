"""Phase 3 lite — supplier QC scorecard (read-only)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import GoodsReceiving, GrnQualityInspection, Vendor


async def build_supplier_scorecard(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int = 50,
) -> dict:
    """Pass / reject rates by vendor from completed GRN QC inspections."""
    limit = max(1, min(int(limit), 100))
    rows = (
        await db.execute(
            select(
                GoodsReceiving.vendor_id,
                func.count(GrnQualityInspection.id).label("inspections"),
                func.coalesce(func.sum(GrnQualityInspection.received_qty), 0).label("received"),
                func.coalesce(func.sum(GrnQualityInspection.accepted_qty), 0).label("accepted"),
                func.coalesce(func.sum(GrnQualityInspection.rejected_qty), 0).label("rejected"),
            )
            .join(GoodsReceiving, GoodsReceiving.id == GrnQualityInspection.grn_id)
            .where(
                GrnQualityInspection.tenant_id == tenant_id,
                GoodsReceiving.tenant_id == tenant_id,
                GoodsReceiving.vendor_id.is_not(None),
                func.upper(GrnQualityInspection.status).in_(("COMPLETED", "DONE", "CLOSED")),
            )
            .group_by(GoodsReceiving.vendor_id)
            .order_by(func.coalesce(func.sum(GrnQualityInspection.rejected_qty), 0).desc())
            .limit(limit)
        )
    ).all()

    vendor_ids = [int(r.vendor_id) for r in rows if r.vendor_id is not None]
    names: dict[int, str] = {}
    if vendor_ids:
        for v in (
            await db.execute(
                select(Vendor).where(Vendor.tenant_id == tenant_id, Vendor.id.in_(vendor_ids))
            )
        ).scalars().all():
            names[v.id] = v.name or v.vendor_code or str(v.id)

    items = []
    for r in rows:
        vid = int(r.vendor_id)
        received = Decimal(str(r.received or 0))
        accepted = Decimal(str(r.accepted or 0))
        rejected = Decimal(str(r.rejected or 0))
        pass_rate = None
        if received > 0:
            pass_rate = str((accepted / received * Decimal("100")).quantize(Decimal("0.01")))
        items.append(
            {
                "vendor_id": vid,
                "vendor_name": names.get(vid),
                "inspections": int(r.inspections or 0),
                "received_qty": str(received.quantize(Decimal("0.0001"))),
                "accepted_qty": str(accepted.quantize(Decimal("0.0001"))),
                "rejected_qty": str(rejected.quantize(Decimal("0.0001"))),
                "pass_rate_pct": pass_rate,
            }
        )
    return {"items": items, "truncated": len(items) >= limit}
