"""DB-backed integration tests for Order planning AI (read-only traces)."""

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
    OrderAiAtpCtpSummaryRequest,
    OrderAiPlanningRiskCheckRequest,
    OrderAiValidateExecutionRequest,
)
from app.modules.orders.order_ai_service import (
    ai_atp_ctp_summary,
    ai_planning_risk_check,
    ai_validate_execution,
    compute_order_ai_indicators,
    list_order_ai_audit_logs,
)


async def _seed_tenant_user_order(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"PlanAI {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pl{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"pl{slug}",
        email=f"pl{slug}@example.com",
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
        quotation_code=f"QT-P{slug}"[:16],
        style_ref="PLAN-STYLE",
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
        order_code=f"ORD-P{slug}"[:16],
        style_ref="PLAN-STYLE",
        status="NEW",
        quantity=500,
    )
    db.add(order)
    await db.flush()
    return tenant, user, customer, quotation, order


@pytest.mark.asyncio
async def test_planning_validate_execution_persists_trace(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    res = await ai_validate_execution(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiValidateExecutionRequest(order_id=order.id, fields={}),
    )
    assert res.suggestion_batch_id is not None
    row = (
        await db.execute(select(OrderAiSuggestionBatch).where(OrderAiSuggestionBatch.id == res.suggestion_batch_id))
    ).scalar_one()
    assert row.action_type == "validate_execution"


@pytest.mark.asyncio
async def test_planning_risk_check_persists_trace_and_audit(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    res = await ai_planning_risk_check(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiPlanningRiskCheckRequest(order_id=order.id),
    )
    assert res.suggestion_batch_id is not None
    batch = (
        await db.execute(select(OrderAiSuggestionBatch).where(OrderAiSuggestionBatch.id == res.suggestion_batch_id))
    ).scalar_one()
    assert batch.action_type == "planning_risk_check"
    audit = (
        await db.execute(
            select(AiAuditLog)
            .where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "ORDER_AI_PLANNING_RISK_CHECK")
            .order_by(AiAuditLog.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    assert audit is not None


@pytest.mark.asyncio
async def test_atp_ctp_summary_is_read_only_for_order_fields(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    original_status = order.status
    original_quantity = order.quantity
    original_delivery = order.delivery_date
    original_updated_at = order.updated_at

    _res = await ai_atp_ctp_summary(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiAtpCtpSummaryRequest(order_id=order.id),
    )
    await db.refresh(order)
    assert order.status == original_status
    assert order.quantity == original_quantity
    assert order.delivery_date == original_delivery
    assert order.updated_at == original_updated_at


@pytest.mark.asyncio
async def test_planning_tenant_isolation_returns_safe_not_found(db_session_integration):
    db = db_session_integration
    t1, u1, _c1, _q1, o1 = await _seed_tenant_user_order(db)
    t2, u2, _c2, _q2, _o2 = await _seed_tenant_user_order(db)
    res = await ai_planning_risk_check(
        db,
        tenant_id=t2.id,
        user_id=u2.id,
        body=OrderAiPlanningRiskCheckRequest(order_id=o1.id),
    )
    assert res.order_id == o1.id
    assert res.suggestion_batch_id is None
    assert any(f.code == "order_not_found" for f in res.factors)
    assert res.promise_check.atp_ok is False
    assert t1.id != t2.id and u1.id != u2.id


@pytest.mark.asyncio
async def test_planning_rbac_deny(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"PlanAI RBAC {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pr{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="clerk",
        display_name="Clerk",
        permissions={"orders.ai.planning_risk_check": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"pr{slug}",
        email=f"pr{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    with pytest.raises(HTTPException) as exc:
        await require_order_ai_capability(db, user, "planning_risk_check")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_planning_audit_filter_only_returns_planning_actions(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    await ai_planning_risk_check(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiPlanningRiskCheckRequest(order_id=order.id),
    )
    await ai_atp_ctp_summary(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiAtpCtpSummaryRequest(order_id=order.id),
    )
    res = await list_order_ai_audit_logs(
        db,
        tenant_id=tenant.id,
        order_id=order.id,
        limit=40,
        planning_only=True,
    )
    assert len(res.items) >= 2
    assert all(
        x.action
        in {
            "ORDER_AI_VALIDATE_EXECUTION",
            "ORDER_AI_PLANNING_RISK_CHECK",
            "ORDER_AI_ATP_CTP_SUMMARY",
            "ORDER_AI_NEXT_ACTIONS",
        }
        for x in res.items
    )


@pytest.mark.asyncio
async def test_order_ai_indicators_include_planning_fields(db_session_integration):
    db = db_session_integration
    _tenant, _user, _c, _q, order = await _seed_tenant_user_order(db)
    out = compute_order_ai_indicators(order)
    assert 0 <= out.execution_readiness_score <= 100
    assert 0 <= out.material_readiness_score <= 100
    assert 0 <= out.planning_confidence_score <= 100
    assert 0 <= out.promise_date_risk_score <= 100
    assert out.missing_dependency_count >= 0
