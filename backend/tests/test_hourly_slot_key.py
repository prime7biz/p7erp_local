"""Phase 0: deterministic hourly slot_key helper (no DB required)."""
from __future__ import annotations

from datetime import date

from app.modules.production.hourly_slot import build_hourly_slot_key


def test_slot_key_stable_with_null_fks():
    key = build_hourly_slot_key(
        department_type="Sewing",
        production_date=date(2026, 11, 23),
        hour_slot=3,
        line_id=None,
        machine_id=None,
        shift_id=None,
    )
    assert key == "sewing|2026-11-23|3|0|0|0"


def test_slot_key_includes_line_machine_shift():
    key = build_hourly_slot_key(
        department_type="sewing",
        production_date="2026-11-23",
        hour_slot=1,
        line_id=12,
        machine_id=5,
        shift_id=2,
    )
    assert key == "sewing|2026-11-23|1|12|5|2"


def test_slot_key_same_inputs_same_output():
    a = build_hourly_slot_key(
        department_type="cutting",
        production_date=date(2026, 1, 1),
        hour_slot=8,
        line_id=1,
    )
    b = build_hourly_slot_key(
        department_type="CUTTING",
        production_date=date(2026, 1, 1),
        hour_slot=8,
        line_id=1,
        machine_id=None,
        shift_id=None,
    )
    assert a == b
