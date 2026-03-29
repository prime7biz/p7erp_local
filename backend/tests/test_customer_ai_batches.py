"""Customer AI suggestion batch helpers (no DB)."""

from app.modules.customers.customer_ai_batches import (
    ALLOWED_FORM_KEYS,
    normalize_suggestion_field_key,
)


def test_normalize_suggestion_field_key_camel_and_snake() -> None:
    assert normalize_suggestion_field_key("legalEntityName") == "legalEntityName"
    assert normalize_suggestion_field_key("legal_entity_name") == "legalEntityName"
    assert normalize_suggestion_field_key("contact_email") == "contactEmail"


def test_blocked_or_unknown_keys() -> None:
    assert normalize_suggestion_field_key("customer_code") is None
    assert normalize_suggestion_field_key("tenant_id") is None


def test_allowed_set_contains_core_profile_fields() -> None:
    assert "contactEmail" in ALLOWED_FORM_KEYS
    assert "billingAddressLine1" in ALLOWED_FORM_KEYS
