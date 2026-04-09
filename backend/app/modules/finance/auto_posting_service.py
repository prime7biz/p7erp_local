"""Balanced vouchers from system COA codes (resolve_system_ledger) or explicit account overrides."""

from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.finance import (
    AccountGroup,
    AccountingPeriod,
    ChartOfAccount,
    Voucher,
    VoucherLine,
    VoucherType,
)
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.modules.finance.voucher_controls import (
    allocate_series_voucher_number,
    finalize_posted_voucher_metadata,
    fiscal_year_calendar,
)

# Same defaults as finance router when tenant has no voucher_types rows
_DEFAULT_VOUCHER_TYPE_CODES: frozenset[str] = frozenset(
    {"PAYMENT", "RECEIPT", "JOURNAL", "CONTRA", "MJ", "PJ", "LCJ"}
)

# BTB LC lifecycle — stable mapping keys (same as ledger system_code / accounting_system_mappings.mapping_key)
SYSTEM_BTB_OPENING_DEBIT = "BTB_NON_ACCEPTED_LC_LIABILITY"
SYSTEM_BTB_OPENING_CREDIT = "BTB_CREDIT_LINE_UTILIZATION_CONTROL"
SYSTEM_BTB_DOCS_DEBIT = "BTB_NON_ACCEPTED_LC_LIABILITY"
SYSTEM_BTB_DOCS_CREDIT = "BTB_ACCEPTED_LC_LIABILITY"
SYSTEM_BTB_REALIZE_DEBIT = "BTB_ACCEPTED_LC_LIABILITY"


def _to_float(v: object) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    return float(str(v).replace(",", "").strip() or 0)


def _apply_voucher_impact(account: ChartOfAccount, entry_type: str, amount: float) -> None:
    current_balance = _to_float(account.balance)
    if account.normal_balance == "debit":
        current_balance += amount if entry_type == "DEBIT" else -amount
    else:
        current_balance += amount if entry_type == "CREDIT" else -amount
    account.balance = str(round(current_balance, 4))


def _voucher_signature_payload(voucher: Voucher, lines: list[VoucherLine]) -> dict:
    serialized_lines = [
        {
            "account_id": line.account_id,
            "cost_center_id": line.cost_center_id,
            "entry_type": line.entry_type,
            "amount": line.amount,
            "base_amount": line.base_amount,
            "currency": line.currency,
            "exchange_rate": line.exchange_rate,
            "notes": line.notes,
        }
        for line in lines
    ]
    return {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "voucher_date": voucher.voucher_date.isoformat(),
        "status": voucher.status,
        "currency": voucher.currency,
        "base_currency": voucher.base_currency,
        "exchange_rate": voucher.exchange_rate,
        "lines": serialized_lines,
    }


def _apply_internal_signature(voucher: Voucher, lines: list[VoucherLine]) -> None:
    canonical = json.dumps(_voucher_signature_payload(voucher, lines), sort_keys=True, separators=(",", ":"))
    voucher.signature_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    voucher.verification_id = voucher.verification_id or f"VFY-{secrets.token_hex(8).upper()}"
    voucher.signed_at = datetime.utcnow()
    voucher.signed_by_system = True


async def _lock_chart_accounts_for_subset(
    db: AsyncSession,
    tenant_id: int,
    account_ids: list[int],
) -> dict[int, ChartOfAccount]:
    ids = sorted(set(account_ids))
    if not ids:
        return {}
    result = await db.execute(
        select(ChartOfAccount)
        .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(ids))
        .order_by(ChartOfAccount.id)
        .with_for_update()
    )
    return {a.id: a for a in result.scalars().all()}


async def _validate_posting_account(db: AsyncSession, tenant_id: int, account_id: int) -> ChartOfAccount:
    account = await db.get(ChartOfAccount, account_id)
    if not account or account.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail=f"Account not found: {account_id}")
    if (account.account_type or "posting").lower() == "header":
        raise HTTPException(
            status_code=400,
            detail=f"Posting not allowed to header account: {account.account_number}",
        )
    group = await db.get(AccountGroup, account.group_id)
    if group and group.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Account group not found for this tenant")
    if group and not bool(group.allow_posting):
        raise HTTPException(
            status_code=400,
            detail=f"Posting not allowed to accounts in group '{group.name}'.",
        )
    return account


async def _ensure_voucher_type_allowed(db: AsyncSession, tenant_id: int, voucher_type: str) -> None:
    """Match finance router: use tenant voucher_types if any exist, else default catalog."""
    code = voucher_type.strip().upper()
    persisted = list(
        (
            await db.execute(
                select(VoucherType).where(
                    VoucherType.tenant_id == tenant_id,
                    VoucherType.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    allowed = {row.code.strip().upper() for row in persisted} if persisted else set(_DEFAULT_VOUCHER_TYPE_CODES)
    if code not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Voucher type {code} is inactive or not configured.",
        )


@dataclass
class AutoPostingLine:
    """One voucher line: resolve account from system_code unless account_id is set."""

    entry_type: Literal["DEBIT", "CREDIT"]
    amount: Decimal
    system_code: str | None = None
    account_id: int | None = None
    cost_center_id: int | None = None
    notes: str | None = None


async def create_system_voucher(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    voucher_type: str,
    voucher_date: date,
    lines: list[AutoPostingLine],
    description: str | None,
    reference: str | None = None,
    source_module: str,
    source_module_ref: str | None = None,
    btb_lc_id: int | None = None,
    trade_case_id: int | None = None,
    facility_utilization_id: int | None = None,
    currency: str | None = None,
    base_currency: str | None = None,
    exchange_rate: float = 1.0,
    auto_post: bool = False,
) -> Voucher:
    if not lines:
        raise HTTPException(status_code=400, detail="At least one voucher line is required")
    vtype = voucher_type.strip().upper()
    await _ensure_voucher_type_allowed(db, tenant_id, vtype)

    resolved: list[tuple[AutoPostingLine, int]] = []
    total_dr = Decimal("0")
    total_cr = Decimal("0")
    for line in lines:
        if line.account_id is not None:
            aid = line.account_id
        elif line.system_code:
            try:
                aid = await resolve_system_ledger(db, tenant_id, line.system_code)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        else:
            raise HTTPException(
                status_code=400,
                detail="Each line needs account_id or system_code",
            )
        await _validate_posting_account(db, tenant_id, aid)
        amt = line.amount
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Line amounts must be greater than zero")
        if line.entry_type == "DEBIT":
            total_dr += amt
        else:
            total_cr += amt
        resolved.append((line, aid))

    if total_dr != total_cr:
        raise HTTPException(
            status_code=400,
            detail=f"Voucher is not balanced: debits {total_dr} != credits {total_cr}",
        )

    voucher_number, series_seq, series_key, fy = await allocate_series_voucher_number(
        db,
        tenant_id=tenant_id,
        voucher_date=voucher_date,
        voucher_type=vtype,
        branch_code="MAIN",
    )
    cur = (currency or "BDT").strip().upper()[:8] or "BDT"
    base_cur = (base_currency or cur).strip().upper()[:8] or cur
    rate_str = f"{float(exchange_rate):.8f}".rstrip("0").rstrip(".")

    voucher = Voucher(
        tenant_id=tenant_id,
        voucher_number=voucher_number,
        voucher_type=vtype,
        voucher_date=voucher_date,
        status="DRAFT",
        description=description,
        reference=reference,
        currency=cur,
        base_currency=base_cur,
        exchange_rate=rate_str,
        btb_lc_id=btb_lc_id,
        trade_case_id=trade_case_id,
        facility_utilization_id=facility_utilization_id,
        branch_code="MAIN",
        fiscal_year=fy,
        series_sequence=series_seq,
        number_series_key=series_key,
        source_module=source_module,
        source_module_ref=source_module_ref,
        allow_manual_edit=False,
        created_by=user_id,
    )
    db.add(voucher)
    await db.flush()

    default_notes = "System COA auto entry"
    for line, aid in resolved:
        amt_str = f"{float(line.amount):.2f}"
        base_amt = float(line.amount) * float(exchange_rate)
        db.add(
            VoucherLine(
                tenant_id=tenant_id,
                voucher_id=voucher.id,
                account_id=aid,
                cost_center_id=line.cost_center_id,
                currency=cur,
                exchange_rate=rate_str,
                base_amount=f"{base_amt:.4f}",
                is_rate_overridden=False,
                rate_source="system",
                entry_type=line.entry_type,
                amount=amt_str,
                notes=line.notes or default_notes,
            )
        )
    await db.flush()

    line_rows = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
    )

    if auto_post:
        open_period = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant_id,
                    AccountingPeriod.is_closed.is_(False),
                    AccountingPeriod.start_date <= voucher.voucher_date,
                    AccountingPeriod.end_date >= voucher.voucher_date,
                )
            )
        ).scalars().first()
        if not open_period:
            raise HTTPException(status_code=400, detail="No open accounting period for this voucher date")
        if voucher.fiscal_year is None:
            voucher.fiscal_year = fiscal_year_calendar(voucher.voucher_date)
        await finalize_posted_voucher_metadata(
            db, tenant_id, voucher, line_rows, strict_duplicate_check=True
        )
        locked = await _lock_chart_accounts_for_subset(
            db, tenant_id, [ln.account_id for ln in line_rows]
        )
        for ln in line_rows:
            acct = locked.get(ln.account_id)
            if acct:
                _apply_voucher_impact(acct, ln.entry_type, _to_float(ln.amount))
        voucher.status = "POSTED"
        from app.modules.facility.posting_hooks import process_facility_voucher_posted

        await process_facility_voucher_posted(db, tenant_id, voucher, user_id)
        _apply_internal_signature(voucher, line_rows)

    await db.flush()
    return voucher


async def create_system_voucher_from_mapping(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    voucher_type: str,
    voucher_date: date,
    amount: float,
    debit_system_code: str | None,
    credit_system_code: str | None,
    debit_account_id: int | None = None,
    credit_account_id: int | None = None,
    cost_center_id: int | None = None,
    description: str | None,
    reference: str | None = None,
    source_module: str,
    source_module_ref: str | None = None,
    btb_lc_id: int | None = None,
    currency: str | None = None,
    exchange_rate: float = 1.0,
    auto_post: bool = False,
) -> Voucher:
    amt = Decimal(str(amount))
    lines = [
        AutoPostingLine(
            entry_type="DEBIT",
            amount=amt,
            system_code=debit_system_code,
            account_id=debit_account_id,
            cost_center_id=cost_center_id,
        ),
        AutoPostingLine(
            entry_type="CREDIT",
            amount=amt,
            system_code=credit_system_code,
            account_id=credit_account_id,
            cost_center_id=cost_center_id,
        ),
    ]
    return await create_system_voucher(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_type=voucher_type,
        voucher_date=voucher_date,
        lines=lines,
        description=description,
        reference=reference,
        source_module=source_module,
        source_module_ref=source_module_ref,
        btb_lc_id=btb_lc_id,
        currency=currency,
        exchange_rate=exchange_rate,
        auto_post=auto_post,
    )
