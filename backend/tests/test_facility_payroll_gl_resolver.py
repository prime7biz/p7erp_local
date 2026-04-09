"""Facility and payroll GL account resolvers (system COA fallbacks; Docker DB)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import ChartOfAccount, Tenant
from app.models.facility import Facility
from app.models.hr_payroll import PayrollAccountingConfig
from app.modules.facility.account_resolver import resolve_facility_accounts
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger, seed_tenant_system_coa
from app.modules.hr_payroll.account_resolver import resolve_payroll_accounts


@pytest.mark.asyncio
async def test_facility_accounts_resolve_system_defaults_by_type(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    suffix = uuid.uuid4().hex[:8]
    for ftype, liability_key in (
        ("term_loan", "TERM_LOAN_PRINCIPAL"),
        ("working_capital", "WORKING_CAPITAL_LOAN"),
        ("overdraft", "OD_LOAN_BALANCE"),
    ):
        fac = Facility(
            tenant_id=tenant.id,
            facility_code=f"F{suffix}{ftype[:2]}",
            facility_type=ftype,
            status="draft",
            gl_liability_account_id=None,
            gl_interest_expense_account_id=None,
            gl_interest_payable_account_id=None,
            gl_penalty_expense_account_id=None,
        )
        db.add(fac)
        await db.flush()

        acc = await resolve_facility_accounts(db, tenant.id, fac)
        assert acc["liability"] == await resolve_system_ledger(db, tenant.id, liability_key)
        exp_key = "TERM_LOAN_INTEREST_EXPENSE" if ftype == "term_loan" else "INTEREST_ON_LOAN_EXPENSE"
        assert acc["interest_expense"] == await resolve_system_ledger(db, tenant.id, exp_key)
        assert acc["interest_payable"] == await resolve_system_ledger(db, tenant.id, "ACCRUED_LOAN_INTEREST_PAYABLE")
        assert acc["penalty_expense"] == await resolve_system_ledger(db, tenant.id, "PENAL_INTEREST_EXPENSE")


@pytest.mark.asyncio
async def test_facility_fk_overrides_system_code(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    sys_liab = await resolve_system_ledger(db, tenant.id, "TERM_LOAN_PRINCIPAL")
    alt_r = await db.execute(
        select(ChartOfAccount.id).where(
            ChartOfAccount.tenant_id == tenant.id,
            ChartOfAccount.id != sys_liab,
        ).limit(1)
    )
    other_id = alt_r.scalar_one_or_none()
    if other_id is None:
        pytest.skip("Need a second chart account")

    suffix = uuid.uuid4().hex[:8]
    fac = Facility(
        tenant_id=tenant.id,
        facility_code=f"FO{suffix}",
        facility_type="term_loan",
        status="draft",
        gl_liability_account_id=other_id,
        gl_interest_expense_account_id=None,
        gl_interest_payable_account_id=None,
    )
    db.add(fac)
    await db.flush()

    acc = await resolve_facility_accounts(db, tenant.id, fac)
    assert acc["liability"] == other_id
    assert acc["interest_expense"] == await resolve_system_ledger(db, tenant.id, "TERM_LOAN_INTEREST_EXPENSE")


@pytest.mark.asyncio
async def test_payroll_accounts_resolve_system_defaults(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id))
    ).scalar_one_or_none()
    prev_exp = prev_pay = None
    if cfg:
        prev_exp, prev_pay = cfg.salary_expense_account_id, cfg.salary_payable_account_id
        cfg.salary_expense_account_id = None
        cfg.salary_payable_account_id = None
        await db.flush()

    try:
        acc = await resolve_payroll_accounts(db, tenant.id)
        assert acc["expense"] == await resolve_system_ledger(db, tenant.id, "DIRECT_SALARY_EXPENSE")
        assert acc["payable"] == await resolve_system_ledger(db, tenant.id, "DIRECT_SALARY_PAYABLE")
    finally:
        if cfg:
            cfg.salary_expense_account_id = prev_exp
            cfg.salary_payable_account_id = prev_pay
            await db.flush()


@pytest.mark.asyncio
async def test_payroll_config_overrides_system_code(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    sys_exp = await resolve_system_ledger(db, tenant.id, "DIRECT_SALARY_EXPENSE")
    sys_pay = await resolve_system_ledger(db, tenant.id, "DIRECT_SALARY_PAYABLE")

    alt_exp = (
        await db.execute(
            select(ChartOfAccount.id).where(
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.id.not_in((sys_exp, sys_pay)),
            ).limit(1)
        )
    ).scalar_one_or_none()
    alt_pay = (
        await db.execute(
            select(ChartOfAccount.id).where(
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.id.not_in((sys_exp, sys_pay, alt_exp)),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if alt_exp is None or alt_pay is None:
        pytest.skip("Need extra chart accounts")

    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if cfg is None:
        cfg = PayrollAccountingConfig(tenant_id=tenant.id)
        db.add(cfg)
        await db.flush()
    prev_exp, prev_pay = cfg.salary_expense_account_id, cfg.salary_payable_account_id
    cfg.salary_expense_account_id = alt_exp
    cfg.salary_payable_account_id = alt_pay
    await db.flush()

    try:
        acc = await resolve_payroll_accounts(db, tenant.id)
        assert acc["expense"] == alt_exp
        assert acc["payable"] == alt_pay
    finally:
        cfg.salary_expense_account_id = prev_exp
        cfg.salary_payable_account_id = prev_pay
        await db.flush()


@pytest.mark.asyncio
async def test_payroll_body_overrides_all(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    ids = (
        await db.execute(
            select(ChartOfAccount.id).where(ChartOfAccount.tenant_id == tenant.id).limit(3)
        )
    ).scalars().all()
    if len(ids) < 2:
        pytest.skip("Need two chart accounts")
    body_exp, body_pay = ids[0], ids[1]

    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id))
    ).scalar_one_or_none()
    prev_exp = prev_pay = None
    if cfg:
        prev_exp, prev_pay = cfg.salary_expense_account_id, cfg.salary_payable_account_id
        cfg.salary_expense_account_id = ids[2] if len(ids) > 2 else ids[1]
        cfg.salary_payable_account_id = ids[0]
        await db.flush()

    try:
        acc = await resolve_payroll_accounts(
            db,
            tenant.id,
            expense_override=body_exp,
            payable_override=body_pay,
        )
        assert acc["expense"] == body_exp
        assert acc["payable"] == body_pay
    finally:
        if cfg:
            cfg.salary_expense_account_id = prev_exp
            cfg.salary_payable_account_id = prev_pay
            await db.flush()
