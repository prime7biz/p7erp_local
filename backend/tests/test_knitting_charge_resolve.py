"""Knitting charge resolver (optional DB)."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.models import KnittingChargeRate, Tenant
from app.modules.production.knitting_service import resolve_charge_amount


@pytest.mark.asyncio
async def test_resolve_charge_zero_without_master_row(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")
    amt = await resolve_charge_amount(
        db,
        tenant_id=tenant.id,
        fabric_type_code="MISSING_FABRIC_" + str(tenant.id),
        unit_basis_hint="per_kg_greige",
        planned_yarn_qty=10,
        planned_greige_qty=5,
        as_of=date.today(),
    )
    assert amt == 0.0


@pytest.mark.asyncio
async def test_resolve_charge_per_kg_greige(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")
    code = f"TST_FABRIC_{tenant.id}_X"
    row = KnittingChargeRate(
        tenant_id=tenant.id,
        fabric_type_code=code,
        unit_basis="per_kg_greige",
        rate_per_unit=12.5,
        currency="BDT",
        effective_from=date(2020, 1, 1),
        effective_to=None,
        is_active=True,
    )
    db.add(row)
    await db.commit()

    amt = await resolve_charge_amount(
        db,
        tenant_id=tenant.id,
        fabric_type_code=code,
        unit_basis_hint="per_kg_greige",
        planned_yarn_qty=0,
        planned_greige_qty=10,
        as_of=date.today(),
    )
    assert round(amt, 4) == round(12.5 * 10, 4)
