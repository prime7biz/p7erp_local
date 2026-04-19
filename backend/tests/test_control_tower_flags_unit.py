"""Unit tests for control tower feature-flag helpers (no database)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.common.control_tower_flags import (
    auto_line_booking_enabled,
    control_tower_enabled,
    require_control_tower_enabled,
)


def test_control_tower_disabled_when_missing_flag():
    tenant = SimpleNamespace(feature_flags=None)
    assert control_tower_enabled(tenant) is False


def test_control_tower_enabled_when_true():
    tenant = SimpleNamespace(feature_flags={"control_tower_enabled": True})
    assert control_tower_enabled(tenant) is True


def test_require_control_tower_raises_when_off():
    tenant = SimpleNamespace(feature_flags={})
    with pytest.raises(HTTPException) as exc:
        require_control_tower_enabled(tenant)
    assert exc.value.status_code == 403


def test_auto_line_booking_flag():
    off = SimpleNamespace(feature_flags={})
    on = SimpleNamespace(feature_flags={"auto_line_booking_enabled": True})
    assert auto_line_booking_enabled(off) is False
    assert auto_line_booking_enabled(on) is True
