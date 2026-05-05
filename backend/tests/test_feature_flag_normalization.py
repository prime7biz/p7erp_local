"""Write-time validation for ``tenants.feature_flags``.

These tests pin the contract that ``rbac_enforcement`` (and any future
enum-style flag added to ``ENUM_FEATURE_FLAG_VALUES``) is normalized to its
canonical lowercase form before being persisted, and that obviously bad
values are rejected at the API boundary instead of silently letting the
backend and frontend drift apart on casing/whitespace.

Run:
    docker compose exec backend pytest tests/test_feature_flag_normalization.py -q
"""

from __future__ import annotations

import pytest

from app.common.tenant_feature_keys import (
    RBAC_ENFORCEMENT,
    normalize_feature_flag_value,
    normalize_feature_flags,
)


class TestNormalizeFeatureFlagValue:
    def test_canonical_values_pass_through_unchanged(self):
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "off") == "off"
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "shadow") == "shadow"
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "enforce") == "enforce"

    def test_mixed_case_is_normalized_to_lowercase(self):
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "Enforce") == "enforce"
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "ENFORCE") == "enforce"
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "ShAdOw") == "shadow"

    def test_surrounding_whitespace_is_stripped(self):
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, " enforce ") == "enforce"
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, "\tshadow\n") == "shadow"

    def test_unknown_string_is_rejected(self):
        with pytest.raises(ValueError):
            normalize_feature_flag_value(RBAC_ENFORCEMENT, "on")
        with pytest.raises(ValueError):
            normalize_feature_flag_value(RBAC_ENFORCEMENT, "")

    def test_non_string_value_is_rejected(self):
        for bad in (True, 1, 0, ["enforce"], {"mode": "enforce"}):
            with pytest.raises(ValueError):
                normalize_feature_flag_value(RBAC_ENFORCEMENT, bad)

    def test_none_value_passes_through(self):
        # None means "clear this flag" — the dict-level reader treats it as off.
        assert normalize_feature_flag_value(RBAC_ENFORCEMENT, None) is None

    def test_unknown_key_is_left_alone_for_forward_compat(self):
        # Brand-new flags shouldn't be blocked by this validator.
        assert normalize_feature_flag_value("brand_new_flag", "Whatever") == "Whatever"
        assert normalize_feature_flag_value("brand_new_flag", 42) == 42
        assert normalize_feature_flag_value("brand_new_flag", True) is True


class TestNormalizeFeatureFlags:
    def test_none_payload_returns_none(self):
        assert normalize_feature_flags(None) is None

    def test_non_dict_payload_is_rejected(self):
        with pytest.raises(ValueError):
            normalize_feature_flags("rbac_enforcement=enforce")
        with pytest.raises(ValueError):
            normalize_feature_flags(["rbac_enforcement", "enforce"])

    def test_mixed_payload_canonicalizes_known_keys_only(self):
        out = normalize_feature_flags(
            {
                "rbac_enforcement": "Enforce",
                "knitting_enabled": True,
                "single_session_enforced": True,
                "some_future_flag": "Whatever",
            }
        )
        assert out == {
            "rbac_enforcement": "enforce",
            "knitting_enabled": True,
            "single_session_enforced": True,
            "some_future_flag": "Whatever",
        }

    def test_invalid_enum_value_raises_value_error(self):
        with pytest.raises(ValueError):
            normalize_feature_flags({"rbac_enforcement": "ON"})

    def test_empty_payload_returns_empty_dict(self):
        assert normalize_feature_flags({}) == {}
