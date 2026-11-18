"""Phase 0: manpower_control_v1 and nested flags (strict true, need master).

Run: docker compose exec backend pytest tests/test_manpower_feature_flags.py -q
"""

from __future__ import annotations

from app.common.tenant_feature_keys import (
    MANPOWER_CONTROL_V1,
    MANPOWER_FLOOR_SUGGESTED_V1,
    MANPOWER_QUOTA_ENFORCEMENT_V1,
    MANPOWER_SMV_PANEL_V1,
    is_manpower_control_v1_enabled,
    is_manpower_floor_suggested_v1_enabled,
    is_manpower_quota_enforcement_v1_enabled,
    is_manpower_smv_panel_v1_enabled,
)
from app.modules.settings.router import _check_manpower_flags
import pytest
from fastapi import HTTPException


def test_master_off_by_default():
    assert is_manpower_control_v1_enabled(None) is False
    assert is_manpower_control_v1_enabled({}) is False
    assert is_manpower_control_v1_enabled({MANPOWER_CONTROL_V1: False}) is False
    assert is_manpower_control_v1_enabled({MANPOWER_CONTROL_V1: "true"}) is False
    assert is_manpower_control_v1_enabled({MANPOWER_CONTROL_V1: True}) is True


def test_nested_need_master():
    nested_only = {
        MANPOWER_QUOTA_ENFORCEMENT_V1: True,
        MANPOWER_FLOOR_SUGGESTED_V1: True,
        MANPOWER_SMV_PANEL_V1: True,
    }
    assert is_manpower_quota_enforcement_v1_enabled(nested_only) is False
    assert is_manpower_floor_suggested_v1_enabled(nested_only) is False
    assert is_manpower_smv_panel_v1_enabled(nested_only) is False

    with_master = {**nested_only, MANPOWER_CONTROL_V1: True}
    assert is_manpower_quota_enforcement_v1_enabled(with_master) is True
    assert is_manpower_floor_suggested_v1_enabled(with_master) is True
    assert is_manpower_smv_panel_v1_enabled(with_master) is True


def test_settings_refuses_nested_without_master():
    with pytest.raises(HTTPException) as exc:
        _check_manpower_flags({}, {MANPOWER_QUOTA_ENFORCEMENT_V1: True})
    assert exc.value.status_code == 400
    assert "manpower_control_v1" in exc.value.detail


def test_settings_allows_nested_with_master():
    changes = _check_manpower_flags(
        {},
        {MANPOWER_CONTROL_V1: True, MANPOWER_QUOTA_ENFORCEMENT_V1: True},
    )
    assert any("manpower_control_v1 enabled" in c for c in changes)
    assert any("manpower_quota_enforcement_v1 enabled" in c for c in changes)
