"""Apply facility state when vouchers reach POSTED (accounting is source of truth)."""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facility import (
    Facility,
    FacilityTransaction,
    FacilityUtilization,
    InterestAccrual,
    RepaymentAllocation,
    RepaymentScheduleLine,
)
from app.models.finance import Voucher, VoucherLine

from app.modules.facility.constants import (
    SOURCE_FACILITY_ACCRUAL,
    SOURCE_FACILITY_DISBURSE,
    SOURCE_FACILITY_REPAYMENT,
)
from app.modules.facility.account_resolver import resolve_facility_accounts
from app.modules.facility.schedule_service import refresh_facility_utilized_amount


_ref_re = re.compile(r"^(\w+):(\d+)$")
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _d(value: object) -> Decimal:
    """Exact Decimal for Numeric columns (never binary float maths on money)."""
    if value is None:
        return ZERO
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _balance(value: Decimal) -> Decimal:
    """Utilization balances are Numeric(18,2); never below zero."""
    return max(value, ZERO).quantize(CENT, rounding=ROUND_HALF_UP)


async def _tenant_util(db: AsyncSession, tenant_id: int, util_id: int | None) -> FacilityUtilization | None:
    if util_id is None:
        return None
    util = await db.get(FacilityUtilization, util_id)
    return util if util is not None and util.tenant_id == tenant_id else None


async def _tenant_facility(db: AsyncSession, tenant_id: int, facility_id: int | None) -> Facility | None:
    if facility_id is None:
        return None
    fac = await db.get(Facility, facility_id)
    return fac if fac is not None and fac.tenant_id == tenant_id else None


async def process_facility_voucher_posted(
    db: AsyncSession,
    tenant_id: int,
    voucher: Voucher,
    user_id: int | None,
) -> None:
    if voucher.tenant_id != tenant_id:
        return
    sm = (voucher.source_module or "").strip()
    ref = (voucher.source_module_ref or "").strip()
    m = _ref_re.match(ref)
    if not m:
        return
    kind, id_str = m.group(1), m.group(2)
    oid = int(id_str)

    if sm == SOURCE_FACILITY_DISBURSE and kind == "disbursement":
        util = await _tenant_util(db, tenant_id, oid)
        if not util:
            return
        dup = (
            await db.execute(
                select(FacilityTransaction.id).where(
                    FacilityTransaction.tenant_id == tenant_id,
                    FacilityTransaction.voucher_id == voucher.id,
                    FacilityTransaction.transaction_type == "drawdown",
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            return
        principal = _d(util.principal_amount)
        util.status = "active"
        util.outstanding_principal = _balance(principal)
        util.disbursement_voucher_id = voucher.id
        fac = await _tenant_facility(db, tenant_id, util.facility_id)
        if fac:
            db.add(
                FacilityTransaction(
                    tenant_id=tenant_id,
                    facility_id=fac.id,
                    facility_utilization_id=util.id,
                    transaction_type="drawdown",
                    amount=principal,
                    currency=util.currency,
                    base_currency_amount=_d(util.base_currency_amount or util.principal_amount),
                    voucher_id=voucher.id,
                    date=voucher.voucher_date,
                    notes="Disbursement posted",
                    created_by=user_id,
                )
            )
            await refresh_facility_utilized_amount(db, fac.id, tenant_id)
        await db.flush()
        return

    if sm == SOURCE_FACILITY_ACCRUAL and kind == "accrual":
        row = await db.get(InterestAccrual, oid)
        if not row or row.tenant_id != tenant_id:
            return
        if row.status == "accrued":
            return
        util = await _tenant_util(db, tenant_id, row.facility_utilization_id)
        if not util:
            return
        add = _d(row.interest_amount)
        util.accrued_interest_outstanding = _balance(_d(util.accrued_interest_outstanding) + add)
        row.status = "accrued"
        fac = await _tenant_facility(db, tenant_id, util.facility_id)
        if fac:
            db.add(
                FacilityTransaction(
                    tenant_id=tenant_id,
                    facility_id=fac.id,
                    facility_utilization_id=util.id,
                    transaction_type="interest_accrual",
                    amount=add,
                    currency=util.currency,
                    voucher_id=voucher.id,
                    date=voucher.voucher_date,
                    notes="Interest accrual posted",
                    created_by=user_id,
                )
            )
        await db.flush()
        return

    if sm == SOURCE_FACILITY_ACCRUAL and kind == "accrual_reversal":
        row = await db.get(InterestAccrual, oid)
        if not row or row.tenant_id != tenant_id:
            return
        if row.status == "reversed":
            return
        util = await _tenant_util(db, tenant_id, row.facility_utilization_id)
        interest = _d(row.interest_amount)
        if util and interest:
            util.accrued_interest_outstanding = _balance(_d(util.accrued_interest_outstanding) - interest)
        row.status = "reversed"
        if util:
            fac = await _tenant_facility(db, tenant_id, util.facility_id)
            if fac:
                db.add(
                    FacilityTransaction(
                        tenant_id=tenant_id,
                        facility_id=fac.id,
                        facility_utilization_id=util.id,
                        transaction_type="interest_accrual",
                        amount=-interest,
                        currency=util.currency,
                        voucher_id=voucher.id,
                        date=voucher.voucher_date,
                        notes="Interest accrual reversal posted",
                        created_by=user_id,
                    )
                )
        await db.flush()
        return

    if sm == SOURCE_FACILITY_REPAYMENT and kind == "repayment":
        line = await db.get(RepaymentScheduleLine, oid)
        if not line or line.tenant_id != tenant_id:
            return
        if line.payment_voucher_id == voucher.id:
            return
        already = (
            await db.execute(
                select(RepaymentAllocation.id).where(
                    RepaymentAllocation.tenant_id == tenant_id,
                    RepaymentAllocation.repayment_schedule_line_id == line.id,
                    RepaymentAllocation.voucher_id == voucher.id,
                )
            )
        ).scalars().first()
        if already is not None:
            return
        util = await _tenant_util(db, tenant_id, line.facility_utilization_id)
        if not util:
            return
        fac = await _tenant_facility(db, tenant_id, util.facility_id)
        # Split principal/interest from lines (use same resolution as draft creation)
        vlines = list(
            (
                await db.execute(
                    select(VoucherLine).where(VoucherLine.voucher_id == voucher.id, VoucherLine.tenant_id == tenant_id)
                )
            ).scalars().all()
        )
        principal_part = ZERO
        interest_part = ZERO
        liability_id = None
        payable_id = None
        if fac:
            fac_acc = await resolve_facility_accounts(db, tenant_id, fac)
            liability_id = fac_acc["liability"]
            payable_id = fac_acc["interest_payable"]
        for vl in vlines:
            if vl.entry_type != "DEBIT":
                continue
            aid = vl.account_id
            amt = _d(vl.amount)
            if liability_id and aid == liability_id:
                principal_part += amt
            if payable_id and aid == payable_id:
                interest_part += amt
        total_paid = principal_part + interest_part
        # A second partial payment adds to what was already paid on this installment.
        cumulative_paid = _d(line.paid_amount) + total_paid
        line.payment_voucher_id = voucher.id
        line.paid_amount = cumulative_paid
        line.paid_date = voucher.voucher_date
        emi_due = _d(line.emi_amount)
        if cumulative_paid + CENT >= emi_due:
            line.status = "paid"
        else:
            line.status = "partially_paid"
        util.outstanding_principal = _balance(_d(util.outstanding_principal) - principal_part)
        util.accrued_interest_outstanding = _balance(_d(util.accrued_interest_outstanding) - interest_part)
        db.add(
            RepaymentAllocation(
                tenant_id=tenant_id,
                facility_utilization_id=util.id,
                repayment_schedule_line_id=line.id,
                voucher_id=voucher.id,
                allocated_principal=principal_part,
                allocated_interest=interest_part,
                allocated_penalty=ZERO,
                allocation_date=voucher.voucher_date,
            )
        )
        if fac:
            db.add(
                FacilityTransaction(
                    tenant_id=tenant_id,
                    facility_id=fac.id,
                    facility_utilization_id=util.id,
                    transaction_type="repayment",
                    amount=total_paid,
                    currency=util.currency,
                    voucher_id=voucher.id,
                    date=voucher.voucher_date,
                    notes="Repayment posted",
                    created_by=user_id,
                )
            )
        await db.flush()
        return
