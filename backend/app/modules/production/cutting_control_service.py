"""3-way BOM vs CAD vs actual cutting consumption + process-loss % (flag ``cutting_loss_control_v1``)."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_cutting_loss_control_v1_enabled
from app.models import CuttingBundle, CutTicket, LayPlan, MarkerPlan, Order, Tenant
from app.models.production import CuttingProcessLossEntry

HUNDRED = Decimal("100")
ZERO = Decimal("0")
LOSS_BUCKETS = ("END_BIT", "SPLICE", "SHRINKAGE", "FABRIC_DEFECT", "CUTTING_MISTAKE", "REMNANT", "RE_CUT")


def _d(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v is not None else 0))
    except Exception:
        return ZERO


def _pct(num: Decimal, den: Decimal) -> Decimal:
    if den <= 0:
        return ZERO
    return (num * HUNDRED / den).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def three_way_variance(
    *,
    bom_per_dz: Decimal,
    cad_per_dz: Decimal,
    actual_per_dz: Decimal,
    allowed_wastage_pct: Decimal,
) -> dict[str, Any]:
    bom_vs_cad = cad_per_dz - bom_per_dz
    cad_vs_act = actual_per_dz - cad_per_dz
    bom_vs_act = actual_per_dz - bom_per_dz
    process_loss_pct = _pct(actual_per_dz - bom_per_dz, bom_per_dz) if bom_per_dz > 0 else ZERO
    excess = process_loss_pct > allowed_wastage_pct
    return {
        "bom_consumption_per_dz": f"{bom_per_dz:.6f}",
        "cad_consumption_per_dz": f"{cad_per_dz:.6f}",
        "actual_consumption_per_dz": f"{actual_per_dz:.6f}",
        "bom_vs_cad": f"{bom_vs_cad:.6f}",
        "cad_vs_actual": f"{cad_vs_act:.6f}",
        "bom_vs_actual": f"{bom_vs_act:.6f}",
        "process_loss_pct": f"{process_loss_pct:.2f}",
        "allowed_wastage_pct": f"{allowed_wastage_pct:.2f}",
        "excess_loss": excess,
    }


async def order_consumption_variance(
    db: AsyncSession, *, tenant: Tenant, order_id: int, allowed_wastage_pct: Decimal | None = None
) -> dict[str, Any]:
    if not is_cutting_loss_control_v1_enabled(tenant.feature_flags):
        return {"enabled": False}
    await ensure_owned(db, Order, order_id, tenant.id, "Order")
    markers = list(
        (
            await db.execute(
                select(MarkerPlan).where(MarkerPlan.tenant_id == tenant.id, MarkerPlan.order_id == order_id)
            )
        )
        .scalars()
        .all()
    )
    lays = list(
        (
            await db.execute(select(LayPlan).where(LayPlan.tenant_id == tenant.id, LayPlan.order_id == order_id))
        )
        .scalars()
        .all()
    )
    allowed = allowed_wastage_pct if allowed_wastage_pct is not None else Decimal("15")
    items: list[dict[str, Any]] = []
    for m in markers:
        bom = _d(m.bom_consumption_per_dz)
        if bom <= 0 and m.fabric_consumption_per_pcs:
            bom = _d(m.fabric_consumption_per_pcs) * Decimal("12")
        cad = _d(m.planned_consumption_per_dz)
        if cad <= 0 and m.fabric_consumption_per_pcs:
            cad = _d(m.fabric_consumption_per_pcs) * Decimal("12")
        actual = _d(m.actual_consumption_per_dz)
        if actual <= 0:
            # Prefer lay actuals for this marker
            for lay in lays:
                if lay.marker_plan_id == m.id and lay.actual_consumption_per_dz:
                    actual = _d(lay.actual_consumption_per_dz)
                    break
        items.append(
            {
                "marker_id": m.id,
                "marker_code": m.marker_code,
                "color_name": m.color_name,
                **three_way_variance(
                    bom_per_dz=bom, cad_per_dz=cad, actual_per_dz=actual, allowed_wastage_pct=allowed
                ),
            }
        )

    loss_rows = list(
        (
            await db.execute(
                select(CuttingProcessLossEntry).where(
                    CuttingProcessLossEntry.tenant_id == tenant.id,
                    CuttingProcessLossEntry.order_id == order_id,
                )
            )
        )
        .scalars()
        .all()
    )
    by_bucket: dict[str, Decimal] = {b: ZERO for b in LOSS_BUCKETS}
    for r in loss_rows:
        b = (r.loss_bucket or "").upper()
        if b in by_bucket:
            by_bucket[b] += _d(r.qty)

    # Cut-to-sew WIP rough ledger
    cut_pcs = sum(int(m.actual_cut_pcs or 0) for m in markers) or sum(int(l.actual_cut_pcs or 0) for l in lays)
    reject = sum(int(m.rejected_panel_pcs or 0) for m in markers) + sum(int(l.rejected_panel_pcs or 0) for l in lays)
    issued = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(CuttingBundle.qty_in_bundle), 0)).where(
                    CuttingBundle.tenant_id == tenant.id,
                    CuttingBundle.status.in_(("issued", "ISSUED", "Issued")),
                )
            )
        ).scalar()
        or 0
    )
    # Restrict issued to this order's cut tickets when possible
    ticket_ids = [
        t.id
        for t in (
            await db.execute(select(CutTicket).where(CutTicket.tenant_id == tenant.id, CutTicket.order_id == order_id))
        )
        .scalars()
        .all()
    ]
    if ticket_ids:
        issued = int(
            (
                await db.execute(
                    select(func.coalesce(func.sum(CuttingBundle.qty_in_bundle), 0)).where(
                        CuttingBundle.tenant_id == tenant.id,
                        CuttingBundle.cut_ticket_id.in_(ticket_ids),
                        CuttingBundle.status.in_(("issued", "ISSUED", "Issued")),
                    )
                )
            ).scalar()
            or 0
        )

    order = await db.get(Order, order_id)
    order_qty = _d(getattr(order, "quantity", 0) if order else 0)
    return {
        "enabled": True,
        "order_id": order_id,
        "items": items,
        "loss_by_bucket": {k: f"{v:.4f}" for k, v in by_bucket.items()},
        "wip": {
            "order_qty": f"{order_qty:.3f}",
            "cut_pcs": cut_pcs,
            "rejected_panel_pcs": reject,
            "bundles_issued_pcs": issued,
            "cut_panel_buffer_pcs": max(0, cut_pcs - reject - issued),
        },
    }
