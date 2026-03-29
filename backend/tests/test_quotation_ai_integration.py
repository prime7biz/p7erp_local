"""DB-backed integration tests for Quotation AI batches, RBAC, costing safety, trace rows.

Requires DATABASE_URL (PostgreSQL). Typical run:

    docker compose exec backend pytest tests/test_quotation_ai_integration.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Customer, GarmentStyle, Inquiry, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.tenant import TenantType
from app.models.user import Role
from app.models.quotation_ai_suggestion import QuotationAiSuggestionBatch, QuotationAiSuggestionItem
from app.modules.quotations import quotation_ai_batches as qt_batches
from app.modules.quotations.quotation_ai_authz import require_quotation_ai_capability
from app.modules.quotations.quotation_ai_schemas import QuotationAiDedupeRequest, QuotationAiValidateRequest
from app.modules.quotations.quotation_ai_service import ai_dedupe, ai_validate


async def _seed_tenant_user_quotation(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"QAI int {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"q{slug}"[:18],
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
        username=f"qu{slug}",
        email=f"qu{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C{slug}"[:12],
        name="Buyer Co",
    )
    db.add(customer)
    await db.flush()
    style = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"ST{slug}"[:12],
        name="Test Style",
    )
    db.add(style)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-{slug}"[:16],
        style_id=style.id,
        style_ref="REF-Q1",
        department="Kids",
        projected_quantity=5000,
        currency="USD",
        status="DRAFT",
    )
    db.add(quotation)
    await db.flush()
    return tenant, user, customer, style, quotation


@pytest.mark.asyncio
async def test_tenant_isolation_batch_load(db_session_integration):
    db = db_session_integration
    t1, u1, _c1, _s1, qt1 = await _seed_tenant_user_quotation(db)
    t2, _, _, _, _ = await _seed_tenant_user_quotation(db)
    suggestions = {
        "department": {"value": "Women", "confidence": 0.9, "source": "test", "rationale": None},
    }
    bid = await qt_batches.create_batch_from_enrich(
        db,
        tenant_id=t1.id,
        user_id=u1.id,
        quotation_id=qt1.id,
        suggestions=suggestions,
        request_id="r1",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await qt_batches._load_batch_items(db, batch_id=bid, tenant_id=t2.id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_discard_blocks_apply(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    suggestions = {
        "department": {"value": "Men", "confidence": 0.9, "source": "test", "rationale": None},
    }
    bid = await qt_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=quotation.id,
        suggestions=suggestions,
        request_id="r2",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    await qt_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=bid)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await qt_batches.apply_suggestions_to_quotation(
            db,
            tenant=tenant,
            user_id=user.id,
            batch_id=bid,
            quotation_id=quotation.id,
            actions=[("department", "apply")],
            conflict_mode="overwrite",
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_trace_batch_rejects_mark_decisions(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    bid = await qt_batches.create_trace_result_batch(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=quotation.id,
        action_type="validate",
        request_id="rv",
        model_hint="rules",
        meta_payload={"issue_count": 0},
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await qt_batches.mark_suggestion_decisions(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            batch_id=bid,
            decisions=[("department", "skip")],
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_apply_skips_non_allowlisted_field(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    now = datetime.utcnow()
    batch = QuotationAiSuggestionBatch(
        tenant_id=tenant.id,
        quotation_id=quotation.id,
        action_type="enrich",
        source_type="inference",
        status="generated",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    db.add(
        QuotationAiSuggestionItem(
            batch_id=batch.id,
            tenant_id=tenant.id,
            field_key="bogusKey999",
            suggested_value="HACK",
            confidence=0.99,
            source="x",
            disposition="pending",
            created_at=now,
            updated_at=now,
        )
    )
    await db.flush()
    out = await qt_batches.apply_suggestions_to_quotation(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        quotation_id=quotation.id,
        actions=[("bogusKey999", "apply")],
        conflict_mode="overwrite",
    )
    assert "bogusKey999" not in out["applied_fields"]
    await db.refresh(quotation)
    assert quotation.department == "Kids"


@pytest.mark.asyncio
async def test_apply_rejects_calculated_costing_field(db_session_integration):
    """AI must never write calculated costing totals (material_cost, total_cost etc.)."""
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    now = datetime.utcnow()
    batch = QuotationAiSuggestionBatch(
        tenant_id=tenant.id,
        quotation_id=quotation.id,
        action_type="enrich",
        source_type="inference",
        status="generated",
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=30),
    )
    db.add(batch)
    await db.flush()
    for protected_key in ("material_cost", "total_cost", "cost_per_piece", "profit_percentage", "quoted_price", "total_amount", "status"):
        db.add(
            QuotationAiSuggestionItem(
                batch_id=batch.id,
                tenant_id=tenant.id,
                field_key=protected_key,
                suggested_value="99999",
                confidence=0.99,
                source="adversary",
                disposition="pending",
                created_at=now,
                updated_at=now,
            )
        )
    await db.flush()
    out = await qt_batches.apply_suggestions_to_quotation(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        quotation_id=quotation.id,
        actions=[(k, "apply") for k in ("material_cost", "total_cost", "cost_per_piece", "profit_percentage", "quoted_price", "total_amount", "status")],
        conflict_mode="overwrite",
    )
    assert len(out["applied_fields"]) == 0
    await db.refresh(quotation)
    assert quotation.status == "DRAFT"
    assert quotation.material_cost is None


@pytest.mark.asyncio
async def test_apply_updates_department(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    suggestions = {
        "department": {"value": "Women", "confidence": 0.92, "source": "test", "rationale": None},
    }
    bid = await qt_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=quotation.id,
        suggestions=suggestions,
        request_id="en",
        model_name="test-model",
        source_type="inference",
    )
    await db.flush()
    out = await qt_batches.apply_suggestions_to_quotation(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        quotation_id=quotation.id,
        actions=[("department", "apply")],
        conflict_mode="overwrite",
    )
    assert "department" in out["applied_fields"]
    await db.refresh(quotation)
    assert quotation.department == "Women"


@pytest.mark.asyncio
async def test_validate_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    res = await ai_validate(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=QuotationAiValidateRequest(
            fields={"projected_quantity": 0},
            quotation_id=quotation.id,
        ),
    )
    assert res.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(QuotationAiSuggestionBatch).where(QuotationAiSuggestionBatch.id == res.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "validate"
    assert row.status == "completed"
    assert isinstance(row.meta_json, dict)


@pytest.mark.asyncio
async def test_dedupe_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, customer, _s, quotation = await _seed_tenant_user_quotation(db)
    res = await ai_dedupe(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=QuotationAiDedupeRequest(
            fields={"customer_id": str(customer.id), "department": "Kids"},
            exclude_quotation_id=quotation.id,
        ),
    )
    assert res.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(QuotationAiSuggestionBatch).where(QuotationAiSuggestionBatch.id == res.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "dedupe"


@pytest.mark.asyncio
async def test_finalize_after_create_writes_audit(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, quotation = await _seed_tenant_user_quotation(db)
    suggestions = {
        "department": {"value": "Men", "confidence": 0.9, "source": "doc", "rationale": None},
    }
    bid = await qt_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=None,
        suggestions=suggestions,
        request_id="fin",
        model_name="test",
        source_type="inference",
    )
    await db.flush()
    await qt_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=bid,
        decisions=[("department", "apply")],
    )
    await db.flush()
    before = await db.execute(
        select(func.count()).select_from(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id)
    )
    n0 = int(before.scalar_one() or 0)
    await qt_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        quotation_id=quotation.id,
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
            AiAuditLog.action == "QUOTATION_AI_SUGGESTION_FINALIZE_CREATE",
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
        name=f"QAI RBAC {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"qr{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="sales",
        display_name="Sales",
        permissions={"ai.read": True, "quotations.ai.apply_suggestions": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"qs{slug}",
        email=f"qs{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_quotation_ai_capability(db, user, "apply_suggestions")
    assert exc.value.status_code == 403
