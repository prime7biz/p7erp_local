"""`finance_hubs_v2` (Finance hub navigation) is off unless a tenant sets it to exactly True."""

import pytest

from app.common import tenant_feature_keys as fk


@pytest.mark.parametrize(
    "flags",
    [None, {}, {fk.FINANCE_HUBS_V2: False}, {fk.FINANCE_HUBS_V2: "true"}, {fk.FINANCE_HUBS_V2: 1}, "not-a-dict"],
)
def test_missing_false_or_non_boolean_means_off(flags):
    assert fk.is_finance_hubs_v2_enabled(flags) is False


def test_explicit_true_means_on():
    assert fk.is_finance_hubs_v2_enabled({fk.FINANCE_HUBS_V2: True}) is True


def test_not_default_on():
    assert fk.FINANCE_HUBS_V2 not in fk.DEFAULT_ON_FEATURE_FLAGS
    assert fk.FINANCE_HUBS_V2 not in fk.with_effective_default_flags({})


def test_settings_payload_keeps_the_switch():
    assert fk.normalize_feature_flags({fk.FINANCE_HUBS_V2: True}) == {fk.FINANCE_HUBS_V2: True}
