"""Tally-style exception reports: gaps in document chains and impossible balances.

All queries are read-only and tenant-scoped. Each function returns plain dicts so the
router can paginate and the dashboard summary can count without extra queries.

Rules (see docs/erp-benchmark/P7_GAP_AND_ROADMAP.md, roadmap item 4):
- GRN not billed       : GRN status RECEIVED with no non-cancelled vendor bill pointing at it.
- Challan not invoiced : challan POSTED with no non-cancelled commercial invoice pointing at the
                         challan, or at any order the challan shipped.
- Negative cash / bank : cash or bank ledger whose balance (opening + posted movement) is below zero.
- Negative stock       : item + warehouse where IN minus all other movements is below zero.
- Overdue bills        : open outstanding bills / bill references past due date with money still due.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric, and_, case, cast, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models.commercial import CommercialInvoice, CommercialInvoiceLine
from app.models.costing import Item
from app.models.finance import AccountGroup, BillReference, ChartOfAccount, OutstandingBill, VendorBill
from app.models.inventory import (
    DeliveryChallan,
    DeliveryChallanOrder,
    GoodsReceiving,
    PurchaseOrder,
    StockMovement,
    Vendor,
    Warehouse,
)

CANCELLED = ("CANCELLED", "VOID", "REJECTED")


def _f(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _iso(d: date | None) -> str | None:
    return d.isoformat() if d else None


def grn_not_billed_conditions(tenant_id: int) -> list:
    """WHERE conditions of the "GRN not billed" check (shared with the Finance Control Tower cards)."""
    billed = exists().where(
        VendorBill.tenant_id == tenant_id,
        VendorBill.goods_receiving_id == GoodsReceiving.id,
        func.upper(VendorBill.status).notin_(CANCELLED),
    )
    return [GoodsReceiving.tenant_id == tenant_id, GoodsReceiving.status == "RECEIVED", ~billed]


def challan_not_invoiced_conditions(tenant_id: int) -> list:
    """WHERE conditions of the "challan not invoiced" check (shared with the Finance Control Tower cards)."""
    direct = exists().where(
        CommercialInvoice.tenant_id == tenant_id,
        CommercialInvoice.source_delivery_challan_id == DeliveryChallan.id,
        func.upper(CommercialInvoice.status).notin_(CANCELLED),
    )
    via_order = exists().where(
        DeliveryChallanOrder.tenant_id == tenant_id,
        DeliveryChallanOrder.delivery_challan_id == DeliveryChallan.id,
        CommercialInvoiceLine.order_id == DeliveryChallanOrder.order_id,
        CommercialInvoiceLine.commercial_invoice_id == CommercialInvoice.id,
        CommercialInvoice.tenant_id == tenant_id,
        func.upper(CommercialInvoice.status).notin_(CANCELLED),
    )
    return [
        DeliveryChallan.tenant_id == tenant_id,
        DeliveryChallan.status == "POSTED",
        ~direct,
        ~via_order,
    ]


def negative_stock_select(tenant_id: int):
    """Grouped item + warehouse on-hand query (negative only), unbounded. Columns: item_id, warehouse_id, on_hand,
    item_code, item_name, warehouse_name, default_cost. Same rule as the inventory stock summary."""
    qty = cast(StockMovement.quantity, Numeric)
    signed = case((StockMovement.movement_type == "IN", qty), else_=-qty)
    on_hand = func.coalesce(func.sum(signed), 0)
    return (
        select(
            StockMovement.item_id,
            StockMovement.warehouse_id,
            on_hand.label("on_hand"),
            Item.item_code,
            Item.name,
            Warehouse.name,
            Item.default_cost,
        )
        .join(Item, and_(Item.id == StockMovement.item_id, Item.tenant_id == tenant_id))
        .outerjoin(Warehouse, and_(Warehouse.id == StockMovement.warehouse_id, Warehouse.tenant_id == tenant_id))
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(
            StockMovement.item_id, StockMovement.warehouse_id, Item.item_code, Item.name, Warehouse.name, Item.default_cost
        )
        .having(on_hand < 0)
    )


async def grn_not_billed(db: AsyncSession, tenant_id: int, *, limit: int, offset: int) -> tuple[list[dict], int]:
    base = (
        select(GoodsReceiving, Vendor.name, PurchaseOrder.po_code)
        .outerjoin(Vendor, Vendor.id == GoodsReceiving.vendor_id)
        .outerjoin(PurchaseOrder, PurchaseOrder.id == GoodsReceiving.purchase_order_id)
        .where(*grn_not_billed_conditions(tenant_id))
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(
            base.order_by(GoodsReceiving.received_date.asc().nulls_last(), GoodsReceiving.id).limit(limit).offset(offset)
        )
    ).all()
    today = today_local()
    out = [
        {
            "grn_id": g.id,
            "grn_code": g.grn_code,
            "received_date": _iso(g.received_date),
            "days_waiting": (today - g.received_date).days if g.received_date else None,
            "vendor_name": vendor_name,
            "purchase_order_id": g.purchase_order_id,
            "po_code": po_code,
            "supplier_invoice_no": g.supplier_invoice_no,
        }
        for g, vendor_name, po_code in rows
    ]
    return out, int(total)


async def challan_not_invoiced(db: AsyncSession, tenant_id: int, *, limit: int, offset: int) -> tuple[list[dict], int]:
    base = select(DeliveryChallan).where(*challan_not_invoiced_conditions(tenant_id))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (
        await db.execute(
            base.order_by(DeliveryChallan.delivery_date.asc().nulls_last(), DeliveryChallan.id).limit(limit).offset(offset)
        )
    ).scalars().all()
    today = today_local()
    out = [
        {
            "challan_id": c.id,
            "challan_code": c.challan_code,
            "customer_name": c.customer_name,
            "delivery_date": _iso(c.delivery_date),
            "days_waiting": (today - c.delivery_date).days if c.delivery_date else None,
        }
        for c in rows
    ]
    return out, int(total)


def _cash_or_bank_clause():
    return or_(
        ChartOfAccount.is_bank_account.is_(True),
        AccountGroup.is_bank_group.is_(True),
        func.lower(AccountGroup.name).like("%cash%"),
        func.lower(ChartOfAccount.name).like("%cash%"),
    )


async def negative_cash_bank(db: AsyncSession, tenant_id: int, *, as_of: date) -> list[dict]:
    from app.modules.finance.router import _posted_movement_by_account

    accounts = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, AccountGroup.id == ChartOfAccount.group_id)
            .where(ChartOfAccount.tenant_id == tenant_id, _cash_or_bank_clause())
        )
    ).all()
    if not accounts:
        return []
    movement = await _posted_movement_by_account(db, tenant_id, as_of, [a.id for a, _g in accounts])
    out: list[dict] = []
    for account, group in accounts:
        opening = _f(account.opening_balance)
        dr = movement[account.id]["DEBIT"]
        cr = movement[account.id]["CREDIT"]
        balance = opening + dr - cr if (account.normal_balance or "debit") == "debit" else opening + cr - dr
        if balance < -0.005:
            out.append(
                {
                    "account_id": account.id,
                    "account_number": account.account_number,
                    "account_name": account.name,
                    "group_name": group.name,
                    "balance": round(balance, 2),
                }
            )
    out.sort(key=lambda r: r["balance"])
    return out


async def negative_stock(db: AsyncSession, tenant_id: int, *, limit: int) -> list[dict]:
    # Same rule as the inventory stock summary: IN adds, every other movement type subtracts.
    stmt = negative_stock_select(tenant_id)
    stmt = stmt.order_by(stmt.selected_columns.on_hand.asc()).limit(limit)
    return [
        {
            "item_id": item_id,
            "item_code": code,
            "item_name": name,
            "warehouse_id": wh_id,
            "warehouse_name": wh_name,
            "on_hand": round(_f(oh), 4),
        }
        for item_id, wh_id, oh, code, name, wh_name, _cost in (await db.execute(stmt)).all()
    ]


async def overdue_bills(db: AsyncSession, tenant_id: int, *, as_of: date, limit: int) -> list[dict]:
    out: list[dict] = []
    ob_due = OutstandingBill.amount - OutstandingBill.paid_amount
    for b in (
        await db.execute(
            select(OutstandingBill)
            .where(
                OutstandingBill.tenant_id == tenant_id,
                OutstandingBill.due_date < as_of,
                func.upper(OutstandingBill.status).notin_(("PAID", "SETTLED", "CLOSED", *CANCELLED)),
                ob_due > 0,
            )
            .order_by(OutstandingBill.due_date)
            .limit(limit)
        )
    ).scalars():
        out.append(
            {
                "source": "OUTSTANDING_BILL",
                "id": b.id,
                "bill_number": b.bill_no,
                "party_name": b.party_name,
                "bill_type": b.bill_type,
                "due_date": _iso(b.due_date),
                "days_overdue": (as_of - b.due_date).days,
                "amount_due": round(_f(b.amount) - _f(b.paid_amount), 2),
                "source_voucher_id": None,
            }
        )
    for b in (
        await db.execute(
            select(BillReference)
            .where(
                BillReference.tenant_id == tenant_id,
                BillReference.due_date.is_not(None),
                BillReference.due_date < as_of,
                func.upper(BillReference.status).notin_(("SETTLED", *CANCELLED)),
                BillReference.pending_amount > 0,
            )
            .order_by(BillReference.due_date)
            .limit(limit)
        )
    ).scalars():
        out.append(
            {
                "source": "BILL_REFERENCE",
                "id": b.id,
                "bill_number": b.bill_number,
                "party_name": b.party_name,
                "bill_type": b.bill_type,
                "due_date": _iso(b.due_date),
                "days_overdue": (as_of - b.due_date).days if b.due_date else None,
                "amount_due": round(_f(b.pending_amount), 2),
                "source_voucher_id": b.source_voucher_id,
            }
        )
    out.sort(key=lambda r: -(r["days_overdue"] or 0))
    return out[:limit]
