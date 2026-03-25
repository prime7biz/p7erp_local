"""Create a balanced draft finance voucher for a WIP journal (production costing)."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import AccountGroup, ChartOfAccount, CostCenter, Tenant, User, Voucher, VoucherLine, WipJournal


async def create_draft_voucher_for_wip_journal(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    wip: WipJournal,
    gl_debit_account_id: int,
    gl_credit_account_id: int,
    voucher_type_code: str = "JOURNAL",
) -> int:
    """
    Build a two-line balanced DRAFT voucher: debit WIP / clearing, credit offset.
    Caller must have flushed `wip` so `wip.id` is set. Does not commit.
    """
    from app.modules.finance.router import (
        _active_voucher_type_codes,
        _apply_internal_signature,
        _lookup_exchange_rate,
        _normalize_currency,
        _to_float,
    )

    total = float(wip.total_value or 0)
    if total <= 0:
        raise HTTPException(status_code=400, detail="Total value must be positive to create a voucher")

    if gl_debit_account_id == gl_credit_account_id:
        raise HTTPException(status_code=400, detail="Debit and credit accounts must differ")

    vtype = voucher_type_code.strip().upper()
    if vtype not in await _active_voucher_type_codes(db, tenant.id):
        raise HTTPException(status_code=400, detail="Voucher type is inactive or not configured")

    desc = (
        f"WIP movement {wip.from_department} → {wip.to_department}"
        + (f" (order #{wip.order_id})" if wip.order_id else "")
    ).strip()
    ref = f"WIP-JRN-{wip.id}"

    amt_str = str(round(total, 4))
    txn_currency = _normalize_currency("BDT", default="BDT")
    base_currency = _normalize_currency("BDT", default="BDT")
    exchange_rate_value, rate_source, fetched_at = await _lookup_exchange_rate(db, tenant.id, txn_currency, base_currency)

    voucher_number = await next_tenant_code(
        db,
        model=Voucher,
        tenant_id=tenant.id,
        prefix="VCH-",
        width=4,
    )
    row = Voucher(
        tenant_id=tenant.id,
        voucher_number=voucher_number,
        voucher_type=vtype,
        voucher_date=wip.journal_date,
        status="DRAFT",
        description=desc,
        reference=ref,
        currency=txn_currency,
        base_currency=base_currency,
        exchange_rate=str(round(exchange_rate_value or 1.0, 8)),
        exchange_rate_source=rate_source,
        exchange_rate_fetched_at=fetched_at,
        trade_case_id=None,
        btb_lc_id=None,
        created_by=user.id,
    )
    db.add(row)
    await db.flush()

    line_specs: list[tuple[int, str, str]] = [
        (gl_debit_account_id, "DEBIT", amt_str),
        (gl_credit_account_id, "CREDIT", amt_str),
    ]
    created_lines: list[VoucherLine] = []
    for account_id, entry_type, amount in line_specs:
        acct = await db.get(ChartOfAccount, account_id)
        if not acct or acct.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Account not found: {account_id}")
        if getattr(acct, "account_type", "posting") == "header":
            raise HTTPException(status_code=400, detail=f"Posting not allowed to header account: {acct.account_number}")
        cc_id = wip.cost_center_id
        if cc_id is not None:
            center = await db.get(CostCenter, cc_id)
            if not center or center.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail=f"Cost center not found: {cc_id}")
        grp = await db.get(AccountGroup, acct.group_id)
        if grp and grp.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Account group not found")
        if grp and not getattr(grp, "allow_posting", True):
            raise HTTPException(
                status_code=400,
                detail=f"Posting not allowed to accounts in group '{grp.name}' (summary/post-disabled).",
            )
        line_rate = exchange_rate_value or 1.0
        amount_value = _to_float(amount)
        base_amount_value = amount_value * line_rate
        voucher_line = VoucherLine(
            tenant_id=tenant.id,
            voucher_id=row.id,
            account_id=account_id,
            cost_center_id=cc_id,
            currency=txn_currency,
            exchange_rate=str(round(line_rate, 8)),
            base_amount=str(round(base_amount_value, 4)),
            is_rate_overridden=False,
            rate_source=rate_source,
            entry_type=entry_type,
            amount=amount,
            notes=None,
        )
        db.add(voucher_line)
        created_lines.append(voucher_line)

    debit_total = sum(_to_float(x.amount) for x in created_lines if x.entry_type == "DEBIT")
    credit_total = sum(_to_float(x.amount) for x in created_lines if x.entry_type == "CREDIT")
    if round(debit_total, 4) != round(credit_total, 4):
        raise HTTPException(status_code=400, detail="Voucher is not balanced")

    _apply_internal_signature(row, created_lines)
    return row.id
