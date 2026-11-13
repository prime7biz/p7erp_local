"""Read-only reproduction of the CURRENT advisory capacity figure, so the UI can show Legacy vs Corrected.

Source: `production/planning_advisory_service.py` -> `build_capacity_and_sequencing_advisory`, per line:

    rough_capacity_units = machines x operators x average_shift_minutes x working_days

- machines = running_machine_count, else default_machine_count, else 1
- operators = default_operator_count, else 1
- average_shift_minutes = plain average of the net minutes of ALL active tenant shifts
  (a shift without times counts as 480; with no active shift the average is 480)
- working_days = max(1, working days in the window)

This is known to overstate capacity (machines are multiplied by operators and shifts are averaged, not
summed). It is reproduced here unchanged on purpose. Nothing in this module writes to the database or imports a
function that does.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from app.models import ProductionShift
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext
from app.modules.production.calendar_service import count_working_days_between, net_shift_minutes

LEGACY_BASIS = "machines x operators x average shift minutes x working days (legacy advisory proxy)"


@dataclass(frozen=True)
class LegacyContext:
    average_shift_minutes: float  # same float semantics as the advisory
    working_days: int


def build_legacy_context(
    shifts: list[ProductionShift], calendar: CalendarContext, window_start: date, window_end: date
) -> LegacyContext:
    if shifts:
        mins = [float(net_shift_minutes(s.start_time, s.end_time, int(s.break_minutes or 0))) for s in shifts]
        average = float(sum(mins) / len(mins))
    else:
        average = 480.0
    days = max(
        1,
        count_working_days_between(
            window_start, window_end, weekend_days=calendar.weekend_days, overrides=calendar.overrides
        ),
    )
    return LegacyContext(average_shift_minutes=average, working_days=days)


def legacy_line_capacity(line: Any, ctx: LegacyContext) -> Decimal:
    """Advisory arithmetic: float product then round(x, 2); returned as an exact Decimal of that value."""
    machines = int(line.running_machine_count or line.default_machine_count or 1)
    operators = int(line.default_operator_count or 1)
    value = round(machines * operators * ctx.average_shift_minutes * ctx.working_days, 2)
    return Decimal(str(value))
