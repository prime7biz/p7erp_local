"""Shared seeds for the Manufacturing Intelligence Phase 1 tests (built inside tests only, never live data).

Reference calendar: 2030-03-04 is a MONDAY. Weekend = Saturday + Sunday (tenant production settings).
Worked example (doc 04 section 7): one shift 08:00-17:00 with a 60 minute break = 480 net minutes,
30 operators, efficiency 60 %, SMV 12.5 -> practical 8,640 SMV minutes/day = 691.20 pieces/day.

Run the tests with:
    docker compose exec backend pytest tests/test_mfg_intelligence_*.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    FactoryCalendarOverride,
    Order,
    OperationBulletin,
    ProductionShift,
    SewingLine,
    SewingLineStyleConfig,
    TenantProductionSettings,
)
from tests.merch_fixtures import create_customer, create_garment_style, create_merch_tenant_with_user

MONDAY = date(2030, 3, 4)
API = "/api/v1/mfg-intelligence"

FLAGS_ON = {
    "manufacturing_intelligence_v1": True,
    "planning_math_v2": True,
    "mfg_order_bom_readiness_v2": True,
}


@asynccontextmanager
async def client_for(db, tenant, user):
    """HTTP client whose auth / tenant / database dependencies are stubbed to the given objects."""

    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def new_tenant(db, *, flags: dict | None = None, permissions: dict | None = None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=permissions)
    tenant.feature_flags = dict(flags) if flags is not None else {}
    await db.flush()
    return tenant, user, role


async def add_settings(db, tenant, weekend=("saturday", "sunday")) -> None:
    db.add(TenantProductionSettings(tenant_id=tenant.id, weekend_days=list(weekend)))
    await db.flush()


async def add_holiday(db, tenant, day: date) -> None:
    db.add(FactoryCalendarOverride(tenant_id=tenant.id, override_date=day, override_type="holiday", name="Test holiday"))
    await db.flush()


async def add_shift(db, tenant, code="DAY", start=time(8, 0), end=time(17, 0), brk=60) -> ProductionShift:
    shift = ProductionShift(
        tenant_id=tenant.id, shift_code=code, name=f"Shift {code}", start_time=start, end_time=end, break_minutes=brk,
        is_active=True,
    )
    db.add(shift)
    await db.flush()
    return shift


async def add_line(db, tenant, code="L1", *, operators=30, machines=30, unit=None, active=True) -> SewingLine:
    line = SewingLine(
        tenant_id=tenant.id,
        line_code=code,
        name=f"Line {code}",
        default_machine_count=machines,
        running_machine_count=machines,
        default_operator_count=operators,
        factory_unit=unit,
        is_active=active,
    )
    db.add(line)
    await db.flush()
    return line


async def add_style_with_ob(db, tenant, *, smv: str | None = "12.5", status="approved", version=1, customer=None):
    """A garment style and (when smv is given) one operation bulletin for it."""
    customer = customer or await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    ob = None
    if smv is not None:
        ob = await add_ob(db, tenant, style, smv=smv, status=status, version=version)
    return customer, style, ob


async def add_ob(db, tenant, style, *, smv: str, status="approved", version=1) -> OperationBulletin:
    ob = OperationBulletin(
        tenant_id=tenant.id,
        style_id=style.id,
        ob_code=f"OB-{uuid.uuid4().hex[:8]}",
        version_no=version,
        total_smv=Decimal(smv),
        status=status,
    )
    db.add(ob)
    await db.flush()
    return ob


async def add_order(db, tenant, customer, style, *, status="CONFIRMED", qty=1000, delivery: date | None = None) -> Order:
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        style_id=style.id,
        order_code=f"O-{uuid.uuid4().hex[:10]}",
        status=status,
        quantity=qty,
        delivery_date=delivery,
    )
    db.add(order)
    await db.flush()
    return order


async def add_plan(
    db,
    tenant,
    line,
    *,
    start: date,
    end: date | None = None,
    qty="1000",
    done="0",
    order=None,
    style=None,
    ob=None,
    shift=None,
    rs="FIRM_BOOKED",
    operators=30,
    eff="60",
    smv_row: str | None = None,
) -> SewingLineStyleConfig:
    row = SewingLineStyleConfig(
        tenant_id=tenant.id,
        line_id=line.id,
        order_id=order.id if order else None,
        style_id=style.id if style else None,
        ob_id=ob.id if ob else None,
        shift_id=shift.id if shift else None,
        operator_count=operators,
        target_efficiency_pct=Decimal(eff),
        start_date=start,
        planned_end_date=end,
        reservation_status=rs,
        planned_qty=Decimal(qty),
        completed_qty=Decimal(done),
        smv_per_piece=Decimal(smv_row) if smv_row is not None else None,
    )
    db.add(row)
    await db.flush()
    return row


async def seed_basic_factory(db, tenant, *, shifts=1):
    """Settings + one (or two) shift(s) + one line + a style with a 12.5 SMV approved OB."""
    await add_settings(db, tenant)
    if shifts > 1:  # two NON-overlapping shifts of 480 net minutes each
        shift = await add_shift(db, tenant, "DAY", time(6, 0), time(14, 0), 0)
        shift2 = await add_shift(db, tenant, "LATE", time(14, 0), time(22, 0), 0)
    else:
        shift = await add_shift(db, tenant, "DAY")
        shift2 = None
    line = await add_line(db, tenant, "L1")
    customer, style, ob = await add_style_with_ob(db, tenant)
    return SimpleNamespace(tenant=tenant, shift=shift, shift2=shift2, line=line, customer=customer, style=style, ob=ob)
