"""Financier order detail and recovery outlook (integration with demo seed)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.external_access.constants import PRINCIPAL_FINANCIER
from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal.recovery_outlook_service import (
    build_recovery_outlook_for_order,
    build_recovery_outlook_rows,
)
from app.external_access.financier_portal.visibility_service import (
    _stage_from_pct,
    build_financed_order_book_rows,
    build_order_detail_enriched,
)
from app.models import BtbLc, ExternalPrincipal, MasterContract, Order, Tenant
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.customer import Customer
from app.models.inventory import Vendor
from app.models.tenant import TenantType
from app.seeds.financier_portal_demo import DEFAULT_DEMO_PASSWORD, run_financier_portal_demo_seed


def test_stage_from_pct_not_started():
    status, pct = _stage_from_pct(0.0, has_activity=False)
    assert status == "not_started"
    assert pct == 0.0


def test_stage_from_pct_completed():
    status, pct = _stage_from_pct(100.0, has_activity=True)
    assert status == "completed"
    assert pct == 100.0


@pytest.mark.asyncio
async def test_enriched_order_detail_and_recovery_after_demo_seed(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    code = f"OD{slug}"[:18].upper()
    today = date.today()

    tenant = Tenant(
        name=f"Order detail {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=code,
        feature_flags={},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()

    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat", is_active=True)
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs", is_active=True)
    db.add(unit)
    await db.flush()
    db.add(
        Item(
            tenant_id=tenant.id,
            item_code=f"I{slug}"[:10],
            name="Item",
            category_id=cat.id,
            unit_id=unit.id,
            is_active=True,
        )
    )
    db.add(Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:10], name="V", is_active=True))

    mc = MasterContract(
        tenant_id=tenant.id,
        reference=f"MC-{slug}",
        status="OPEN",
        contract_type="EXPORT_LC",
        amount=100_000.0,
        currency="USD",
        expiry_date=today.replace(year=today.year + 1),
    )
    db.add(mc)
    await db.flush()

    btb = BtbLc(
        tenant_id=tenant.id,
        reference=f"BTBWF-{slug}",
        status="OPEN",
        amount=80_000.0,
        currency="USD",
        master_contract_id=mc.id,
        open_date=today,
    )
    db.add(btb)
    await db.flush()

    cust = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name="Buyer", status="active")
    db.add(cust)
    await db.flush()

    order = Order(
        tenant_id=tenant.id,
        customer_id=cust.id,
        order_code=f"ORD-{slug}",
        style_ref="STY-01",
        status="CONFIRMED",
        pipeline_status="ORDER_CONFIRMED",
        master_contract_id=mc.id,
        order_date=today,
        delivery_date=today.replace(month=((today.month % 12) + 1)),
        quantity=1000,
        commercial_snapshot_json={"target_fob": "12.5", "currency": "USD"},
    )
    db.add(order)
    await db.commit()

    email = f"od.{slug}@test.local"
    out = await run_financier_portal_demo_seed(db, code, demo_email=email, demo_password=DEFAULT_DEMO_PASSWORD)
    assert "warning" not in out
    await db.commit()

    pr = (
        await db.execute(
            select(ExternalPrincipal).where(
                ExternalPrincipal.tenant_id == tenant.id,
                ExternalPrincipal.email == email.lower(),
                ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
            )
        )
    ).scalar_one()

    detail = await build_order_detail_enriched(db, tenant_id=tenant.id, party_id=pr.id, order_id=order.id)
    assert detail is not None
    assert detail["order_code"] == order.order_code
    assert detail.get("pipeline") is not None
    assert detail.get("production") is not None

    recovery = await build_recovery_outlook_for_order(
        db, tenant_id=tenant.id, party_id=pr.id, order_id=order.id
    )
    assert recovery is not None
    assert recovery["order_id"] == order.id
    assert recovery.get("recovery_band") in ("strong", "adequate", "watch", "at_risk")

    rows, note = await build_recovery_outlook_rows(db, tenant_id=tenant.id, party_id=pr.id)
    assert any(r["order_id"] == order.id for r in rows)

    book, total = await build_financed_order_book_rows(db, tenant_id=tenant.id, party_id=pr.id, limit=20, offset=0)
    assert total >= 1
    assert any(r["id"] == order.id for r in book)

    btb_rows = await fsel.party_btb_lc_rows(db, tenant.id, pr.id)
    assert len(btb_rows) >= 1
