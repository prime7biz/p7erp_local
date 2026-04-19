"""Integration tests for quotation document extract → suggestion batch (no live LLM).

    docker compose exec backend pytest tests/test_quotation_ai_extract_integration.py -q
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import Quotation
from app.models.quotation_ai_suggestion import QuotationAiSuggestionBatch, QuotationAiSuggestionItem
from app.modules.ai_extract.schemas import ExtractedField, InquiryExtractionResponse
from app.modules.quotations import quotation_ai_batches as qt_batches
from tests.merch_fixtures import create_customer, create_garment_style, create_merch_tenant_with_user


async def _seed(db):
    tenant, user, _role = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    slug = uuid.uuid4().hex[:8]
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QX-{slug}"[:16],
        style_id=style.id,
        status="DRAFT",
    )
    db.add(quotation)
    await db.flush()
    return tenant, user, quotation


@pytest.mark.asyncio
async def test_create_batch_from_extraction_maps_allowed_keys(db_session_integration):
    db = db_session_integration
    tenant, user, quotation = await _seed(db)
    extraction = InquiryExtractionResponse(
        success=True,
        fields={
            "department": ExtractedField(value="Women", confidence=0.92, source="uploaded_document"),
            "material_cost": ExtractedField(value="999", confidence=0.99, source="uploaded_document"),
            "notes": ExtractedField(value="From PDF", confidence=0.8, source="uploaded_document"),
        },
    )
    bid = await qt_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=quotation.id,
        extraction=extraction,
        request_id="req-ext-1",
        model_hint="test",
    )
    await db.commit()

    rb = await db.execute(select(QuotationAiSuggestionBatch).where(QuotationAiSuggestionBatch.id == bid))
    batch = rb.scalar_one()
    assert batch.action_type == "extract"
    assert batch.quotation_id == quotation.id

    ri = await db.execute(
        select(QuotationAiSuggestionItem).where(QuotationAiSuggestionItem.batch_id == bid)
    )
    items = list(ri.scalars().all())
    keys = {i.field_key for i in items}
    assert "department" in keys
    assert "notes" in keys
    assert "material_cost" not in keys
