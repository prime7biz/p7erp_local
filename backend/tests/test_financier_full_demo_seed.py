"""Financier full demo seed (integration).

Run:
  docker compose exec backend pytest tests/test_financier_full_demo_seed.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.constants import PRINCIPAL_FINANCIER
from app.models import BtbLc, ExternalPrincipal, MasterContract, Order, ProformaInvoice, Tenant
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.customer import Customer
from app.models.inventory import Vendor
from app.models.tenant import TenantType
from app.seeds.financier_full_demo import BTB01_REF, run_financier_full_demo_seed
from app.seeds.financier_portal_demo import DEFAULT_DEMO_EMAIL


@pytest.mark.asyncio
async def test_financier_full_demo_warns_without_prerequisite_btb(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    code = f"FF{slug}"[:18].upper()

    tenant = Tenant(
        name=f"Full demo seed {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=code,
        feature_flags={},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.commit()

    out = await run_financier_full_demo_seed(db, code)
    assert "warning" in out
    assert BTB01_REF in (out.get("warning") or "")


@pytest.mark.asyncio
async def test_financier_full_demo_creates_multiple_facilities_when_prereqs_exist(db_session_integration):
    """Minimal Lakhsma-like rows so the full demo runs end-to-end."""
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    code = f"FL{slug}"[:18].upper()
    today = date.today()

    tenant = Tenant(
        name=f"Lakhsma-like {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=code,
        feature_flags={},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()

    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:12], name="Cat", is_active=True)
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Kg", is_active=True)
    db.add(unit)
    await db.flush()
    for icode, iname in (
        ("LKH-FAB-JERSEY-160", "Fabric"),
        ("LKH-TRIM-RIB-1X1", "Rib"),
        ("LKH-TRIM-LABEL-WVN", "Label"),
    ):
        db.add(
            Item(
                tenant_id=tenant.id,
                item_code=icode,
                name=iname,
                category_id=cat.id,
                unit_id=unit.id,
                is_active=True,
            )
        )
    vend = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:12], name="V", is_active=True)
    db.add(vend)

    mc = MasterContract(
        tenant_id=tenant.id,
        contract_type="EXPORT_LC",
        reference="LKH-MASTER-EXPORT-LC-DEMO-01",
        status="OPEN",
        contract_date=today,
        amount=1_000_000.0,
        currency="USD",
        buyer_name="Buyer",
        bank_name="Bank",
        expiry_date=today.replace(year=today.year + 1),
        btb_utilized_amount=0,
    )
    db.add(mc)
    await db.flush()

    pi2 = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        reference="LKH-PI-DEMO-02",
        status="ISSUED",
        invoice_date=today,
        amount=250_000.0,
        currency="USD",
    )
    db.add(pi2)
    await db.flush()

    btb = BtbLc(
        tenant_id=tenant.id,
        reference=BTB01_REF,
        status="ISSUED",
        lc_date=today,
        amount=200_000.0,
        master_contract_id=mc.id,
        proforma_invoice_id=pi2.id,
        currency="USD",
        open_date=today,
        expiry_date=today.replace(year=today.year + 1),
        maturity_date=today.replace(year=today.year + 1, month=6, day=30),
        maturity_amount=200_000.0,
        exchange_rate_to_base=110.0,
        base_currency_amount=200_000.0 * 110.0,
    )
    db.add(btb)

    cust = Customer(
        tenant_id=tenant.id,
        customer_code=f"CUST{slug}"[:12],
        name="Buyer",
        status="active",
    )
    db.add(cust)
    await db.flush()

    for n in range(1, 8):
        db.add(
            Order(
                tenant_id=tenant.id,
                customer_id=cust.id,
                order_code=f"LKH-ORD-{n:02d}",
                style_ref=f"LKH-STY-{n:02d}",
                status="CONFIRMED",
                pipeline_status="ORDER_CONFIRMED",
                order_date=today,
                delivery_date=today.replace(year=today.year + 1),
                quantity=1200,
            )
        )
    await db.commit()

    out = await run_financier_full_demo_seed(db, code)
    assert "warning" not in out, out.get("warning")
    await db.commit()

    pr = (
        await db.execute(
            select(ExternalPrincipal).where(
                ExternalPrincipal.tenant_id == tenant.id,
                ExternalPrincipal.email == DEFAULT_DEMO_EMAIL.lower(),
                ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
            )
        )
    ).scalar_one_or_none()
    assert pr is not None

    facs = await fsel.list_facilities_for_financier(db, tenant.id, pr.id)
    assert len(facs) >= 3

    out2 = await run_financier_full_demo_seed(db, code)
    assert "warning" not in out2
    await db.commit()
