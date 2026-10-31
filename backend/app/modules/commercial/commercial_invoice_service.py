"""Commercial Invoice: create from delivery challan, ISSUE → draft AR, receipt allocations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.codegen import next_tenant_code
from app.models import (
    Customer,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    Item,
    Order,
    ProformaInvoice,
    ProformaInvoiceOrder,
    Quotation,
    Voucher,
)
from app.models.commercial import (
    CommercialInvoice,
    CommercialInvoiceLine,
    CommercialInvoiceReceiptAllocation,
)
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher

ACTIVE_INVOICE_STATUSES = ("DRAFT", "ISSUED")
ACTIVE_ALLOCATION_STATUSES = ("PENDING", "POSTED")
POSTED_ALLOCATION_STATUS = "POSTED"
MONEY_Q = Decimal("0.0001")
MONEY_2 = Decimal("0.01")


def _d(value: object | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    s = str(value).replace(",", "").strip()
    if not s:
        return Decimal("0")
    return Decimal(s)


def _money4(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def _money2(value: Decimal) -> Decimal:
    return value.quantize(MONEY_2, rounding=ROUND_HALF_UP)


def _order_currency(order: Order) -> str | None:
    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else {}
    for key in ("document_currency", "target_price_currency", "currency"):
        raw = snap.get(key)
        if raw and str(raw).strip():
            return str(raw).strip().upper()[:10]
    return None


def resolve_selling_unit_price(
    *,
    order: Order,
    pi: ProformaInvoice | None,
    live_quotation: Quotation | None,
    confirm_quotation_fallback: bool,
) -> tuple[Decimal | None, str, dict[str, Any] | None, bool]:
    """Return (unit_price, price_source, ref, price_review_required). Never uses BOM cost."""
    snap = order.commercial_snapshot_json if isinstance(order.commercial_snapshot_json, dict) else {}
    quoted = _d(snap.get("quoted_price"))
    if quoted > 0:
        return quoted, "SNAPSHOT_QUOTED", {"order_id": order.id, "field": "quoted_price"}, False

    if pi is not None and _d(pi.amount) > 0 and order.quantity and int(order.quantity) > 0:
        unit = _money4(_d(pi.amount) / Decimal(int(order.quantity)))
        if unit > 0:
            return (
                unit,
                "PI_DERIVED",
                {
                    "proforma_invoice_id": pi.id,
                    "pi_amount": float(_d(pi.amount)),
                    "order_quantity": int(order.quantity),
                },
                False,
            )

    if confirm_quotation_fallback and live_quotation is not None:
        qprice = _d(live_quotation.quoted_price)
        if qprice > 0:
            return (
                qprice,
                "QUOTATION_CONFIRMED",
                {"quotation_id": live_quotation.id},
                False,
            )

    return None, "MISSING", {"order_id": order.id}, True


@dataclass
class CiOutstanding:
    invoice_id: int
    total_amount: Decimal
    allocated_active: Decimal
    allocated_posted: Decimal
    outstanding_for_new: Decimal
    outstanding_posted: Decimal
    currency: str | None


async def get_ci_outstanding(
    db: AsyncSession,
    *,
    tenant_id: int,
    invoice: CommercialInvoice,
) -> CiOutstanding:
    total = _money2(_d(invoice.total_amount))
    active = (
        await db.execute(
            select(func.coalesce(func.sum(CommercialInvoiceReceiptAllocation.allocated_amount), 0)).where(
                CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                CommercialInvoiceReceiptAllocation.commercial_invoice_id == invoice.id,
                CommercialInvoiceReceiptAllocation.status.in_(list(ACTIVE_ALLOCATION_STATUSES)),
            )
        )
    ).scalar()
    posted = (
        await db.execute(
            select(func.coalesce(func.sum(CommercialInvoiceReceiptAllocation.allocated_amount), 0)).where(
                CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                CommercialInvoiceReceiptAllocation.commercial_invoice_id == invoice.id,
                CommercialInvoiceReceiptAllocation.status == POSTED_ALLOCATION_STATUS,
            )
        )
    ).scalar()
    allocated_active = _money2(_d(active))
    allocated_posted = _money2(_d(posted))
    return CiOutstanding(
        invoice_id=invoice.id,
        total_amount=total,
        allocated_active=allocated_active,
        allocated_posted=allocated_posted,
        outstanding_for_new=_money2(max(total - allocated_active, Decimal("0"))),
        outstanding_posted=_money2(max(total - allocated_posted, Decimal("0"))),
        currency=invoice.currency,
    )


async def shipped_qty_for_order_item(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    item_id: int,
) -> Decimal:
    result = await db.execute(
        select(func.coalesce(func.sum(DeliveryChallanItem.quantity), 0))
        .select_from(DeliveryChallanItem)
        .join(DeliveryChallan, DeliveryChallan.id == DeliveryChallanItem.challan_id)
        .join(
            DeliveryChallanOrder,
            DeliveryChallanOrder.delivery_challan_id == DeliveryChallan.id,
        )
        .where(
            DeliveryChallanItem.tenant_id == tenant_id,
            DeliveryChallanItem.item_id == item_id,
            DeliveryChallanOrder.order_id == order_id,
            DeliveryChallan.status == "POSTED",
        )
    )
    return _money4(_d(result.scalar()))


async def invoiced_qty_for_order_item(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    item_id: int,
    exclude_invoice_id: int | None = None,
    exclude_source_challan_id: int | None = None,
) -> Decimal:
    stmt = (
        select(func.coalesce(func.sum(CommercialInvoiceLine.quantity), 0))
        .select_from(CommercialInvoiceLine)
        .join(CommercialInvoice, CommercialInvoice.id == CommercialInvoiceLine.commercial_invoice_id)
        .where(
            CommercialInvoiceLine.tenant_id == tenant_id,
            CommercialInvoiceLine.order_id == order_id,
            CommercialInvoiceLine.item_id == item_id,
            CommercialInvoice.status.in_(list(ACTIVE_INVOICE_STATUSES)),
        )
    )
    if exclude_invoice_id is not None:
        stmt = stmt.where(CommercialInvoice.id != exclude_invoice_id)
    if exclude_source_challan_id is not None:
        # Sibling invoices from the same challan (allow_split) must not block each other.
        stmt = stmt.where(
            (CommercialInvoice.source_delivery_challan_id.is_(None))
            | (CommercialInvoice.source_delivery_challan_id != exclude_source_challan_id)
        )
    result = await db.execute(stmt)
    return _money4(_d(result.scalar()))


async def _primary_export_pi_for_order(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> ProformaInvoice | None:
    result = await db.execute(
        select(ProformaInvoice)
        .join(ProformaInvoiceOrder, ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id)
        .where(
            ProformaInvoice.tenant_id == tenant_id,
            ProformaInvoiceOrder.order_id == order_id,
            func.upper(ProformaInvoice.direction) == "EXPORT",
            func.upper(ProformaInvoice.status) == "ISSUED",
        )
        .order_by(ProformaInvoice.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _build_draft_invoice_for_group(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    challan: DeliveryChallan,
    customer_id: int,
    currency: str,
    group_orders: list[Order],
    items: list[DeliveryChallanItem],
    idempotency_key: str,
    exchange_rate_to_base: Decimal,
    confirm_quotation_fallback: bool,
    invoice_date: date | None,
    allow_split: bool,
    split_note: str | None = None,
) -> CommercialInvoice:
    primary_order = group_orders[0]
    customer = await db.get(Customer, customer_id)
    if customer is None or customer.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Customer not found for linked order(s)")

    rate = exchange_rate_to_base
    pi = await _primary_export_pi_for_order(db, tenant_id=tenant_id, order_id=primary_order.id)
    live_q = None
    if primary_order.quotation_id:
        live_q = await db.get(Quotation, primary_order.quotation_id)

    unit_price, price_source, price_ref, review_required = resolve_selling_unit_price(
        order=primary_order,
        pi=pi,
        live_quotation=live_q,
        confirm_quotation_fallback=confirm_quotation_fallback,
    )
    if unit_price is None:
        unit_price = Decimal("0")
        review_required = True

    exclude_challan = challan.id if allow_split else None
    for ci_item in items:
        qty = _money4(_d(ci_item.quantity))
        if qty <= 0:
            continue
        shipped = await shipped_qty_for_order_item(
            db, tenant_id=tenant_id, order_id=primary_order.id, item_id=ci_item.item_id
        )
        already = await invoiced_qty_for_order_item(
            db,
            tenant_id=tenant_id,
            order_id=primary_order.id,
            item_id=ci_item.item_id,
            exclude_source_challan_id=exclude_challan,
        )
        available = _money4(max(shipped - already, Decimal("0")))
        if qty > available:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invoiced quantity would exceed shipped quantity for item_id={ci_item.item_id} "
                    f"(requested={float(qty)}, available={float(available)}, "
                    f"shipped={float(shipped)}, already_invoiced={float(already)})"
                ),
            )

    invoice_code = await next_tenant_code(
        db, model=CommercialInvoice, tenant_id=tenant_id, prefix="CI-", width=4
    )
    notes = f"From delivery challan {challan.challan_code}"
    if split_note:
        notes = f"{notes}. {split_note}"
    invoice = CommercialInvoice(
        tenant_id=tenant_id,
        invoice_code=invoice_code,
        status="DRAFT",
        customer_id=customer_id,
        source_delivery_challan_id=challan.id,
        invoice_date=invoice_date or challan.delivery_date or date.today(),
        currency=currency,
        exchange_rate_to_base=rate,
        total_amount=Decimal("0"),
        base_total_amount=Decimal("0"),
        price_review_required=review_required,
        idempotency_key=idempotency_key,
        created_by=user_id,
        notes=notes,
    )
    db.add(invoice)
    await db.flush()

    total = Decimal("0")
    sort = 0
    for ci_item in items:
        qty = _money4(_d(ci_item.quantity))
        if qty <= 0:
            continue
        item_row = await db.get(Item, ci_item.item_id)
        desc = (item_row.name if item_row else None) or f"Item {ci_item.item_id}"
        line_amt = _money2(qty * unit_price)
        total += line_amt
        db.add(
            CommercialInvoiceLine(
                tenant_id=tenant_id,
                commercial_invoice_id=invoice.id,
                order_id=primary_order.id,
                item_id=ci_item.item_id,
                delivery_challan_item_id=ci_item.id,
                description=desc[:255],
                quantity=qty,
                unit_price=_money4(unit_price),
                line_amount=line_amt,
                currency=currency,
                price_source=price_source,
                price_source_ref=price_ref,
                sort_order=sort,
            )
        )
        sort += 1

    invoice.total_amount = _money2(total)
    invoice.base_total_amount = _money4(invoice.total_amount * rate)
    await db.flush()
    return invoice


async def create_invoices_from_delivery_challan(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    challan_id: int,
    idempotency_key: str,
    exchange_rate_to_base: Decimal | None = None,
    confirm_quotation_fallback: bool = False,
    invoice_date: date | None = None,
    allow_split: bool = False,
) -> tuple[list[CommercialInvoice], bool]:
    """
    Create draft commercial invoice(s) from a POSTED delivery challan.
    Returns (invoices, was_created).

    When linked orders have mixed customer/currency:
      - allow_split=False → HTTP 409 with code=split_required
      - allow_split=True  → one draft invoice per (customer_id, currency) group
    """
    key = (idempotency_key or "").strip()[:128]
    if not key:
        raise HTTPException(status_code=400, detail="idempotency_key is required")

    challan = await db.get(DeliveryChallan, challan_id)
    if challan is None or challan.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    if (challan.status or "").upper() != "POSTED":
        raise HTTPException(
            status_code=400,
            detail="Only POSTED delivery challans can create a commercial invoice",
        )

    existing = list(
        (
            await db.execute(
                select(CommercialInvoice).where(
                    CommercialInvoice.tenant_id == tenant_id,
                    CommercialInvoice.source_delivery_challan_id == challan_id,
                    CommercialInvoice.idempotency_key == key,
                )
            )
        ).scalars().all()
    )
    if existing:
        return existing, False

    order_links = list(
        (
            await db.execute(
                select(DeliveryChallanOrder).where(
                    DeliveryChallanOrder.tenant_id == tenant_id,
                    DeliveryChallanOrder.delivery_challan_id == challan_id,
                )
            )
        ).scalars().all()
    )
    if not order_links:
        raise HTTPException(
            status_code=400,
            detail="Link at least one sales order to this delivery challan before creating an invoice",
        )

    orders: list[Order] = []
    for link in order_links:
        order = await db.get(Order, link.order_id)
        if order is None or order.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail=f"Order {link.order_id} not found for tenant")
        orders.append(order)

    groups: dict[tuple[int, str], list[Order]] = {}
    for order in orders:
        currency = (_order_currency(order) or "USD").upper()[:10]
        groups.setdefault((order.customer_id, currency), []).append(order)

    if len(groups) > 1 and not allow_split:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "split_required",
                "message": (
                    "Delivery challan links orders with different customers or currencies. "
                    "Create separate invoices per customer/currency group?"
                ),
                "groups": [
                    {
                        "customer_id": cid,
                        "currency": cur,
                        "order_ids": [o.id for o in ords],
                    }
                    for (cid, cur), ords in groups.items()
                ],
            },
        )

    items = list(
        (
            await db.execute(
                select(DeliveryChallanItem)
                .where(
                    DeliveryChallanItem.tenant_id == tenant_id,
                    DeliveryChallanItem.challan_id == challan_id,
                )
                .order_by(DeliveryChallanItem.id)
            )
        ).scalars().all()
    )
    if not items:
        raise HTTPException(status_code=400, detail="Delivery challan has no lines to invoice")

    rate = _d(exchange_rate_to_base) if exchange_rate_to_base is not None else Decimal("1")
    if rate <= 0:
        raise HTTPException(status_code=400, detail="exchange_rate_to_base must be greater than zero")

    created: list[CommercialInvoice] = []
    group_items = list(groups.items())
    for (customer_id, currency), group_orders in group_items:
        split_note = None
        if len(group_items) > 1:
            split_note = (
                f"Split invoice for customer_id={customer_id} / {currency} "
                f"(orders: {', '.join(str(o.id) for o in group_orders)})"
            )
        inv = await _build_draft_invoice_for_group(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            challan=challan,
            customer_id=customer_id,
            currency=currency,
            group_orders=group_orders,
            items=items,
            idempotency_key=key,
            exchange_rate_to_base=rate,
            confirm_quotation_fallback=confirm_quotation_fallback,
            invoice_date=invoice_date,
            allow_split=len(group_items) > 1,
            split_note=split_note,
        )
        created.append(inv)
    return created, True


async def load_commercial_invoice(
    db: AsyncSession,
    *,
    tenant_id: int,
    invoice_id: int,
) -> CommercialInvoice | None:
    result = await db.execute(
        select(CommercialInvoice)
        .where(CommercialInvoice.id == invoice_id, CommercialInvoice.tenant_id == tenant_id)
        .options(selectinload(CommercialInvoice.lines))
    )
    return result.scalar_one_or_none()


async def issue_commercial_invoice(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    invoice: CommercialInvoice,
) -> CommercialInvoice:
    """ISSUE draft CI and create draft AR JOURNAL (Dr Export Receivable / Cr Export Sales)."""
    if (invoice.status or "").upper() != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT commercial invoices can be issued")
    if invoice.price_review_required:
        raise HTTPException(
            status_code=400,
            detail="Price review required before ISSUE — set a selling price from snapshot/PI or confirm quotation fallback",
        )
    if _d(invoice.total_amount) <= 0:
        raise HTTPException(status_code=400, detail="Cannot ISSUE a commercial invoice with zero total")

    lines = list(
        (
            await db.execute(
                select(CommercialInvoiceLine).where(
                    CommercialInvoiceLine.commercial_invoice_id == invoice.id,
                    CommercialInvoiceLine.tenant_id == tenant_id,
                )
            )
        ).scalars().all()
    )
    if not lines:
        raise HTTPException(status_code=400, detail="Commercial invoice has no lines")
    if any(_d(ln.unit_price) <= 0 for ln in lines):
        raise HTTPException(status_code=400, detail="All lines must have a positive unit price before ISSUE")

    amt = _money2(_d(invoice.total_amount))
    rate = _d(invoice.exchange_rate_to_base) if invoice.exchange_rate_to_base is not None else Decimal("1")
    cur = (invoice.currency or "USD").upper()[:10]
    primary_order_id = lines[0].order_id if lines else None
    narration = f"AR for commercial invoice {invoice.invoice_code}"

    voucher = await create_system_voucher(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_type="JOURNAL",
        voucher_date=invoice.invoice_date or date.today(),
        lines=[
            AutoPostingLine(
                entry_type="DEBIT",
                amount=amt,
                system_code="EXPORT_RECEIVABLE",
                notes=narration,
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amt,
                system_code="SALES_REVENUE_EXPORT",
                notes=narration,
            ),
        ],
        description=narration,
        reference=invoice.invoice_code,
        source_module="COMMERCIAL_INVOICE",
        source_module_ref=str(invoice.id),
        currency=cur,
        exchange_rate=float(rate) if rate > 0 else 1.0,
        auto_post=False,
    )
    voucher.order_id = primary_order_id
    voucher.allow_manual_edit = True

    now = datetime.utcnow()
    invoice.ar_voucher_id = voucher.id
    invoice.status = "ISSUED"
    invoice.issued_at = now
    invoice.updated_at = now
    await db.flush()
    return invoice


async def cancel_commercial_invoice(
    db: AsyncSession,
    *,
    tenant_id: int,
    invoice: CommercialInvoice,
) -> CommercialInvoice:
    """Cancel an ISSUED commercial invoice that has no posted receipt allocations."""
    st = (invoice.status or "").upper()
    if st == "CANCELLED":
        return invoice
    if st != "ISSUED":
        raise HTTPException(status_code=400, detail="Only ISSUED commercial invoices can be cancelled")

    posted = (
        await db.execute(
            select(func.count())
            .select_from(CommercialInvoiceReceiptAllocation)
            .where(
                CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                CommercialInvoiceReceiptAllocation.commercial_invoice_id == invoice.id,
                CommercialInvoiceReceiptAllocation.status == POSTED_ALLOCATION_STATUS,
            )
        )
    ).scalar()
    if int(posted or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel a commercial invoice with posted receipt allocations",
        )

    now = datetime.utcnow()
    invoice.status = "CANCELLED"
    invoice.cancelled_at = now
    invoice.updated_at = now
    await db.flush()
    return invoice


async def create_receipt_from_commercial_invoice(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    invoice: CommercialInvoice,
    amount: Decimal,
    receipt_date: date,
    bank_ledger_id: int,
    receivable_ledger_id: int,
    currency: str | None,
    exchange_rate_to_base: Decimal,
    idempotency_key: str,
) -> tuple[CommercialInvoiceReceiptAllocation, Voucher, CiOutstanding, bool]:
    if (invoice.status or "").upper() != "ISSUED":
        raise HTTPException(status_code=400, detail="Only ISSUED commercial invoices can record payment")

    key = (idempotency_key or "").strip()[:128]
    if not key:
        raise HTTPException(status_code=400, detail="idempotency_key is required")

    existing = (
        await db.execute(
            select(CommercialInvoiceReceiptAllocation).where(
                CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                CommercialInvoiceReceiptAllocation.commercial_invoice_id == invoice.id,
                CommercialInvoiceReceiptAllocation.idempotency_key == key,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        voucher = await db.get(Voucher, existing.voucher_id)
        if voucher is None or voucher.tenant_id != tenant_id:
            raise HTTPException(status_code=500, detail="Allocation voucher missing")
        outstanding = await get_ci_outstanding(db, tenant_id=tenant_id, invoice=invoice)
        return existing, voucher, outstanding, False

    amt = _money2(_d(amount))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="amount must be greater than zero")
    rate = _d(exchange_rate_to_base)
    if rate <= 0:
        raise HTTPException(status_code=400, detail="exchange_rate_to_base must be greater than zero")

    outstanding = await get_ci_outstanding(db, tenant_id=tenant_id, invoice=invoice)
    if amt > outstanding.outstanding_for_new:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Receipt amount exceeds outstanding balance "
                f"(outstanding={float(outstanding.outstanding_for_new)})"
            ),
        )

    cur = (currency or invoice.currency or "USD").strip().upper()[:10] or "USD"
    base_amt = _money4(amt * rate)
    line = (
        await db.execute(
            select(CommercialInvoiceLine)
            .where(
                CommercialInvoiceLine.commercial_invoice_id == invoice.id,
                CommercialInvoiceLine.tenant_id == tenant_id,
            )
            .order_by(CommercialInvoiceLine.sort_order)
            .limit(1)
        )
    ).scalar_one_or_none()
    primary_order_id = line.order_id if line else None

    voucher = await create_system_voucher(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_type="RECEIPT",
        voucher_date=receipt_date,
        lines=[
            AutoPostingLine(
                entry_type="DEBIT",
                amount=amt,
                account_id=bank_ledger_id,
                notes=f"Receipt against CI {invoice.invoice_code}",
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amt,
                account_id=receivable_ledger_id,
                notes=f"Clear receivable for CI {invoice.invoice_code}",
            ),
        ],
        description=f"Receipt for commercial invoice {invoice.invoice_code}",
        reference=invoice.invoice_code,
        source_module="COMMERCIAL_INVOICE",
        source_module_ref=str(invoice.id),
        currency=cur,
        exchange_rate=float(rate),
        auto_post=False,
    )
    voucher.order_id = primary_order_id
    voucher.allow_manual_edit = True

    allocation = CommercialInvoiceReceiptAllocation(
        tenant_id=tenant_id,
        commercial_invoice_id=invoice.id,
        voucher_id=voucher.id,
        order_id=primary_order_id,
        allocated_amount=amt,
        allocated_base_amount=base_amt,
        currency=cur,
        exchange_rate_to_base=rate,
        status="PENDING",
        idempotency_key=key,
        created_by=user_id,
    )
    db.add(allocation)
    await db.flush()
    outstanding_after = await get_ci_outstanding(db, tenant_id=tenant_id, invoice=invoice)
    return allocation, voucher, outstanding_after, True


async def sync_ci_allocation_status_for_voucher(
    db: AsyncSession,
    *,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    if (voucher.source_module or "").upper() != "COMMERCIAL_INVOICE":
        return
    # AR journal on ISSUE has no receipt allocation; only RECEIPT vouchers do.
    if (voucher.voucher_type or "").upper() != "RECEIPT":
        return
    alloc = (
        await db.execute(
            select(CommercialInvoiceReceiptAllocation).where(
                CommercialInvoiceReceiptAllocation.tenant_id == tenant_id,
                CommercialInvoiceReceiptAllocation.voucher_id == voucher.id,
            )
        )
    ).scalar_one_or_none()
    if alloc is None:
        return
    vstatus = (voucher.status or "").strip().upper()
    if vstatus == "POSTED":
        alloc.status = "POSTED"
    elif vstatus in {"REVERSED", "CANCELLED"}:
        alloc.status = "REVERSED"
    alloc.updated_at = datetime.utcnow()
    await db.flush()


async def order_has_fully_paid_commercial_invoice(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> bool | None:
    """
    When ISSUED CIs exist for the order:
      True  — all have posted outstanding <= 0
      False — at least one still has posted outstanding
    None — no ISSUED CI linked (caller falls back to PI / legacy).
    """
    invoice_ids = list(
        (
            await db.execute(
                select(CommercialInvoice.id)
                .join(
                    CommercialInvoiceLine,
                    CommercialInvoiceLine.commercial_invoice_id == CommercialInvoice.id,
                )
                .where(
                    CommercialInvoice.tenant_id == tenant_id,
                    CommercialInvoiceLine.order_id == order_id,
                    func.upper(CommercialInvoice.status) == "ISSUED",
                )
                .distinct()
            )
        ).scalars().all()
    )
    if not invoice_ids:
        return None

    for inv_id in invoice_ids:
        inv = await db.get(CommercialInvoice, inv_id)
        if inv is None or inv.tenant_id != tenant_id:
            continue
        outstanding = await get_ci_outstanding(db, tenant_id=tenant_id, invoice=inv)
        if outstanding.total_amount <= 0:
            if outstanding.allocated_posted <= 0:
                return False
            continue
        if outstanding.outstanding_posted > 0:
            return False
    return True
