"""DB-backed tests for order planning simulation (read-only traces, no business writes)."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Customer, Order, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.order_ai_suggestion import OrderAiSuggestionBatch
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.orders.order_ai_authz import require_order_ai_capability
from app.modules.orders.order_ai_schemas import (
    OrderAiCapacityBottleneckScanRequest,
    OrderAiExecutionPlanningSummaryRequest,
    OrderAiWhatIfSimulationRequest,
)
from app.modules.orders.order_ai_service import (
    ai_capacity_bottleneck_scan,
    ai_execution_planning_summary,
    ai_what_if_simulation,
    compute_order_ai_indicators,
    list_order_ai_audit_logs,
)


async def _seed_tenant_user_order(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"SimAI {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"si{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"si{slug}",
        email=f"si{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:12], name="Buyer Co")
    db.add(customer)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-S{slug}"[:16],
        style_ref="SIM-STYLE",
        projected_quantity=1000,
        currency="USD",
        status="APPROVED",
    )
    db.add(quotation)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=quotation.id,
        order_code=f"ORD-S{slug}"[:16],
        style_ref="SIM-STYLE",
        status="NEW",
        quantity=500,
    )
    db.add(order)
    await db.flush()
    return tenant, user, order


@pytest.mark.asyncio
async def test_capacity_scan_persists_trace(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_tenant_user_order(db)
    res = await ai_capacity_bottleneck_scan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiCapacityBottleneckScanRequest(order_id=order.id),
    )
    assert res.suggestion_batch_id is not None
    row = (
        await db.execute(select(OrderAiSuggestionBatch).where(OrderAiSuggestionBatch.id == res.suggestion_batch_id))
    ).scalar_one()
    assert row.action_type == "capacity_bottleneck_scan"


@pytest.mark.asyncio
async def test_what_if_does_not_mutate_order(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_tenant_user_order(db)
    original_qty = order.quantity
    original_updated = order.updated_at

    await ai_what_if_simulation(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiWhatIfSimulationRequest(
            order_id=order.id,
            delivery_date_shift_days=-14,
            quantity_scale_pct=120,
        ),
    )
    await db.refresh(order)
    assert order.quantity == original_qty
    assert order.updated_at == original_updated


@pytest.mark.asyncio
async def test_simulation_tenant_isolation(db_session_integration):
    db = db_session_integration
    t1, u1, o1 = await _seed_tenant_user_order(db)
    t2, u2, _o2 = await _seed_tenant_user_order(db)
    res = await ai_capacity_bottleneck_scan(
        db,
        tenant_id=t2.id,
        user_id=u2.id,
        body=OrderAiCapacityBottleneckScanRequest(order_id=o1.id),
    )
    assert res.order_id == o1.id
    assert any("not visible" in n.lower() for n in res.explainability_notes)
    assert t1.id != t2.id


@pytest.mark.asyncio
async def test_simulation_rbac_deny(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"SimRBAC {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"sr{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="clerk",
        display_name="Clerk",
        permissions={"orders.ai.what_if_simulation": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"sr{slug}",
        email=f"sr{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_order_ai_capability(db, user, "what_if_simulation")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_simulation_audit_filter(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_tenant_user_order(db)
    await ai_execution_planning_summary(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiExecutionPlanningSummaryRequest(order_id=order.id),
    )
    res = await list_order_ai_audit_logs(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        limit=20,
        simulation_only=True,
    )
    assert len(res.items) >= 1
    assert all(
        x.action
        in {
            "ORDER_AI_CAPACITY_BOTTLENECK_SCAN",
            "ORDER_AI_WHAT_IF_SIMULATION",
            "ORDER_AI_PROMISE_SENSITIVITY_CHECK",
            "ORDER_AI_EXECUTION_PLANNING_SUMMARY",
        }
        for x in res.items
    )


@pytest.mark.asyncio
async def test_indicators_with_layout_count(db_session_integration):
    db = db_session_integration
    _tenant, _user, order = await _seed_tenant_user_order(db)
    base = compute_order_ai_indicators(order)
    with_layout = compute_order_ai_indicators(order, production_layout_row_count=2)
    assert with_layout.capacity_bottleneck_flag is True
    assert with_layout.bottleneck_severity_score >= base.bottleneck_severity_score


@pytest.mark.asyncio
async def test_planning_summary_writes_audit_only(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_tenant_user_order(db)
    before = (
        await db.execute(select(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "ORDER_AI_EXECUTION_PLANNING_SUMMARY"))
    ).scalars().all()
    n_before = len(before)

    await ai_execution_planning_summary(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiExecutionPlanningSummaryRequest(order_id=order.id),
    )
    after = (
        await db.execute(select(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "ORDER_AI_EXECUTION_PLANNING_SUMMARY"))
    ).scalars().all()
    assert len(after) == n_before + 1
