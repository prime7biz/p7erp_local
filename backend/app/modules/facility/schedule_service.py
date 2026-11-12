"""Generate repayment schedule rows for a utilization."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine

from app.modules.facility.emi_service import _d, preview_emi

PAID_LINE_STATUSES = ("paid", "partially_paid")


def add_months(base_date: date, months: int) -> date:
    month_index = (base_date.month - 1) + months
    year = base_date.year + month_index // 12
    month = (month_index % 12) + 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def add_period(base_date: date, freq: str, count: int) -> date:
    f = (freq or "monthly").lower()
    if f == "monthly":
        return add_months(base_date, count)
    if f == "quarterly":
        return add_months(base_date, count * 3)
    if f == "semi_annually":
        return add_months(base_date, count * 6)
    if f == "annually":
        return add_months(base_date, count * 12)
    return add_months(base_date, count)


def update_utilization_classification(util: FacilityUtilization, today: date) -> None:
    md = util.maturity_date
    if not md:
        util.utilization_classification = None
        return
    days = (md - today).days
    util.utilization_classification = "current" if days <= 365 else "non_current"


async def replace_schedule_for_utilization(
    db: AsyncSession,
    *,
    facility: Facility,
    util: FacilityUtilization,
    grace_days: int,
) -> None:
    """Delete unpaid schedule lines and rebuild them from preview (draft/active).

    Paid / partly paid installments (and any line already linked to a payment voucher) are kept
    as they are; the rebuilt schedule only fills the installment numbers that are still open.
    """
    kept = list(
        (
            await db.execute(
                select(RepaymentScheduleLine).where(
                    RepaymentScheduleLine.facility_utilization_id == util.id,
                    or_(
                        RepaymentScheduleLine.status.in_(PAID_LINE_STATUSES),
                        RepaymentScheduleLine.payment_voucher_id.is_not(None),
                    ),
                )
            )
        ).scalars().all()
    )
    kept_numbers = {ln.installment_number for ln in kept}
    stmt = delete(RepaymentScheduleLine).where(RepaymentScheduleLine.facility_utilization_id == util.id)
    if kept:
        stmt = stmt.where(RepaymentScheduleLine.id.not_in([ln.id for ln in kept]))
    await db.execute(stmt)
    await db.flush()

    policy = (util.repayment_policy or "emi_reducing").lower()
    principal = _d(util.principal_amount)
    rate = _d(util.interest_rate if util.interest_rate is not None else facility.interest_rate)
    itype = (util.interest_type or facility.interest_type or "reducing_balance") or "reducing_balance"
    n = int(util.num_installments or 0)
    freq = util.installment_frequency or "monthly"
    moratorium = int(util.moratorium_months or 0)

    first_due = util.first_repayment_date or util.disbursement_date or today_local()
    util.schedule_generation_version = int(util.schedule_generation_version or 1) + 1
    ver = util.schedule_generation_version

    if policy == "one_time_settlement" or n <= 0:
        util.emi_amount = None
        util.total_interest = None
        util.total_repayable = principal
        await db.flush()
        return

    preview = preview_emi(
        principal=principal,
        annual_interest_rate_percent=rate,
        repayment_policy=policy if policy != "manual_schedule" else "emi_reducing",
        num_installments=n,
        installment_frequency=freq,
        moratorium_months=moratorium,
        interest_type=itype,
    )
    util.emi_amount = _d(preview.emi_amount) if preview.emi_amount != "0" else None
    util.total_interest = _d(preview.total_interest) if preview.total_interest else None
    util.total_repayable = _d(preview.total_repayable) if preview.total_repayable else None

    for row in preview.rows:
        if row.installment_number in kept_numbers:
            continue
        due = add_period(first_due, freq, row.installment_number - 1)
        gd = due + timedelta(days=max(0, int(grace_days)))
        pr = _d(row.principal_component)
        ir = _d(row.interest_component)
        em = _d(row.emi_amount)
        ob = _d(row.outstanding_after)
        line = RepaymentScheduleLine(
            tenant_id=util.tenant_id,
            facility_utilization_id=util.id,
            installment_number=row.installment_number,
            due_date=due,
            principal_component=pr,
            interest_component=ir,
            emi_amount=em,
            outstanding_after_payment=ob,
            status="upcoming",
            grace_due_date=gd,
            schedule_version=ver,
        )
        db.add(line)
    await db.flush()


async def refresh_facility_utilized_amount(db: AsyncSession, facility_id: int, tenant_id: int) -> None:
    fac = await db.get(Facility, facility_id)
    if not fac or fac.tenant_id != tenant_id:
        return
    r = await db.execute(
        select(FacilityUtilization).where(
            FacilityUtilization.facility_id == facility_id,
            FacilityUtilization.tenant_id == tenant_id,
            FacilityUtilization.status.in_(("active", "draft")),
        )
    )
    utils = list(r.scalars().all())
    used = sum((_d(u.principal_amount) for u in utils if u.status == "active"), Decimal("0"))
    fac.utilized_amount = used
    san = _d(fac.sanctioned_amount)
    fac.available_amount = max(san - used, Decimal("0")) if san else None
    await db.flush()
