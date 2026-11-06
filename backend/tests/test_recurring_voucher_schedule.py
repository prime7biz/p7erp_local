"""Recurring vouchers: due dates counted from start_date, manual generate keeps the schedule, no duplicates.

Run in Docker: docker compose exec backend pytest tests/test_recurring_voucher_schedule.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import RECURRING_VOUCHER_ENABLED
from app.models.advanced_vouchers import RecurringVoucherTemplate
from app.models.finance import AccountGroup, ChartOfAccount, Voucher
from app.modules.finance.advanced_voucher_service import (
    generate_from_recurring_template,
    next_recurring_occurrence,
    recurring_occurrence,
)
from tests.benchmark_fixtures import api_client, seed_tenant_admin


def test_monthly_schedule_does_not_drift_after_short_months():
    start = date(2026, 1, 31)
    assert [recurring_occurrence(start, "MONTHLY", n) for n in range(4)] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30),
    ]
    assert next_recurring_occurrence(start, "MONTHLY", date(2026, 2, 28)) == date(2026, 3, 31)
    assert next_recurring_occurrence(start, "QUARTERLY", date(2026, 1, 31)) == date(2026, 4, 30)
    assert next_recurring_occurrence(start, "QUARTERLY", date(2026, 4, 30)) == date(2026, 7, 31)
    assert next_recurring_occurrence(date(2024, 2, 29), "YEARLY", date(2024, 2, 29)) == date(2025, 2, 28)
    assert next_recurring_occurrence(date(2024, 2, 29), "YEARLY", date(2027, 3, 1)) == date(2028, 2, 29)
    assert next_recurring_occurrence(date(2026, 1, 1), "WEEKLY", date(2026, 1, 1)) == date(2026, 1, 8)
    assert next_recurring_occurrence(date(2026, 1, 1), "WEEKLY", date(2026, 1, 9)) == date(2026, 1, 15)
    assert next_recurring_occurrence(date(2026, 1, 1), "DAILY", date(2026, 1, 9)) == date(2026, 1, 10)
    assert next_recurring_occurrence(date(2026, 5, 1), "MONTHLY", date(2026, 1, 1)) == date(2026, 5, 1)


async def _template(db, tenant_id: int, *, start: date, next_due: date) -> RecurringVoucherTemplate:
    slug = uuid.uuid4().hex[:6]
    grp = AccountGroup(tenant_id=tenant_id, name=f"RV {slug}", code=f"RV{slug}", nature="Expense")
    db.add(grp)
    await db.flush()
    rent = ChartOfAccount(tenant_id=tenant_id, account_number=f"RV-R{slug}", name="Rent", group_id=grp.id, normal_balance="debit")
    cash = ChartOfAccount(tenant_id=tenant_id, account_number=f"RV-C{slug}", name="Cash", group_id=grp.id, normal_balance="debit")
    db.add_all([rent, cash])
    await db.flush()
    tpl = RecurringVoucherTemplate(
        tenant_id=tenant_id,
        name=f"Rent {slug}",
        voucher_type="JOURNAL",
        frequency="MONTHLY",
        start_date=start,
        next_due_date=next_due,
        voucher_template={"lines": [
            {"account_id": rent.id, "entry_type": "DEBIT", "amount": "100"},
            {"account_id": cash.id, "entry_type": "CREDIT", "amount": "100"},
        ]},
        generate_as_status="DRAFT",
        is_active=True,
    )
    db.add(tpl)
    await db.flush()
    return tpl


async def _generated_dates(db, tenant_id: int, template_id: int) -> list[date]:
    return list((await db.execute(
        select(Voucher.voucher_date).where(
            Voucher.tenant_id == tenant_id, Voucher.source_module == "RECURRING",
            Voucher.source_module_ref == str(template_id),
        ).order_by(Voucher.voucher_date)
    )).scalars().all())


@pytest.mark.asyncio
async def test_catch_up_keeps_month_end_and_skips_existing_period(db_session_integration):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    tpl = await _template(db, tenant.id, start=date(2026, 1, 31), next_due=date(2026, 1, 31))
    # February's voucher already exists (e.g. an earlier run committed it before a crash).
    db.add(Voucher(tenant_id=tenant.id, voucher_number=f"OLD-{uuid.uuid4().hex[:6]}", voucher_type="JOURNAL",
                   voucher_date=date(2026, 2, 28), status="DRAFT", source_module="RECURRING",
                   source_module_ref=str(tpl.id), exchange_rate=Decimal("1")))
    await db.flush()
    made = 0
    while await generate_from_recurring_template(db, tenant.id, tpl, as_of=date(2026, 4, 30)):
        made += 1
    assert made == 3  # Jan, Mar, Apr (Feb skipped as a duplicate)
    assert await _generated_dates(db, tenant.id, tpl.id) == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30),
    ]
    assert tpl.next_due_date == date(2026, 5, 31)
    assert tpl.last_generated_date == date(2026, 4, 30)


@pytest.mark.asyncio
async def test_manual_generate_does_not_shift_schedule(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), RECURRING_VOUCHER_ENABLED: True}
    tpl = await _template(db, tenant.id, start=date(2030, 1, 31), next_due=date(2030, 3, 31))
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(f"/api/v1/finance/recurring-vouchers/{tpl.id}/generate")
        assert r.status_code == 200, r.text
        assert r.json()["template"]["next_due_date"] == "2030-04-30"
        voucher = await db.get(Voucher, r.json()["voucher_id"])
        assert voucher.voucher_date == date(2030, 3, 31)
        r2 = await ac.post(f"/api/v1/finance/recurring-vouchers/{tpl.id}/generate")
        assert r2.status_code == 200, r2.text
        assert r2.json()["template"]["next_due_date"] == "2030-05-31"
    assert await _generated_dates(db, tenant.id, tpl.id) == [date(2030, 3, 31), date(2030, 4, 30)]
