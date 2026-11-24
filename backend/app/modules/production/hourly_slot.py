"""Deterministic slot key for hourly production rows (migration 328).

Format: ``department_type|YYYY-MM-DD|hour|line_id|machine_id|shift_id``
Null FKs become ``0`` so matching is stable across create/update.
"""
from __future__ import annotations

from datetime import date


def build_hourly_slot_key(
    *,
    department_type: str,
    production_date: date | str,
    hour_slot: int,
    line_id: int | None = None,
    machine_id: int | None = None,
    shift_id: int | None = None,
) -> str:
    d = production_date.isoformat() if isinstance(production_date, date) else str(production_date)
    return "|".join(
        [
            (department_type or "").strip().lower(),
            d,
            str(int(hour_slot)),
            str(int(line_id or 0)),
            str(int(machine_id or 0)),
            str(int(shift_id or 0)),
        ]
    )
