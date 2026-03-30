"""DB-backed tests for planning data grounding (deterministic snapshot)."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.models import Customer, Order, Quotation, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.orders.commercial_change_authz import require_commercial_capability
from app.modules.orders.planning_grounding_service import (
    compute_planning_grounding_snapshot,
    compute_planning_grounding_summaries,
)


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"PG {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pg{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="planner",
        display_name="Planner",
        permissions={},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"pgu{slug}",
        email=f"pgu{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"PGC{slug}"[:12],
        name="Co",
    )
    db.add(customer)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-PG{slug}"[:16],
        style_ref="S1",
        currency="USD",
        status="NEW",
    )
    db.add(quotation)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=quotation.id,
        order_code=f"PG-{slug}"[:16],
        style_ref="S1",
        status="NEW",
        quantity=10,
        delivery_date=None,
    )
    db.add(order)
    await db.flush()
    return tenant, user, order


@pytest.mark.asyncio
async def test_grounding_snapshot_has_signals(db_session_integration):
    db = db_session_integration
    tenant, _u, order = await _seed(db)
    snap = await compute_planning_grounding_snapshot(db, tenant_id=tenant.id, order_id=order.id)
    assert snap is not None
    assert snap.order_id == order.id
    codes = {s.code for s in snap.signals}
    assert "material_atp_ctp" in codes
    assert "production_readiness_chain" in codes
    assert "line_capacity_context" in codes
    assert "dependency_completeness" in codes
    assert "delivery_window" in codes
    assert snap.limitations
    assert isinstance(snap.dependency_completeness, dict)


@pytest.mark.asyncio
async def test_grounding_wrong_tenant_returns_none(db_session_integration):
    db = db_session_integration
    t1, _, o1 = await _seed(db)
    t2, _, _ = await _seed(db)
    snap = await compute_planning_grounding_snapshot(db, tenant_id=t2.id, order_id=o1.id)
    assert snap is None


@pytest.mark.asyncio
async def test_grounding_summary_batch(db_session_integration):
    db = db_session_integration
    tenant, _, order = await _seed(db)
    rows = await compute_planning_grounding_summaries(db, tenant_id=tenant.id, order_ids=[order.id])
    assert len(rows) == 1
    assert rows[0].order_id == order.id
    assert rows[0].overall_readiness in {"ready", "at_risk", "blocked", "incomplete"}
    assert rows[0].pending_change_requests >= 0


@pytest.mark.asyncio
async def test_view_planning_grounding_rbac_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"PG2 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"x{slug}",
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="viewer",
        display_name="Viewer",
        permissions={"orders.view_planning_grounding": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"v{slug}",
        email=f"v{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_commercial_capability(db, user, "view_planning_grounding")
    assert exc.value.status_code == 403
