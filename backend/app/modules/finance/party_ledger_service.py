"""Core PartyLedger CRUD, balances, statement, and aging."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.finance import AccountGroup, ChartOfAccount
from app.models.inventory import Vendor
from app.models.party_ledger import PartyLedger, PartyLedgerBill

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


def _d(value: Any) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).replace(",", "") or "0")
    except Exception:
        return ZERO


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


async def _next_party_account_number(db: AsyncSession, tenant_id: int, prefix: str) -> str:
    like = f"{prefix}%"
    existing = (
        await db.execute(
            select(ChartOfAccount.account_number)
            .where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.account_number.ilike(like),
            )
            .order_by(ChartOfAccount.account_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not existing:
        return f"{prefix}0001"
    digits = "".join(ch for ch in str(existing)[len(prefix) :] if ch.isdigit()) or "0"
    return f"{prefix}{int(digits) + 1:04d}"


async def _ensure_party_coa(
    db: AsyncSession,
    *,
    tenant_id: int,
    party_type: str,
    party_name: str,
    existing_ledger_id: int | None = None,
) -> ChartOfAccount:
    if existing_ledger_id:
        acct = await db.get(ChartOfAccount, existing_ledger_id)
        if acct and acct.tenant_id == tenant_id:
            if not acct.enable_bill_wise:
                acct.enable_bill_wise = True
            return acct

    group_code = "TRADE_RECEIVABLES" if party_type == "CUSTOMER" else "TRADE_PAYABLES"
    normal = "debit" if party_type == "CUSTOMER" else "credit"
    prefix = "AR-" if party_type == "CUSTOMER" else "AP-"

    group = (
        await db.execute(
            select(AccountGroup).where(
                AccountGroup.tenant_id == tenant_id,
                AccountGroup.system_code == group_code,
            )
        )
    ).scalar_one_or_none()
    if not group:
        # Fallback: any receivable/payable-ish group by nature
        nature = "Asset" if party_type == "CUSTOMER" else "Liability"
        group = (
            await db.execute(
                select(AccountGroup)
                .where(
                    AccountGroup.tenant_id == tenant_id,
                    func.lower(AccountGroup.nature) == nature.lower(),
                )
                .order_by(AccountGroup.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if not group:
        raise HTTPException(
            status_code=400,
            detail=f"No account group found to create party ledger ({group_code})",
        )

    acct_number = await _next_party_account_number(db, tenant_id, prefix)
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=acct_number,
        name=f"{party_name} ({party_type.title()})",
        group_id=group.id,
        normal_balance=normal,
        enable_bill_wise=True,
        is_active=True,
        account_type="posting",
        usage_purpose="party_ledger",
        linked_module="PARTY_LEDGER",
    )
    db.add(acct)
    await db.flush()
    return acct


async def get_or_create_party_ledger(
    db: AsyncSession,
    tenant_id: int,
    party_type: str,
    party_id: int,
    *,
    credit_limit: Decimal | None = None,
    credit_days: int = 30,
    interest_rate_monthly: Decimal | None = None,
    ledger_account_id: int | None = None,
    opening_balance: Decimal | None = None,
    opening_balance_type: str = "DR",
    opening_balance_date: date | None = None,
    bill_wise_tracking: bool = True,
    created_by: int | None = None,
) -> PartyLedger:
    party_type = (party_type or "").strip().upper()
    if party_type not in {"CUSTOMER", "VENDOR"}:
        raise HTTPException(status_code=400, detail="party_type must be CUSTOMER or VENDOR")

    filters = [PartyLedger.tenant_id == tenant_id, PartyLedger.party_type == party_type]
    if party_type == "CUSTOMER":
        filters.append(PartyLedger.customer_id == party_id)
    else:
        filters.append(PartyLedger.vendor_id == party_id)

    existing = (await db.execute(select(PartyLedger).where(*filters))).scalar_one_or_none()
    if existing:
        return existing

    party_name = ""
    vendor_ledger_id: int | None = None
    if party_type == "CUSTOMER":
        customer = await db.get(Customer, party_id)
        if not customer or customer.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Customer not found")
        party_name = customer.name
    else:
        vendor = await db.get(Vendor, party_id)
        if not vendor or vendor.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Vendor not found")
        party_name = vendor.name
        vendor_ledger_id = vendor.ledger_id
        if credit_limit is None and vendor.credit_limit is not None:
            credit_limit = _d(vendor.credit_limit)
        if credit_days == 30 and vendor.payment_terms_days:
            credit_days = int(vendor.payment_terms_days)

    if ledger_account_id:
        acct = await db.get(ChartOfAccount, ledger_account_id)
        if not acct or acct.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Ledger account not found")
        if not acct.enable_bill_wise:
            acct.enable_bill_wise = True
    else:
        acct = await _ensure_party_coa(
            db,
            tenant_id=tenant_id,
            party_type=party_type,
            party_name=party_name,
            existing_ledger_id=vendor_ledger_id,
        )
        if party_type == "VENDOR" and vendor_ledger_id is None:
            vendor = await db.get(Vendor, party_id)
            if vendor:
                vendor.ledger_id = acct.id

    ob = _money(_d(opening_balance))
    ob_type = (opening_balance_type or "DR").upper()
    if ob_type not in {"DR", "CR"}:
        ob_type = "DR"

    row = PartyLedger(
        tenant_id=tenant_id,
        party_type=party_type,
        customer_id=party_id if party_type == "CUSTOMER" else None,
        vendor_id=party_id if party_type == "VENDOR" else None,
        ledger_account_id=acct.id,
        credit_limit=credit_limit,
        credit_days=credit_days,
        interest_rate_monthly=interest_rate_monthly,
        opening_balance=ob,
        opening_balance_type=ob_type,
        opening_balance_date=opening_balance_date or date.today(),
        current_balance=ob,
        current_balance_type=ob_type,
        total_dr_amount=ob if ob_type == "DR" else ZERO,
        total_cr_amount=ob if ob_type == "CR" else ZERO,
        bill_wise_tracking=bill_wise_tracking,
        is_active=True,
        created_by=created_by,
    )
    db.add(row)
    await db.flush()
    return row


async def get_party_ledger_by_account(
    db: AsyncSession,
    tenant_id: int,
    account_id: int,
) -> PartyLedger | None:
    return (
        await db.execute(
            select(PartyLedger).where(
                PartyLedger.tenant_id == tenant_id,
                PartyLedger.ledger_account_id == account_id,
                PartyLedger.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()


async def update_party_ledger_balance(
    db: AsyncSession,
    party_ledger_id: int,
) -> None:
    pl = await db.get(PartyLedger, party_ledger_id)
    if not pl:
        return

    rows = (
        await db.execute(
            select(
                PartyLedgerBill.amount_type,
                func.coalesce(func.sum(PartyLedgerBill.pending_amount), 0),
                func.coalesce(func.sum(PartyLedgerBill.original_amount), 0),
            )
            .where(
                PartyLedgerBill.party_ledger_id == party_ledger_id,
                PartyLedgerBill.status != "CANCELLED",
            )
            .group_by(PartyLedgerBill.amount_type)
        )
    ).all()

    total_dr = ZERO
    total_cr = ZERO
    pending_dr = ZERO
    pending_cr = ZERO
    for amount_type, pending_sum, original_sum in rows:
        if amount_type == "DR":
            total_dr = _d(original_sum)
            pending_dr = _d(pending_sum)
        else:
            total_cr = _d(original_sum)
            pending_cr = _d(pending_sum)

    # Net outstanding from party's perspective: DR pending − CR pending, plus opening
    opening = _d(pl.opening_balance)
    if (pl.opening_balance_type or "DR").upper() == "CR":
        opening = -opening

    net = opening + pending_dr - pending_cr
    pl.total_dr_amount = _money(total_dr)
    pl.total_cr_amount = _money(total_cr)
    if net >= 0:
        pl.current_balance = _money(net)
        pl.current_balance_type = "DR"
    else:
        pl.current_balance = _money(-net)
        pl.current_balance_type = "CR"
    pl.updated_at = datetime.utcnow()
    await db.flush()


async def get_party_name(db: AsyncSession, pl: PartyLedger) -> str:
    if pl.party_type == "CUSTOMER" and pl.customer_id:
        c = await db.get(Customer, pl.customer_id)
        return c.name if c else f"Customer #{pl.customer_id}"
    if pl.vendor_id:
        v = await db.get(Vendor, pl.vendor_id)
        return v.name if v else f"Vendor #{pl.vendor_id}"
    return f"PartyLedger #{pl.id}"


async def get_party_names(db: AsyncSession, ledgers: Sequence[PartyLedger]) -> dict[int, str]:
    """Same names as ``get_party_name``, for many ledgers at once (one query per party type)."""
    customer_ids = {pl.customer_id for pl in ledgers if pl.party_type == "CUSTOMER" and pl.customer_id}
    vendor_ids = {
        pl.vendor_id
        for pl in ledgers
        if pl.vendor_id and not (pl.party_type == "CUSTOMER" and pl.customer_id)
    }
    customer_names: dict[int, str] = {}
    if customer_ids:
        rows = await db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(customer_ids)))
        customer_names = {row.id: row.name for row in rows}
    vendor_names: dict[int, str] = {}
    if vendor_ids:
        rows = await db.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_(vendor_ids)))
        vendor_names = {row.id: row.name for row in rows}

    names: dict[int, str] = {}
    for pl in ledgers:
        if pl.party_type == "CUSTOMER" and pl.customer_id:
            names[pl.id] = customer_names.get(pl.customer_id, f"Customer #{pl.customer_id}")
        elif pl.vendor_id:
            names[pl.id] = vendor_names.get(pl.vendor_id, f"Vendor #{pl.vendor_id}")
        else:
            names[pl.id] = f"PartyLedger #{pl.id}"
    return names


async def get_overdue_amounts(db: AsyncSession, ledger_ids: Sequence[int]) -> dict[int, Decimal]:
    """Pending amount of OVERDUE bills per party ledger (ledgers without any are left out)."""
    if not ledger_ids:
        return {}
    rows = await db.execute(
        select(PartyLedgerBill.party_ledger_id, func.sum(PartyLedgerBill.pending_amount))
        .where(
            PartyLedgerBill.party_ledger_id.in_(ledger_ids),
            PartyLedgerBill.status == "OVERDUE",
            PartyLedgerBill.pending_amount > 0,
        )
        .group_by(PartyLedgerBill.party_ledger_id)
    )
    return {ledger_id: _d(total) for ledger_id, total in rows.all()}


BILL_SUMMARY_STATUSES = ("PENDING", "PARTIAL", "SETTLED", "OVERDUE", "CANCELLED")


async def get_bill_summaries(db: AsyncSession, ledger_ids: Sequence[int]) -> dict[int, dict[str, int]]:
    """Bill count per status for each party ledger (same shape as ``bill_summary_counts``)."""
    summaries = {ledger_id: dict.fromkeys(BILL_SUMMARY_STATUSES, 0) for ledger_id in ledger_ids}
    if not ledger_ids:
        return summaries
    rows = await db.execute(
        select(PartyLedgerBill.party_ledger_id, PartyLedgerBill.status, func.count())
        .where(PartyLedgerBill.party_ledger_id.in_(ledger_ids))
        .group_by(PartyLedgerBill.party_ledger_id, PartyLedgerBill.status)
    )
    for ledger_id, status, count in rows.all():
        key = (status or "PENDING").upper()
        if key in summaries[ledger_id]:
            summaries[ledger_id][key] += int(count)
    return summaries


async def get_party_ledger_statement(
    db: AsyncSession,
    tenant_id: int,
    party_ledger_id: int,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict[str, Any]:
    pl = await db.get(PartyLedger, party_ledger_id)
    if not pl or pl.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Party ledger not found")

    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=90)

    # Opening = party opening + bills before from_date (net pending effect of settled+open history)
    opening = _d(pl.opening_balance)
    if (pl.opening_balance_type or "DR").upper() == "CR":
        opening = -opening

    prior = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.party_ledger_id == party_ledger_id,
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status != "CANCELLED",
                PartyLedgerBill.bill_date < from_date,
            )
        )
    ).scalars().all()
    for bill in prior:
        amt = _d(bill.original_amount)
        if bill.amount_type == "DR":
            opening += amt
        else:
            opening -= amt
        # Subtract settlements that happened before from_date via allocations
        from app.models.party_ledger import PartyLedgerBillAllocation

        alloc_sum = (
            await db.execute(
                select(func.coalesce(func.sum(PartyLedgerBillAllocation.allocated_amount), 0)).where(
                    PartyLedgerBillAllocation.bill_id == bill.id,
                    PartyLedgerBillAllocation.allocated_date < from_date,
                )
            )
        ).scalar_one()
        settled_prior = _d(alloc_sum)
        if bill.amount_type == "DR":
            opening -= settled_prior
        else:
            opening += settled_prior

    bills = (
        await db.execute(
            select(PartyLedgerBill)
            .where(
                PartyLedgerBill.party_ledger_id == party_ledger_id,
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status != "CANCELLED",
                PartyLedgerBill.bill_date >= from_date,
                PartyLedgerBill.bill_date <= to_date,
            )
            .order_by(PartyLedgerBill.bill_date.asc(), PartyLedgerBill.id.asc())
        )
    ).scalars().all()

    running = opening
    transactions: list[dict[str, Any]] = []
    for bill in bills:
        debit = _d(bill.original_amount) if bill.amount_type == "DR" else ZERO
        credit = _d(bill.original_amount) if bill.amount_type == "CR" else ZERO
        running = running + debit - credit
        bal_type = "DR" if running >= 0 else "CR"
        transactions.append(
            {
                "date": bill.bill_date.isoformat(),
                "bill_number": bill.bill_number,
                "bill_type": bill.bill_type,
                "narration": bill.narration or "",
                "debit": str(_money(debit)),
                "credit": str(_money(credit)),
                "balance": str(_money(abs(running))),
                "balance_type": bal_type,
                "voucher_id": bill.voucher_id,
                "status": bill.status,
            }
        )

    closing_type = "DR" if running >= 0 else "CR"
    return {
        "party_ledger_id": pl.id,
        "party_name": await get_party_name(db, pl),
        "party_type": pl.party_type,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "opening_balance": str(_money(abs(opening))),
        "opening_balance_type": "DR" if opening >= 0 else "CR",
        "transactions": transactions,
        "closing_balance": str(_money(abs(running))),
        "closing_balance_type": closing_type,
    }


AGING_BUCKETS = ("not_due", "days_1_30", "days_31_60", "days_61_90", "days_91_plus")


async def _aging_bucket_totals(
    db: AsyncSession,
    tenant_id: int,
    ledger_filters: list[Any],
    as_of: date,
) -> dict[int, dict[str, Decimal]]:
    """Open pending amount per aging bucket for each matching party ledger, summed in SQL.

    Days past due = as_of - (due_date, or bill_date when there is no due date):
    0 or less -> not_due, 1-30, 31-60, 61-90, 91+. Ledgers with no open bills are left out.
    """
    due = func.coalesce(PartyLedgerBill.due_date, PartyLedgerBill.bill_date)
    day_30 = as_of - timedelta(days=30)
    day_60 = as_of - timedelta(days=60)
    day_90 = as_of - timedelta(days=90)
    bucket_conditions = {
        "not_due": due >= as_of,
        "days_1_30": and_(due < as_of, due >= day_30),
        "days_31_60": and_(due < day_30, due >= day_60),
        "days_61_90": and_(due < day_60, due >= day_90),
        "days_91_plus": due < day_90,
    }
    bucket_sums = [
        func.sum(case((condition, PartyLedgerBill.pending_amount), else_=0)).label(name)
        for name, condition in bucket_conditions.items()
    ]
    rows = await db.execute(
        select(PartyLedgerBill.party_ledger_id, *bucket_sums)
        .join(PartyLedger, PartyLedger.id == PartyLedgerBill.party_ledger_id)
        .where(
            *ledger_filters,
            PartyLedgerBill.tenant_id == tenant_id,
            PartyLedgerBill.status.in_(("PENDING", "PARTIAL", "OVERDUE")),
            PartyLedgerBill.pending_amount > 0,
        )
        .group_by(PartyLedgerBill.party_ledger_id)
    )
    return {
        row.party_ledger_id: {name: _d(getattr(row, name)) for name in AGING_BUCKETS}
        for row in rows
    }


async def get_party_aging_report(
    db: AsyncSession,
    tenant_id: int,
    party_ledger_id: int | None = None,
    as_of_date: date | None = None,
    party_type: str | None = None,
) -> dict[str, Any]:
    as_of = as_of_date or date.today()
    filters = [
        PartyLedger.tenant_id == tenant_id,
        PartyLedger.is_active.is_(True),
    ]
    if party_ledger_id:
        filters.append(PartyLedger.id == party_ledger_id)
    if party_type:
        filters.append(PartyLedger.party_type == party_type.strip().upper())

    ledgers = (await db.execute(select(PartyLedger).where(*filters).order_by(PartyLedger.id))).scalars().all()
    bucket_totals = await _aging_bucket_totals(db, tenant_id, filters, as_of)
    party_names = await get_party_names(db, ledgers)

    parties: list[dict[str, Any]] = []
    grand = {
        "not_due": ZERO,
        "days_1_30": ZERO,
        "days_31_60": ZERO,
        "days_61_90": ZERO,
        "days_91_plus": ZERO,
        "total_overdue": ZERO,
    }

    for pl in ledgers:
        buckets = bucket_totals.get(pl.id) or dict.fromkeys(AGING_BUCKETS, ZERO)
        overdue = (
            buckets["days_1_30"]
            + buckets["days_31_60"]
            + buckets["days_61_90"]
            + buckets["days_91_plus"]
        )
        for k in grand:
            if k == "total_overdue":
                grand[k] += overdue
            else:
                grand[k] += buckets[k]

        parties.append(
            {
                "party_ledger_id": pl.id,
                "party_name": party_names[pl.id],
                "party_type": pl.party_type,
                "current_balance": str(_money(_d(pl.current_balance))),
                "balance_type": pl.current_balance_type,
                "not_due": str(_money(buckets["not_due"])),
                "days_1_30": str(_money(buckets["days_1_30"])),
                "days_31_60": str(_money(buckets["days_31_60"])),
                "days_61_90": str(_money(buckets["days_61_90"])),
                "days_91_plus": str(_money(buckets["days_91_plus"])),
                "total_overdue": str(_money(overdue)),
            }
        )

    return {
        "as_of_date": as_of.isoformat(),
        "parties": parties,
        "grand_total": {k: str(_money(v)) for k, v in grand.items()},
    }


async def list_party_ledgers(
    db: AsyncSession,
    tenant_id: int,
    *,
    party_type: str | None = None,
    search: str | None = None,
    is_active: bool | None = True,
    balance_type: str | None = None,
    overdue_only: bool = False,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[PartyLedger], int]:
    page = max(1, page)
    page_size = min(max(1, page_size), 200)

    q = select(PartyLedger).where(PartyLedger.tenant_id == tenant_id)
    if is_active is not None:
        q = q.where(PartyLedger.is_active.is_(is_active))
    if party_type:
        q = q.where(PartyLedger.party_type == party_type.strip().upper())
    if balance_type:
        q = q.where(PartyLedger.current_balance_type == balance_type.strip().upper())

    if search:
        term = f"%{search.strip()}%"
        cust_ids = (
            await db.execute(
                select(Customer.id).where(
                    Customer.tenant_id == tenant_id,
                    or_(Customer.name.ilike(term), Customer.customer_code.ilike(term)),
                )
            )
        ).scalars().all()
        vend_ids = (
            await db.execute(
                select(Vendor.id).where(
                    Vendor.tenant_id == tenant_id,
                    or_(Vendor.name.ilike(term), Vendor.vendor_code.ilike(term)),
                )
            )
        ).scalars().all()
        q = q.where(
            or_(
                PartyLedger.customer_id.in_(list(cust_ids) or [-1]),
                PartyLedger.vendor_id.in_(list(vend_ids) or [-1]),
            )
        )

    if overdue_only:
        overdue_pl_ids = (
            await db.execute(
                select(PartyLedgerBill.party_ledger_id)
                .where(
                    PartyLedgerBill.tenant_id == tenant_id,
                    PartyLedgerBill.status == "OVERDUE",
                    PartyLedgerBill.pending_amount > 0,
                )
                .distinct()
            )
        ).scalars().all()
        q = q.where(PartyLedger.id.in_(list(overdue_pl_ids) or [-1]))

    count_q = select(func.count()).select_from(q.subquery())
    total = int((await db.execute(count_q)).scalar_one() or 0)
    rows = (
        await db.execute(
            q.order_by(PartyLedger.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    return list(rows), total
