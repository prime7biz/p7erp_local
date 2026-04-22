"""Cost nature columns + master-contract RM guard helpers."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.common.master_contract_rm_guard import assert_orders_have_master_contract
from app.models import Customer, Order, Tenant
from app.models.tenant import TenantType
from app.models.commercial import MasterContract

from tests.merch_fixtures import create_customer


@pytest.mark.asyncio
async def test_assert_orders_have_master_contract_blocks_orphan(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    t = Tenant(
        name=f"T-{slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"co{slug}"[:18],
    )
    db.add(t)
    await db.flush()
    cust = await create_customer(db, t)
    mc = MasterContract(
        tenant_id=t.id,
        reference=f"MC-{slug}",
        status="OPEN",
    )
    db.add(mc)
    await db.flush()
    o = Order(
        tenant_id=t.id,
        customer_id=cust.id,
        order_code=f"ORD-{slug}",
        status="CONFIRMED",
        quantity=100,
        master_contract_id=None,
    )
    db.add(o)
    await db.flush()

    with pytest.raises(HTTPException) as ei:
        await assert_orders_have_master_contract(db, tenant_id=t.id, order_ids={o.id})
    assert ei.value.status_code == 409
    assert (ei.value.detail or {}).get("code") == "ORDER_REQUIRES_MASTER_CONTRACT"

    o.master_contract_id = mc.id
    await db.flush()
    await assert_orders_have_master_contract(db, tenant_id=t.id, order_ids={o.id})
