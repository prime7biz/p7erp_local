"""Apply facility state when vouchers reach POSTED (accounting is source of truth)."""

from __future__ import annotations

import re
from datetime import date

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
from app.models.finance import BankAccount, Voucher, VoucherLine

from app.modules.facility.constants import (
    SOURCE_FACILITY_ACCRUAL,
    SOURCE_FACILITY_DISBURSE,
    SOURCE_FACILITY_REPAYMENT,
)
from app.modules.facility.account_resolver import resolve_facility_accounts
from app.modules.facility.schedule_service import refresh_facility_utilized_amount


_ref_re = re.compile(r"^(\w+):(\d+)$")


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
        util = await db.get(FacilityUtilization, oid)
        if not util or util.tenant_id != tenant_id:
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
        util.status = "active"
        util.outstanding_principal = float(util.principal_amount or 0)
        util.disbursement_voucher_id = voucher.id
        fac = await db.get(Facility, util.facility_id)
        if fac:
            db.add(
                FacilityTransaction(
                    tenant_id=tenant_id,
                    facility_id=fac.id,
                    facility_utilization_id=util.id,
                    transaction_type="drawdown",
                    amount=float(util.principal_amount or 0),
                    currency=util.currency,
                    base_currency_amount=float(util.base_currency_amount or util.principal_amount or 0),
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
        util = await db.get(FacilityUtilization, row.facility_utilization_id)
        if not util:
            return
        add = float(row.interest_amount or 0)
        util.accrued_interest_outstanding = float(util.accrued_interest_outstanding or 0) + add
        row.status = "accrued"
        fac = await db.get(Facility, util.facility_id)
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
        util = await db.get(FacilityUtilization, row.facility_utilization_id)
        if util and row.interest_amount:
            util.accrued_interest_outstanding = max(
                float(util.accrued_interest_outstanding or 0) - float(row.interest_amount), 0
            )
        row.status = "reversed"
        if util:
            fac = await db.get(Facility, util.facility_id)
            if fac:
                db.add(
                    FacilityTransaction(
                        tenant_id=tenant_id,
                        facility_id=fac.id,
                        facility_utilization_id=util.id,
                        transaction_type="interest_accrual",
                        amount=-float(row.interest_amount or 0),
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
        util = await db.get(FacilityUtilization, line.facility_utilization_id)
        if not util:
            return
        fac = await db.get(Facility, util.facility_id)
        # Split principal/interest from lines (use same resolution as draft creation)
        vlines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
        principal_part = 0.0
        interest_part = 0.0
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
            amt = float(vl.amount or 0)
            if liability_id and aid == liability_id:
                principal_part += amt
            if payable_id and aid == payable_id:
                interest_part += amt
        total_paid = principal_part + interest_part
        line.payment_voucher_id = voucher.id
        line.paid_amount = total_paid
        line.paid_date = voucher.voucher_date
        emi_due = float(line.emi_amount or 0)
        if total_paid + 0.01 >= emi_due:
            line.status = "paid"
        else:
            line.status = "partially_paid"
        util.outstanding_principal = max(float(util.outstanding_principal or 0) - principal_part, 0)
        util.accrued_interest_outstanding = max(
            float(util.accrued_interest_outstanding or 0) - interest_part, 0
        )
        db.add(
            RepaymentAllocation(
                tenant_id=tenant_id,
                facility_utilization_id=util.id,
                repayment_schedule_line_id=line.id,
                voucher_id=voucher.id,
                allocated_principal=principal_part,
                allocated_interest=interest_part,
                allocated_penalty=0,
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
