"""Soft 3-way match: PO vs GRN vs VendorBill (warn-only, no posting).

Behind hub or inbound flag. Never blocks receive/bill — returns MATCH / WARN / MISSING_*.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models.finance import VendorBill, VendorBillLine
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrderItem

_QTY = Decimal("0.0001")
_TOL_QTY = Decimal("0.01")  # soft qty tolerance
_TOL_VALUE_PCT = Decimal("0.02")  # 2% soft value tolerance


def _dec(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value is not None else "0"))
    except Exception:
        return Decimal("0")


def _money(value: Decimal) -> str:
    return str(value.quantize(_QTY, rounding=ROUND_HALF_UP))


def _qty_str(value: Decimal) -> str:
    return str(value.quantize(_QTY, rounding=ROUND_HALF_UP))


async def build_three_way_for_grn(
    db: AsyncSession,
    *,
    tenant_id: int,
    grn_id: int,
) -> dict:
    """Compare one GRN's lines to PO ordered qty and VendorBill billed qty/value."""
    grn = await ensure_owned(db, GoodsReceiving, grn_id, tenant_id, "GRN", status_code=404)
    assert grn is not None

    lines = list(
        (
            await db.execute(
                select(GoodsReceivingItem).where(
                    GoodsReceivingItem.tenant_id == tenant_id,
                    GoodsReceivingItem.goods_receiving_id == grn.id,
                )
            )
        )
        .scalars()
        .all()
    )

    bills = list(
        (
            await db.execute(
                select(VendorBill).where(
                    VendorBill.tenant_id == tenant_id,
                    VendorBill.goods_receiving_id == grn.id,
                    func.upper(VendorBill.status) != "CANCELLED",
                )
            )
        )
        .scalars()
        .all()
    )
    bill_ids = [b.id for b in bills]
    bill_lines: list[VendorBillLine] = []
    if bill_ids:
        bill_lines = list(
            (
                await db.execute(
                    select(VendorBillLine).where(
                        VendorBillLine.tenant_id == tenant_id,
                        VendorBillLine.vendor_bill_id.in_(bill_ids),
                    )
                )
            )
            .scalars()
            .all()
        )

    # Aggregate bill qty/value by GRN item / PO line / item_id
    bill_by_gri: dict[int, tuple[Decimal, Decimal]] = {}
    bill_by_poi: dict[int, tuple[Decimal, Decimal]] = {}
    bill_by_item: dict[int, tuple[Decimal, Decimal]] = {}
    for bl in bill_lines:
        qty = _dec(bl.quantity)
        val = _dec(bl.line_total) if bl.line_total is not None else qty * _dec(bl.unit_price)
        if bl.goods_receiving_item_id:
            q0, v0 = bill_by_gri.get(bl.goods_receiving_item_id, (Decimal("0"), Decimal("0")))
            bill_by_gri[bl.goods_receiving_item_id] = (q0 + qty, v0 + val)
        if bl.purchase_order_line_id:
            q0, v0 = bill_by_poi.get(bl.purchase_order_line_id, (Decimal("0"), Decimal("0")))
            bill_by_poi[bl.purchase_order_line_id] = (q0 + qty, v0 + val)
        q0, v0 = bill_by_item.get(bl.item_id, (Decimal("0"), Decimal("0")))
        bill_by_item[bl.item_id] = (q0 + qty, v0 + val)

    po_line_ids = [int(ln.purchase_order_line_id) for ln in lines if ln.purchase_order_line_id]
    po_map: dict[int, PurchaseOrderItem] = {}
    if po_line_ids:
        for poi in (
            await db.execute(
                select(PurchaseOrderItem).where(
                    PurchaseOrderItem.tenant_id == tenant_id,
                    PurchaseOrderItem.id.in_(po_line_ids),
                )
            )
        ).scalars().all():
            po_map[poi.id] = poi

    out_lines: list[dict] = []
    worst = "MATCH"
    severity_rank = {"MATCH": 0, "MISSING_BILL": 1, "MISSING_PO": 1, "QTY_WARN": 2, "VALUE_WARN": 2}

    for ln in lines:
        accepted = _dec(ln.accepted_qty if ln.accepted_qty is not None else ln.quantity)
        grn_value = _dec(ln.accepted_value)
        if grn_value <= 0 and ln.unit_price:
            grn_value = accepted * _dec(ln.unit_price)

        po_qty = Decimal("0")
        po_value = Decimal("0")
        flags: list[str] = []
        status_line = "MATCH"

        if ln.purchase_order_line_id and ln.purchase_order_line_id in po_map:
            poi = po_map[ln.purchase_order_line_id]
            po_qty = _dec(poi.quantity)
            po_value = po_qty * _dec(getattr(poi, "unit_price", 0) or 0)
            if accepted > po_qty + _TOL_QTY:
                flags.append("OVER_RECEIVE_VS_PO")
                status_line = "QTY_WARN"
            elif accepted + _TOL_QTY < po_qty and accepted > 0:
                flags.append("UNDER_RECEIVE_VS_PO")
                # soft info — still MATCH unless bill also off
        else:
            if grn.purchase_order_id or ln.purchase_order_line_id:
                flags.append("PO_LINE_MISSING")
                status_line = "MISSING_PO"

        b_qty, b_val = (Decimal("0"), Decimal("0"))
        if ln.id in bill_by_gri:
            b_qty, b_val = bill_by_gri[ln.id]
        elif ln.purchase_order_line_id and ln.purchase_order_line_id in bill_by_poi:
            b_qty, b_val = bill_by_poi[ln.purchase_order_line_id]
        elif ln.item_id in bill_by_item:
            b_qty, b_val = bill_by_item[ln.item_id]

        if not bills:
            flags.append("NO_VENDOR_BILL")
            if severity_rank.get(status_line, 0) < severity_rank["MISSING_BILL"]:
                status_line = "MISSING_BILL"
        else:
            if abs(b_qty - accepted) > _TOL_QTY:
                flags.append("QTY_BILL_VS_GRN")
                status_line = "QTY_WARN"
            if grn_value > 0 and b_val > 0:
                diff_pct = abs(b_val - grn_value) / grn_value
                if diff_pct > _TOL_VALUE_PCT:
                    flags.append("VALUE_BILL_VS_GRN")
                    status_line = "VALUE_WARN"

        if severity_rank.get(status_line, 0) > severity_rank.get(worst, 0):
            worst = status_line

        out_lines.append(
            {
                "grn_item_id": ln.id,
                "item_id": ln.item_id,
                "purchase_order_line_id": ln.purchase_order_line_id,
                "po_qty": _qty_str(po_qty),
                "grn_accepted_qty": _qty_str(accepted),
                "bill_qty": _qty_str(b_qty),
                "grn_value": _money(grn_value),
                "bill_value": _money(b_val),
                "status": status_line,
                "flags": flags,
            }
        )

    if not lines:
        worst = "MATCH"

    return {
        "grn_id": grn.id,
        "grn_code": grn.grn_code,
        "purchase_order_id": grn.purchase_order_id,
        "vendor_id": grn.vendor_id,
        "status": worst if out_lines else ("MISSING_BILL" if not bills else "MATCH"),
        "bills": [
            {
                "id": b.id,
                "bill_code": b.bill_code,
                "status": b.status,
                "total_amount": _money(_dec(b.total_amount)),
            }
            for b in bills
        ],
        "lines": out_lines,
        "warn_only": True,
    }


async def list_three_way_exceptions(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int = 50,
) -> dict:
    """Recent posted/received GRNs that are not clean MATCH (soft scan)."""
    limit = max(1, min(int(limit), 100))
    grns = list(
        (
            await db.execute(
                select(GoodsReceiving)
                .where(
                    GoodsReceiving.tenant_id == tenant_id,
                    func.upper(GoodsReceiving.status).in_(("POSTED", "RECEIVED", "COMPLETED", "APPROVED")),
                )
                .order_by(GoodsReceiving.id.desc())
                .limit(limit * 3)  # scan a bit more, filter to exceptions
            )
        )
        .scalars()
        .all()
    )

    items: list[dict] = []
    for grn in grns:
        row = await build_three_way_for_grn(db, tenant_id=tenant_id, grn_id=grn.id)
        if row["status"] != "MATCH":
            items.append(
                {
                    "grn_id": row["grn_id"],
                    "grn_code": row["grn_code"],
                    "status": row["status"],
                    "purchase_order_id": row["purchase_order_id"],
                    "vendor_id": row["vendor_id"],
                    "bill_count": len(row["bills"]),
                    "line_count": len(row["lines"]),
                    "href": f"/app/inventory/goods-receiving?grn={row['grn_id']}",
                }
            )
        if len(items) >= limit:
            break

    return {"items": items, "warn_only": True, "truncated": len(grns) >= limit * 3 and len(items) >= limit}
