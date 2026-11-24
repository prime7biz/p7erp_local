"""Phase 7 — Cost-Saving / leak watchlist (read-only aggregates)."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import VendorBill
from app.models.inventory import (
    GoodsReceiving,
    GrnQualityInspection,
    InterDepartmentTransfer,
    InventoryCostLayer,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.merch import Bom, BomItem


async def build_leak_watchlist(
    db: AsyncSession,
    *,
    tenant_id: int,
    as_of: date,
) -> dict:
    """Five leak buckets used by Material Control Overview (flag material_budget_plan_v1)."""
    aged_cutoff = as_of - timedelta(days=30)
    remnant_layers = list(
        (
            await db.execute(
                select(InventoryCostLayer)
                .where(
                    InventoryCostLayer.tenant_id == tenant_id,
                    InventoryCostLayer.qty_remaining > 0,
                    InventoryCostLayer.layer_date.is_not(None),
                    InventoryCostLayer.layer_date <= aged_cutoff,
                )
                .order_by(InventoryCostLayer.layer_date.asc())
                .limit(50)
            )
        ).scalars().all()
    )
    remnant_value = sum(
        (Decimal(str(x.qty_remaining or 0)) * Decimal(str(x.unit_cost or 0)) for x in remnant_layers),
        Decimal("0"),
    )
    billed = select(VendorBill.goods_receiving_id).where(
        VendorBill.tenant_id == tenant_id,
        VendorBill.goods_receiving_id.is_not(None),
        func.upper(VendorBill.status) != "CANCELLED",
    )
    unbilled_count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(GoodsReceiving)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    func.upper(GoodsReceiving.status) == "RECEIVED",
                    GoodsReceiving.id.not_in(billed),
                )
            )
        ).scalar_one()
        or 0
    )

    overbuy = await _overbuy_vs_bom(db, tenant_id=tenant_id)
    qc_unclaimed = await _qc_reject_unclaimed(db, tenant_id=tenant_id)
    process_loss = await _process_loss_over_std(db, tenant_id=tenant_id)

    return {
        "aging_remnants": {
            "count": len(remnant_layers),
            "fifo_value": str(remnant_value.quantize(Decimal("0.01"))),
            "cutoff_days": 30,
        },
        "unbilled_grni": {"count": unbilled_count},
        "overbuy_vs_bom": overbuy,
        "qc_reject_unclaimed": qc_unclaimed,
        "process_loss_over_std": process_loss,
    }


async def _overbuy_vs_bom(db: AsyncSession, *, tenant_id: int) -> dict:
    """PO qty (open statuses) vs Order BOM required_gross by item — top overbuys."""
    bom_need = (
        await db.execute(
            select(
                BomItem.item_id,
                func.coalesce(func.sum(BomItem.required_gross_qty), 0).label("need"),
            )
            .join(Bom, and_(Bom.id == BomItem.bom_id, Bom.tenant_id == tenant_id))
            .where(
                BomItem.tenant_id == tenant_id,
                BomItem.item_id.is_not(None),
                func.upper(Bom.status).in_(("APPROVED", "FROZEN")),
            )
            .group_by(BomItem.item_id)
        )
    ).all()
    need_by_item = {int(r.item_id): Decimal(str(r.need or 0)) for r in bom_need if r.item_id is not None}

    po_ordered = (
        await db.execute(
            select(
                PurchaseOrderItem.item_id,
                func.coalesce(func.sum(PurchaseOrderItem.quantity), 0).label("ordered"),
            )
            .join(
                PurchaseOrder,
                and_(PurchaseOrder.id == PurchaseOrderItem.purchase_order_id, PurchaseOrder.tenant_id == tenant_id),
            )
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                func.upper(PurchaseOrder.status).notin_(("CANCELLED", "CLOSED", "REJECTED")),
            )
            .group_by(PurchaseOrderItem.item_id)
        )
    ).all()

    rows: list[dict] = []
    for r in po_ordered:
        item_id = int(r.item_id)
        ordered = Decimal(str(r.ordered or 0))
        need = need_by_item.get(item_id, Decimal("0"))
        if need <= 0:
            continue
        if ordered <= need:
            continue
        over = ordered - need
        rows.append(
            {
                "item_id": item_id,
                "bom_need": str(need.quantize(Decimal("0.0001"))),
                "po_ordered": str(ordered.quantize(Decimal("0.0001"))),
                "over_qty": str(over.quantize(Decimal("0.0001"))),
            }
        )
    rows.sort(key=lambda x: Decimal(x["over_qty"]), reverse=True)
    top = rows[:20]
    return {
        "status": "ok",
        "count": len(rows),
        "items": top,
    }


async def _qc_reject_unclaimed(db: AsyncSession, *, tenant_id: int) -> dict:
    """QC lines with rejected qty still marked debit_note_suggested (claim/DN not cleared)."""
    count = int(
        (
            await db.execute(
                select(func.count())
                .select_from(GrnQualityInspection)
                .where(
                    GrnQualityInspection.tenant_id == tenant_id,
                    GrnQualityInspection.rejected_qty > 0,
                    or_(
                        GrnQualityInspection.debit_note_suggested.is_(True),
                        func.upper(func.coalesce(GrnQualityInspection.result, "")).in_(
                            ("FAIL", "PARTIAL", "REJECT")
                        ),
                    ),
                    func.upper(GrnQualityInspection.status).in_(("COMPLETED", "DONE", "CLOSED")),
                )
            )
        ).scalar_one()
        or 0
    )
    # Also count PENDING with reject/hold so store sees open QC cash risk
    pending = int(
        (
            await db.execute(
                select(func.count())
                .select_from(GrnQualityInspection)
                .where(
                    GrnQualityInspection.tenant_id == tenant_id,
                    or_(
                        GrnQualityInspection.rejected_qty > 0,
                        GrnQualityInspection.hold_qty > 0,
                    ),
                    func.upper(GrnQualityInspection.status) == "PENDING",
                )
            )
        ).scalar_one()
        or 0
    )
    return {
        "status": "ok",
        "completed_reject_suggested": count,
        "pending_hold_or_reject": pending,
        "count": count + pending,
    }


async def _process_loss_over_std(db: AsyncSession, *, tenant_id: int) -> dict:
    """IDT rows where actual process loss % exceeds standard (or loss_exception flag)."""
    rows = list(
        (
            await db.execute(
                select(InterDepartmentTransfer)
                .where(
                    InterDepartmentTransfer.tenant_id == tenant_id,
                    or_(
                        InterDepartmentTransfer.loss_exception.is_(True),
                        and_(
                            InterDepartmentTransfer.process_loss_percent.is_not(None),
                            InterDepartmentTransfer.standard_process_loss_percent.is_not(None),
                            InterDepartmentTransfer.process_loss_percent
                            > InterDepartmentTransfer.standard_process_loss_percent,
                        ),
                    ),
                )
                .order_by(InterDepartmentTransfer.id.desc())
                .limit(30)
            )
        ).scalars().all()
    )
    items = [
        {
            "idt_id": r.id,
            "idt_number": r.idt_number,
            "process_name": r.process_name,
            "process_loss_percent": str(r.process_loss_percent) if r.process_loss_percent is not None else None,
            "standard_process_loss_percent": (
                str(r.standard_process_loss_percent) if r.standard_process_loss_percent is not None else None
            ),
            "loss_exception": bool(r.loss_exception),
        }
        for r in rows
    ]
    return {"status": "ok", "count": len(items), "items": items}
