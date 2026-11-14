"""Report period: one month (default, the current month), one quarter or one financial year. Never longer than a year.

    "2026-11"   -> that calendar month
    "2026-Q2"   -> quarter 2 of the financial year that starts in 2026 (fiscal_year_start_month flag)
    "FY2026"    -> the financial year that starts in 2026
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from app.common.business_date import today_local
from app.modules.finance.budget_analytics.common import add_months, month_end, months_between
from app.modules.finance.fiscal_year import fiscal_year_bounds, fiscal_year_label, fiscal_year_of, fy_start_month

_MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
_QUARTER = re.compile(r"^(\d{4})-Q([1-4])$", re.IGNORECASE)
_FY = re.compile(r"^FY(\d{4})$", re.IGNORECASE)
MIN_YEAR, MAX_YEAR = 2000, 2100


@dataclass(frozen=True)
class Period:
    kind: str  # month | quarter | year
    label: str
    start: date
    end: date
    today: date
    fy_start_month: int

    @property
    def months(self) -> list[date]:
        return months_between(self.start, self.end)

    @property
    def current_month(self) -> date:
        return self.today.replace(day=1)

    def month_kind(self, month: date) -> str:
        """past | current | future relative to today."""
        if month < self.current_month:
            return "past"
        if month == self.current_month:
            return "current"
        return "future"

    @property
    def fiscal_year_label(self) -> str:
        return fiscal_year_label(fiscal_year_of(self.start, self.fy_start_month), self.fy_start_month)


def _check_year(year: int) -> None:
    if not (MIN_YEAR <= year <= MAX_YEAR):
        raise ValueError(f"period year must be between {MIN_YEAR} and {MAX_YEAR}")


def parse_period(text: str | None, tenant: Any, *, today: date | None = None) -> Period:
    """ValueError (-> 422) for anything else."""
    sm = fy_start_month(tenant.feature_flags)
    today = today or today_local(tenant)
    raw = (text or "").strip()
    if not raw:
        start = today.replace(day=1)
        return Period("month", f"{start.year:04d}-{start.month:02d}", start, month_end(start), today, sm)
    m = _MONTH.match(raw)
    if m:
        year = int(m.group(1))
        _check_year(year)
        start = date(year, int(m.group(2)), 1)
        return Period("month", raw, start, month_end(start), today, sm)
    q = _QUARTER.match(raw)
    if q:
        year = int(q.group(1))
        _check_year(year)
        start = add_months(date(year, sm, 1), 3 * (int(q.group(2)) - 1))
        end = add_months(start, 3) - timedelta(days=1)
        return Period("quarter", f"{year}-Q{q.group(2)}", start, end, today, sm)
    f = _FY.match(raw)
    if f:
        year = int(f.group(1))
        _check_year(year)
        start, end = fiscal_year_bounds(date(year, sm, 1), sm)
        return Period("year", f"FY{year}", start, end, today, sm)
    raise ValueError("period must look like 2026-11 (month), 2026-Q2 (quarter) or FY2026 (financial year)")


def history_window(period: Period, months: int) -> tuple[date, date]:
    """The `months` closed months before the current month (3-month average)."""
    cur = period.current_month
    return add_months(cur, -months), cur - timedelta(days=1)
