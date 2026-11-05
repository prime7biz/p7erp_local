"""R4/R5 feature flags are on for every tenant unless explicitly set to False."""

import pytest

from app.common import tenant_feature_keys as fk

CHECKS = {
    fk.ORDER_COLOR_SIZE_MATRIX_ENABLED: fk.is_order_color_size_matrix_enabled,
    fk.COMMISSION_ENGINE_ENABLED: fk.is_commission_engine_enabled,
    fk.TRACEABILITY_ENABLED: fk.is_traceability_enabled,
    fk.PACKING_LIST_CARTONS_ENABLED: fk.is_packing_list_cartons_enabled,
    fk.SHOP_FLOOR_SCAN_ENABLED: fk.is_shop_floor_scan_enabled,
    fk.BD_BOND_COMPLIANCE_ENABLED: fk.is_bd_bond_compliance_enabled,
    fk.PO_COLOR_SIZE_MATRIX_ENABLED: fk.is_po_color_size_matrix_enabled,
    fk.AI_EXCEPTION_AGENTS_ENABLED: fk.is_ai_exception_agents_enabled,
    fk.AI_DASHBOARD_CARDS_ENABLED: fk.is_ai_dashboard_cards_enabled,
    fk.VOUCHER_ENTRY_ASSIST_ENABLED: fk.is_voucher_entry_assist_enabled,
}


def test_every_default_on_key_has_a_check():
    assert set(CHECKS) == set(fk.DEFAULT_ON_FEATURE_FLAGS)


@pytest.mark.parametrize("key", sorted(CHECKS))
def test_missing_flag_means_on_and_explicit_false_means_off(key):
    check = CHECKS[key]
    assert check(None) is True
    assert check({}) is True
    assert check({key: True}) is True
    assert check({key: False}) is False


def test_effective_flags_fill_missing_keys_and_keep_explicit_false():
    out = fk.with_effective_default_flags({fk.TRACEABILITY_ENABLED: False, "trade_enabled": False})
    assert out[fk.TRACEABILITY_ENABLED] is False
    assert out["trade_enabled"] is False
    for key in fk.DEFAULT_ON_FEATURE_FLAGS:
        if key != fk.TRACEABILITY_ENABLED:
            assert out[key] is True
    assert fk.with_effective_default_flags(None) == {k: True for k in fk.DEFAULT_ON_FEATURE_FLAGS}
