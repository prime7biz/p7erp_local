"""Phase 1.5 demo seed: idempotency, marker, chain links, tenant isolation."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select

from app.models import CommercialInvoice, DeliveryChallan, Order, ProformaInvoice, Tenant
from app.models.tenant import TenantType
from app.seeds.phase1_demo import (
    DEMO_MODE_FLAG,
    MARKER_CHALLAN,
    MARKER_KEY,
    MARKER_ORDER,
    MARKER_PI,
    run_phase1_demo_seed,
)


@pytest.mark.asyncio
async def test_phase1_demo_seed_idempotent_and_marker(db_session_integration):
    db = db_session_integration
    code = f"DEMO{uuid.uuid4().hex[:6]}".upper()[:18]

    r1 = await run_phase1_demo_seed(db, company_code=code, reset=False, force=False)
    assert r1["status"] == "seeded"
    assert r1["marker"] == MARKER_KEY
    counts1 = r1["counts"]

    tenant = (await db.execute(select(Tenant).where(Tenant.company_code == code))).scalar_one()
    flags = tenant.feature_flags or {}
    assert flags.get(DEMO_MODE_FLAG) is True
    assert isinstance(flags.get(MARKER_KEY), dict)

    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant.id, Order.order_code == MARKER_ORDER))
    ).scalar_one()
    challan = (
        await db.execute(
            select(DeliveryChallan).where(
                DeliveryChallan.tenant_id == tenant.id, DeliveryChallan.challan_code == MARKER_CHALLAN
            )
        )
    ).scalar_one()
    assert challan.status == "POSTED"
    ci_count = (
        await db.execute(
            select(func.count()).select_from(CommercialInvoice).where(
                CommercialInvoice.tenant_id == tenant.id,
                CommercialInvoice.source_delivery_challan_id == challan.id,
            )
        )
    ).scalar_one()
    assert int(ci_count) >= 1
    pi = (
        await db.execute(
            select(ProformaInvoice).where(
                ProformaInvoice.tenant_id == tenant.id, ProformaInvoice.reference == MARKER_PI
            )
        )
    ).scalar_one()
    assert pi.status == "ISSUED"
    assert order.id == (r1["summary"] or {}).get("order_id")

    r2 = await run_phase1_demo_seed(db, company_code=code, reset=False, force=False)
    assert r2["status"] == "idempotent"
    assert r2["counts"] == counts1


@pytest.mark.asyncio
async def test_phase1_demo_refuses_non_demo_tenant(db_session_integration):
    db = db_session_integration
    code = f"PROD{uuid.uuid4().hex[:6]}".upper()[:18]
    db.add(
        Tenant(
            name="Prod-like",
            tenant_type=TenantType.both,
            is_active=True,
            company_code=code,
            feature_flags={},
        )
    )
    await db.commit()
    with pytest.raises(ValueError, match="Refusing"):
        await run_phase1_demo_seed(db, company_code=code, force=False)


@pytest.mark.asyncio
async def test_phase1_demo_tenant_isolation(db_session_integration):
    db = db_session_integration
    a = f"DEMOA{uuid.uuid4().hex[:5]}".upper()[:18]
    b = f"DEMOB{uuid.uuid4().hex[:5]}".upper()[:18]
    await run_phase1_demo_seed(db, company_code=a)
    await run_phase1_demo_seed(db, company_code=b)
    ta = (await db.execute(select(Tenant).where(Tenant.company_code == a))).scalar_one()
    tb = (await db.execute(select(Tenant).where(Tenant.company_code == b))).scalar_one()
    orders_a = (
        await db.execute(select(Order).where(Order.tenant_id == ta.id, Order.order_code == MARKER_ORDER))
    ).scalars().all()
    orders_b = (
        await db.execute(select(Order).where(Order.tenant_id == tb.id, Order.order_code == MARKER_ORDER))
    ).scalars().all()
    assert len(orders_a) == 1
    assert len(orders_b) == 1
    assert orders_a[0].id != orders_b[0].id
    # Cross-tenant: B must not see A's order id as its DEMO-001
    assert orders_b[0].tenant_id == tb.id
