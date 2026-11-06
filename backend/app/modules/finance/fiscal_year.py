"""Per-tenant financial year (Tally-style: no year-end closing entry needed).

The start month lives in `tenants.feature_flags["fiscal_year_start_month"]` (1-12, default 1).
A financial year is labelled by the calendar year it starts in:
    start_month=7, 2026-07-01 .. 2027-06-30  -> fiscal year 2026, label "2026-27"
    start_month=1, 2026-01-01 .. 2026-12-31  -> fiscal year 2026, label "2026"
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import FISCAL_YEAR_START_MONTH


def fy_start_month(feature_flags: Any) -> int:
    if not isinstance(feature_flags, dict):
        return 1
    try:
        m = int(feature_flags.get(FISCAL_YEAR_START_MONTH) or 1)
    except (TypeError, ValueError):
        return 1
    return m if 1 <= m <= 12 else 1


def fiscal_year_of(d: date, start_month: int = 1) -> int:
    return d.year if d.month >= start_month else d.year - 1


def fiscal_year_bounds(d: date, start_month: int = 1) -> tuple[date, date]:
    fy = fiscal_year_of(d, start_month)
    start = date(fy, start_month, 1)
    next_start = date(fy + 1, start_month, 1)
    return start, next_start - timedelta(days=1)


def fiscal_year_label(fy: int, start_month: int = 1) -> str:
    return str(fy) if start_month == 1 else f"{fy}-{str(fy + 1)[-2:]}"


def fiscal_year_info(d: date, start_month: int = 1) -> dict[str, Any]:
    start, end = fiscal_year_bounds(d, start_month)
    fy = fiscal_year_of(d, start_month)
    return {
        "fiscal_year": fy,
        "label": fiscal_year_label(fy, start_month),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "start_month": start_month,
    }


def fiscal_year_bounds_from_label(label: Any, start_month: int = 1) -> tuple[date, date] | None:
    """Start/end dates for a stored fiscal-year label such as "2026" or "2026-27".

    The leading 4-digit number is the calendar year the financial year starts in.
    Returns None when the label has no usable year (old free-text budgets).
    """
    text = str(label or "").strip()
    if len(text) < 4 or not text[:4].isdigit():
        return None
    year = int(text[:4])
    if year < 1900 or year > 9998:
        return None
    return fiscal_year_bounds(date(year, start_month, 1), start_month)


async def tenant_fy_start_month(db: AsyncSession, tenant_id: int) -> int:
    from app.models import Tenant

    tenant = await db.get(Tenant, tenant_id)
    return fy_start_month(tenant.feature_flags if tenant else None)
