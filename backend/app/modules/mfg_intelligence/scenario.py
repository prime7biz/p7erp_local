"""What-if scenario rows for plan revision impact (read-only, in memory only).

A `ScenarioRow` is a plain dataclass with the same attribute names the Phase 1 readers use on a
`SewingLineStyleConfig`. It is never an ORM object, so building a scenario can never add, change or flush a
database row. `Scenario` says which live rows are replaced, removed or added; `apply_to_rows` returns the row list
the readers should use instead of the stored one.

`TentativeRow` is the same idea for tentative inquiry / quotation demand (always SOFT load, never firm).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Iterable

EXCLUDED_STATUSES = ("CANCELLED", "COMPLETED")

# Ids of rows that do not exist in the database are negative so they never clash with a real row id.
NEW_ROW_ID_BASE = -1
TENTATIVE_ROW_ID_BASE = -1_000_000


@dataclass
class ScenarioRow:
    id: int
    tenant_id: int
    line_id: int
    order_id: int | None
    style_id: int | None
    ob_id: int | None
    shift_id: int | None
    operator_count: int
    target_efficiency_pct: Decimal
    start_date: date
    planned_end_date: date | None
    reservation_status: str
    planned_qty: Decimal
    completed_qty: Decimal = Decimal("0")
    smv_per_piece: Decimal | None = None
    machine_count: int = 0
    helper_count: int = 0
    status: str = "planned"
    sort_order: int = 0
    is_scenario: bool = True


@dataclass
class TentativeRow:
    """A tentative booking seen as a SOFT line-loading row. `order_id` is always None."""

    id: int
    tenant_id: int
    line_id: int
    style_id: int | None
    ob_id: int | None
    shift_id: int | None
    start_date: date
    planned_end_date: date | None
    planned_qty: Decimal
    smv_per_piece: Decimal | None
    confidence_pct: Decimal
    booking_id: int
    inquiry_id: int | None = None
    quotation_id: int | None = None
    order_id: int | None = None
    operator_count: int = 0
    target_efficiency_pct: Decimal = Decimal("0")
    reservation_status: str = "SOFT_BOOKED"
    completed_qty: Decimal = Decimal("0")
    machine_count: int = 0
    helper_count: int = 0
    status: str = "planned"
    sort_order: int = 0
    is_tentative: bool = True


@dataclass
class Scenario:
    """replacements: stored row id -> new row (None = the row is cancelled / removed); additions: new rows."""

    replacements: dict[int, ScenarioRow | None] = field(default_factory=dict)
    additions: list[ScenarioRow] = field(default_factory=list)
    # Filled by the builder so the impact calculation knows what to compare (before vs after).
    order_ids: set[int] = field(default_factory=set)
    line_ids: set[int] = field(default_factory=set)
    gaining_firm_order_ids: set[int] = field(default_factory=set)
    date_min: date | None = None
    date_max: date | None = None

    def is_empty(self) -> bool:
        return not self.replacements and not self.additions


def _live(row: Any) -> bool:
    return (row.reservation_status or "").strip().upper() not in EXCLUDED_STATUSES


def apply_to_rows(
    rows: Iterable[Any],
    scenario: Scenario | None,
    *,
    window_start: date | None = None,
    window_end: date | None = None,
    line_ids: set[int] | None = None,
    order_ids: set[int] | None = None,
    include_completed: bool = False,
    live_only: bool = True,
) -> list[Any]:
    """Stored rows with the scenario applied; scenario rows are filtered like the stored query would.

    `window_*` keep rows overlapping the window (rows that ended long before are not worth carrying);
    `line_ids` / `order_ids` restrict like the reader's own filters. Scenario rows that are CANCELLED / COMPLETED are
    dropped when `live_only`. Output order: start date, id (the readers' own sort).
    """
    out: list[Any] = []
    for r in rows:
        if scenario is not None and r.id in scenario.replacements:
            continue
        out.append(r)
    if scenario is not None:
        extra = [x for x in scenario.replacements.values() if x is not None] + list(scenario.additions)
        for x in extra:
            if live_only and not _live(x):
                continue
            if not live_only and not include_completed and (x.reservation_status or "").strip().upper() == "CANCELLED":
                continue
            if line_ids is not None and x.line_id not in line_ids:
                continue
            if order_ids is not None and (x.order_id is None or x.order_id not in order_ids):
                continue
            if window_start is not None and window_end is not None:
                end = x.planned_end_date or x.start_date
                if x.start_date > window_end or end < window_start:
                    continue
            out.append(x)
    out.sort(key=lambda r: (r.start_date, r.id))
    return out
