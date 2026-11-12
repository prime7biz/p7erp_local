"""Helpers that load a record by id must ignore other tenants' records (RC-14, KI-01).

Every caller passes an id it already checked, so these were not reachable; the tests keep it that way
if a new caller forgets.

Run:
    docker compose exec backend pytest tests/test_latent_helper_tenant_scope.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models import PartyLedger, PartyLedgerBill
from app.modules.finance.party_ledger_bill_service import calculate_bill_interest
from app.modules.finance.party_ledger_service import update_party_ledger_balance
from app.modules.inventory.idt_service import _avg_unit_cost
from app.modules.inventory.job_work_costing_service import calculate_job_work_cost
from app.modules.production.crew_router import _template_rows_for_line
from tests.go_live_fixtures import create_admin_tenant_with_user


async def _two_tenants(db):
    a, _ua, _ = await create_admin_tenant_with_user(db)
    b, _ub, _ = await create_admin_tenant_with_user(db)
    await db.flush()
    return a, b


async def _ledger(db) -> PartyLedger:
    """Ledger in its own tenant (`pl.tenant_id`), with the party COA groups the service needs."""
    from app.modules.finance.party_ledger_service import get_or_create_party_ledger
    from tests.test_party_ledger import _seed_party_world

    tenant, customer, *_ = await _seed_party_world(db)
    pl = await get_or_create_party_ledger(
        db, tenant.id, "CUSTOMER", customer.id, opening_balance=Decimal("100"), interest_rate_monthly=Decimal("2")
    )
    await db.flush()
    return pl


@pytest.mark.asyncio
async def test_party_ledger_balance_ignores_other_tenant(db_session_integration):
    db = db_session_integration
    _a, b = await _two_tenants(db)
    pl = await _ledger(db)
    pl.current_balance = Decimal("999")
    await db.flush()
    await update_party_ledger_balance(db, pl.id, tenant_id=b.id)
    assert pl.current_balance == Decimal("999"), "another tenant must not recalculate this ledger"
    await update_party_ledger_balance(db, pl.id, tenant_id=pl.tenant_id)
    assert pl.current_balance == Decimal("100")


@pytest.mark.asyncio
async def test_bill_interest_ignores_other_tenant(db_session_integration):
    db = db_session_integration
    _a, b = await _two_tenants(db)
    pl = await _ledger(db)
    bill = PartyLedgerBill(
        tenant_id=pl.tenant_id,
        party_ledger_id=pl.id,
        bill_number=f"B-{uuid.uuid4().hex[:6]}",
        bill_date=date.today() - timedelta(days=90),
        due_date=date.today() - timedelta(days=60),
        bill_type="NEW_REF",
        amount_type="DR",
        original_amount=Decimal("1000"),
        pending_amount=Decimal("1000"),
        settled_amount=Decimal("0"),
        interest_accrued=Decimal("7"),
        status="OVERDUE",
    )
    db.add(bill)
    await db.flush()
    assert await calculate_bill_interest(db, bill.id, tenant_id=b.id) == Decimal("0")
    assert await calculate_bill_interest(db, bill.id, tenant_id=pl.tenant_id) > 0


@pytest.mark.asyncio
async def test_avg_unit_cost_ignores_other_tenant(db_session_integration):
    from tests.go_live_fixtures import seed_inventory_chain

    db = db_session_integration
    a, _user, _wh, _vendor, item = await seed_inventory_chain(db)
    b, _ub, _ = await create_admin_tenant_with_user(db)
    item.avg_cost = Decimal("12.5")
    await db.flush()
    assert await _avg_unit_cost(db, b.id, item.id) == Decimal("0")
    assert await _avg_unit_cost(db, a.id, item.id) > 0


@pytest.mark.asyncio
async def test_job_work_cost_requires_own_tenant(db_session_integration):
    from app.models import InterDepartmentTransfer
    from tests.go_live_fixtures import seed_inventory_chain

    db = db_session_integration
    a, _user, wh, _vendor, item = await seed_inventory_chain(db)
    b, _ub, _ = await create_admin_tenant_with_user(db)
    idt = InterDepartmentTransfer(
        tenant_id=a.id,
        idt_number=f"IDT-{uuid.uuid4().hex[:6]}",
        idt_date=date.today(),
        from_warehouse_id=wh.id,
        to_warehouse_id=wh.id,
        process_name="dyeing",
        source_item_id=item.id,
        source_qty_issued=Decimal("10"),
        source_qty_unit="kg",
        target_item_id=item.id,
        target_qty_expected=Decimal("10"),
        target_qty_unit="kg",
    )
    db.add(idt)
    await db.flush()
    with pytest.raises(ValueError):
        await calculate_job_work_cost(db, idt.id, tenant_id=b.id)
    assert await calculate_job_work_cost(db, idt.id, tenant_id=a.id) is not None


@pytest.mark.asyncio
async def test_crew_template_rows_reject_other_tenant_line(db_session_integration):
    from app.models import SewingLine

    db = db_session_integration
    a, b = await _two_tenants(db)
    line = SewingLine(tenant_id=a.id, line_code=f"L{uuid.uuid4().hex[:5]}", name="Line A")
    db.add(line)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await _template_rows_for_line(db, b.id, line.id)
    assert exc.value.status_code == 404
