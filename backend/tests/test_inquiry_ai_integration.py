"""DB-backed integration tests for Inquiry AI batches, RBAC, trace rows.

Requires DATABASE_URL (PostgreSQL). Typical run:

    docker compose exec backend pytest tests/test_inquiry_ai_integration.py -v
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.models import Customer, GarmentStyle, Inquiry, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.tenant import TenantType
from app.models.user import Role
from app.models.inquiry_ai_suggestion import InquiryAiSuggestionBatch, InquiryAiSuggestionItem
from app.modules.ai_extract.schemas import ExtractedField, InquiryExtractionResponse
from app.modules.inquiries import inquiry_ai_batches as iq_batches
from app.modules.inquiries.inquiry_ai_authz import require_inquiry_ai_capability
from app.modules.inquiries.inquiry_ai_schemas import InquiryAiDedupeRequest, InquiryAiValidateRequest
from app.modules.inquiries.inquiry_ai_service import ai_dedupe, ai_validate


async def _seed_tenant_user_inquiry(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"IAI int {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"i{slug}"[:18],
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
        username=f"iu{slug}",
        email=f"iu{slug}@example.com",
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
    inquiry = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id,
        inquiry_code=f"INQ-{slug}"[:16],
        style_id=style.id,
        style_ref="REF-1",
        season="SS26",
        department="Kids",
        quantity=1000,
        status="DRAFT",
    )
    db.add(inquiry)
    await db.flush()
    return tenant, user, customer, style, inquiry


@pytest.mark.asyncio
async def test_tenant_isolation_batch_load(db_session_integration):
    db = db_session_integration
    t1, u1, _c1, _s1, inq1 = await _seed_tenant_user_inquiry(db)
    t2, _, _, _, _ = await _seed_tenant_user_inquiry(db)
    extraction = InquiryExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "season": ExtractedField(value="FW26", confidence=0.9, source="doc"),
        },
        items=[],
        unmapped_text=[],
        warnings=[],
    )
    bid = await iq_batches.create_batch_from_extraction(
        db,
        tenant_id=t1.id,
        user_id=u1.id,
        inquiry_id=inq1.id,
        extraction=extraction,
        request_id="r1",
        model_hint="test",
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await iq_batches._load_batch_items(db, batch_id=bid, tenant_id=t2.id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_discard_blocks_apply(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    extraction = InquiryExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "season": ExtractedField(value="NEW", confidence=0.9, source="doc"),
        },
        items=[],
        unmapped_text=[],
        warnings=[],
    )
    bid = await iq_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        inquiry_id=inquiry.id,
        extraction=extraction,
        request_id="r2",
        model_hint="test",
    )
    await db.flush()
    await iq_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=bid)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await iq_batches.apply_suggestions_to_inquiry(
            db,
            tenant=tenant,
            user_id=user.id,
            batch_id=bid,
            inquiry_id=inquiry.id,
            actions=[("season", "apply")],
            conflict_mode="overwrite",
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_trace_batch_rejects_mark_decisions(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    bid = await iq_batches.create_trace_result_batch(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        inquiry_id=inquiry.id,
        action_type="validate",
        request_id="rv",
        model_hint="rules",
        meta_payload={"issue_count": 0},
    )
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await iq_batches.mark_suggestion_decisions(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            batch_id=bid,
            decisions=[("season", "skip")],
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_apply_skips_non_allowlisted_field(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    now = datetime.utcnow()
    batch = InquiryAiSuggestionBatch(
        tenant_id=tenant.id,
        inquiry_id=inquiry.id,
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
        InquiryAiSuggestionItem(
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
    out = await iq_batches.apply_suggestions_to_inquiry(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=batch.id,
        inquiry_id=inquiry.id,
        actions=[("bogusKey999", "apply")],
        conflict_mode="overwrite",
    )
    assert "bogusKey999" not in out["applied_fields"]
    await db.refresh(inquiry)
    assert inquiry.season == "SS26"


@pytest.mark.asyncio
async def test_apply_updates_season(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    suggestions = {
        "season": {
            "value": "FW27",
            "confidence": 0.92,
            "source": "test",
            "rationale": None,
        },
    }
    bid = await iq_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        inquiry_id=inquiry.id,
        suggestions=suggestions,
        request_id="en",
        model_name="test-model",
        source_type="inference",
    )
    await db.flush()
    out = await iq_batches.apply_suggestions_to_inquiry(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        inquiry_id=inquiry.id,
        actions=[("season", "apply")],
        conflict_mode="overwrite",
    )
    assert "season" in out["applied_fields"]
    await db.refresh(inquiry)
    assert inquiry.season == "FW27"


@pytest.mark.asyncio
async def test_validate_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    res = await ai_validate(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=InquiryAiValidateRequest(
            fields={"quantity": 0},
            inquiry_id=inquiry.id,
        ),
    )
    assert res.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(InquiryAiSuggestionBatch).where(InquiryAiSuggestionBatch.id == res.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "validate"
    assert row.status == "completed"
    assert isinstance(row.meta_json, dict)


@pytest.mark.asyncio
async def test_dedupe_persists_trace_batch(db_session_integration):
    db = db_session_integration
    tenant, user, customer, _s, inquiry = await _seed_tenant_user_inquiry(db)
    res = await ai_dedupe(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        body=InquiryAiDedupeRequest(
            fields={"customer_id": str(customer.id), "season": "SS26"},
            exclude_inquiry_id=inquiry.id,
        ),
    )
    assert res.suggestion_batch_id
    await db.flush()
    r = await db.execute(
        select(InquiryAiSuggestionBatch).where(InquiryAiSuggestionBatch.id == res.suggestion_batch_id)
    )
    row = r.scalar_one()
    assert row.action_type == "dedupe"


@pytest.mark.asyncio
async def test_finalize_after_create_writes_audit(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _s, inquiry = await _seed_tenant_user_inquiry(db)
    extraction = InquiryExtractionResponse(
        success=True,
        document_type="pdf",
        fields={
            "department": ExtractedField(value="Men", confidence=0.9, source="doc"),
        },
        items=[],
        unmapped_text=[],
        warnings=[],
    )
    bid = await iq_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        inquiry_id=None,
        extraction=extraction,
        request_id="fin",
        model_hint="test",
    )
    await db.flush()
    await iq_batches.mark_suggestion_decisions(
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
    await iq_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=bid,
        inquiry_id=inquiry.id,
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
            AiAuditLog.action == "INQUIRY_AI_SUGGESTION_FINALIZE_CREATE",
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
        name=f"IAI RBAC {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ir{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="sales",
        display_name="Sales",
        permissions={"ai.read": True, "inquiries.ai.apply_suggestions": False},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"is{slug}",
        email=f"is{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await require_inquiry_ai_capability(db, user, "apply_suggestions")
    assert exc.value.status_code == 403
