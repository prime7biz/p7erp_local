"""Shared double-entry helpers for every path that puts a voucher into the books.

Rules enforced here:
- Money is Decimal, never float.
- Chart-of-account balances are kept in the tenant's base currency, so posting uses each
  line's ``base_amount`` (falling back to ``amount x exchange_rate`` for rows that never
  stored a base amount).
- A voucher may only hit the books when base debits equal base credits.

Which amount was used to post is recorded as ``balance_basis`` inside
``Voucher.posted_snapshot_json``. Vouchers posted before this module existed have no marker
and were posted with the transaction ``amount``; cancel/reverse undo them the same way so
cached balances never drift.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping

from fastapi import HTTPException
from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import ChartOfAccount, Voucher, VoucherLine

ZERO = Decimal("0")
MONEY_Q = Decimal("0.0001")
# Base amounts are rounded to 4 dp per line, so FX vouchers can differ by a few ten-thousandths.
BALANCE_TOLERANCE = Decimal("0.01")

BASIS_BASE = "base"
BASIS_AMOUNT = "amount"


def to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return ZERO
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return ZERO


def _base_from(amount: Decimal, base: Decimal, rate: Decimal) -> Decimal:
    if base != ZERO or amount == ZERO:
        return base
    return (amount * (rate if rate > ZERO else Decimal("1"))).quantize(MONEY_Q)


def line_base_amount(line: VoucherLine) -> Decimal:
    """Line value in base currency."""
    return _base_from(to_decimal(line.amount), to_decimal(line.base_amount), to_decimal(line.exchange_rate))


def dict_line_base_amount(line: Mapping[str, Any], *, default_rate: Any = None) -> Decimal:
    """Same as ``line_base_amount`` for request/template dicts (``amount``, ``base_amount``, ``exchange_rate``)."""
    rate = line.get("exchange_rate")
    return _base_from(
        to_decimal(line.get("amount")),
        to_decimal(line.get("base_amount")),
        to_decimal(rate if rate not in (None, "") else default_rate),
    )


def line_base_amount_sql():
    """SQL twin of ``line_base_amount`` for report aggregations."""
    return case(
        (
            (VoucherLine.base_amount != 0) | (VoucherLine.amount == 0),
            VoucherLine.base_amount,
        ),
        else_=VoucherLine.amount * VoucherLine.exchange_rate,
    )


def line_amount_for_basis(line: VoucherLine, basis: str) -> Decimal:
    if basis == BASIS_AMOUNT:
        return to_decimal(line.amount)
    return line_base_amount(line)


def debit_credit_totals(entries: Iterable[tuple[str, Decimal]]) -> tuple[Decimal, Decimal]:
    debit = ZERO
    credit = ZERO
    for entry_type, amount in entries:
        if (entry_type or "").upper() == "DEBIT":
            debit += amount
        else:
            credit += amount
    return debit, credit


def assert_totals_balanced(debit: Decimal, credit: Decimal, *, label: str = "Voucher") -> None:
    if abs(debit - credit) > BALANCE_TOLERANCE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{label} is not balanced: debits {debit.quantize(MONEY_Q)} != credits "
                f"{credit.quantize(MONEY_Q)} (base currency)"
            ),
        )


def assert_lines_balanced(lines: list[VoucherLine], *, label: str = "Voucher") -> None:
    """Raise 400 unless base-currency debits equal credits."""
    if not lines:
        raise HTTPException(status_code=400, detail=f"{label} has no lines")
    debit, credit = debit_credit_totals((ln.entry_type, line_base_amount(ln)) for ln in lines)
    assert_totals_balanced(debit, credit, label=label)


def assert_dict_lines_balanced(
    lines: list[Mapping[str, Any]],
    *,
    label: str = "Voucher",
    default_rate: Any = None,
) -> None:
    """Balance check for line dicts (templates, special-voucher bodies) before they are stored."""
    if not lines:
        raise HTTPException(status_code=400, detail=f"{label} has no lines")
    entries = []
    for ln in lines:
        entry = str(ln.get("entry_type") or "").upper()
        if entry not in {"DEBIT", "CREDIT"}:
            raise HTTPException(status_code=400, detail=f"{label}: entry_type must be DEBIT or CREDIT")
        amount = to_decimal(ln.get("amount"))
        if amount < ZERO:
            raise HTTPException(status_code=400, detail=f"{label}: line amounts cannot be negative")
        entries.append((entry, dict_line_base_amount(ln, default_rate=default_rate)))
    debit, credit = debit_credit_totals(entries)
    assert_totals_balanced(debit, credit, label=label)


def voucher_balance_basis(voucher: Voucher) -> str:
    raw = getattr(voucher, "posted_snapshot_json", None)
    if not raw:
        return BASIS_AMOUNT
    try:
        doc = json.loads(raw)
    except (TypeError, ValueError):
        return BASIS_AMOUNT
    basis = doc.get("balance_basis") if isinstance(doc, dict) else None
    return basis if basis in {BASIS_BASE, BASIS_AMOUNT} else BASIS_AMOUNT


def mark_balance_basis(voucher: Voucher, basis: str) -> None:
    """Record which amount column was used to post (kept inside the posted snapshot JSON)."""
    doc: dict[str, Any] = {}
    raw = getattr(voucher, "posted_snapshot_json", None)
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                doc = parsed
        except (TypeError, ValueError):
            doc = {}
    doc["balance_basis"] = basis
    voucher.posted_snapshot_json = json.dumps(doc, ensure_ascii=False)


def apply_amount_to_account(account: ChartOfAccount, entry_type: str, amount: Decimal) -> None:
    current = to_decimal(account.balance)
    debit_normal = (account.normal_balance or "debit").lower() == "debit"
    is_debit = (entry_type or "").upper() == "DEBIT"
    if debit_normal:
        current = current + amount if is_debit else current - amount
    else:
        current = current - amount if is_debit else current + amount
    account.balance = current.quantize(MONEY_Q)


async def lock_accounts(db: AsyncSession, tenant_id: int, account_ids: Iterable[int]) -> dict[int, ChartOfAccount]:
    """SELECT ... FOR UPDATE ordered by id (same order everywhere avoids deadlocks)."""
    ids = sorted(set(account_ids))
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(ids))
            .order_by(ChartOfAccount.id)
            .with_for_update()
        )
    ).scalars().all()
    return {a.id: a for a in rows}


async def load_voucher_lines(db: AsyncSession, voucher_id: int) -> list[VoucherLine]:
    return list(
        (
            await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher_id).order_by(VoucherLine.id))
        ).scalars().all()
    )


async def apply_voucher_to_books(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    lines: list[VoucherLine] | None = None,
    *,
    reverse: bool = False,
    basis: str | None = None,
    check_balance: bool = True,
) -> None:
    """Add (or remove, with ``reverse=True``) a voucher's lines to cached CoA balances.

    Posting checks the voucher balances in base currency first. Reversal uses the basis the
    voucher was originally posted with so legacy vouchers are undone exactly. Pass
    ``check_balance=False`` only when mirroring an entry that is already in the books.
    """
    if lines is None:
        lines = await load_voucher_lines(db, voucher.id)
    if reverse:
        use_basis = basis or voucher_balance_basis(voucher)
    else:
        use_basis = basis or BASIS_BASE
        if lines and check_balance:
            assert_lines_balanced(lines)
    locked = await lock_accounts(db, tenant_id, (ln.account_id for ln in lines))
    for ln in lines:
        account = locked.get(ln.account_id)
        if account is None:
            continue
        entry = ln.entry_type
        if reverse:
            entry = "CREDIT" if (entry or "").upper() == "DEBIT" else "DEBIT"
        apply_amount_to_account(account, entry, line_amount_for_basis(ln, use_basis))
    voucher.books_applied = not reverse
    if not reverse:
        mark_balance_basis(voucher, use_basis)
