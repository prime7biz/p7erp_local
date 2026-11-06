"""Bank loan facility: schedule regeneration, partial repayments, single activation.

Run:
docker compose exec backend pytest tests/test_accounting_facility.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.facility import Facility, FacilityUtilization, RepaymentAllocation, RepaymentScheduleLine
from app.models.finance import AccountingPeriod, Voucher, VoucherLine, VoucherType
from app.modules.facility import router as facility_router
from app.modules.facility.constants import SOURCE_FACILITY_REPAYMENT
from app.modules.facility.posting_hooks import process_facility_voucher_posted
from app.modules.facility.schedule_service import replace_schedule_for_utilization

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account


async def _seed(db, *, policy: str = "emi_reducing", installments: int = 3):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=False,
        )
    )
    loan = await _account(db, tenant.id, "Term loan", normal="credit")
    interest_payable = await _account(db, tenant.id, "Interest payable", normal="credit")
    bank = await _account(db, tenant.id, "Bank")
    fac = Facility(
        tenant_id=tenant.id,
        facility_code=f"F{uuid.uuid4().hex[:6]}",
        facility_type="term_loan",
        sanctioned_amount=Decimal("300000"),
        interest_rate=Decimal("12"),
        interest_type="reducing_balance",
        status="draft",
        gl_liability_account_id=loan.id,
        gl_interest_payable_account_id=interest_payable.id,
        repayment_source_account_id=bank.id,
    )
    db.add(fac)
    await db.flush()
    util = FacilityUtilization(
        tenant_id=tenant.id,
        facility_id=fac.id,
        utilization_code=f"U{uuid.uuid4().hex[:6]}",
        principal_amount=Decimal("300000"),
        disbursement_date=today,
        first_repayment_date=today + timedelta(days=30),
        repayment_policy=policy,
        num_installments=installments,
        installment_frequency="monthly",
        interest_rate=Decimal("12"),
        status="draft",
        outstanding_principal=Decimal("300000"),
    )
    db.add(util)
    await db.flush()
    return tenant, user, fac, util, loan, interest_payable, bank


async def _schedule(db, util_id: int) -> list[RepaymentScheduleLine]:
    return list(
        (
            await db.execute(
                select(RepaymentScheduleLine)
                .where(RepaymentScheduleLine.facility_utilization_id == util_id)
                .order_by(RepaymentScheduleLine.installment_number)
            )
        ).scalars().all()
    )


@pytest.mark.asyncio
async def test_one_time_settlement_schedule_does_not_crash(db_session_integration):
    db = db_session_integration
    _t, _u, fac, util, *_ = await _seed(db, policy="one_time_settlement", installments=0)
    await replace_schedule_for_utilization(db, facility=fac, util=util, grace_days=0)
    assert Decimal(str(util.total_repayable)) == Decimal("300000")


@pytest.mark.asyncio
async def test_regenerate_keeps_paid_installments(db_session_integration):
    db = db_session_integration
    _t, _u, fac, util, *_ = await _seed(db)
    await replace_schedule_for_utilization(db, facility=fac, util=util, grace_days=0)
    first = await _schedule(db, util.id)
    assert [ln.installment_number for ln in first] == [1, 2, 3]
    paid = first[0]
    paid.status = "paid"
    paid.paid_amount = paid.emi_amount
    await db.flush()

    await replace_schedule_for_utilization(db, facility=fac, util=util, grace_days=5)
    second = await _schedule(db, util.id)
    assert [ln.installment_number for ln in second] == [1, 2, 3]
    assert second[0].id == paid.id
    assert second[0].status == "paid"


async def _repayment_voucher(db, tenant, util_line, loan, bank, amount: str) -> Voucher:
    v = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"RP-{uuid.uuid4().hex[:6]}",
        voucher_type="PAYMENT",
        voucher_date=date.today(),
        status="POSTED",
        source_module=SOURCE_FACILITY_REPAYMENT,
        source_module_ref=f"repayment:{util_line.id}",
    )
    db.add(v)
    await db.flush()
    db.add_all(
        [
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=loan.id, entry_type="DEBIT", amount=Decimal(amount), base_amount=Decimal(amount)),
            VoucherLine(tenant_id=tenant.id, voucher_id=v.id, account_id=bank.id, entry_type="CREDIT", amount=Decimal(amount), base_amount=Decimal(amount)),
        ]
    )
    await db.flush()
    return v


@pytest.mark.asyncio
async def test_partial_repayments_add_up(db_session_integration):
    db = db_session_integration
    tenant, user, fac, util, loan, _ip, bank = await _seed(db)
    await replace_schedule_for_utilization(db, facility=fac, util=util, grace_days=0)
    line = (await _schedule(db, util.id))[0]
    emi = Decimal(str(line.emi_amount))
    half = (emi / 2).quantize(Decimal("0.01"))

    v1 = await _repayment_voucher(db, tenant, line, loan, bank, str(half))
    await process_facility_voucher_posted(db, tenant.id, v1, user.id)
    await db.refresh(line)
    assert line.status == "partially_paid"
    assert Decimal(str(line.paid_amount)) == half

    # Same voucher again is ignored.
    await process_facility_voucher_posted(db, tenant.id, v1, user.id)
    v2 = await _repayment_voucher(db, tenant, line, loan, bank, str(emi - half))
    await process_facility_voucher_posted(db, tenant.id, v2, user.id)
    await db.refresh(line)
    assert Decimal(str(line.paid_amount)) == emi
    assert line.status == "paid"
    allocs = (await db.execute(select(RepaymentAllocation).where(RepaymentAllocation.repayment_schedule_line_id == line.id))).scalars().all()
    assert len(allocs) == 2


@pytest.mark.asyncio
async def test_activation_cannot_create_second_disbursement(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, fac, util, *_ = await _seed(db)
    db.add(VoucherType(tenant_id=tenant.id, code="JOURNAL", name="Journal", is_active=True))
    await db.commit()
    monkeypatch.setattr(facility_router, "get_settings", lambda: SimpleNamespace(facility_management_enabled=True))

    out = await facility_router.activate_utilization(utilization_id=util.id, tenant=tenant, user=user, db=db, _=None)
    first_voucher_id = out["disbursement_voucher_id"]
    with pytest.raises(HTTPException) as exc:
        await facility_router.activate_utilization(utilization_id=util.id, tenant=tenant, user=user, db=db, _=None)
    assert exc.value.status_code == 409
    vouchers = (
        await db.execute(
            select(Voucher).where(Voucher.tenant_id == tenant.id, Voucher.source_module_ref == f"disbursement:{util.id}")
        )
    ).scalars().all()
    assert [v.id for v in vouchers] == [first_voucher_id]
