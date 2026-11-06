"""Create and settle PartyLedgerBill rows; FIFO/LIFO/manual allocation; interest."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models.finance import Voucher, VoucherLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill, PartyLedgerBillAllocation
from app.modules.finance.party_ledger_service import (
    _d,
    _money,
    update_party_ledger_balance,
)

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
OPEN_STATUSES = ("PENDING", "PARTIAL", "OVERDUE")


def _bill_type_from_voucher(voucher: Voucher, amount_type: str) -> str:
    src = (voucher.source_module or "").upper()
    vtype = (voucher.voucher_type or "").upper()
    if src in {"COMMERCIAL_INVOICE", "CI", "EXPORT_INVOICE"}:
        return "SALE"
    if src in {"VENDOR_BILL", "VENDOR_BILLS"}:
        return "PURCHASE"
    if vtype == "RECEIPT":
        return "RECEIPT"
    if vtype == "PAYMENT":
        return "PAYMENT"
    if vtype in {"CREDIT_NOTE", "CN"}:
        return "CREDIT_NOTE"
    if vtype in {"DEBIT_NOTE", "DN"}:
        return "DEBIT_NOTE"
    if amount_type == "DR":
        return "SALE" if src else "JOURNAL"
    if amount_type == "CR":
        return "PURCHASE" if src else "JOURNAL"
    return "JOURNAL"


def _refresh_bill_status(bill: PartyLedgerBill, *, as_of: date | None = None) -> None:
    pending = _d(bill.pending_amount)
    if pending <= ZERO:
        bill.pending_amount = ZERO
        bill.status = "SETTLED"
        return
    as_of = as_of or today_local()
    if bill.due_date and bill.due_date < as_of and bill.status != "CANCELLED":
        bill.status = "OVERDUE"
    elif _d(bill.settled_amount) > ZERO:
        bill.status = "PARTIAL"
    else:
        bill.status = "PENDING"


async def _next_bill_number(db: AsyncSession, tenant_id: int, prefix: str) -> str:
    like = f"{prefix}%"
    last = (
        await db.execute(
            select(PartyLedgerBill.bill_number)
            .where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.bill_number.ilike(like),
            )
            .order_by(PartyLedgerBill.bill_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not last:
        return f"{prefix}0001"
    digits = "".join(ch for ch in str(last)[len(prefix) :] if ch.isdigit()) or "0"
    return f"{prefix}{int(digits) + 1:04d}"


async def create_bill_from_voucher_line(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    voucher_line: VoucherLine,
    *,
    party_ledger_id: int,
    bill_number: str | None = None,
    due_date: date | None = None,
    commercial_invoice_id: int | None = None,
    vendor_bill_id: int | None = None,
) -> PartyLedgerBill:
    pl = await db.get(PartyLedger, party_ledger_id)
    if not pl or pl.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Party ledger not found")
    if not pl.bill_wise_tracking:
        raise HTTPException(status_code=400, detail="Bill-wise tracking is disabled for this party")

    entry = (voucher_line.entry_type or "").upper()
    # Party perspective: DEBIT on AR/AP party account → party owes us (DR bill)
    # CREDIT on party account → we owe party (CR bill)
    amount_type = "DR" if entry == "DEBIT" else "CR"
    amount = _money(_d(voucher_line.amount))
    if amount <= ZERO:
        raise HTTPException(status_code=400, detail="Bill amount must be greater than zero")

    bill_type = _bill_type_from_voucher(voucher, amount_type)
    prefix = f"PL-{pl.id}-"
    number = (bill_number or "").strip() or await _next_bill_number(db, tenant_id, prefix)

    # Idempotency: same voucher line → same bill
    existing = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.voucher_line_id == voucher_line.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    credit_days = int(pl.credit_days or 30)
    bill_date = voucher.voucher_date or today_local()
    if due_date is None and bill_type in {"SALE", "PURCHASE", "JOURNAL", "DEBIT_NOTE", "CREDIT_NOTE"}:
        due_date = bill_date + timedelta(days=credit_days)

    bill = PartyLedgerBill(
        tenant_id=tenant_id,
        party_ledger_id=pl.id,
        bill_number=number,
        bill_date=bill_date,
        bill_type=bill_type,
        source_module=voucher.source_module,
        source_module_ref=voucher.source_module_ref,
        voucher_id=voucher.id,
        voucher_line_id=voucher_line.id,
        commercial_invoice_id=commercial_invoice_id,
        vendor_bill_id=vendor_bill_id,
        original_amount=amount,
        amount_type=amount_type,
        pending_amount=amount,
        settled_amount=ZERO,
        status="PENDING",
        due_date=due_date,
        interest_rate_monthly=pl.interest_rate_monthly,
        narration=voucher_line.notes or voucher.description,
    )
    db.add(bill)
    await db.flush()
    await update_party_ledger_balance(db, pl.id)
    return bill


async def voucher_unallocated_for_party(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    party_ledger_id: int,
) -> Decimal:
    """How much of this voucher is still free to settle bills of one party.

    Capacity is the voucher's amount on the party's ledger account (or, when the voucher does
    not touch that account, its total debits) minus what it already settled for that party.
    """
    pl = await db.get(PartyLedger, party_ledger_id)
    lines = list(
        (
            await db.execute(
                select(VoucherLine).where(VoucherLine.voucher_id == voucher.id, VoucherLine.tenant_id == tenant_id)
            )
        ).scalars().all()
    )
    party_lines = [ln for ln in lines if pl is not None and ln.account_id == pl.ledger_account_id]
    if party_lines:
        dr = sum((_d(ln.amount) for ln in party_lines if (ln.entry_type or "").upper() == "DEBIT"), ZERO)
        cr = sum((_d(ln.amount) for ln in party_lines if (ln.entry_type or "").upper() != "DEBIT"), ZERO)
        capacity = max(dr, cr)
    else:
        capacity = sum((_d(ln.amount) for ln in lines if (ln.entry_type or "").upper() == "DEBIT"), ZERO)
    used = (
        await db.execute(
            select(func.coalesce(func.sum(PartyLedgerBillAllocation.allocated_amount), 0))
            .join(PartyLedgerBill, PartyLedgerBill.id == PartyLedgerBillAllocation.bill_id)
            .where(
                PartyLedgerBillAllocation.tenant_id == tenant_id,
                PartyLedgerBillAllocation.voucher_id == voucher.id,
                PartyLedgerBill.party_ledger_id == party_ledger_id,
            )
        )
    ).scalar_one()
    return _money(max(capacity - _d(used), ZERO))


async def allocate_to_bill(
    db: AsyncSession,
    tenant_id: int,
    *,
    bill_id: int,
    voucher_id: int,
    allocated_amount: Decimal,
    allocated_date: date | None = None,
    voucher_line_id: int | None = None,
    notes: str | None = None,
    created_by: int | None = None,
) -> PartyLedgerBillAllocation:
    # Write pending changes first so the locked re-reads below cannot discard them.
    await db.flush()
    # Lock order voucher -> bill (same as posting) so concurrent allocations serialize.
    voucher = (
        await db.execute(
            select(Voucher)
            .where(Voucher.id == voucher_id, Voucher.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if voucher is None:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if (voucher.status or "").upper() != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can settle bills")

    bill = (
        await db.execute(
            select(PartyLedgerBill)
            .where(PartyLedgerBill.id == bill_id, PartyLedgerBill.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if bill is None:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot allocate to a cancelled bill")
    if bill.status == "SETTLED" or _d(bill.pending_amount) <= ZERO:
        raise HTTPException(status_code=400, detail="Bill is already settled")

    amt = _money(_d(allocated_amount))
    if amt <= ZERO:
        raise HTTPException(status_code=400, detail="allocated_amount must be greater than zero")
    if amt > _d(bill.pending_amount):
        raise HTTPException(
            status_code=400,
            detail=f"allocated_amount {amt} exceeds pending {bill.pending_amount}",
        )
    remainder = await voucher_unallocated_for_party(db, tenant_id, voucher, bill.party_ledger_id)
    if amt > remainder:
        raise HTTPException(
            status_code=400,
            detail=f"allocated_amount {amt} exceeds the voucher's unallocated amount {remainder}",
        )

    existing = (
        await db.execute(
            select(PartyLedgerBillAllocation).where(
                PartyLedgerBillAllocation.tenant_id == tenant_id,
                PartyLedgerBillAllocation.bill_id == bill_id,
                PartyLedgerBillAllocation.voucher_id == voucher_id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        # Top-up existing allocation for same voucher
        new_total = _money(_d(existing.allocated_amount) + amt)
        if new_total > _d(bill.original_amount):
            raise HTTPException(status_code=400, detail="Allocation would exceed original bill amount")
        existing.allocated_amount = new_total
        bill.pending_amount = _money(_d(bill.pending_amount) - amt)
        bill.settled_amount = _money(_d(bill.settled_amount) + amt)
        _refresh_bill_status(bill)
        existing.bill_balance_after = bill.pending_amount
        if notes:
            existing.notes = notes
        await db.flush()
        await update_party_ledger_balance(db, bill.party_ledger_id)
        return existing

    bill.pending_amount = _money(_d(bill.pending_amount) - amt)
    bill.settled_amount = _money(_d(bill.settled_amount) + amt)
    _refresh_bill_status(bill)

    alloc = PartyLedgerBillAllocation(
        tenant_id=tenant_id,
        bill_id=bill.id,
        voucher_id=voucher_id,
        voucher_line_id=voucher_line_id,
        allocated_amount=amt,
        allocated_date=allocated_date or voucher.voucher_date or today_local(),
        bill_balance_after=bill.pending_amount,
        notes=notes,
        created_by=created_by,
    )
    db.add(alloc)
    await db.flush()
    await update_party_ledger_balance(db, bill.party_ledger_id)
    return alloc


async def auto_allocate_payment(
    db: AsyncSession,
    tenant_id: int,
    party_ledger_id: int,
    payment_voucher: Voucher,
    payment_amount: Decimal,
    *,
    allocation_method: Literal["FIFO", "LIFO", "MANUAL"] = "FIFO",
    manual_bill_ids: list[int] | None = None,
    target_amount_type: str | None = None,
    voucher_line_id: int | None = None,
    created_by: int | None = None,
) -> list[PartyLedgerBillAllocation]:
    """Allocate payment/receipt against opposite-side open bills.

    RECEIPT (money in) settles DR (AR) bills.
    PAYMENT (money out) settles CR (AP) bills.
    """
    remaining = _money(_d(payment_amount))
    if remaining <= ZERO:
        return []
    if (payment_voucher.status or "").upper() != "POSTED":
        raise HTTPException(status_code=400, detail="Only posted vouchers can settle bills")
    remaining = min(remaining, await voucher_unallocated_for_party(db, tenant_id, payment_voucher, party_ledger_id))
    if remaining <= ZERO:
        return []

    vtype = (payment_voucher.voucher_type or "").upper()
    if target_amount_type is None:
        if vtype == "RECEIPT":
            target_amount_type = "DR"
        elif vtype == "PAYMENT":
            target_amount_type = "CR"
        else:
            # Journal settlement line: allocate against opposite of the settlement line itself
            # Caller should pass target_amount_type; default DR
            target_amount_type = "DR"

    q = (
        select(PartyLedgerBill)
        .where(
            PartyLedgerBill.tenant_id == tenant_id,
            PartyLedgerBill.party_ledger_id == party_ledger_id,
            PartyLedgerBill.amount_type == target_amount_type,
            PartyLedgerBill.status.in_(OPEN_STATUSES),
            PartyLedgerBill.pending_amount > 0,
        )
    )
    if allocation_method == "MANUAL" and manual_bill_ids:
        q = q.where(PartyLedgerBill.id.in_(manual_bill_ids))
        # Preserve manual order
        bills = list((await db.execute(q)).scalars().all())
        id_order = {bid: i for i, bid in enumerate(manual_bill_ids)}
        bills.sort(key=lambda b: id_order.get(b.id, 9999))
    else:
        if allocation_method == "LIFO":
            q = q.order_by(PartyLedgerBill.bill_date.desc(), PartyLedgerBill.id.desc())
        else:
            q = q.order_by(PartyLedgerBill.bill_date.asc(), PartyLedgerBill.id.asc())
        bills = list((await db.execute(q)).scalars().all())

    allocations: list[PartyLedgerBillAllocation] = []
    for bill in bills:
        if remaining <= ZERO:
            break
        take = min(remaining, _d(bill.pending_amount))
        alloc = await allocate_to_bill(
            db,
            tenant_id,
            bill_id=bill.id,
            voucher_id=payment_voucher.id,
            allocated_amount=take,
            allocated_date=payment_voucher.voucher_date,
            voucher_line_id=voucher_line_id,
            notes=f"Auto-allocate {allocation_method}",
            created_by=created_by,
        )
        allocations.append(alloc)
        remaining = _money(remaining - take)
    return allocations


async def calculate_bill_interest(
    db: AsyncSession,
    bill_id: int,
    as_of_date: date | None = None,
) -> Decimal:
    bill = await db.get(PartyLedgerBill, bill_id)
    if not bill:
        return ZERO
    if bill.status in {"SETTLED", "CANCELLED"}:
        return _d(bill.interest_accrued)

    as_of = as_of_date or today_local()
    rate = bill.interest_rate_monthly
    if rate is None:
        pl = await db.get(PartyLedger, bill.party_ledger_id)
        rate = pl.interest_rate_monthly if pl else None
    if rate is None or _d(rate) <= ZERO:
        return _d(bill.interest_accrued)
    if not bill.due_date or bill.due_date >= as_of:
        return _d(bill.interest_accrued)

    days_overdue = (as_of - bill.due_date).days
    pending = _d(bill.pending_amount)
    interest = _money(pending * (_d(rate) / Decimal("100")) * (Decimal(days_overdue) / Decimal("30")))
    bill.interest_accrued = interest
    bill.interest_last_calculated_at = datetime.utcnow()
    await db.flush()
    return interest


async def mark_overdue_bills(
    db: AsyncSession,
    tenant_id: int,
    as_of_date: date | None = None,
) -> int:
    as_of = as_of_date or today_local()
    bills = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status.in_(("PENDING", "PARTIAL")),
                PartyLedgerBill.due_date.is_not(None),
                PartyLedgerBill.due_date < as_of,
                PartyLedgerBill.pending_amount > 0,
            )
        )
    ).scalars().all()
    count = 0
    for bill in bills:
        bill.status = "OVERDUE"
        bill.updated_at = datetime.utcnow()
        count += 1
    await db.flush()
    return count


async def calculate_all_interest(
    db: AsyncSession,
    tenant_id: int,
    as_of_date: date | None = None,
) -> tuple[int, Decimal]:
    as_of = as_of_date or today_local()
    bills = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status == "OVERDUE",
                PartyLedgerBill.pending_amount > 0,
            )
        )
    ).scalars().all()
    total = ZERO
    n = 0
    for bill in bills:
        interest = await calculate_bill_interest(db, bill.id, as_of)
        if interest > ZERO:
            n += 1
            total += interest
    return n, _money(total)


async def cancel_bills_for_voucher(
    db: AsyncSession,
    tenant_id: int,
    voucher_id: int,
) -> int:
    """Mark bills from this voucher CANCELLED and reverse their allocations."""
    bills = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.voucher_id == voucher_id,
                PartyLedgerBill.status != "CANCELLED",
            )
        )
    ).scalars().all()

    # Reverse allocations WHERE this voucher was the settling voucher
    allocs = (
        await db.execute(
            select(PartyLedgerBillAllocation).where(
                PartyLedgerBillAllocation.tenant_id == tenant_id,
                PartyLedgerBillAllocation.voucher_id == voucher_id,
            )
        )
    ).scalars().all()
    touched_pl: set[int] = set()
    for alloc in allocs:
        bill = await db.get(PartyLedgerBill, alloc.bill_id)
        if bill and bill.status != "CANCELLED":
            bill.pending_amount = _money(_d(bill.pending_amount) + _d(alloc.allocated_amount))
            bill.settled_amount = _money(max(ZERO, _d(bill.settled_amount) - _d(alloc.allocated_amount)))
            _refresh_bill_status(bill)
            touched_pl.add(bill.party_ledger_id)
        await db.delete(alloc)

    for bill in bills:
        bill.status = "CANCELLED"
        bill.pending_amount = ZERO
        bill.updated_at = datetime.utcnow()
        touched_pl.add(bill.party_ledger_id)

    for pl_id in touched_pl:
        await update_party_ledger_balance(db, pl_id)
    await db.flush()
    return len(bills)


async def bill_summary_counts(db: AsyncSession, party_ledger_id: int) -> dict[str, int]:
    bills = (
        await db.execute(
            select(PartyLedgerBill.status).where(PartyLedgerBill.party_ledger_id == party_ledger_id)
        )
    ).scalars().all()
    counts = {"PENDING": 0, "PARTIAL": 0, "SETTLED": 0, "OVERDUE": 0, "CANCELLED": 0}
    for st in bills:
        key = (st or "PENDING").upper()
        if key in counts:
            counts[key] += 1
    return counts


def bill_out(bill: PartyLedgerBill) -> dict[str, Any]:
    days = None
    if bill.due_date:
        days = (today_local() - bill.due_date).days
    return {
        "id": bill.id,
        "party_ledger_id": bill.party_ledger_id,
        "bill_number": bill.bill_number,
        "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
        "bill_type": bill.bill_type,
        "source_module": bill.source_module,
        "source_module_ref": bill.source_module_ref,
        "voucher_id": bill.voucher_id,
        "voucher_line_id": bill.voucher_line_id,
        "commercial_invoice_id": bill.commercial_invoice_id,
        "vendor_bill_id": bill.vendor_bill_id,
        "original_amount": str(_money(_d(bill.original_amount))),
        "amount_type": bill.amount_type,
        "pending_amount": str(_money(_d(bill.pending_amount))),
        "settled_amount": str(_money(_d(bill.settled_amount))),
        "status": bill.status,
        "due_date": bill.due_date.isoformat() if bill.due_date else None,
        "days_overdue": days,
        "interest_rate_monthly": str(bill.interest_rate_monthly) if bill.interest_rate_monthly is not None else None,
        "interest_accrued": str(_money(_d(bill.interest_accrued))),
        "narration": bill.narration,
        "created_at": bill.created_at.isoformat() if bill.created_at else None,
    }


def allocation_out(alloc: PartyLedgerBillAllocation) -> dict[str, Any]:
    return {
        "id": alloc.id,
        "bill_id": alloc.bill_id,
        "voucher_id": alloc.voucher_id,
        "voucher_line_id": alloc.voucher_line_id,
        "allocated_amount": str(_money(_d(alloc.allocated_amount))),
        "allocated_date": alloc.allocated_date.isoformat() if alloc.allocated_date else None,
        "bill_balance_after": str(_money(_d(alloc.bill_balance_after))),
        "notes": alloc.notes,
        "created_at": alloc.created_at.isoformat() if alloc.created_at else None,
    }
