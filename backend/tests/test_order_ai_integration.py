"""DB-backed integration tests for Order AI — tenant isolation, RBAC, protected fields, traces."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Customer, Order, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.order_ai_suggestion import OrderAiSuggestionBatch, OrderAiSuggestionItem
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.orders import order_ai_batches as ord_batches
from app.modules.orders.order_ai_authz import require_order_ai_capability
from app.modules.orders.order_ai_schemas import OrderAiDedupeRequest, OrderAiValidateRequest
from app.modules.orders.order_ai_service import ai_dedupe, ai_validate


async def _seed_tenant_user_order(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"OAI int {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"o{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions={},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ou{slug}",
        email=f"ou{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"OC{slug}"[:12],
        name="Buyer Co",
    )
    db.add(customer)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-O{slug}"[:16],
        style_ref="REF-ORD",
        department="Kids",
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
        order_code=f"ORD-{slug}"[:16],
        style_ref="OLD-STYLE",
        status="DRAFT",
        quantity=100,
    )
    db.add(order)
    await db.flush()
    return tenant, user, customer, quotation, order


@pytest.mark.asyncio
async def test_tenant_isolation_batch_load(db_session_integration):
    db = db_session_integration
    t1, u1, _c, _q, o1 = await _seed_tenant_user_order(db)
    t2, _, _, _, _ = await _seed_tenant_user_order(db)
    suggestions = {"remarks": {"value": "Note", "confidence": 0.9, "source": "test", "rationale": None}}
    bid = await ord_batches.create_batch_from_enrich(
        db,
        tenant_id=t1.id,
        user_id=u1.id,
        order_id=o1.id,
        suggestions=suggestions,
        request_id="r1",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await ord_batches._load_batch_items(db, batch_id=bid, tenant_id=t2.id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_discard_blocks_apply(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    bid = await ord_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        order_id=order.id,
        suggestions={"remarks": {"value": "X", "confidence": 0.9, "source": "t", "rationale": None}},
        request_id="r2",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    await ord_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=bid)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await ord_batches.apply_suggestions_to_order(
            db,
            tenant=tenant,
            user_id=user.id,
            batch_id=bid,
            order_id=order.id,
            actions=[("remarks", "apply")],
            conflict_mode="overwrite",
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_trace_batch_rejects_mark_decisions(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    bid = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        order_id=order.id,
        action_type="validate",
        request_id="r3",
        model_hint="rules",
        meta_payload={"issue_count": 0},
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await ord_batches.mark_suggestion_decisions(
            db, tenant_id=tenant.id, user_id=user.id, batch_id=bid, decisions=[("remarks", "apply")]
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_apply_skips_non_allowlisted_field(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    now = datetime.utcnow()
    batch = OrderAiSuggestionBatch(
        tenant_id=tenant.id,
        order_id=order.id,
        action_type="enrich",
        status="generated",
        source_type="test",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    db.add(
        OrderAiSuggestionItem(
            batch_id=batch.id,
            tenant_id=tenant.id,
            field_key="fantasy_field",
            suggested_value="nope",
            disposition="pending",
            created_at=now,
            updated_at=now,
        )
    )
    await db.flush()
    out = await ord_batches.apply_suggestions_to_order(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        order_id=order.id,
        actions=[("fantasy_field", "apply")],
        conflict_mode="overwrite",
    )
    assert "fantasy_field" in out["skipped_fields"]


@pytest.mark.asyncio
async def test_apply_rejects_protected_fields(db_session_integration):
    db = db_session_integration
    tenant, user, customer, quotation, order = await _seed_tenant_user_order(db)
    now = datetime.utcnow()
    batch = OrderAiSuggestionBatch(
        tenant_id=tenant.id,
        order_id=order.id,
        action_type="enrich",
        status="generated",
        source_type="test",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    for fk, sv in [
        ("quotation_id", "999"),
        ("customer_id", "999"),
        ("status", "CANCELLED"),
    ]:
        db.add(
            OrderAiSuggestionItem(
                batch_id=batch.id,
                tenant_id=tenant.id,
                field_key=fk,
                suggested_value=sv,
                disposition="pending",
                created_at=now,
                updated_at=now,
            )
        )
    await db.flush()
    out = await ord_batches.apply_suggestions_to_order(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        order_id=order.id,
        actions=[("quotation_id", "apply"), ("customer_id", "apply"), ("status", "apply")],
        conflict_mode="overwrite",
    )
    assert len(out["applied_fields"]) == 0
    await db.refresh(order)
    assert order.status == "DRAFT"
    assert order.customer_id == customer.id
    assert order.quotation_id == quotation.id


@pytest.mark.asyncio
async def test_apply_updates_remarks(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    now = datetime.utcnow()
    batch = OrderAiSuggestionBatch(
        tenant_id=tenant.id,
        order_id=order.id,
        action_type="enrich",
        status="generated",
        source_type="test",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    db.add(
        OrderAiSuggestionItem(
            batch_id=batch.id,
            tenant_id=tenant.id,
            field_key="remarks",
            suggested_value="PO-123 confirmed",
            disposition="pending",
            created_at=now,
            updated_at=now,
        )
    )
    await db.flush()
    out = await ord_batches.apply_suggestions_to_order(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        order_id=order.id,
        actions=[("remarks", "apply")],
        conflict_mode="overwrite",
    )
    assert "remarks" in out["applied_fields"]
    await db.refresh(order)
    assert order.remarks == "PO-123 confirmed"


@pytest.mark.asyncio
async def test_validate_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    res = await ai_validate(
        db, tenant_id=tenant.id, user_id=user.id, body=OrderAiValidateRequest(order_id=order.id, fields={})
    )
    assert res.suggestion_batch_id
    r = await db.execute(select(OrderAiSuggestionBatch).where(OrderAiSuggestionBatch.id == res.suggestion_batch_id))
    b = r.scalar_one()
    assert b.action_type == "validate"


@pytest.mark.asyncio
async def test_dedupe_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, customer, _q, order = await _seed_tenant_user_order(db)
    res = await ai_dedupe(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=OrderAiDedupeRequest(
            fields={"customer_id": str(customer.id), "style_ref": order.style_ref or "OLD"},
            exclude_order_id=None,
        ),
    )
    assert res.suggestion_batch_id


@pytest.mark.asyncio
async def test_finalize_after_create_writes_audit(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _q, order = await _seed_tenant_user_order(db)
    bid = await ord_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        order_id=None,
        suggestions={"remarks": {"value": "A", "confidence": 0.9, "source": "t", "rationale": None}},
        request_id="r4",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    await ord_batches.mark_suggestion_decisions(
        db, tenant_id=tenant.id, user_id=user.id, batch_id=bid, decisions=[("remarks", "apply")]
    )
    await ord_batches.finalize_batch_after_create(
        db, tenant=tenant, user_id=user.id, batch_id=bid, order_id=order.id
    )
    await db.flush()
    r = await db.execute(
        select(AiAuditLog)
        .where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "ORDER_AI_SUGGESTION_FINALIZE_CREATE")
        .order_by(AiAuditLog.id.desc())
        .limit(1)
    )
    row = r.scalar_one_or_none()
    assert row is not None


@pytest.mark.asyncio
async def test_rbac_apply_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"OAI rbac {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"rb{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="clerk",
        display_name="Clerk",
        permissions={"orders.ai.apply_suggestions": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"rb{slug}",
        email=f"rb{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_order_ai_capability(db, user, "apply_suggestions")
    assert exc.value.status_code == 403
