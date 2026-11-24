"""Today's Action Queue — bounded read aggregates for Material Control Overview."""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import VendorBill
from app.models.inventory import GoodsReceiving, ProductionMaterialIssue, PurchaseOrder
from app.modules.material_control.schemas import ActionQueueItem, ActionQueueResponse

_MAX_ITEMS = 50


async def build_action_queue(
    db: AsyncSession,
    *,
    tenant_id: int,
    as_of: date,
) -> ActionQueueResponse:
    items: list[ActionQueueItem] = []

    # Draft GRNs waiting to receive
    draft_grns = list(
        (
            await db.execute(
                select(GoodsReceiving)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    func.upper(GoodsReceiving.status) == "DRAFT",
                )
                .order_by(GoodsReceiving.id.desc())
                .limit(15)
            )
        ).scalars().all()
    )
    for g in draft_grns:
        items.append(
            ActionQueueItem(
                kind="GRN_DRAFT",
                severity="warn",
                title=f"Draft GRN {g.grn_code or g.id}",
                detail="Receive goods or cancel the draft",
                href=f"/app/inventory/goods-receiving/{g.id}",
                record_id=g.id,
                record_code=g.grn_code,
                as_of_date=g.received_date or as_of,
            )
        )

    # Received GRNs with no posted vendor bill (unbilled GRNI risk)
    billed_grn_ids = select(VendorBill.goods_receiving_id).where(
        VendorBill.tenant_id == tenant_id,
        VendorBill.goods_receiving_id.is_not(None),
        func.upper(VendorBill.status) != "CANCELLED",
    )
    unbilled = list(
        (
            await db.execute(
                select(GoodsReceiving)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    func.upper(GoodsReceiving.status) == "RECEIVED",
                    GoodsReceiving.id.not_in(billed_grn_ids),
                )
                .order_by(GoodsReceiving.received_date.asc().nulls_last(), GoodsReceiving.id.asc())
                .limit(15)
            )
        ).scalars().all()
    )
    cutoff = as_of - timedelta(days=7)
    for g in unbilled:
        aged = bool(g.received_date and g.received_date <= cutoff)
        items.append(
            ActionQueueItem(
                kind="GRN_UNBILLED",
                severity="urgent" if aged else "warn",
                title=f"Unbilled GRN {g.grn_code or g.id}",
                detail="Create vendor bill to clear GRNI",
                href=f"/app/inventory/goods-receiving/{g.id}",
                record_id=g.id,
                record_code=g.grn_code,
                as_of_date=g.received_date,
            )
        )

    draft_bills = list(
        (
            await db.execute(
                select(VendorBill)
                .where(
                    VendorBill.tenant_id == tenant_id,
                    func.upper(VendorBill.status) == "DRAFT",
                )
                .order_by(VendorBill.id.desc())
                .limit(10)
            )
        ).scalars().all()
    )
    for b in draft_bills:
        items.append(
            ActionQueueItem(
                kind="VENDOR_BILL_DRAFT",
                severity="info",
                title=f"Draft vendor bill {b.bill_code or b.id}",
                detail="Add invoice ref and post to clear GRNI",
                href="/app/accounts/vendor-bills",
                record_id=b.id,
                record_code=b.bill_code,
                as_of_date=b.bill_date,
            )
        )

    open_pos = list(
        (
            await db.execute(
                select(PurchaseOrder)
                .where(
                    PurchaseOrder.tenant_id == tenant_id,
                    func.upper(PurchaseOrder.status).in_(("APPROVED", "PARTIAL", "OPEN", "CONFIRMED")),
                )
                .order_by(PurchaseOrder.id.desc())
                .limit(10)
            )
        ).scalars().all()
    )
    for po in open_pos:
        items.append(
            ActionQueueItem(
                kind="PO_OPEN",
                severity="info",
                title=f"Open PO {po.po_code or po.id}",
                detail="Track receipt against this purchase order",
                href=f"/app/inventory/purchase-orders/{po.id}",
                record_id=po.id,
                record_code=getattr(po, "po_code", None),
                as_of_date=po.order_date,
            )
        )

    draft_pmi = list(
        (
            await db.execute(
                select(ProductionMaterialIssue)
                .where(
                    ProductionMaterialIssue.tenant_id == tenant_id,
                    func.upper(ProductionMaterialIssue.status) == "DRAFT",
                )
                .order_by(ProductionMaterialIssue.id.desc())
                .limit(10)
            )
        ).scalars().all()
    )
    for pmi in draft_pmi:
        items.append(
            ActionQueueItem(
                kind="PMI_DRAFT",
                severity="warn",
                title=f"Draft material issue {pmi.issue_code or pmi.id}",
                detail="Approve / issue materials to the floor",
                href="/app/inventory/consumption-control",
                record_id=pmi.id,
                record_code=pmi.issue_code,
                as_of_date=pmi.issue_date,
            )
        )

    truncated = len(items) > _MAX_ITEMS
    items = items[:_MAX_ITEMS]
    return ActionQueueResponse(items=items, truncated=truncated)
