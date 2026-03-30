"""DB-backed tests for commercial change requests and patch guards."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import Customer, Order, Quotation, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.orders.commercial_change_authz import require_commercial_capability
from app.modules.orders.commercial_fields import list_order_commercial_patch_violations
from app.modules.orders import order_ai_batches as ord_batches
from app.modules.orders.change_request_service import (
    apply_change_request,
    approve_change_request,
    cancel_change_request,
    create_change_request,
    get_change_request,
    parse_value_for_apply,
    reject_change_request,
)
from app.models.order_ai_suggestion import OrderAiSuggestionBatch, OrderAiSuggestionItem


async def _seed_locked_order(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CCR {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"cc{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="commercial",
        display_name="Commercial",
        permissions={},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ccu{slug}",
        email=f"ccu{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"CCC{slug}"[:12],
        name="Buyer",
    )
    db.add(customer)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-CC{slug}"[:16],
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
        order_code=f"CC-{slug}"[:16],
        style_ref="S1",
        status="CONFIRMED",
        quantity=100,
        delivery_date=date.today() + timedelta(days=30),
        shipping_term="FOB",
    )
    db.add(order)
    await db.flush()
    return tenant, user, order


async def _seed_draft_order(db):
    t, u, o = await _seed_locked_order(db)
    o.status = "DRAFT"
    await db.flush()
    return t, u, o


@pytest.mark.asyncio
async def test_create_change_request_locked_order_ok(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="quantity",
        new_value=200,
        reason="Customer confirmed higher qty",
    )
    await db.flush()
    assert cr.status == "pending_approval"
    assert cr.old_value is not None
    assert cr.field_key == "quantity"


@pytest.mark.asyncio
async def test_create_change_request_rejects_null_numeric_new_value(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    with pytest.raises(HTTPException) as exc:
        await create_change_request(
            db,
            tenant_id=tenant.id,
            user=user,
            entity_type="order",
            entity_id=order.id,
            field_key="quantity",
            new_value=None,
            reason="bad payload",
        )
    assert exc.value.status_code == 400
    d = exc.value.detail
    assert isinstance(d, dict) and d.get("code") == "INVALID_NEW_VALUE"


def test_parse_value_for_apply_null_int_raises():
    with pytest.raises(HTTPException) as exc:
        parse_value_for_apply("quantity", "null")
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_create_change_request_draft_order_fails(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_draft_order(db)
    with pytest.raises(HTTPException) as exc:
        await create_change_request(
            db,
            tenant_id=tenant.id,
            user=user,
            entity_type="order",
            entity_id=order.id,
            field_key="quantity",
            new_value=5,
            reason="x",
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_approve_apply_updates_order(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="quantity",
        new_value=250,
        reason="UAT",
    )
    await db.flush()
    await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="ok")
    await db.flush()
    await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    await db.flush()
    await db.refresh(order)
    assert order.quantity == 250
    await db.refresh(cr)
    assert cr.status == "applied"


@pytest.mark.asyncio
async def test_apply_without_approval_fails(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="shipping_term",
        new_value="CIF",
        reason="term",
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_double_apply_conflict(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="shipping_term",
        new_value="EXW",
        reason="x",
    )
    await db.flush()
    await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="y")
    await db.flush()
    await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_reject_does_not_change_order(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    before_qty = order.quantity
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="quantity",
        new_value=999,
        reason="bad",
    )
    await db.flush()
    await reject_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="no")
    await db.flush()
    await db.refresh(order)
    assert order.quantity == before_qty


@pytest.mark.asyncio
async def test_cancel_pending(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="quantity",
        new_value=1,
        reason="cancel me",
    )
    await db.flush()
    await cancel_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    await db.flush()
    await db.refresh(cr)
    assert cr.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_approved_fails(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="quantity",
        new_value=2,
        reason="x",
    )
    await db.flush()
    await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="y")
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await cancel_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_tenant_isolation_change_request(db_session_integration):
    db = db_session_integration
    t1, u1, o1 = await _seed_locked_order(db)
    t2, _, _ = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=t1.id,
        user=u1,
        entity_type="order",
        entity_id=o1.id,
        field_key="quantity",
        new_value=3,
        reason="z",
    )
    await db.flush()
    missing = await get_change_request(db, tenant_id=t2.id, cr_id=cr.id)
    assert missing is None


@pytest.mark.asyncio
async def test_commercial_approve_rbac_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"RB {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"rb{slug}",
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="noperm",
        display_name="No",
        permissions={"commercial.approve_change": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"rb{slug}",
        email=f"rb{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_commercial_capability(db, user, "approve_change")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_patch_violation_lists_protected_fields(db_session_integration):
    db = db_session_integration
    _t, _u, order = await _seed_locked_order(db)
    v = list_order_commercial_patch_violations(
        order.status,
        {"quantity": 5, "remarks": "ok"},
    )
    assert "quantity" in v
    assert "remarks" not in v


@pytest.mark.asyncio
async def test_ai_audit_on_apply(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="order",
        entity_id=order.id,
        field_key="shipping_term",
        new_value="DDP",
        reason="audit test",
    )
    await db.flush()
    await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="a")
    await db.flush()
    await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    await db.flush()
    from app.models.ai_tool import AiAuditLog

    r = await db.execute(
        select(AiAuditLog).where(
            AiAuditLog.tenant_id == tenant.id,
            AiAuditLog.prompt_category == "commercial_change_control",
            AiAuditLog.action == "COMMERCIAL_CHANGE_APPLIED",
        )
    )
    rows = r.scalars().all()
    assert len(rows) >= 1


@pytest.mark.asyncio
async def test_quotation_change_request_flow(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"QCR {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"qc{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="U", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"q{slug}",
        email=f"q{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"Q{slug}"[:10],
        name="C",
    )
    db.add(customer)
    await db.flush()
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QQ{slug}"[:14],
        currency="USD",
        target_price="10",
        status="APPROVED",
    )
    db.add(q)
    await db.flush()
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type="quotation",
        entity_id=q.id,
        field_key="target_price",
        new_value="12",
        reason="price adj",
    )
    await db.flush()
    await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id, note="y")
    await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr.id)
    await db.flush()
    await db.refresh(q)
    assert q.target_price == "12"


@pytest.mark.asyncio
async def test_ai_apply_locked_order_skips_commercial_fields(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _seed_locked_order(db)
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
            field_key="quantity",
            suggested_value="999",
            disposition="pending",
            created_at=now,
            updated_at=now,
        )
    )
    await db.flush()
    before = order.quantity
    out = await ord_batches.apply_suggestions_to_order(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        order_id=order.id,
        actions=[("quantity", "apply")],
        conflict_mode="overwrite",
    )
    await db.flush()
    await db.refresh(order)
    assert order.quantity == before
    assert "quantity" in out["skipped_fields"]
    assert any(x.get("field_key") == "quantity" for x in out.get("requires_change_request", []))
