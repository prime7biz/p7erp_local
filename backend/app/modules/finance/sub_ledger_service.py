"""Person/source sub-accounts and draft-safe Tally bill references.

Draft vouchers store choices on ``voucher_line_bill_intents``. Those choices become
``bill_references`` only when the voucher is posted into the books. Trade reports
keep counting only PAYABLE and RECEIVABLE bills.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.orm_numeric import decimal_to_money_response
from app.common.ownership import ensure_owned
from app.models.finance import (
    AccountGroup,
    BillAllocation,
    BillReference,
    ChartOfAccount,
    FinanceSubAccount,
    Voucher,
    VoucherLine,
    VoucherLineBillIntent,
)
from app.models.party_ledger import PartyLedger

TRADE_BILL_TYPES = ("PAYABLE", "RECEIVABLE")
OPEN_STATUSES = ("OPEN", "PARTIALLY_SETTLED")
Q = Decimal("0.0001")


def quantize_amount(value: Decimal | str | int | float) -> Decimal:
    return Decimal(str(value)).quantize(Q)


def posted_or_manual_bill_clause():
    """Manual bills (no voucher) stay visible. Draft, cancelled and reversed voucher bills do not."""
    return or_(
        BillReference.source_voucher_id.is_(None),
        exists(
            select(1).where(
                Voucher.id == BillReference.source_voucher_id,
                Voucher.tenant_id == BillReference.tenant_id,
                Voucher.status == "POSTED",
            )
        ),
    )


def classify_bill_type(group: AccountGroup, entry_side: str, allocation_type: str) -> str:
    """Map a ledger group and the line side to a bill type of at most 20 characters."""
    side = (entry_side or "").upper()
    kind = (allocation_type or "").upper()
    code = (group.system_code or "").upper()
    name = (group.name or "").lower()
    nature = (group.nature or "").lower()
    payable = code in {"TRADE_PAYABLES", "ACCOUNTS_PAYABLE", "SUNDRY_CREDITORS"} or "payable" in name or "creditor" in name
    receivable = code in {"TRADE_RECEIVABLES", "SUNDRY_DEBTORS"} or "receivable" in name or "debtor" in name
    advance_asset = code in {"ADVANCES_AND_DEPOSITS", "OTHER_RECEIVABLES"} or nature == "asset"
    hand_loan = code == "SHORT_TERM_BORROWINGS" or "borrowing" in name or "loan" in name

    if payable:
        if side == "CREDIT":
            return "PAYABLE"
        if kind in {"NEW_REF", "ADVANCE"}:
            return "SUPPLIER_ADVANCE"
        raise HTTPException(status_code=400, detail="A supplier debit must settle an open bill (Against Ref or On Account).")
    if receivable:
        if side == "DEBIT":
            return "RECEIVABLE"
        if kind in {"NEW_REF", "ADVANCE"}:
            return "CUSTOMER_ADVANCE"
        raise HTTPException(status_code=400, detail="A customer credit must settle an open bill (Against Ref or On Account).")
    if hand_loan and nature == "liability":
        if side == "CREDIT" and kind in {"NEW_REF", "ADVANCE"}:
            return "HAND_LOAN_TAKEN"
        if side == "DEBIT":
            return "LENDER_ADVANCE"
        raise HTTPException(status_code=400, detail="This loan line needs a new reference on the credit, or a settlement on the debit.")
    if advance_asset:
        if side == "DEBIT" and kind in {"NEW_REF", "ADVANCE"}:
            return "ADVANCE_GIVEN"
        if side == "CREDIT":
            raise HTTPException(status_code=400, detail="An advance credit must settle an open advance (Against Ref or On Account).")
    raise HTTPException(status_code=400, detail="This ledger cannot take a bill reference of that kind.")


async def _party_ledger_blocks(db: AsyncSession, tenant_id: int, account_id: int, feature_flags) -> None:
    from app.common.tenant_feature_keys import is_party_ledger_enabled

    if not is_party_ledger_enabled(feature_flags):
        return
    row = (
        await db.execute(
            select(PartyLedger.id).where(
                PartyLedger.tenant_id == tenant_id,
                PartyLedger.ledger_account_id == account_id,
                PartyLedger.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if row is not None:
        raise HTTPException(
            status_code=400,
            detail="Ledger uses Party Ledger tracking; manage bills via Party Ledger.",
        )


async def _load_accounts_and_groups(
    db: AsyncSession, tenant_id: int, account_ids: set[int]
) -> tuple[dict[int, ChartOfAccount], dict[int, AccountGroup]]:
    """Load this tenant's ledgers and their groups in two queries."""
    if not account_ids:
        return {}, {}
    accounts = {
        row.id: row
        for row in (
            await db.execute(
                select(ChartOfAccount).where(
                    ChartOfAccount.tenant_id == tenant_id,
                    ChartOfAccount.id.in_(account_ids),
                )
            )
        ).scalars().all()
    }
    group_ids = {row.group_id for row in accounts.values() if row.group_id}
    if not group_ids:
        return accounts, {}
    groups = {
        row.id: row
        for row in (
            await db.execute(
                select(AccountGroup).where(
                    AccountGroup.tenant_id == tenant_id,
                    AccountGroup.id.in_(group_ids),
                )
            )
        ).scalars().all()
    }
    return accounts, groups


async def replace_line_intents(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    voucher: Voucher,
    pairs: list[tuple[VoucherLine, list]],
    feature_flags,
) -> None:
    """Replace draft intents for these lines. Does not write bill_references."""
    from app.common.tenant_feature_keys import is_finance_sub_ledger_tracking_v1_enabled

    enabled = is_finance_sub_ledger_tracking_v1_enabled(feature_flags)
    accounts, groups = await _load_accounts_and_groups(
        db, tenant_id, {line.account_id for line, intents in pairs if intents}
    )
    against_ids = {
        intent.target_bill_reference_id
        for _, intents in pairs
        for intent in intents
        if (getattr(intent, "allocation_type", "") or "").upper() == "AGAINST_REF"
        and getattr(intent, "target_bill_reference_id", None)
    }
    source_vouchers: dict[int, Voucher] = {}
    if against_ids:
        bill_rows = (
            await db.execute(
                select(BillReference).where(
                    BillReference.tenant_id == tenant_id,
                    BillReference.id.in_(against_ids),
                )
            )
        ).scalars().all()
        source_ids = {row.source_voucher_id for row in bill_rows if row.source_voucher_id}
        if source_ids:
            source_vouchers = {
                row.id: row
                for row in (
                    await db.execute(
                        select(Voucher).where(
                            Voucher.tenant_id == tenant_id,
                            Voucher.id.in_(source_ids),
                        )
                    )
                ).scalars().all()
            }
    for line, intents in pairs:
        if line.sub_account_id is not None or intents:
            if not enabled:
                raise HTTPException(status_code=400, detail="Sub-account tracking is switched off for this company.")
        if line.sub_account_id is not None:
            await ensure_owned(db, FinanceSubAccount, line.sub_account_id, tenant_id, "Sub-account")
        if not intents:
            continue
        await _party_ledger_blocks(db, tenant_id, line.account_id, feature_flags)
        total = Decimal("0")
        base = quantize_amount(line.base_amount or 0)
        for intent in intents:
            amount = quantize_amount(intent.amount)
            if amount <= 0:
                raise HTTPException(status_code=400, detail="Reference amount must be greater than zero.")
            ref_no = (intent.reference_no or "").strip()
            if len(ref_no) > 50:
                raise HTTPException(status_code=400, detail="Reference number must be 50 characters or less.")
            kind = (intent.allocation_type or "").upper()
            target_id = getattr(intent, "target_bill_reference_id", None)
            if kind in {"NEW_REF", "ADVANCE"}:
                if target_id is not None:
                    raise HTTPException(
                        status_code=400,
                        detail="New Ref and Advance create their own bill when the voucher is posted.",
                    )
                target_id = None
                account = accounts.get(line.account_id)
                group = groups.get(account.group_id) if account and account.group_id else None
                if account is None or account.tenant_id != tenant_id or group is None or group.tenant_id != tenant_id:
                    raise HTTPException(status_code=400, detail="Account group not found.")
                classify_bill_type(group, line.entry_type, kind)
            elif kind == "AGAINST_REF":
                if not target_id:
                    raise HTTPException(status_code=400, detail="Against Ref needs an open bill.")
                ref = await ensure_owned(db, BillReference, target_id, tenant_id, "Bill reference")
                if ref is None or ref.account_id != line.account_id:
                    raise HTTPException(status_code=400, detail="That reference is on a different ledger.")
                if (ref.status or "").upper() not in OPEN_STATUSES:
                    raise HTTPException(status_code=400, detail="That reference is not open.")
                if ref.source_voucher_id is not None:
                    source = source_vouchers.get(ref.source_voucher_id)
                    if source is None or source.status != "POSTED":
                        raise HTTPException(status_code=400, detail="That reference is not in the books yet.")
                if ref.entry_side and ref.entry_side == line.entry_type:
                    raise HTTPException(status_code=400, detail="Against Ref must be the opposite side of the open reference.")
                if line.sub_account_id and ref.sub_account_id and ref.sub_account_id != line.sub_account_id:
                    raise HTTPException(status_code=400, detail="That reference belongs to a different person.")
            elif kind == "ON_ACCOUNT":
                if target_id is not None:
                    ref = await ensure_owned(db, BillReference, target_id, tenant_id, "Bill reference")
                    if ref is None or ref.account_id != line.account_id:
                        raise HTTPException(status_code=400, detail="That reference is on a different ledger.")
            else:
                raise HTTPException(status_code=400, detail="Unknown reference type.")
            total += amount
            db.add(
                VoucherLineBillIntent(
                    tenant_id=tenant_id,
                    voucher_id=voucher.id,
                    voucher_line_id=line.id,
                    account_id=line.account_id,
                    sub_account_id=line.sub_account_id,
                    allocation_type=kind,
                    reference_no=ref_no or None,
                    target_bill_reference_id=target_id,
                    due_date=getattr(intent, "due_date", None),
                    amount=amount,
                    notes=getattr(intent, "notes", None),
                    lifecycle_status="PENDING",
                    created_by=user_id,
                )
            )
        if total > base:
            raise HTTPException(status_code=400, detail="Reference amounts cannot be more than the line amount.")
    await db.flush()


async def cancel_pending_intents(db: AsyncSession, tenant_id: int, voucher_id: int) -> None:
    rows = (
        await db.execute(
            select(VoucherLineBillIntent).where(
                VoucherLineBillIntent.tenant_id == tenant_id,
                VoucherLineBillIntent.voucher_id == voucher_id,
                VoucherLineBillIntent.lifecycle_status == "PENDING",
            )
        )
    ).scalars().all()
    for row in rows:
        row.lifecycle_status = "CANCELLED"


async def apply_pending_intents(db: AsyncSession, tenant_id: int, voucher: Voucher, user_id: int | None) -> None:
    """Turn PENDING draft references into posted bills. Safe to call again."""
    intents = (
        await db.execute(
            select(VoucherLineBillIntent).where(
                VoucherLineBillIntent.tenant_id == tenant_id,
                VoucherLineBillIntent.voucher_id == voucher.id,
                VoucherLineBillIntent.lifecycle_status == "PENDING",
            )
        )
    ).scalars().all()
    if not intents:
        return
    lines = {
        row.id: row
        for row in (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant_id,
                    VoucherLine.id.in_({row.voucher_line_id for row in intents}),
                )
            )
        ).scalars().all()
    }
    accounts, groups = await _load_accounts_and_groups(db, tenant_id, {row.account_id for row in intents})
    for intent in intents:
        line = lines.get(intent.voucher_line_id)
        account = accounts.get(intent.account_id)
        if line is None or account is None:
            raise HTTPException(status_code=400, detail="Bill reference line is no longer valid.")
        group = groups.get(account.group_id) if account.group_id else None
        if group is None:
            raise HTTPException(status_code=400, detail="Account group not found.")
        amount = quantize_amount(intent.amount)
        if intent.allocation_type in {"NEW_REF", "ADVANCE"}:
            bill_type = classify_bill_type(group, line.entry_type, intent.allocation_type)
            existing = None
            if intent.target_bill_reference_id:
                existing = await db.get(BillReference, intent.target_bill_reference_id, with_for_update=True)
            if (
                existing is not None
                and existing.tenant_id == tenant_id
                and existing.source_voucher_id == voucher.id
                and existing.account_id == account.id
                and (existing.status or "").upper() == "CANCELLED"
            ):
                existing.status = "OPEN"
                existing.pending_amount = amount
                existing.original_amount = amount
                existing.bill_type = bill_type
                existing.entry_side = line.entry_type
            else:
                ref = BillReference(
                    tenant_id=tenant_id,
                    bill_number=(intent.reference_no or f"TALLY-{voucher.id}-{intent.id}")[:50],
                    bill_date=voucher.voucher_date,
                    due_date=intent.due_date,
                    bill_type=bill_type,
                    party_name=(account.name or "")[:255],
                    account_id=account.id,
                    sub_account_id=intent.sub_account_id,
                    entry_side=line.entry_type,
                    original_amount=amount,
                    pending_amount=amount,
                    source_voucher_id=voucher.id,
                    source_doc_type=intent.allocation_type,
                    source_doc_number=(voucher.voucher_number or "")[:50],
                    status="OPEN",
                    notes=intent.notes,
                    created_by=user_id,
                )
                db.add(ref)
                await db.flush()
                intent.target_bill_reference_id = ref.id
        elif intent.allocation_type == "AGAINST_REF":
            ref = await db.get(BillReference, intent.target_bill_reference_id, with_for_update=True)
            if ref is None or ref.tenant_id != tenant_id or ref.account_id != intent.account_id:
                raise HTTPException(status_code=404, detail="Bill reference not found.")
            if intent.sub_account_id and ref.sub_account_id and ref.sub_account_id != intent.sub_account_id:
                raise HTTPException(status_code=400, detail="That reference belongs to a different person.")
            if ref.entry_side and ref.entry_side == line.entry_type:
                raise HTTPException(status_code=400, detail="Against Ref must be the opposite side of the open reference.")
            pending = quantize_amount(ref.pending_amount or 0)
            if amount > pending:
                raise HTTPException(status_code=400, detail="Amount is more than the open reference.")
            ref.pending_amount = pending - amount
            ref.status = "SETTLED" if ref.pending_amount <= Q else "PARTIALLY_SETTLED"
            db.add(
                BillAllocation(
                    tenant_id=tenant_id,
                    bill_reference_id=ref.id,
                    voucher_id=voucher.id,
                    voucher_line_id=line.id,
                    allocation_type="AGAINST_REF",
                    amount=amount,
                    account_id=account.id,
                    sub_account_id=intent.sub_account_id,
                    allocation_date=voucher.voucher_date,
                    notes=intent.notes,
                    created_by=user_id,
                )
            )
        else:
            on_account_bill_id = None
            if intent.target_bill_reference_id:
                ref = await db.get(BillReference, intent.target_bill_reference_id, with_for_update=True)
                if ref is None or ref.tenant_id != tenant_id or ref.account_id != account.id:
                    raise HTTPException(status_code=404, detail="Bill reference not found.")
                on_account_bill_id = ref.id
            db.add(
                BillAllocation(
                    tenant_id=tenant_id,
                    bill_reference_id=on_account_bill_id,
                    voucher_id=voucher.id,
                    voucher_line_id=line.id,
                    allocation_type="ON_ACCOUNT",
                    amount=amount,
                    account_id=account.id,
                    sub_account_id=intent.sub_account_id,
                    allocation_date=voucher.voucher_date,
                    notes=intent.notes,
                    created_by=user_id,
                )
            )
        intent.lifecycle_status = "APPLIED"
    await db.flush()


async def reverse_applied_intents(db: AsyncSession, tenant_id: int, voucher_id: int, *, reset_to_pending: bool) -> None:
    intents = (
        await db.execute(
            select(VoucherLineBillIntent).where(
                VoucherLineBillIntent.tenant_id == tenant_id,
                VoucherLineBillIntent.voucher_id == voucher_id,
                VoucherLineBillIntent.lifecycle_status == "APPLIED",
            )
        )
    ).scalars().all()
    for intent in intents:
        if intent.allocation_type in {"NEW_REF", "ADVANCE"} and intent.target_bill_reference_id:
            ref = await db.get(BillReference, intent.target_bill_reference_id, with_for_update=True)
            if ref is not None and ref.tenant_id == tenant_id:
                used = (
                    await db.execute(
                        select(BillAllocation.id)
                        .join(Voucher, Voucher.id == BillAllocation.voucher_id)
                        .where(
                            BillAllocation.tenant_id == tenant_id,
                            BillAllocation.bill_reference_id == ref.id,
                            BillAllocation.voucher_id != voucher_id,
                            Voucher.tenant_id == tenant_id,
                            Voucher.status == "POSTED",
                        )
                    )
                ).first()
                if used is not None:
                    raise HTTPException(status_code=409, detail="Another voucher already used this reference.")
                ref.status = "CANCELLED"
                ref.pending_amount = Decimal("0")
        elif intent.allocation_type == "AGAINST_REF" and intent.target_bill_reference_id:
            ref = await db.get(BillReference, intent.target_bill_reference_id, with_for_update=True)
            if ref is not None and ref.tenant_id == tenant_id:
                ref.pending_amount = quantize_amount(ref.pending_amount or 0) + quantize_amount(intent.amount)
                ref.status = "OPEN" if ref.pending_amount >= quantize_amount(ref.original_amount or 0) else "PARTIALLY_SETTLED"
        intent.lifecycle_status = "PENDING" if reset_to_pending else "REVERSED"
    await db.execute(
        delete(BillAllocation).where(
            BillAllocation.tenant_id == tenant_id,
            BillAllocation.voucher_id == voucher_id,
        )
    )
    await db.flush()


def intent_to_dict(row: VoucherLineBillIntent) -> dict:
    return {
        "allocation_type": row.allocation_type,
        "reference_no": row.reference_no,
        "target_bill_reference_id": row.target_bill_reference_id,
        "due_date": row.due_date,
        "amount": decimal_to_money_response(row.amount),
        "notes": row.notes,
    }


async def intents_by_line(db: AsyncSession, tenant_id: int, voucher_ids: list[int]) -> dict[int, list[dict]]:
    if not voucher_ids:
        return {}
    rows = (
        await db.execute(
            select(VoucherLineBillIntent).where(
                VoucherLineBillIntent.tenant_id == tenant_id,
                VoucherLineBillIntent.voucher_id.in_(voucher_ids),
                VoucherLineBillIntent.lifecycle_status != "CANCELLED",
            )
        )
    ).scalars().all()
    out: dict[int, list[dict]] = {}
    for row in rows:
        out.setdefault(row.voucher_line_id, []).append(intent_to_dict(row))
    return out
