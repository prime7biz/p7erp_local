"""`mobile_ui_v2` (simpler phone / tablet layout) is off unless a tenant sets it to exactly True."""

import pytest

from app.common import tenant_feature_keys as fk


@pytest.mark.parametrize(
    "flags",
    [None, {}, {fk.MOBILE_UI_V2: False}, {fk.MOBILE_UI_V2: "true"}, {fk.MOBILE_UI_V2: 1}, "not-a-dict"],
)
def test_missing_false_or_non_boolean_means_off(flags):
    assert fk.is_mobile_ui_v2_enabled(flags) is False


def test_explicit_true_means_on():
    assert fk.is_mobile_ui_v2_enabled({fk.MOBILE_UI_V2: True}) is True


def test_not_default_on():
    assert fk.MOBILE_UI_V2 not in fk.DEFAULT_ON_FEATURE_FLAGS
    assert fk.MOBILE_UI_V2 not in fk.with_effective_default_flags({})


def test_settings_payload_keeps_the_switch():
    assert fk.normalize_feature_flags({fk.MOBILE_UI_V2: True}) == {fk.MOBILE_UI_V2: True}
