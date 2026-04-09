"""Idempotent month-end interest accrual (draft vouchers)."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.facility import Facility, FacilityUtilization, InterestAccrual
from app.models.finance import Voucher, VoucherLine
from app.modules.facility.constants import SOURCE_FACILITY_ACCRUAL
from app.modules.facility.emi_service import accrue_simple_monthly_interest, _d
from app.modules.facility.account_resolver import resolve_facility_accounts
from app.modules.facility.gl_service import create_accrual_draft, create_facility_journal_draft


def accrual_month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


async def run_monthly_accrual(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    accrual_month: str,
    accrual_date: date | None = None,
) -> dict[str, int]:
    """Create one accrual per active utilization per month (skip if exists). Returns counts."""
    created = 0
    skipped = 0
    adate = accrual_date or date.today()

    r = await db.execute(
        select(FacilityUtilization).where(
            FacilityUtilization.tenant_id == tenant_id,
            FacilityUtilization.status == "active",
        )
    )
    utils = list(r.scalars().all())
    for util in utils:
        existing = (
            await db.execute(
                select(InterestAccrual).where(
                    InterestAccrual.tenant_id == tenant_id,
                    InterestAccrual.facility_utilization_id == util.id,
                    InterestAccrual.accrual_month == accrual_month,
                )
            )
        ).scalar_one_or_none()
        if existing:
            skipped += 1
            continue
        fac = await db.get(Facility, util.facility_id)
        if not fac or fac.tenant_id != tenant_id:
            continue
        rate = util.interest_rate if util.interest_rate is not None else fac.interest_rate
        if rate is None or float(rate) <= 0:
            skipped += 1
            continue
        principal = _d(util.outstanding_principal if util.outstanding_principal is not None else util.principal_amount)
        if principal <= 0:
            skipped += 1
            continue
        fac_acc = await resolve_facility_accounts(db, tenant_id, fac)
        exp_id = fac_acc["interest_expense"]
        pay_id = fac_acc["interest_payable"]
        if not exp_id or not pay_id:
            skipped += 1
            continue
        int_amt = float(accrue_simple_monthly_interest(principal, _d(rate)))
        if int_amt <= 0:
            skipped += 1
            continue
        row = InterestAccrual(
            tenant_id=tenant_id,
            facility_utilization_id=util.id,
            accrual_month=accrual_month,
            accrual_date=adate,
            outstanding_principal_at_accrual=float(principal),
            interest_amount=int_amt,
            status="pending",
        )
        db.add(row)
        await db.flush()
        t = await db.get(Tenant, tenant_id)
        base_ccy = (t.base_currency if t else None) or "BDT"
        v = await create_accrual_draft(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            util_id=util.id,
            interest_amount=int_amt,
            expense_account_id=exp_id,
            interest_payable_account_id=pay_id,
            voucher_date=adate,
            accrual_id=row.id,
            base_currency=base_ccy,
        )
        row.journal_voucher_id = v.id
        row.status = "pending"  # becomes accrued when voucher is POSTED (posting hook)
        created += 1
    await db.flush()
    return {"created": created, "skipped": skipped}


async def reverse_accrual(
    db: AsyncSession,
    *,
    tenant_id: int,
    accrual_id: int,
    reason: str,
    user_id: int | None,
) -> InterestAccrual | None:
    row = await db.get(InterestAccrual, accrual_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Accrual not found")
    if row.reversal_voucher_id:
        raise HTTPException(status_code=400, detail="Reversal already created")
    if row.status == "pending":
        # Draft accrual not posted — remove voucher and row
        if row.journal_voucher_id:
            v0 = await db.get(Voucher, row.journal_voucher_id)
            if v0 and v0.status == "DRAFT":
                vlines = (
                    await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v0.id))
                ).scalars().all()
                for vl in vlines:
                    await db.delete(vl)
                await db.delete(v0)
        await db.delete(row)
        await db.flush()
        return None
    if row.status != "accrued":
        raise HTTPException(status_code=400, detail="Only posted accruals can be reversed this way")
    # Reversal: swap DR/CR on same accounts via journal — reuse create with swapped accounts
    v_orig = await db.get(Voucher, row.journal_voucher_id)
    if not v_orig:
        raise HTTPException(status_code=400, detail="Original voucher missing")
    lines = list(
        (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == v_orig.id))).scalars().all()
    )
    if len(lines) != 2:
        raise HTTPException(status_code=400, detail="Expected two-line accrual voucher")
    dr = next(x for x in lines if x.entry_type == "DEBIT")
    cr = next(x for x in lines if x.entry_type == "CREDIT")
    amt = float(dr.amount or 0)
    util = await db.get(FacilityUtilization, row.facility_utilization_id)
    t = await db.get(Tenant, tenant_id)
    base_ccy = (t.base_currency if t else None) or "BDT"
    rev = await create_facility_journal_draft(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_date=date.today(),
        description=f"Reversal accrual #{accrual_id}",
        reference=f"FAC-ACC-REV-{accrual_id}",
        debit_account_id=cr.account_id,
        credit_account_id=dr.account_id,
        amount=amt,
        facility_utilization_id=row.facility_utilization_id,
        source_module=SOURCE_FACILITY_ACCRUAL,
        source_module_ref=f"accrual_reversal:{accrual_id}",
        base_currency=base_ccy,
    )
    row.reversal_voucher_id = rev.id
    row.reversal_reason = reason
    # status becomes reversed when reversal voucher is POSTED (posting hook)
    await db.flush()
    return row
