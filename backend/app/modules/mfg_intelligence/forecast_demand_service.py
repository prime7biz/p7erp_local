"""Forecast demand layer (Manufacturing Intelligence Phase 5; doc 16 D8, D9, 4.4, 15.5). Read-only, no money.

Seasonal naive, style family level (`garment_styles.product_type`, never buyer):
    A(m, fam)  = sum of order qty x SMV of orders whose ex-factory month (`orders.delivery_date`) is m,
                 status not CANCELLED / DRAFT (unknown-SMV orders left out; coverage % shown)
    F(m, fam)  = A(m - 12, fam)
    consumed   = A(m, fam) + counted tentative bookings (full minutes, by booking end month)
    residual   = max(0, F - consumed)    label FORECAST_AT_EXFACTORY_MONTH; never part of confirmed
Availability per family: the tenant has >= 12 complete months of order history (earliest ex-factory month at least 12
months before the current month) AND the family has orders in >= 6 of the last 12 complete months; otherwise
INSUFFICIENT_HISTORY (no forecast for that family). No trend.
Placement: the residual of month m is spread evenly over the working days of m from max(month start, today); days after
the horizon end are counted as beyond the horizon.
Query budget: earliest month 1, monthly history 1 (<= 20,000 groups), styles 1, SMV <= 3.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, Order
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.empirical_efficiency_service import FAMILY_UNSPECIFIED, family_of
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows

METHOD = "SEASONAL_NAIVE_12M"
LABEL = "FORECAST_AT_EXFACTORY_MONTH"
MIN_TENANT_MONTHS = 12
MIN_FAMILY_MONTHS = 6
MAX_GROUPS = 20000
EXCLUDED_ORDER_STATUSES = ("CANCELLED", "DRAFT")
AVAILABLE = "AVAILABLE"
INSUFFICIENT = "INSUFFICIENT_HISTORY"
UNAVAILABLE = "UNAVAILABLE"

ASSUMPTIONS = [
    "Forecast = the same month last year (seasonal naive) per style family, from orders by ex-factory month.",
    "Orders that are CANCELLED or DRAFT are not history; orders with unknown SMV are left out (see coverage).",
    "Confirmed orders and counted tentative bookings of a month consume its forecast; only the rest is shown.",
    "A family needs 12 months of company history and orders in at least 6 of the last 12 months.",
    "The forecast residual is never confirmed demand and is not in the base scenario.",
]

Month = tuple[int, int]


def add_months(m: Month, k: int) -> Month:
    idx = m[0] * 12 + (m[1] - 1) + k
    return idx // 12, idx % 12 + 1


def month_start(m: Month) -> date:
    return date(m[0], m[1], 1)


def month_end(m: Month) -> date:
    nxt = add_months(m, 1)
    return date(nxt[0], nxt[1], 1) - timedelta(days=1)


def month_key(m: Month) -> str:
    return f"{m[0]:04d}-{m[1]:02d}"


@dataclass
class ForecastResult:
    today: date
    end: date
    months: list[Month]
    tenant_history_months: int
    tenant_history_ok: bool
    family_months_with_orders: dict[str, int]
    availability: dict[str, str]
    forecast: dict[tuple[Month, str], Decimal] = field(default_factory=dict)
    consumed: dict[tuple[Month, str], Decimal] = field(default_factory=dict)
    residual: dict[tuple[Month, str], Decimal] = field(default_factory=dict)
    coverage_pct: Decimal | None = None
    notices: list[str] = field(default_factory=list)

    @property
    def available(self) -> bool:
        return any(v == AVAILABLE for v in self.availability.values())


async def load_forecast(
    db: AsyncSession,
    tenant_id: int,
    *,
    today: date,
    end: date,
    use_style_standard: bool,
    tentative_rows: list[dict[str, Any]] | None = None,
) -> ForecastResult:
    cur: Month = (today.year, today.month)
    last: Month = (end.year, end.month)
    months: list[Month] = []
    m = cur
    while m <= last:
        months.append(m)
        m = add_months(m, 1)
    hist_from = add_months(cur, -MIN_TENANT_MONTHS)
    status = func.upper(func.trim(Order.status))
    base = (Order.tenant_id == tenant_id, status.notin_(EXCLUDED_ORDER_STATUSES), Order.delivery_date.isnot(None))

    earliest = (await db.execute(select(func.min(Order.delivery_date)).where(*base))).scalar_one_or_none()
    history_months = 0
    if earliest is not None:
        history_months = max(0, (cur[0] * 12 + cur[1]) - (earliest.year * 12 + earliest.month))
    tenant_ok = history_months >= MIN_TENANT_MONTHS

    y, mo = extract("year", Order.delivery_date), extract("month", Order.delivery_date)
    groups = list(
        (
            await db.execute(
                select(y, mo, Order.style_id, func.coalesce(func.sum(Order.quantity), 0))
                .where(*base, Order.delivery_date >= month_start(hist_from), Order.delivery_date <= month_end(last))
                .group_by(y, mo, Order.style_id)
                .order_by(y, mo, Order.style_id)
                .limit(MAX_GROUPS + 1)
            )
        ).all()
    )
    notices: list[str] = []
    if len(groups) > MAX_GROUPS:
        groups = groups[:MAX_GROUPS]
        notices.append(f"FORECAST_HISTORY_TRUNCATED: only the first {MAX_GROUPS} month x style groups were used")
    style_ids = {int(g[2]) for g in groups if g[2] is not None} | {
        int(t["style_id"]) for t in (tentative_rows or []) if t.get("style_id")
    }
    families: dict[int, str] = {}
    if style_ids:
        for sid, ptype in (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.product_type).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.id.in_(sorted(style_ids))
                )
            )
        ).all():
            families[int(sid)] = family_of(ptype)
    smv_rows = [SimpleNamespace(id=sid, style_id=sid, ob_id=None, smv_per_piece=None) for sid in sorted(style_ids)]
    smv = await resolve_smv_for_rows(db, tenant_id, smv_rows, use_style_standard=use_style_standard) if smv_rows else {}

    actual: dict[tuple[Month, str], Decimal] = {}
    months_with_orders: dict[str, set[Month]] = {}
    hist_window = {add_months(cur, -k) for k in range(1, 13)}
    total_qty = known_qty = ZERO
    source_months = {add_months(mm, -12) for mm in months}
    for gy, gm, sid, qty in groups:
        month: Month = (int(gy), int(gm))
        q = to_dec(qty) or ZERO
        fam = families.get(int(sid), FAMILY_UNSPECIFIED) if sid is not None else FAMILY_UNSPECIFIED
        if month in hist_window and q > ZERO:
            months_with_orders.setdefault(fam, set()).add(month)
        value = smv[int(sid)].value if sid is not None and int(sid) in smv else None
        if month in source_months:
            total_qty += q
            if value is not None:
                known_qty += q
        if value is None:
            continue
        key = (month, fam)
        actual[key] = actual.get(key, ZERO) + quant(q * value, 4)

    result = ForecastResult(
        today=today, end=end, months=months, tenant_history_months=history_months, tenant_history_ok=tenant_ok,
        family_months_with_orders={f: len(v) for f, v in sorted(months_with_orders.items())},
        availability={}, notices=notices,
    )
    result.coverage_pct = quant(known_qty / total_qty * Decimal(100), 2) if total_qty > ZERO else None
    all_families = set(months_with_orders) | {fam for (_m, fam) in actual}
    for fam in sorted(all_families):
        ok = tenant_ok and len(months_with_orders.get(fam, set())) >= MIN_FAMILY_MONTHS
        result.availability[fam] = AVAILABLE if ok else INSUFFICIENT
    tentative_by_key: dict[tuple[Month, str], Decimal] = {}
    for t in tentative_rows or []:
        d: date = t["end_date"]
        fam = families.get(int(t["style_id"]), FAMILY_UNSPECIFIED) if t.get("style_id") else FAMILY_UNSPECIFIED
        key = ((d.year, d.month), fam)
        tentative_by_key[key] = tentative_by_key.get(key, ZERO) + (t.get("minutes") or ZERO)
    for fam, state in result.availability.items():
        if state != AVAILABLE:
            continue
        for mm in months:
            f = actual.get((add_months(mm, -12), fam), ZERO)
            consumed = actual.get((mm, fam), ZERO) + tentative_by_key.get((mm, fam), ZERO)
            result.forecast[(mm, fam)] = f
            result.consumed[(mm, fam)] = consumed
            result.residual[(mm, fam)] = max(ZERO, f - consumed)
    return result


def residual_days(
    result: ForecastResult, calendar: CalendarContext, *, today: date, end: date
) -> tuple[dict[tuple[Month, str], dict[date, Decimal]], Decimal]:
    """Residual minutes per (month, family) per day inside the horizon, plus the minutes beyond the horizon."""
    from app.modules.mfg_intelligence.demand_layers import spread_even

    out: dict[tuple[Month, str], dict[date, Decimal]] = {}
    beyond = ZERO
    for key, minutes in sorted(result.residual.items()):
        if minutes <= ZERO:
            continue
        mm = key[0]
        first = max(month_start(mm), today)
        days = calendar.working_days(first, month_end(mm))
        if not days:
            d = calendar.first_working_on_or_after(first)
            days = [d] if d is not None else [first]
        alloc = spread_even(minutes, days)
        out[key] = {d: m for d, m in alloc.items() if d <= end}
        beyond += sum((m for d, m in alloc.items() if d > end), ZERO)
    return out, beyond


def forecast_payload(result: ForecastResult, horizon_days: int) -> dict[str, Any]:
    families_out = []
    for fam, state in sorted(result.availability.items()):
        months_out = []
        if state == AVAILABLE:
            for mm in result.months:
                months_out.append({
                    "month": month_key(mm),
                    "forecast_minutes": dec_str(result.forecast.get((mm, fam))),
                    "consumed_minutes": dec_str(result.consumed.get((mm, fam))),
                    "residual_minutes": dec_str(result.residual.get((mm, fam))),
                })
        families_out.append({
            "family": fam,
            "availability": state,
            "months_with_orders": result.family_months_with_orders.get(fam, 0),
            "residual_total_minutes": dec_str(sum((result.residual.get((mm, fam), ZERO) for mm in result.months), ZERO))
            if state == AVAILABLE else None,
            "months": months_out,
            "reason_codes": [] if state == AVAILABLE else [INSUFFICIENT],
        })
    availability = AVAILABLE if result.available else UNAVAILABLE
    reasons = [] if result.available else [INSUFFICIENT]
    return {
        "as_of": result.today,
        "date_from": result.today,
        "date_to": result.end,
        "horizon_days": horizon_days,
        "method": METHOD,
        "label": LABEL,
        "availability": availability,
        "tenant_history_months": result.tenant_history_months,
        "tenant_history_sufficient": result.tenant_history_ok,
        "coverage_pct": dec_str(result.coverage_pct),
        "months": [month_key(mm) for mm in result.months],
        "families": families_out,
        "reason_codes": reasons,
        "notices": list(result.notices),
        "assumptions": list(ASSUMPTIONS),
    }
