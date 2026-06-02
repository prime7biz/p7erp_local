from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import ChartOfAccount, Tenant, VoucherLine
from app.modules.finance.voucher_controls import collect_bank_cash_control_warnings


@pytest.mark.asyncio
async def test_collect_bank_cash_control_warnings_no_name_error(db_session_integration):
    session = db_session_integration
    tenant = (await session.execute(select(Tenant).limit(1))).scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    account = (
        await session.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.tenant_id == tenant.id)
            .limit(1)
        )
    ).scalars().first()
    if account is None:
        pytest.skip("No chart of account found for tenant")

    lines = [
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=0,
            account_id=account.id,
            entry_type="DEBIT",
            amount="100",
            currency="BDT",
            exchange_rate="1",
            base_amount="100",
        )
    ]

    warnings = await collect_bank_cash_control_warnings(
        session,
        tenant.id,
        lines,
        voucher_type="JOURNAL",
        instrument_reference=None,
    )
    assert isinstance(warnings, list)

