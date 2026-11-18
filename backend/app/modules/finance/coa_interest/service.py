"""Run / preview COA interest accruals and create DRAFT journals."""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models import Tenant
from app.models.finance import (
    AccountGroup,
    AccountingPeriod,
    ChartOfAccount,
    CoaInterestAccrual,
    Voucher,
    VoucherLine,
)
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher, quantize_amount
from app.modules.finance.coa_interest import ACCRUAL_UNIQUE_KEY, MAX_CATCHUP_PERIODS, SOURCE_MODULE
from app.modules.finance.coa_interest.calc import (
    completed_period_keys,
    compute_period_interest,
    period_bounds,
    q4,
    to_decimal,
)
from app.modules.finance.posting_core import line_base_amount_sql

logger = logging.getLogger(__name__)


async def _period_is_open(db: AsyncSession, tenant_id: int, on_date: date) -> bool:
    row = (
        await db.execute(
            select(AccountingPeriod.id).where(
                AccountingPeriod.tenant_id == tenant_id,
                AccountingPeriod.is_closed.is_(False),
                AccountingPeriod.start_date <= on_date,
                AccountingPeriod.end_date >= on_date,
            )
        )
    ).scalar_one_or_none()
    return row is not None


async def balance_as_of(
    db: AsyncSession,
    *,
    tenant_id: int,
    account: ChartOfAccount,
    as_of: date,
    basis: str,
) -> Decimal:
    """Ledger balance in the account's normal direction as of ``as_of`` (posted books only).

    ``simple`` excludes net movement from earlier posted COA_INTEREST vouchers on this ledger.
    ``compound`` uses the full as-of balance.
    """
    opening = to_decimal(account.opening_balance or 0)
    debit_normal = (account.normal_balance or "debit").lower() == "debit"
    amount = line_base_amount_sql()
    is_debit = func.upper(VoucherLine.entry_type) == "DEBIT"
    # Movement in normal direction: debit-normal => debit - credit; credit-normal => credit - debit
    if debit_normal:
        signed = case((is_debit, amount), else_=-amount)
    else:
        signed = case((is_debit, -amount), else_=amount)

    filters = [
        VoucherLine.tenant_id == tenant_id,
        Voucher.tenant_id == tenant_id,
        VoucherLine.account_id == account.id,
        voucher_counts_in_books_status_clause(),
        voucher_in_books_clause(),
        Voucher.voucher_date <= as_of,
    ]
    if (basis or "").strip().lower() == "simple":
        filters.append(
            or_exclude_coa_interest(),
        )

    total_move = (
        await db.execute(
            select(func.coalesce(func.sum(signed), 0)).select_from(VoucherLine).join(
                Voucher, VoucherLine.voucher_id == Voucher.id
            ).where(*filters)
        )
    ).scalar_one()
    return q4(opening + to_decimal(total_move))


def or_exclude_coa_interest():
    """Posted non-COA_INTEREST lines, OR non-posted (already excluded by status clause)."""
    return (
        (func.upper(func.coalesce(Voucher.source_module, "")) != SOURCE_MODULE)
        | (Voucher.source_module.is_(None))
    )


async def list_interest_enabled_accounts(db: AsyncSession, tenant_id: int) -> list[tuple[ChartOfAccount, AccountGroup]]:
    rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, AccountGroup.id == ChartOfAccount.group_id)
            .where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.interest_enabled.is_(True),
                ChartOfAccount.is_active.is_(True),
                AccountGroup.tenant_id == tenant_id,
                func.lower(AccountGroup.nature).in_(("asset", "liability")),
            )
            .order_by(ChartOfAccount.id)
        )
    ).all()
    return [(a, g) for a, g in rows]


async def _existing_accrual(
    db: AsyncSession, tenant_id: int, account_id: int, period_key: str
) -> CoaInterestAccrual | None:
    return (
        await db.execute(
            select(CoaInterestAccrual).where(
                CoaInterestAccrual.tenant_id == tenant_id,
                CoaInterestAccrual.account_id == account_id,
                CoaInterestAccrual.period_key == period_key,
            )
        )
    ).scalar_one_or_none()


async def _voucher_usable(db: AsyncSession, tenant_id: int, voucher_id: int | None) -> bool:
    if voucher_id is None:
        return False
    v = await db.get(Voucher, voucher_id)
    if not v or v.tenant_id != tenant_id:
        return False
    return (v.status or "").upper() not in {"CANCELLED"}


async def _heal_cancelled_accrual(db: AsyncSession, row: CoaInterestAccrual, tenant_id: int) -> bool:
    """Mark cancelled when draft was deleted/cancelled; return True if caller may recreate."""
    if row.status in {"posted", "reversed"}:
        return False
    if row.status == "cancelled":
        # Delete the cancelled marker so unique key allows a new draft for this period.
        await db.delete(row)
        await db.flush()
        return True
    if not await _voucher_usable(db, tenant_id, row.journal_voucher_id):
        await db.delete(row)
        await db.flush()
        return True
    return False


def _journal_lines(
    *,
    nature: str,
    ledger_id: int,
    counterpart_id: int,
    amount: Decimal,
    ledger_name: str,
) -> list[AutoPostingLine]:
    note = f"Interest on {ledger_name}"
    if (nature or "").lower() == "liability":
        return [
            AutoPostingLine(entry_type="DEBIT", amount=amount, account_id=counterpart_id, notes=f"Interest expense — {note}"),
            AutoPostingLine(entry_type="CREDIT", amount=amount, account_id=ledger_id, notes=f"Interest accrued — {note}"),
        ]
    return [
        AutoPostingLine(entry_type="DEBIT", amount=amount, account_id=ledger_id, notes=f"Interest earned — {note}"),
        AutoPostingLine(entry_type="CREDIT", amount=amount, account_id=counterpart_id, notes=f"Interest income — {note}"),
    ]


async def preview_account_periods(
    db: AsyncSession,
    *,
    tenant_id: int,
    account: ChartOfAccount,
    group: AccountGroup,
    as_of: date | None = None,
) -> list[dict]:
    as_of = as_of or today_local()
    if not account.interest_enabled or not account.interest_activation_date:
        return []
    keys = completed_period_keys(
        frequency=account.interest_frequency or "monthly",
        activation=account.interest_activation_date,
        as_of=as_of,
        max_periods=MAX_CATCHUP_PERIODS,
    )
    out: list[dict] = []
    for key in keys:
        _start, end = period_bounds(key)
        base = await balance_as_of(
            db,
            tenant_id=tenant_id,
            account=account,
            as_of=end,
            basis=account.interest_basis or "simple",
        )
        preview = compute_period_interest(
            method=account.interest_method or "yearly_rate",
            frequency=account.interest_frequency or "monthly",
            base_balance=base,
            rate_yearly=account.interest_rate_yearly,
            fixed_amount=account.interest_amount,
            activation=account.interest_activation_date,
            period_key=key,
            nature=group.nature or "",
        )
        existing = await _existing_accrual(db, tenant_id, account.id, key)
        out.append(
            {
                "account_id": account.id,
                "account_name": account.name,
                "period_key": preview.period_key,
                "period_start": preview.period_start.isoformat(),
                "period_end": preview.period_end.isoformat(),
                "base_balance": str(preview.base_balance),
                "proration_factor": str(preview.proration_factor),
                "interest_amount": str(preview.interest_amount),
                "skip_reason": preview.skip_reason,
                "existing_status": existing.status if existing else None,
                "existing_voucher_id": existing.journal_voucher_id if existing else None,
                "period_open": await _period_is_open(db, tenant_id, preview.period_end),
            }
        )
    return out


async def create_accrual_for_period(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    account: ChartOfAccount,
    group: AccountGroup,
    period_key: str,
    base_currency: str,
) -> str:
    """Create one draft accrual. Returns created|skipped|healed_skip reason code."""
    # Lock the ledger so concurrent runs / CoA edits serialize on this account.
    locked = (
        await db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.id == account.id, ChartOfAccount.tenant_id == tenant_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if locked is None or not locked.interest_enabled:
        return "skipped_disabled"

    existing = await _existing_accrual(db, tenant_id, locked.id, period_key)
    if existing is not None:
        if not await _heal_cancelled_accrual(db, existing, tenant_id):
            return "skipped_exists"

    if not locked.interest_activation_date or not locked.interest_counterpart_account_id:
        return "skipped_incomplete"

    _start, end = period_bounds(period_key)
    if not await _period_is_open(db, tenant_id, end):
        logger.info(
            "coa_interest skip closed period tenant=%s account=%s period=%s",
            tenant_id,
            locked.id,
            period_key,
        )
        return "skipped_period_closed"

    base = await balance_as_of(
        db,
        tenant_id=tenant_id,
        account=locked,
        as_of=end,
        basis=locked.interest_basis or "simple",
    )
    preview = compute_period_interest(
        method=locked.interest_method or "yearly_rate",
        frequency=locked.interest_frequency or "monthly",
        base_balance=base,
        rate_yearly=locked.interest_rate_yearly,
        fixed_amount=locked.interest_amount,
        activation=locked.interest_activation_date,
        period_key=period_key,
        nature=group.nature or "",
    )
    if preview.skip_reason or preview.interest_amount <= 0:
        return f"skipped_{preview.skip_reason or 'zero'}"

    amount = quantize_amount(preview.interest_amount)
    lines = _journal_lines(
        nature=group.nature or "",
        ledger_id=locked.id,
        counterpart_id=locked.interest_counterpart_account_id,
        amount=amount,
        ledger_name=locked.name,
    )
    try:
        async with db.begin_nested():
            row = CoaInterestAccrual(
                tenant_id=tenant_id,
                account_id=locked.id,
                period_key=period_key,
                accrual_date=end,
                base_balance=preview.base_balance,
                proration_factor=preview.proration_factor,
                interest_amount=amount,
                status="draft",
            )
            db.add(row)
            await db.flush()
            voucher = await create_system_voucher(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                voucher_type="JOURNAL",
                voucher_date=end,
                lines=lines,
                description=(
                    f"COA interest {locked.name} ({locked.account_number}) "
                    f"{period_key} {locked.interest_basis}/{locked.interest_method}"
                ),
                reference=f"COA-INT-{locked.account_number}-{period_key}",
                source_module=SOURCE_MODULE,
                source_module_ref=f"coa_int:{locked.id}:{period_key}",
                currency=base_currency,
                base_currency=base_currency,
                auto_post=False,
            )
            row.journal_voucher_id = voucher.id
            await db.flush()
    except IntegrityError as exc:
        if ACCRUAL_UNIQUE_KEY not in str(getattr(exc, "orig", exc)):
            raise
        logger.info(
            "coa_interest already exists tenant=%s account=%s period=%s",
            tenant_id,
            locked.id,
            period_key,
        )
        return "skipped_exists"
    return "created"


async def run_coa_interest(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    as_of: date | None = None,
    account_id: int | None = None,
) -> dict:
    as_of = as_of or today_local()
    tenant = await db.get(Tenant, tenant_id)
    base_ccy = (tenant.base_currency if tenant else None) or "BDT"
    pairs = await list_interest_enabled_accounts(db, tenant_id)
    if account_id is not None:
        pairs = [(a, g) for a, g in pairs if a.id == account_id]
        if not pairs:
            raise HTTPException(status_code=404, detail="Interest-enabled ledger not found")

    created = 0
    skipped = 0
    details: list[dict] = []
    for account, group in pairs:
        if not account.interest_activation_date:
            skipped += 1
            continue
        keys = completed_period_keys(
            frequency=account.interest_frequency or "monthly",
            activation=account.interest_activation_date,
            as_of=as_of,
            max_periods=MAX_CATCHUP_PERIODS,
        )
        for key in keys:
            result = await create_accrual_for_period(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                account=account,
                group=group,
                period_key=key,
                base_currency=base_ccy,
            )
            details.append({"account_id": account.id, "period_key": key, "result": result})
            if result == "created":
                created += 1
            else:
                skipped += 1
    await db.flush()
    return {"created": created, "skipped": skipped, "as_of": as_of.isoformat(), "details": details}


async def list_accruals(
    db: AsyncSession,
    *,
    tenant_id: int,
    account_id: int | None = None,
    period_key: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[CoaInterestAccrual]:
    q = select(CoaInterestAccrual).where(CoaInterestAccrual.tenant_id == tenant_id)
    if account_id is not None:
        q = q.where(CoaInterestAccrual.account_id == account_id)
    if period_key:
        q = q.where(CoaInterestAccrual.period_key == period_key.strip())
    q = q.order_by(CoaInterestAccrual.id.desc()).offset(offset).limit(limit)
    return list((await db.execute(q)).scalars().all())
