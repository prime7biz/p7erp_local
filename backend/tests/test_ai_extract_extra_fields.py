"""Extra details from customer / inquiry document imports (``app/modules/ai_extract/extra_fields.py``).

Pure unit tests plus DB-backed round trips through the stub provider:

    docker compose exec backend pytest tests/test_ai_extract_extra_fields.py -q
"""

from __future__ import annotations

import uuid

import pytest

from app.modules.ai_extract import extra_fields as xf
from app.modules.ai_extract.schemas import ExtractedField


def _run(raw: dict, form: str):
    extras, loose = xf.collect_extra_candidates(raw, form)
    extras = xf.promote_extras_into_raw(raw, extras, form)
    return extras, loose


def test_synonym_mapping_article_code_to_style_ref():
    assert xf.synonym_target("Article Code", "inquiry") == "style_ref"
    assert xf.synonym_target("Article Name", "inquiry") == "style_name_candidate"
    assert xf.synonym_target("Certification 2", "inquiry") == "notes"
    assert xf.synonym_target("Gender", "inquiry") == "department"
    assert xf.synonym_target("VAT No.", "customer") == "taxIdVatNumber"
    assert xf.synonym_target("Created On", "inquiry") is None


def test_header_then_value_pairing_from_split_snippets():
    raw = {
        "style_ref": "ST-1",
        "_unmapped_text": ["Season", "SS27", "Brand", "Premier", "Gender", "Mens", "Last Modified", "2026-01-02"],
    }
    extras, loose = xf.collect_extra_candidates(raw, "inquiry")
    pairs = {(e.label, e.value) for e in extras}
    assert ("Season", "SS27") in pairs
    assert ("Brand", "Premier") in pairs
    assert ("Gender", "Mens") in pairs
    assert ("Last Modified", "2026-01-02") in pairs
    assert loose == []


def test_list_header_collects_following_rows_and_bare_headers_are_dropped():
    raw = {"_unmapped_text": ["Article Code", "Colors", "Navy (NAVY)", "Pan 2767C", "White", "Season", "SS27"]}
    extras, loose = xf.collect_extra_candidates(raw, "inquiry")
    by_label = {e.label: e.value for e in extras}
    assert "Article Code" not in by_label  # header with no value is noise
    assert by_label["Colors"] == "Navy (NAVY)\nPan 2767C\nWhite"
    assert by_label["Season"] == "SS27"
    assert loose == []


def test_label_colon_value_split_and_urls_untouched():
    raw = {"_unmapped_text": ["Payment: LC at sight", "https://example.com/page", "10:30"]}
    extras, loose = xf.collect_extra_candidates(raw, "inquiry")
    assert [(e.label, e.value) for e in extras] == [("Payment", "LC at sight")]
    assert loose == ["https://example.com/page", "10:30"]


def test_allowlist_rejects_unknown_suggested_field():
    assert xf.resolve_suggested_field("Something", "tenant_id", "inquiry") is None
    assert xf.resolve_suggested_field("Something", "customer_id", "inquiry") is None
    assert xf.resolve_suggested_field("Something", "notes", "inquiry") == "notes"
    assert xf.resolve_suggested_field("Something", "notes", "customer") is None
    # synonym table wins over the AI suggestion
    assert xf.resolve_suggested_field("Season", "notes", "inquiry") == "season"


def test_unknown_top_level_keys_become_extras_not_fields():
    raw = {"style_ref": "ST-1", "tenant_id": 99, "brandName": "Premier"}
    extras, _ = xf.collect_extra_candidates(raw, "inquiry")
    assert "tenant_id" not in raw and "brandName" not in raw
    labels = {e.label for e in extras}
    assert {"Tenant id", "Brand Name"} <= labels


def test_promotion_only_when_main_field_empty_with_capped_confidence():
    raw = {
        "style_ref": None,
        "season": "AW26",
        "_confidences": {},
        "_extra_fields": [
            {"label": "Article Code", "value": "ART-77", "confidence": 0.99},
            {"label": "Season", "value": "SS27"},
            {"label": "Material", "value": "100% Cotton", "suggested_field": "notes"},
            {"label": "Order Qty", "value": "about fifty thousand"},
        ],
    }
    remaining, _ = _run(raw, "inquiry")
    assert raw["style_ref"] == "ART-77"
    assert raw["_confidences"]["style_ref"] <= xf.PROMOTED_CONFIDENCE_CAP
    assert raw["season"] == "AW26"  # never overwritten
    left = {e.label for e in remaining}
    assert left == {"Season", "Material", "Order Qty"}  # notes never promoted, bad quantity stays
    assert raw.get("notes") is None
    assert raw.get("quantity") is None


def test_ambiguous_number_formats_are_not_promoted():
    raw = {
        "_confidences": {},
        "_extra_fields": [
            {"label": "Target Price", "value": "4,50"},
            {"label": "Order Qty", "value": "1.200"},
        ],
    }
    remaining, _ = _run(raw, "inquiry")
    assert raw.get("target_price") is None and raw.get("quantity") is None
    assert {e.label for e in remaining} == {"Target Price", "Order Qty"}
    assert xf.is_ambiguous_number("4,50") and xf.is_ambiguous_number("1.200 pcs")
    assert not xf.is_ambiguous_number("1,200") and not xf.is_ambiguous_number("3.25")


def test_vague_labels_and_wrong_shaped_values_are_not_promoted():
    raw = {
        "_confidences": {},
        "_extra_fields": [
            {"label": "Contact", "value": "+46 8 123 4567"},
            {"label": "Attn", "value": "+46 8 123 4567"},
            {"label": "Ref", "value": "PO-55821"},
        ],
    }
    remaining, _ = _run(raw, "customer")
    assert raw.get("primaryContactName") is None
    assert len(remaining) == 3
    # still suggested in the panel so the user can choose it
    assert xf.resolve_suggested_field("Contact", None, "customer") == "primaryContactName"

    raw = {"_confidences": {}, "_extra_fields": [{"label": "Ref", "value": "PO-55821"}]}
    _run(raw, "inquiry")
    assert raw.get("style_ref") is None


def test_differently_spelled_keys_are_renamed_not_dropped():
    raw = {"contact_email": "a@b.com", "expectedDeliveryDate": "2026-08-15", "_confidences": {"contact_email": 0.9}}
    extras, _ = xf.collect_extra_candidates(raw, "customer")
    assert raw["contactEmail"] == "a@b.com"
    assert raw["_confidences"]["contactEmail"] == 0.9
    assert "contact_email" not in raw
    # not a customer field -> becomes a labelled extra
    assert [e.label for e in extras] == ["Expected Delivery Date"]

    raw = {"expectedDeliveryDate": "2026-08-15"}
    xf.collect_extra_candidates(raw, "inquiry")
    assert raw["expected_delivery_date"] == "2026-08-15"


@pytest.mark.parametrize(
    "raw",
    [
        {"countryCode": None, "contactPhone": "+44 20 7946 0000"},
        {"contactPhone": "+44 20 7946 0000", "countryCode": None},
    ],
)
def test_phone_prefix_country_code_survives_key_order(raw):
    from app.modules.ai_extract.service import _normalize_customer_map

    fields = _normalize_customer_map(raw)
    assert fields["countryCode"].value == "+44"


def test_finalize_dedupes_caps_and_escapes():
    fields = {"style_ref": ExtractedField(value="ART-77", confidence=0.9)}
    extras = [
        xf.ExtraCandidate(label="Code", value="ART-77"),  # same as a main field value
        xf.ExtraCandidate(label="Note", value="<b>bold</b>"),
        xf.ExtraCandidate(label="Note", value="<b>bold</b>"),  # duplicate
        xf.ExtraCandidate(label="Junk", value="."),
    ] + [xf.ExtraCandidate(label=f"L{i}", value=f"value {i}") for i in range(60)]
    rows, legacy = xf.finalize_extras(extras, ["loose bit"], fields, "inquiry")
    assert len(rows) == xf.MAX_EXTRAS
    assert all(r.value != "ART-77" for r in rows)
    note_rows = [r for r in rows if r.label == "Note"]
    assert len(note_rows) == 1 and note_rows[0].value == "&lt;b&gt;bold&lt;/b&gt;"
    assert all(r.label != "Junk" for r in rows)
    assert "Note: &lt;b&gt;bold&lt;/b&gt;" in legacy


def test_value_length_cap():
    rows, _ = xf.finalize_extras([xf.ExtraCandidate(label="Long", value="x" * 5000)], [], {}, "inquiry")
    assert len(rows[0].value) == xf.MAX_VALUE_LEN


def test_loose_text_grouped_with_no_suggestion():
    rows, legacy = xf.finalize_extras([], ["first loose", "second loose"], {}, "customer")
    assert len(rows) == 1
    assert rows[0].label == "Other text from the document"
    assert rows[0].suggested_field is None
    assert rows[0].value == "first loose\nsecond loose"
    assert legacy == ["first loose", "second loose"]


def test_country_code_from_billing_country():
    raw = {"countryCode": None, "contactPhone": "01711122334", "billingCountry": "Bangladesh"}
    xf.fill_customer_country_code(raw)
    assert raw["countryCode"] == "+880"
    assert raw["_confidences"]["countryCode"] == 0.6


def test_country_code_not_overridden_by_phone_prefix_or_existing_value():
    raw = {"countryCode": None, "contactPhone": "+46 8 123 4567", "billingCountry": "Bangladesh"}
    xf.fill_customer_country_code(raw)
    assert raw["countryCode"] is None
    raw = {"countryCode": "+44", "billingCountry": "Sweden"}
    xf.fill_customer_country_code(raw)
    assert raw["countryCode"] == "+44"


# --- DB-backed round trips (stub provider is used under pytest) -------------------------------


async def _seed_tenant_user(db):
    from app.models import Tenant, User
    from app.models.tenant import TenantType
    from app.models.user import Role

    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(name=f"XF {slug}", tenant_type=TenantType.both, is_active=True, company_code=f"x{slug}"[:18])
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
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
    return tenant, user


@pytest.mark.asyncio
async def test_customer_extra_fields_round_trip_through_customer_ai_service(db_session_integration):
    from app.modules.customers.customer_ai_service import ai_extract_document

    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)
    wrap = await ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=b"%PDF-1.4 test",
        content_type="application/pdf",
        customer_id=None,
    )
    ext = wrap.extraction
    labels = {r.label: r for r in ext.extra_fields}
    assert labels["Fax"].suggested_field is None
    # "Delivery address" is a shipping synonym and the stub's shipping line is empty -> promoted.
    assert "Delivery address" not in labels
    assert ext.fields["shippingAddressLine1"].value == "Plot 7, BSCIC, Narayanganj"
    assert ext.fields["shippingAddressLine1"].confidence <= xf.PROMOTED_CONFIDENCE_CAP
    assert "Registered under Companies Act 1994" in ext.unmapped_text


@pytest.mark.asyncio
async def test_inquiry_extra_fields_round_trip(db_session_integration):
    from app.modules.ai_extract.service import extract_inquiry_form

    db = db_session_integration
    tenant, _ = await _seed_tenant_user(db)
    res = await extract_inquiry_form(db, tenant.id, b"img", "image/png")
    by_label = {r.label: r for r in res.extra_fields}
    assert by_label["Composition"].suggested_field == "notes"
    assert by_label["Colours"].value == "Navy\nWhite\nHeather Grey"
    assert by_label["Payment"].value == "LC at sight"
    assert "Payment: LC at sight" in res.unmapped_text
    assert res.fields["style_ref"].value == "ST-2204-B"
