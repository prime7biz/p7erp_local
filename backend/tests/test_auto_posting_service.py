"""Auto-posting service (system COA → vouchers). Run in Docker with DATABASE_URL."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Tenant, VoucherLine
from app.modules.finance.auto_posting_service import (
    AutoPostingLine,
    create_system_voucher,
    create_system_voucher_from_mapping,
)


@pytest.mark.asyncio
async def test_create_system_voucher_from_mapping_draft(db_session_integration):
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    v = await create_system_voucher_from_mapping(
        session,
        tenant_id=tenant.id,
        user_id=None,
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        amount=42.5,
        debit_system_code="BTB_NON_ACCEPTED_LC_LIABILITY",
        credit_system_code="BTB_CREDIT_LINE_UTILIZATION_CONTROL",
        debit_account_id=None,
        credit_account_id=None,
        cost_center_id=None,
        description="Test LCJ system mapping",
        reference="TEST-P2-MAP",
        source_module="LC_COMMERCIAL",
        source_module_ref="test:auto_posting",
        btb_lc_id=None,
        auto_post=False,
    )
    await session.flush()
    assert v.status == "DRAFT"
    assert v.voucher_type == "JOURNAL"
    lines = list(
        (await session.execute(select(VoucherLine).where(VoucherLine.voucher_id == v.id))).scalars().all()
    )
    assert len(lines) == 2
    assert sum(float(x.amount) for x in lines if x.entry_type == "DEBIT") == pytest.approx(42.5)
    assert sum(float(x.amount) for x in lines if x.entry_type == "CREDIT") == pytest.approx(42.5)


@pytest.mark.asyncio
async def test_create_system_voucher_unbalanced_raises(db_session_integration):
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    with pytest.raises(HTTPException) as exc:
        await create_system_voucher(
            session,
            tenant_id=tenant.id,
            user_id=None,
            voucher_type="JOURNAL",
            voucher_date=date.today(),
            lines=[
                AutoPostingLine(
                    entry_type="DEBIT",
                    amount=Decimal("10"),
                    system_code="BTB_NON_ACCEPTED_LC_LIABILITY",
                ),
                AutoPostingLine(
                    entry_type="CREDIT",
                    amount=Decimal("9"),
                    system_code="BTB_CREDIT_LINE_UTILIZATION_CONTROL",
                ),
            ],
            description="unbalanced",
            source_module="LC_COMMERCIAL",
            auto_post=False,
        )
    assert exc.value.status_code == 400
    assert "not balanced" in (exc.value.detail or "").lower()


@pytest.mark.asyncio
async def test_create_system_voucher_missing_mapping_raises(db_session_integration):
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    with pytest.raises(HTTPException) as exc:
        await create_system_voucher_from_mapping(
            session,
            tenant_id=tenant.id,
            user_id=None,
            voucher_type="JOURNAL",
            voucher_date=date.today(),
            amount=1.0,
            debit_system_code="NONEXISTENT_LEDGER_XYZ",
            credit_system_code="BTB_CREDIT_LINE_UTILIZATION_CONTROL",
            debit_account_id=None,
            credit_account_id=None,
            cost_center_id=None,
            description="bad",
            reference="BAD",
            source_module="LC_COMMERCIAL",
            auto_post=False,
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_create_system_voucher_auto_post_requires_open_period(db_session_integration):
    """auto_post=True needs an open accounting period; otherwise 400."""
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    # Pick a date unlikely to fall in any open period (far future)
    far = date(2099, 6, 15)
    with pytest.raises(HTTPException) as exc:
        await create_system_voucher_from_mapping(
            session,
            tenant_id=tenant.id,
            user_id=None,
            voucher_type="JOURNAL",
            voucher_date=far,
            amount=1.0,
            debit_system_code="BTB_NON_ACCEPTED_LC_LIABILITY",
            credit_system_code="BTB_CREDIT_LINE_UTILIZATION_CONTROL",
            debit_account_id=None,
            credit_account_id=None,
            cost_center_id=None,
            description="auto post test",
            reference="AUTO-P2",
            source_module="LC_COMMERCIAL",
            auto_post=True,
        )
    assert exc.value.status_code == 400
    assert "period" in (exc.value.detail or "").lower()
