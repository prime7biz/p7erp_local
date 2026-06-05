"""Voucher numbering series, duplicate fingerprinting, posted snapshots, bank/cash warnings."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code_entity_key
from app.common.orm_numeric import decimal_to_money_response, decimal_to_rate_response
from app.models import AccountGroup, ChartOfAccount, CostCenter, Voucher, VoucherLine


def fiscal_year_calendar(d: date) -> int:
    """Calendar fiscal year until tenant-specific FY rules are configured."""
    return d.year


def _slug_branch(branch: str | None) -> str:
    raw = (branch or "MAIN").strip().upper() or "MAIN"
    slug = re.sub(r"[^A-Z0-9_-]", "", raw.replace(" ", "_"))[:16]
    return slug or "MAIN"


def _slug_vtype(vtype: str) -> str:
    s = "".join(c for c in (vtype or "JR").upper() if c.isalnum())[:12]
    return s or "JR"


def build_number_series_key(*, fiscal_year: int, voucher_type: str, branch_code: str) -> str:
    return f"{fiscal_year}:{_slug_branch(branch_code)}:{_slug_vtype(voucher_type)}"


async def allocate_series_voucher_number(
    db: AsyncSession,
    *,
    tenant_id: int,
    voucher_date: date,
    voucher_type: str,
    branch_code: str | None,
) -> tuple[str, int, str, int]:
    """Returns (voucher_number, series_sequence, number_series_key, fiscal_year)."""
    fy = fiscal_year_calendar(voucher_date)
    series_key = build_number_series_key(fiscal_year=fy, voucher_type=voucher_type, branch_code=_slug_branch(branch_code))
    entity_key = f"voucher_series:{tenant_id}:{series_key}"[:128]
    seq_str = await next_tenant_code_entity_key(
        db,
        tenant_id=tenant_id,
        entity_key=entity_key,
        prefix="",
        width=4,
    )
    seq = int(seq_str)  # numeric part only from width 4 padded
    br = _slug_branch(branch_code)
    vt = _slug_vtype(voucher_type)
    voucher_number = f"VCH-{fy}-{vt}-{br}-{seq_str}"
    return voucher_number, seq, series_key, fy


def compute_duplicate_risk_hash(
    *,
    tenant_id: int,
    voucher_date: date,
    reference: str | None,
    line_account_ids: list[int],
    debit_total: float,
    credit_total: float,
) -> str:
    """Stable fingerprint for soft duplicate detection (same tenant + shape)."""
    ref = (reference or "").strip().lower()
    accts = ",".join(str(i) for i in sorted(line_account_ids))
    payload = f"{tenant_id}|{voucher_date.isoformat()}|{ref}|{round(debit_total, 4)}|{round(credit_total, 4)}|{accts}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:64]


async def find_conflicting_posted_vouchers(
    db: AsyncSession,
    *,
    tenant_id: int,
    duplicate_risk_hash: str,
    exclude_voucher_id: int | None,
) -> list[int]:
    stmt = select(Voucher.id).where(
        Voucher.tenant_id == tenant_id,
        Voucher.duplicate_risk_hash == duplicate_risk_hash,
        Voucher.status == "POSTED",
    )
    if exclude_voucher_id is not None:
        stmt = stmt.where(Voucher.id != exclude_voucher_id)
    rows = (await db.execute(stmt.limit(10))).scalars().all()
    return list(rows)


def _is_bank_like(account: ChartOfAccount, group: AccountGroup) -> bool:
    name = (account.name or "").lower()
    return bool(account.is_bank_account) or bool(group.is_bank_group) or "bank" in name


def _is_cash_like(account: ChartOfAccount, group: AccountGroup) -> bool:
    """Cash / petty style: name or group hints, excluding bank-like."""
    if _is_bank_like(account, group):
        return False
    name = (account.name or "").lower()
    code = (group.code or "").lower()
    return "cash" in name or "cash" in code


def _is_cash_or_bank(account: ChartOfAccount, group: AccountGroup) -> bool:
    return _is_bank_like(account, group) or _is_cash_like(account, group)


async def collect_bank_cash_control_warnings(
    db: AsyncSession,
    tenant_id: int,
    lines: list[VoucherLine],
    *,
    voucher_type: str,
    instrument_reference: str | None,
) -> list[str]:
    warnings: list[str] = []
    if not lines:
        return warnings
    account_ids = sorted({line.account_id for line in lines})
    if not account_ids:
        return warnings
    rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids))
        )
    ).all()
    amap: dict[int, tuple[ChartOfAccount, AccountGroup]] = {a.id: (a, g) for a, g in rows}

    debits_bank = 0
    credits_bank = 0
    debits_cash = 0
    credits_cash = 0
    bank_accounts_touched: list[tuple[ChartOfAccount, float]] = []
    for line in lines:
        pair = amap.get(line.account_id)
        if not pair:
            continue
        account, group = pair
        amount = float(line.amount or "0")
        if line.entry_type == "DEBIT":
            if _is_bank_like(account, group):
                debits_bank += 1
                bank_accounts_touched.append((account, amount))
            elif _is_cash_like(account, group):
                debits_cash += 1
        elif line.entry_type == "CREDIT":
            if _is_bank_like(account, group):
                credits_bank += 1
                bank_accounts_touched.append((account, amount))
            elif _is_cash_like(account, group):
                credits_cash += 1

    if debits_bank >= 2:
        warnings.append("Multiple debit lines hit bank-type accounts — confirm this is not an unintended bank-to-bank movement.")
    if credits_bank >= 2:
        warnings.append("Multiple credit lines hit bank-type accounts — confirm this is not an unintended bank-to-bank movement.")
    if debits_cash >= 2:
        warnings.append("Multiple debit lines hit cash-style accounts — review for unusual cash-to-cash movement.")
    if credits_cash >= 2:
        warnings.append("Multiple credit lines hit cash-style accounts — review for unusual cash-to-cash movement.")

    vt = (voucher_type or "").upper()
    if vt in {"PAYMENT", "RECEIPT", "CONTRA", "BP", "CP"}:
        inst = (instrument_reference or "").strip()
        if not inst and any(_is_cash_or_bank(amap[l.account_id][0], amap[l.account_id][1]) for l in lines if l.account_id in amap):
            warnings.append("Instrument / cheque or payment reference is empty — add one for bank or cash lines when required.")

    # Overdraft-style: bank normal debit balance goes negative after typical credit-only outflow (heuristic).
    for account, amt in bank_accounts_touched:
        if not account.is_bank_account:
            continue
        bal = float(account.balance or "0")
        # If this line reduces bank (credit on debit-normal account typical for payment from bank)
        if account.normal_balance == "debit":
            for line in lines:
                if line.account_id != account.id:
                    continue
                if line.entry_type == "CREDIT":
                    projected = bal - amt
                    if projected < 0:
                        warnings.append(
                            f"Bank account {account.account_number} may go negative after posting (projected {projected:.2f}) — verify funds."
                        )
        break  # one warning sample

    return warnings


async def build_posted_snapshot_json(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    lines: list[VoucherLine],
    *,
    posted_at: datetime | None = None,
) -> str:
    cc_ids = {line.cost_center_id for line in lines if line.cost_center_id}
    cc_map: dict[int, str] = {}
    if cc_ids:
        cc_rows = (
            await db.execute(select(CostCenter).where(CostCenter.tenant_id == tenant_id, CostCenter.id.in_(cc_ids)))
        ).scalars().all()
        cc_map = {c.id: (c.name or c.code or str(c.id)) for c in cc_rows}

    account_ids = sorted({line.account_id for line in lines})
    acc_rows = (
        await db.execute(
            select(ChartOfAccount, AccountGroup)
            .join(AccountGroup, ChartOfAccount.group_id == AccountGroup.id)
            .where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids))
        )
    ).all()
    acc_map: dict[int, tuple[ChartOfAccount, AccountGroup]] = {a.id: (a, g) for a, g in acc_rows}

    snap_lines: list[dict[str, Any]] = []
    for line in sorted(lines, key=lambda x: x.id):
        pair = acc_map.get(line.account_id)
        if pair:
            acct, grp = pair
            aname = acct.name
            anum = acct.account_number
            gname = grp.name
        else:
            aname = None
            anum = None
            gname = None
        snap_lines.append(
            {
                "line_id": line.id,
                "account_id": line.account_id,
                "account_number": anum,
                "account_name": aname,
                "group_name": gname,
                "cost_center_id": line.cost_center_id,
                "cost_center_label": cc_map.get(line.cost_center_id) if line.cost_center_id else None,
                "entry_type": line.entry_type,
                "amount": decimal_to_money_response(line.amount),
                "currency": line.currency,
                "exchange_rate": decimal_to_rate_response(line.exchange_rate),
                "base_amount": decimal_to_money_response(line.base_amount),
                "notes": line.notes,
            }
        )

    header = {
        "voucher_id": voucher.id,
        "voucher_number": voucher.voucher_number,
        "voucher_type": voucher.voucher_type,
        "voucher_date": voucher.voucher_date.isoformat(),
        "description": voucher.description,
        "reference": voucher.reference,
        "currency": voucher.currency,
        "base_currency": voucher.base_currency,
        "exchange_rate": decimal_to_rate_response(voucher.exchange_rate),
        "branch_code": voucher.branch_code,
        "fiscal_year": voucher.fiscal_year,
        "instrument_reference": voucher.instrument_reference,
    }
    doc = {
        "posted_at": (posted_at or datetime.utcnow()).isoformat() + "Z",
        "header": header,
        "lines": snap_lines,
    }
    return json.dumps(doc, ensure_ascii=False)


async def finalize_posted_voucher_metadata(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    lines: list[VoucherLine],
    *,
    strict_duplicate_check: bool = True,
) -> list[str]:
    """Set duplicate hash, snapshot, fiscal year; return control warnings. Raises if duplicate posted."""
    if voucher.fiscal_year is None:
        voucher.fiscal_year = fiscal_year_calendar(voucher.voucher_date)
    acct_ids = [line.account_id for line in lines]
    deb = sum(float(line.amount or "0") for line in lines if line.entry_type == "DEBIT")
    cre = sum(float(line.amount or "0") for line in lines if line.entry_type == "CREDIT")
    voucher.duplicate_risk_hash = compute_duplicate_risk_hash(
        tenant_id=tenant_id,
        voucher_date=voucher.voucher_date,
        reference=voucher.reference,
        line_account_ids=acct_ids,
        debit_total=deb,
        credit_total=cre,
    )
    if strict_duplicate_check:
        conflicts = await find_conflicting_posted_vouchers(
            db,
            tenant_id=tenant_id,
            duplicate_risk_hash=voucher.duplicate_risk_hash,
            exclude_voucher_id=voucher.id,
        )
        if conflicts:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Possible duplicate voucher: same date, reference shape, accounts and totals as another posted voucher.",
                    "similar_voucher_ids": conflicts,
                },
            )

    voucher.posted_snapshot_json = await build_posted_snapshot_json(db, tenant_id, voucher, lines)
    warnings = await collect_bank_cash_control_warnings(
        db,
        tenant_id,
        lines,
        voucher_type=voucher.voucher_type,
        instrument_reference=voucher.instrument_reference,
    )
    return warnings
