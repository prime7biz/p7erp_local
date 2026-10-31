"""Proforma invoice receipt allocations: partial payments + outstanding balance."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ProformaInvoice, ProformaInvoiceOrder, Voucher
from app.models.commercial import ProformaReceiptAllocation
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher

ACTIVE_ALLOCATION_STATUSES = ("PENDING", "POSTED")
POSTED_ALLOCATION_STATUS = "POSTED"
MONEY_Q = Decimal("0.0001")
MONEY_2 = Decimal("0.01")


def _d(value: object | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money4(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def _money2(value: Decimal) -> Decimal:
    return value.quantize(MONEY_2, rounding=ROUND_HALF_UP)


@dataclass
class ProformaOutstanding:
    pi_id: int
    pi_amount: Decimal
    allocated_active: Decimal
    allocated_posted: Decimal
    outstanding_for_new: Decimal
    outstanding_posted: Decimal
    currency: str | None


async def get_proforma_outstanding(
    db: AsyncSession,
    *,
    tenant_id: int,
    pi: ProformaInvoice,
) -> ProformaOutstanding:
    pi_amount = _money2(_d(pi.amount))
    active = (
        await db.execute(
            select(func.coalesce(func.sum(ProformaReceiptAllocation.allocated_amount), 0)).where(
                ProformaReceiptAllocation.tenant_id == tenant_id,
                ProformaReceiptAllocation.proforma_invoice_id == pi.id,
                ProformaReceiptAllocation.status.in_(list(ACTIVE_ALLOCATION_STATUSES)),
            )
        )
    ).scalar()
    posted = (
        await db.execute(
            select(func.coalesce(func.sum(ProformaReceiptAllocation.allocated_amount), 0)).where(
                ProformaReceiptAllocation.tenant_id == tenant_id,
                ProformaReceiptAllocation.proforma_invoice_id == pi.id,
                ProformaReceiptAllocation.status == POSTED_ALLOCATION_STATUS,
            )
        )
    ).scalar()
    allocated_active = _money2(_d(active))
    allocated_posted = _money2(_d(posted))
    return ProformaOutstanding(
        pi_id=pi.id,
        pi_amount=pi_amount,
        allocated_active=allocated_active,
        allocated_posted=allocated_posted,
        outstanding_for_new=_money2(max(pi_amount - allocated_active, Decimal("0"))),
        outstanding_posted=_money2(max(pi_amount - allocated_posted, Decimal("0"))),
        currency=pi.currency,
    )


async def list_allocations_for_pi(
    db: AsyncSession,
    *,
    tenant_id: int,
    pi_id: int,
) -> list[ProformaReceiptAllocation]:
    result = await db.execute(
        select(ProformaReceiptAllocation)
        .where(
            ProformaReceiptAllocation.tenant_id == tenant_id,
            ProformaReceiptAllocation.proforma_invoice_id == pi_id,
        )
        .order_by(ProformaReceiptAllocation.id.desc())
    )
    return list(result.scalars().all())


async def order_ids_for_pi(db: AsyncSession, *, pi: ProformaInvoice) -> list[int]:
    # Always query explicitly — lazy-loading relationships fails under AsyncSession.
    rows = (
        await db.execute(
            select(ProformaInvoiceOrder.order_id)
            .where(ProformaInvoiceOrder.proforma_invoice_id == pi.id)
            .order_by(ProformaInvoiceOrder.sort_order)
        )
    ).scalars().all()
    return list(rows)


async def create_receipt_from_proforma(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    pi: ProformaInvoice,
    amount: Decimal,
    receipt_date: date,
    bank_ledger_id: int,
    receivable_ledger_id: int,
    currency: str | None,
    exchange_rate_to_base: Decimal,
    idempotency_key: str,
) -> tuple[ProformaReceiptAllocation, Voucher, ProformaOutstanding, bool]:
    """Create draft RECEIPT + allocation. Returns (allocation, voucher, outstanding_after, was_created)."""
    direction = (pi.direction or "").strip().upper()
    if direction != "EXPORT":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only EXPORT proforma invoices can create receipt vouchers. "
            "IMPORT settlement uses a PAYMENT voucher flow.",
        )
    if (pi.status or "").strip().upper() != "ISSUED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only ISSUED proforma invoices can record payment",
        )

    key = (idempotency_key or "").strip()[:128]
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="idempotency_key is required")

    existing = (
        await db.execute(
            select(ProformaReceiptAllocation).where(
                ProformaReceiptAllocation.tenant_id == tenant_id,
                ProformaReceiptAllocation.proforma_invoice_id == pi.id,
                ProformaReceiptAllocation.idempotency_key == key,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        voucher = await db.get(Voucher, existing.voucher_id)
        if voucher is None or voucher.tenant_id != tenant_id:
            raise HTTPException(status_code=500, detail="Allocation voucher missing")
        outstanding = await get_proforma_outstanding(db, tenant_id=tenant_id, pi=pi)
        return existing, voucher, outstanding, False

    amt = _money2(_d(amount))
    if amt <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount must be greater than zero")

    rate = _d(exchange_rate_to_base)
    if rate <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="exchange_rate_to_base must be greater than zero",
        )

    outstanding = await get_proforma_outstanding(db, tenant_id=tenant_id, pi=pi)
    if amt > outstanding.outstanding_for_new:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Receipt amount exceeds outstanding balance "
                f"(outstanding={float(outstanding.outstanding_for_new)}, "
                f"pi_amount={float(outstanding.pi_amount)}, "
                f"already_allocated={float(outstanding.allocated_active)})"
            ),
        )

    cur = (currency or pi.currency or "USD").strip().upper()[:10] or "USD"
    base_amt = _money4(amt * rate)
    order_ids = await order_ids_for_pi(db, pi=pi)
    primary_order_id = order_ids[0] if order_ids else None

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
                notes=f"Receipt against PI {pi.reference}",
            ),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amt,
                account_id=receivable_ledger_id,
                notes=f"Clear receivable for PI {pi.reference}",
            ),
        ],
        description=f"Receipt for proforma {pi.reference}",
        reference=pi.reference,
        source_module="PROFORMA",
        source_module_ref=str(pi.id),
        currency=cur,
        base_currency=None,
        exchange_rate=float(rate),
        auto_post=False,
    )
    voucher.order_id = primary_order_id
    voucher.allow_manual_edit = True

    allocation = ProformaReceiptAllocation(
        tenant_id=tenant_id,
        proforma_invoice_id=pi.id,
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

    outstanding_after = await get_proforma_outstanding(db, tenant_id=tenant_id, pi=pi)
    return allocation, voucher, outstanding_after, True


async def sync_allocation_status_for_voucher(
    db: AsyncSession,
    *,
    tenant_id: int,
    voucher: Voucher,
) -> None:
    """Keep allocation status in sync when a RECEIPT voucher is posted or reversed."""
    if (voucher.source_module or "").upper() != "PROFORMA":
        return
    alloc = (
        await db.execute(
            select(ProformaReceiptAllocation).where(
                ProformaReceiptAllocation.tenant_id == tenant_id,
                ProformaReceiptAllocation.voucher_id == voucher.id,
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


async def order_has_fully_paid_proforma(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> bool | None:
    """
    Balance-based payment check via linked EXPORT ISSUED PIs.
    Returns:
      True  — at least one measurable PI and all linked PI posted-outstanding are <= 0
      False — linked PI(s) exist but still have posted outstanding
      None  — no ISSUED EXPORT PI linked (caller may fall back to legacy voucher check)
    """
    pi_ids = list(
        (
            await db.execute(
                select(ProformaInvoice.id)
                .join(
                    ProformaInvoiceOrder,
                    ProformaInvoiceOrder.proforma_invoice_id == ProformaInvoice.id,
                )
                .where(
                    ProformaInvoice.tenant_id == tenant_id,
                    ProformaInvoiceOrder.order_id == order_id,
                    func.upper(ProformaInvoice.direction) == "EXPORT",
                    func.upper(ProformaInvoice.status) == "ISSUED",
                )
            )
        ).scalars().all()
    )
    if not pi_ids:
        return None

    for pi_id in pi_ids:
        pi = await db.get(ProformaInvoice, pi_id)
        if pi is None or pi.tenant_id != tenant_id:
            continue
        outstanding = await get_proforma_outstanding(db, tenant_id=tenant_id, pi=pi)
        if outstanding.pi_amount <= 0:
            # Zero-amount PI does not count as paid unless there is a posted allocation.
            if outstanding.allocated_posted <= 0:
                return False
            continue
        if outstanding.outstanding_posted > 0:
            return False
    return True


async def load_pi_with_orders(
    db: AsyncSession,
    *,
    tenant_id: int,
    pi_id: int,
) -> ProformaInvoice | None:
    result = await db.execute(
        select(ProformaInvoice)
        .where(ProformaInvoice.id == pi_id, ProformaInvoice.tenant_id == tenant_id)
        .options(selectinload(ProformaInvoice.proforma_invoice_orders))
    )
    return result.scalar_one_or_none()
