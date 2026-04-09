"""Repayment draft vouchers and overdue maintenance."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.finance import BankAccount
from app.modules.facility.account_resolver import resolve_facility_accounts
from app.modules.facility.gl_service import create_repayment_draft


async def create_repayment_draft_for_line(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    schedule_line_id: int,
    voucher_date: date | None = None,
) -> tuple[RepaymentScheduleLine, object]:
    line = await db.get(RepaymentScheduleLine, schedule_line_id)
    if not line or line.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Schedule line not found")
    if line.status in ("paid",):
        raise HTTPException(status_code=400, detail="Line already paid")
    if line.draft_voucher_id:
        raise HTTPException(status_code=400, detail="Draft voucher already exists for this line")
    util = await db.get(FacilityUtilization, line.facility_utilization_id)
    if not util or util.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Utilization not found")
    fac = await db.get(Facility, util.facility_id)
    if not fac:
        raise HTTPException(status_code=400, detail="Facility not found")
    fac_acc = await resolve_facility_accounts(db, tenant_id, fac)
    liability_id = fac_acc["liability"]
    payable_id = fac_acc["interest_payable"]
    if not liability_id or not payable_id:
        raise HTTPException(
            status_code=400,
            detail="Facility GL accounts not configured (configure facility or run system COA seed)",
        )
    bank_gl = None
    if fac.linked_bank_account_id:
        ba = await db.get(BankAccount, fac.linked_bank_account_id)
        if ba and ba.tenant_id == tenant_id:
            bank_gl = ba.gl_account_id
    if not bank_gl and fac.repayment_source_account_id:
        bank_gl = fac.repayment_source_account_id
    if not bank_gl:
        raise HTTPException(status_code=400, detail="Repayment bank GL not configured (link bank account or repayment source)")
    from app.models import Tenant

    t = await db.get(Tenant, tenant_id)
    base_ccy = (t.base_currency if t else None) or "BDT"
    v = await create_repayment_draft(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        util_id=util.id,
        schedule_line_id=line.id,
        principal_part=float(line.principal_component or 0),
        interest_part=float(line.interest_component or 0),
        liability_account_id=liability_id,
        interest_payable_account_id=payable_id,
        bank_account_id=bank_gl,
        voucher_date=voucher_date or date.today(),
        base_currency=base_ccy,
    )
    line.draft_voucher_id = v.id
    await db.flush()
    return line, v


async def generate_due_vouchers(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    horizon_days: int = 7,
) -> int:
    today = date.today()
    until = today + timedelta(days=horizon_days)
    r = await db.execute(
        select(RepaymentScheduleLine)
        .join(FacilityUtilization, RepaymentScheduleLine.facility_utilization_id == FacilityUtilization.id)
        .where(
            RepaymentScheduleLine.tenant_id == tenant_id,
            FacilityUtilization.status == "active",
            RepaymentScheduleLine.due_date <= until,
            RepaymentScheduleLine.status.in_(("upcoming", "due", "overdue", "partially_paid")),
            RepaymentScheduleLine.draft_voucher_id.is_(None),
        )
    )
    lines = list(r.scalars().all())
    n = 0
    for line in lines:
        try:
            await create_repayment_draft_for_line(db, tenant_id=tenant_id, user_id=user_id, schedule_line_id=line.id)
            n += 1
        except HTTPException:
            continue
    await db.flush()
    return n


async def mark_overdue_lines(db: AsyncSession, *, tenant_id: int) -> int:
    today = date.today()
    r = await db.execute(
        select(RepaymentScheduleLine).where(
            RepaymentScheduleLine.tenant_id == tenant_id,
            RepaymentScheduleLine.status.in_(("upcoming", "due", "partially_paid")),
            RepaymentScheduleLine.grace_due_date.isnot(None),
            RepaymentScheduleLine.grace_due_date < today,
        )
    )
    lines = list(r.scalars().all())
    for ln in lines:
        ln.status = "overdue"
    await db.flush()
    return len(lines)
