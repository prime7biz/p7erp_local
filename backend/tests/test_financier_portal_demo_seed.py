"""Financier portal demo seed (integration).

Run:
  docker compose exec backend pytest tests/test_financier_portal_demo_seed.py -q
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.external_access.constants import PRINCIPAL_FINANCIER
from app.external_access.financier_portal import facility_selectors as fsel
from app.models import BtbLc, ExternalPrincipal, Tenant, Vendor
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.tenant import TenantType
from app.seeds.financier_portal_demo import (
    DEFAULT_DEMO_EMAIL,
    DEFAULT_DEMO_PASSWORD,
    FAC_CODE,
    run_financier_portal_demo_seed,
)


@pytest.mark.asyncio
async def test_financier_portal_demo_seed_creates_credit_line_scope(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    code = f"FP{slug}"[:18].upper()

    tenant = Tenant(
        name=f"Financier seed {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=code,
        feature_flags={},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()

    cat = ItemCategory(
        tenant_id=tenant.id,
        category_code=f"CAT{slug}"[:12],
        name="Seed category",
        is_active=True,
    )
    db.add(cat)
    await db.flush()
    unit = ItemUnit(
        tenant_id=tenant.id,
        unit_code=f"U{slug}"[:8],
        name="Pcs",
        is_active=True,
    )
    db.add(unit)
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"ITM{slug}"[:12],
        name="Seed item",
        category_id=cat.id,
        unit_id=unit.id,
        is_active=True,
    )
    db.add(item)
    vendor = Vendor(
        tenant_id=tenant.id,
        vendor_code=f"V{slug}"[:12],
        name="Seed vendor",
        is_active=True,
    )
    db.add(vendor)
    btb = BtbLc(
        tenant_id=tenant.id,
        reference=f"BTBWF-TEST-{slug}",
        status="OPEN",
        amount=500000.0,
        currency="BDT",
    )
    db.add(btb)
    await db.commit()

    out = await run_financier_portal_demo_seed(
        db,
        code,
        demo_email=f"fp.{slug}@test.local",
        demo_password=DEFAULT_DEMO_PASSWORD,
    )
    assert "warning" not in out
    await db.commit()

    pr = (
        await db.execute(
            select(ExternalPrincipal).where(
                ExternalPrincipal.tenant_id == tenant.id,
                ExternalPrincipal.email == f"fp.{slug}@test.local",
                ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
            )
        )
    ).scalar_one()
    facs = await fsel.list_facilities_for_financier(db, tenant.id, pr.id)
    assert len(facs) == 1
    assert facs[0].facility_code == FAC_CODE

    out2 = await run_financier_portal_demo_seed(
        db,
        code,
        demo_email=f"fp.{slug}@test.local",
        demo_password=DEFAULT_DEMO_PASSWORD,
    )
    assert "warning" not in out2
    await db.commit()
