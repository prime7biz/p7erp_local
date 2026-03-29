"""DB-backed integration tests for Customer AI batches, RBAC helpers, trace rows, and cleanup.

Requires DATABASE_URL (PostgreSQL). Typical run:

    docker compose exec backend pytest tests/test_customer_ai_integration.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Customer, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.customer_ai_suggestion import CustomerAiSuggestionBatch, CustomerAiSuggestionItem
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.customers import customer_ai_batches as cai_batches
from app.modules.customers.customer_ai_authz import require_customer_ai_capability
from app.modules.customers.customer_ai_schemas import CustomerAiDedupeRequest, CustomerAiValidateRequest
from app.modules.customers.customer_ai_service import ai_dedupe, ai_validate
from app.modules.ai_extract.schemas import CustomerExtractionField, CustomerExtractionResponse


async def _seed_tenant_user_customer(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"AI int {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"z{slug}"[:18],
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
        username=f"u{slug}",
        email=f"u{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C{slug}"[:12],
        name="Acme Corp",
        status="active",
        contact_email="old@example.com",
        email="old@example.com",
    )
    db.add(customer)
    await db.flush()
    return tenant, user, customer


@pytest.mark.asyncio
async def test_tenant_isolation_batch_load(db_session_integration):
    db = db_session_integration
    t1, u1, c1 = await _seed_tenant_user_customer(db)
    t2, _, _ = await _seed_tenant_user_customer(db)
    extraction = CustomerExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "contactEmail": CustomerExtractionField(value="x@y.com", confidence=0.9, source="doc"),
        },
        unmapped_text=[],
        warnings=[],
        duplicate_warnings=[],
    )
    bid = await cai_batches.create_batch_from_extraction(
        db,
        tenant_id=t1.id,
        user_id=u1.id,
        customer_id=c1.id,
        extraction=extraction,
        request_id="r1",
        model_hint="test",
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await cai_batches._load_batch_items(db, batch_id=bid, tenant_id=t2.id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_discard_blocks_apply(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    extraction = CustomerExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "contactEmail": CustomerExtractionField(value="new@example.com", confidence=0.9, source="doc"),
        },
        unmapped_text=[],
        warnings=[],
        duplicate_warnings=[],
    )
    bid = await cai_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        customer_id=customer.id,
        extraction=extraction,
        request_id="r2",
        model_hint="test",
    )
    await db.flush()
    await cai_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=bid)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await cai_batches.apply_suggestions_to_customer(
            db,
            tenant=tenant,
            user_id=user.id,
            batch_id=bid,
            customer_id=customer.id,
            actions=[("contactEmail", "apply")],
            conflict_mode="overwrite",
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_trace_batch_rejects_mark_decisions(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    bid = await cai_batches.create_trace_result_batch(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        customer_id=customer.id,
        action_type="validate",
        request_id="rv",
        model_hint="rules",
        meta_payload={"issue_count": 0},
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await cai_batches.mark_suggestion_decisions(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            batch_id=bid,
            decisions=[("contactEmail", "skip")],
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_apply_skips_non_allowlisted_field(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    now = datetime.utcnow()
    batch = CustomerAiSuggestionBatch(
        tenant_id=tenant.id,
        customer_id=customer.id,
        action_type="extract",
        source_type="document",
        status="generated",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    db.add(
        CustomerAiSuggestionItem(
            batch_id=batch.id,
            tenant_id=tenant.id,
            field_key="customer_code",
            suggested_value="HACK",
            confidence=0.99,
            source="x",
            disposition="pending",
            created_at=now,
            updated_at=now,
        )
    )
    await db.flush()
    out = await cai_batches.apply_suggestions_to_customer(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        customer_id=customer.id,
        actions=[("customer_code", "apply")],
        conflict_mode="overwrite",
    )
    assert "customer_code" not in out["applied_fields"]
    await db.refresh(customer)
    assert customer.customer_code != "HACK"


@pytest.mark.asyncio
async def test_enrich_apply_updates_email(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    suggestions = {
        "contactEmail": {
            "value": "enriched@example.com",
            "confidence": 0.92,
            "source": "test",
            "rationale": None,
        },
    }
    bid = await cai_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        customer_id=customer.id,
        suggestions=suggestions,
        request_id="en",
        model_name="test-model",
        source_type="inference",
    )
    await db.flush()
    out = await cai_batches.apply_suggestions_to_customer(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        customer_id=customer.id,
        actions=[("contactEmail", "apply")],
        conflict_mode="overwrite",
    )
    assert "contactEmail" in out["applied_fields"]
    await db.refresh(customer)
    assert customer.contact_email == "enriched@example.com"


@pytest.mark.asyncio
async def test_validate_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    res = await ai_validate(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=CustomerAiValidateRequest(
            fields={"contactEmail": "not-an-email"},
            customer_id=customer.id,
        ),
    )
    assert res.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(CustomerAiSuggestionBatch).where(CustomerAiSuggestionBatch.id == res.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "validate"
    assert row.status == "completed"
    assert isinstance(row.meta_json, dict)


@pytest.mark.asyncio
async def test_finalize_after_create_writes_audit(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    extraction = CustomerExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "contactEmail": CustomerExtractionField(value="f@example.com", confidence=0.9, source="doc"),
        },
        unmapped_text=[],
        warnings=[],
        duplicate_warnings=[],
    )
    bid = await cai_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        customer_id=None,
        extraction=extraction,
        request_id="fin",
        model_hint="test",
    )
    await db.flush()
    await cai_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=bid,
        decisions=[("contactEmail", "apply")],
    )
    await db.flush()
    before = await db.execute(
        select(func.count()).select_from(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id)
    )
    n0 = int(before.scalar_one() or 0)
    await cai_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        customer_id=customer.id,
    )
    await db.flush()
    after = await db.execute(
        select(func.count()).select_from(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id)
    )
    n1 = int(after.scalar_one() or 0)
    assert n1 > n0
    r2 = await db.execute(
        select(AiAuditLog)
        .where(
            AiAuditLog.tenant_id == tenant.id,
            AiAuditLog.action == "CUSTOMER_AI_SUGGESTION_FINALIZE_CREATE",
        )
        .order_by(AiAuditLog.id.desc())
        .limit(1)
    )
    log_row = r2.scalar_one_or_none()
    assert log_row is not None


@pytest.mark.asyncio
async def test_rbac_apply_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"RBAC {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"r{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="sales",
        display_name="Sales",
        permissions={"ai.read": True, "customers.ai.apply_suggestions": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"s{slug}",
        email=f"s{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_customer_ai_capability(db, user, "apply_suggestions")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_rbac_discard_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"RBACd {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"d{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="sales",
        display_name="Sales",
        permissions={"ai.read": True, "customers.ai.discard_suggestions": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"sd{slug}",
        email=f"sd{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_customer_ai_capability(db, user, "discard_suggestions")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_rbac_audit_denied(db_session_integration):
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"RBACa {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"a{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="sales",
        display_name="Sales",
        permissions={"ai.read": True, "customers.ai.audit": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"sa{slug}",
        email=f"sa{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_customer_ai_capability(db, user, "audit")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_dedupe_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, _customer = await _seed_tenant_user_customer(db)
    out = await ai_dedupe(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=CustomerAiDedupeRequest(fields={"legalEntityName": "UniqueNonMatchXYZ123"}),
    )
    assert out.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(CustomerAiSuggestionBatch).where(CustomerAiSuggestionBatch.id == out.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "dedupe"


@pytest.mark.asyncio
async def test_cleanup_expired_batch_dry_run(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_tenant_user_customer(db)
    past = datetime.utcnow() - timedelta(days=3)
    batch = CustomerAiSuggestionBatch(
        tenant_id=tenant.id,
        customer_id=customer.id,
        action_type="validate",
        source_type="inference",
        status="completed",
        meta_json={"x": 1},
        created_at=past,
        updated_at=past,
        expires_at=past,
    )
    db.add(batch)
    await db.flush()
    bid = batch.id
    stats = await cai_batches.cleanup_expired_customer_ai_batches(db, dry_run=True)
    assert stats.get("would_delete", 0) >= 1
    r = await db.execute(select(CustomerAiSuggestionBatch).where(CustomerAiSuggestionBatch.id == bid))
    assert r.scalar_one_or_none() is not None
