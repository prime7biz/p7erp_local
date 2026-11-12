"""Fact catalog: every figure the commentary may mention, computed by the committed finance services.

A fact has a stable id, a short label, a Decimal value and a unit (currency | percent | count | days | ratio).
Each metric is stored as `<key>_current` and, with a comparison, `<key>_previous`, `<key>_change` and (when the
previous value is not zero) `<key>_change_pct`. The catalog is bounded by MAX_FACTS and holds no ledger or party names
beyond the group / cost-centre / account labels that the reports themselves show (top rows only).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Awaitable, Callable

from fastapi import HTTPException

from app.common.business_date import today_local
from app.models import Tenant
from app.modules.finance.ai_insights.constants import (
    MAX_FACTS,
    MAX_LABEL_CHARS,
    MAX_ROWS_PER_GROUP,
    RATIO_BAD_UP,
    RATIO_GOOD_UP,
)
from app.modules.finance.budget_analytics.analytics_service import build_budget_analytics
from app.modules.finance.budget_analytics.expense_service import build_expense_analysis
from app.modules.finance.control.control_tower_service import build_control_tower
from app.modules.finance.fiscal_year import fiscal_year_label, fiscal_year_of, fy_start_month
from app.modules.finance.statements.balance_sheet_service import build_balance_sheet
from app.modules.finance.statements.cash_flow_service import build_cash_flow
from app.modules.finance.statements.funds_flow_service import build_funds_flow
from app.modules.finance.statements.profit_loss_service import build_profit_loss
from app.modules.finance.statements.ratio_service import build_ratio_analysis
from app.modules.finance.statements.trial_balance_service import build_trial_balance

ZERO = Decimal("0")
HUNDRED = Decimal("100")
_Q4 = Decimal("0.0001")


def q4(value: Decimal) -> Decimal:
    return Decimal(value).quantize(_Q4, rounding=ROUND_HALF_UP)


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")[:40] or "x"


def clip_label(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= MAX_LABEL_CHARS else text[: MAX_LABEL_CHARS - 1] + "…"


# ---- data holders ----------------------------------------------------------------------------------------
@dataclass
class MetricSpec:
    key: str
    label: str
    unit: str
    value: Decimal
    kind: str = ""  # headline | margin | cost | good_up | bad_up | alert | warning | ""
    group: str = ""  # rows of one group are capped at MAX_ROWS_PER_GROUP
    severity: str = ""  # alerts only: high | medium | low


@dataclass
class MetricMeta:
    key: str
    label: str
    unit: str
    kind: str
    severity: str
    cur_id: str
    prev_id: str | None = None
    change_id: str | None = None
    pct_id: str | None = None


@dataclass
class FactRow:
    id: str
    label: str
    value: Decimal
    unit: str

    def value_text(self) -> str:
        return str(int(self.value)) if self.unit == "count" else format(q4(self.value), "f")


class FactBook:
    """Bounded, ordered fact catalog."""

    def __init__(self, comparison_label: str | None) -> None:
        self.comparison_label = comparison_label  # "previous period" | "previous year" | None
        self.rows: dict[str, FactRow] = {}
        self.metrics: list[MetricMeta] = []

    def _room(self, n: int) -> bool:
        return len(self.rows) + n <= MAX_FACTS

    def _add(self, fid: str, label: str, value: Decimal, unit: str) -> None:
        self.rows[fid] = FactRow(fid, clip_label(label), Decimal(value), unit)

    def add_metric(self, cur: MetricSpec, prev: MetricSpec | None) -> bool:
        key = cur.key
        if any(m.key == key for m in self.metrics):
            return True
        has_prev = prev is not None and self.comparison_label is not None
        needed = 1 + (3 if has_prev else 0)
        if not self._room(needed):
            return False
        meta = MetricMeta(key, clip_label(cur.label), cur.unit, cur.kind, cur.severity, f"{key}_current")
        self._add(meta.cur_id, f"{cur.label} - current", cur.value, cur.unit)
        if has_prev and prev is not None:
            change = cur.value - prev.value
            meta.prev_id, meta.change_id = f"{key}_previous", f"{key}_change"
            self._add(meta.prev_id, f"{cur.label} - {self.comparison_label}", prev.value, cur.unit)
            self._add(meta.change_id, f"{cur.label} - change vs {self.comparison_label}", change, cur.unit)
            if cur.unit != "percent" and prev.value != ZERO and cur.unit != "ratio":
                meta.pct_id = f"{key}_change_pct"
                self._add(
                    meta.pct_id,
                    f"{cur.label} - change % vs {self.comparison_label}",
                    change / abs(prev.value) * HUNDRED,
                    "percent",
                )
        self.metrics.append(meta)
        return True

    def value(self, fid: str | None) -> Decimal | None:
        row = self.rows.get(fid) if fid else None
        return row.value if row else None

    def as_list(self) -> list[FactRow]:
        return list(self.rows.values())


def merge_metrics(book: FactBook, current: list[MetricSpec], previous: list[MetricSpec] | None) -> None:
    prev = {s.key: s for s in previous or []}
    counts: dict[str, int] = {}
    for spec in current:
        if spec.group:
            seen = counts.get(spec.group, 0)
            if seen >= MAX_ROWS_PER_GROUP:
                continue
            counts[spec.group] = seen + 1
        if not book.add_metric(spec, prev.get(spec.key)):
            break


# ---- periods ---------------------------------------------------------------------------------------------
def _minus_one_year(d: date) -> date:
    if d.year <= 1:
        raise ValueError("The comparison period is out of range")
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # 29 February
        return d.replace(year=d.year - 1, day=28)


@dataclass
class Periods:
    cur_from: date
    cur_to: date
    fiscal_year: int
    comparison: str
    today: date
    prev_from: date | None = None
    prev_to: date | None = None
    prev_fiscal_year: int | None = None

    @property
    def has_prev(self) -> bool:
        return self.comparison != "none"

    @property
    def comparison_label(self) -> str | None:
        return {"previous_period": "previous period", "previous_year": "previous year"}.get(self.comparison)


def resolve_periods(
    tenant: Tenant, *, from_date: date | None, to_date: date | None, fiscal_year: int | None, comparison: str
) -> Periods:
    # Same range rules as the statements API (422 on a bad range).
    from app.modules.finance.statements.router import _fiscal_range

    start, end = _fiscal_range(tenant, from_date, to_date, fiscal_year)
    sm = fy_start_month(tenant.feature_flags)
    fy = fiscal_year if fiscal_year is not None else fiscal_year_of(end, sm)
    periods = Periods(cur_from=start, cur_to=end, fiscal_year=fy, comparison=comparison, today=today_local(tenant))
    if comparison == "none":
        return periods
    try:
        if comparison == "previous_year":
            periods.prev_from, periods.prev_to = _minus_one_year(start), _minus_one_year(end)
        else:
            length = (end - start).days + 1
            periods.prev_to = start - timedelta(days=1)
            periods.prev_from = periods.prev_to - timedelta(days=length - 1)
    except OverflowError:
        raise ValueError("The comparison period is out of range") from None
    periods.prev_fiscal_year = fy - 1
    return periods


# ---- extractors (response -> metric specs) ---------------------------------------------------------------
def _warning_specs(resp: Any) -> list[MetricSpec]:
    out: list[MetricSpec] = []
    for w in getattr(resp, "warnings", None) or []:
        if w.code == "UNCLASSIFIED_GROUPS":
            out.append(MetricSpec("unclassified_amount", "Amount in unclassified account groups", "currency", w.amount, "warning"))
            out.append(MetricSpec("unclassified_groups", "Unclassified account groups", "count", Decimal(w.count), "warning"))
    rec = getattr(resp, "reconciliation", None)
    if rec is not None and not rec.balanced:
        out.append(MetricSpec("reconciliation_difference", "Reconciliation difference (should be zero)", "currency", rec.difference, "warning"))
    return out


def _unique(keys: set[str], base: str) -> str:
    key, n = base, 2
    while key in keys:
        key, n = f"{base}_{n}", n + 1
    keys.add(key)
    return key


def _node_specs(nodes: list[Any], prefix: str, label_suffix: str, kind: str, group: str) -> list[MetricSpec]:
    keys: set[str] = set()
    rows = [n for n in nodes if n.row_type != "result" and n.outer_amount is not None]
    rows.sort(key=lambda n: abs(n.outer_amount), reverse=True)
    return [
        MetricSpec(_unique(keys, f"{prefix}_{slug(n.name)}"), f"{n.name} {label_suffix}".strip(), "currency", n.outer_amount, kind, group)
        for n in rows
    ]


def extract_trial_balance(resp: Any) -> list[MetricSpec]:
    t = resp.totals
    specs = [
        MetricSpec("tb_period_debit", "Total period debits", "currency", t.period_debit, "headline"),
        MetricSpec("tb_period_credit", "Total period credits", "currency", t.period_credit, "headline"),
        MetricSpec("tb_closing_debit", "Total closing debit balances", "currency", t.closing_debit),
        MetricSpec("tb_closing_credit", "Total closing credit balances", "currency", t.closing_credit),
    ]
    keys: set[str] = set()
    for row in resp.rows:
        if row.row_type == "primary":
            net = row.closing_debit - row.closing_credit
            specs.append(
                MetricSpec(_unique(keys, f"tb_{slug(row.name)}"), f"{row.name} closing balance (debit positive)", "currency", net, "", "rows")
            )
    return specs + _warning_specs(resp)


def extract_balance_sheet(resp: Any) -> list[MetricSpec]:
    specs = [
        MetricSpec("bs_assets", "Total assets", "currency", resp.totals.assets, "headline"),
        MetricSpec("bs_liabilities", "Total liabilities and capital", "currency", resp.totals.liabilities, "headline"),
        MetricSpec("bs_result_to_date", "Profit or loss of the year to date", "currency", resp.profit_and_loss.current_period, "headline"),
    ]
    specs += _node_specs(resp.assets, "bs_asset", "(assets)", "", "assets")
    specs += _node_specs(resp.liabilities, "bs_liab", "(liabilities)", "", "liabilities")
    return specs + _warning_specs(resp)


def extract_profit_loss(resp: Any) -> list[MetricSpec]:
    trading, pl = resp.trading, resp.profit_and_loss
    revenue = sum((n.outer_amount or ZERO for n in trading.credit_rows if n.row_type != "result"), ZERO)
    direct = sum((n.outer_amount or ZERO for n in trading.debit_rows if n.row_type != "result"), ZERO)
    gross = trading.gross_result.amount if trading.gross_result.kind == "profit" else -trading.gross_result.amount
    nett = pl.nett_result.amount if pl.nett_result.kind == "profit" else -pl.nett_result.amount
    indirect_exp = sum((n.outer_amount or ZERO for n in pl.debit_rows if n.row_type != "result"), ZERO)
    indirect_inc = sum((n.outer_amount or ZERO for n in pl.credit_rows if n.row_type != "result"), ZERO)
    specs = [
        MetricSpec("pl_revenue", "Sales and direct income", "currency", revenue, "headline"),
        MetricSpec("pl_direct_costs", "Direct costs (cost of sales)", "currency", direct),
        MetricSpec("pl_gross_result", "Gross profit (loss is negative)", "currency", gross, "headline"),
    ]
    if revenue > ZERO:
        specs.append(MetricSpec("gross_margin", "Gross margin", "percent", gross / revenue * HUNDRED, "margin"))
    specs += [
        MetricSpec("pl_indirect_expenses", "Indirect expenses", "currency", indirect_exp),
        MetricSpec("pl_indirect_income", "Indirect income", "currency", indirect_inc),
        MetricSpec("pl_nett_result", "Nett profit (loss is negative)", "currency", nett, "headline"),
    ]
    if revenue > ZERO:
        specs.append(MetricSpec("net_margin", "Nett margin", "percent", nett / revenue * HUNDRED, "margin"))
    specs += _node_specs(list(trading.debit_rows) + list(pl.debit_rows), "cost", "(cost bucket)", "cost", "cost")
    return specs + _warning_specs(resp)


def extract_cash_flow(resp: Any) -> list[MetricSpec]:
    g = resp.grand_total
    specs = [
        MetricSpec("cash_opening", "Opening cash and bank", "currency", resp.opening_cash),
        MetricSpec("cash_inflow", "Cash inflow for the year", "currency", g.inflow, "headline"),
        MetricSpec("cash_outflow", "Cash outflow for the year", "currency", g.outflow, "headline"),
        MetricSpec("cash_nett_flow", "Nett cash flow for the year", "currency", g.nett_flow, "headline"),
        MetricSpec("cash_closing", "Closing cash and bank", "currency", g.closing_cash, "headline"),
        MetricSpec("cash_bank_od", "Bank overdraft in the pool at year end", "currency", resp.closing_pool.bank_od, "bad_up"),
    ]
    months = [m for m in resp.months if (m.inflow != ZERO or m.outflow != ZERO)]
    if months:
        worst = min(months, key=lambda m: m.nett_flow)
        specs.append(MetricSpec("cash_weakest_month_flow", f"Nett cash flow of the weakest month ({worst.label})", "currency", worst.nett_flow))
    negative = sum(1 for m in resp.months if m.closing_cash < ZERO)
    specs.append(MetricSpec("cash_negative_months", "Months ending with negative cash", "count", Decimal(negative), "bad_up"))
    return specs + _warning_specs(resp)


def extract_funds_flow(resp: Any) -> list[MetricSpec]:
    g = resp.grand_total
    specs = [
        MetricSpec("ff_wc_opening", "Working capital at the start of the year", "currency", g.working_capital_opening),
        MetricSpec("ff_wc_closing", "Working capital at year end", "currency", g.working_capital_closing, "headline"),
        MetricSpec("ff_funds_flow", "Funds flow for the year", "currency", g.funds_flow, "headline"),
    ]
    if resp.months:
        last = resp.months[-1]
        specs += [
            MetricSpec("ff_current_assets", "Current assets at the last month end", "currency", last.current_assets_closing),
            MetricSpec("ff_current_liabilities", "Current liabilities at the last month end", "currency", last.current_liabilities_closing),
        ]
    return specs + _warning_specs(resp)


_RATIO_UNIT = {"ratio": "ratio", "times": "ratio", "percent": "percent", "days": "days"}


def extract_ratios(resp: Any) -> list[MetricSpec]:
    specs: list[MetricSpec] = []
    for r in resp.principal_ratios:
        if r.value is None:
            continue
        kind = "good_up" if r.code in RATIO_GOOD_UP else "bad_up" if r.code in RATIO_BAD_UP else ""
        specs.append(MetricSpec(f"ratio_{slug(r.code)}", r.label, _RATIO_UNIT.get(r.unit, "ratio"), r.value, kind, "ratios"))
    return specs + _warning_specs(resp)


def extract_budget(resp: Any) -> list[MetricSpec]:
    t = resp.totals
    specs = [
        MetricSpec("ba_budget", "Total budget", "currency", t.budget, "headline"),
        MetricSpec("ba_actual", "Total actual spend", "currency", t.actual, "headline"),
        MetricSpec("ba_variance", "Budget minus actual (negative = overspent)", "currency", t.variance),
    ]
    if t.used_percent is not None:
        specs.append(MetricSpec("ba_used_percent", "Budget used", "percent", t.used_percent, "bad_up"))
    over = sum(1 for r in resp.rows if r.status in ("over", "critical"))
    specs.append(MetricSpec("ba_over_count", "Cost centres at or over 100% of budget", "count", Decimal(over), "alert", severity="high"))
    keys: set[str] = set()
    rows = sorted(resp.rows, key=lambda r: abs(r.actual), reverse=True)
    for r in rows:
        base = _unique(keys, f"ba_{slug(r.label)}")
        specs.append(MetricSpec(f"{base}_actual", f"{r.label} actual spend", "currency", r.actual, "", "rows"))
    return specs


def extract_expense(resp: Any) -> list[MetricSpec]:
    specs = [MetricSpec("exp_total", "Total expenses", "currency", resp.total_current, "headline")]
    keys: set[str] = set()
    for c in resp.by_class:
        specs.append(MetricSpec(_unique(keys, f"exp_class_{slug(c.statement_class)}"), f"{c.statement_class} expenses", "currency", c.current, "cost", "classes"))
    rows = sorted(resp.rows, key=lambda r: abs(r.current), reverse=True)
    for r in rows:
        specs.append(MetricSpec(_unique(keys, f"exp_{slug(r.label)}"), f"{r.label} expenses", "currency", r.current, "cost", "rows"))
    for w in resp.warnings:
        specs.append(MetricSpec(f"exp_warn_{slug(w.code)}", w.message, "currency", w.current, "warning"))
    return specs


def extract_control_tower(resp: Any) -> list[MetricSpec]:
    specs: list[MetricSpec] = []
    for card in resp.cards:
        if card.count <= 0 or (card.note and "could not be calculated" in card.note):
            continue
        code = slug(card.code)
        specs.append(MetricSpec(f"ct_{code}_count", card.label, "count", Decimal(card.count), "alert", severity=card.severity))
        if card.amount != ZERO:
            specs.append(MetricSpec(f"ct_{code}_amount", f"{card.label} - amount", "currency", card.amount))
    return specs


# ---- fetchers --------------------------------------------------------------------------------------------
def _fy_label(tenant: Tenant, fy: int) -> str:
    return fiscal_year_label(fy, fy_start_month(tenant.feature_flags))


Fetcher = Callable[[Any, Tenant, Periods, bool], Awaitable[Any]]


async def _f_tb(db, tenant, p: Periods, prev: bool):
    a, b = (p.prev_from, p.prev_to) if prev else (p.cur_from, p.cur_to)
    return await build_trial_balance(db, tenant, from_date=a, to_date=b)


async def _f_bs(db, tenant, p: Periods, prev: bool):
    return await build_balance_sheet(db, tenant, as_of_date=p.prev_to if prev else p.cur_to)


async def _f_pl(db, tenant, p: Periods, prev: bool):
    a, b = (p.prev_from, p.prev_to) if prev else (p.cur_from, p.cur_to)
    return await build_profit_loss(db, tenant, from_date=a, to_date=b)


async def _f_cash(db, tenant, p: Periods, prev: bool):
    return await build_cash_flow(db, tenant, fiscal_year=p.prev_fiscal_year if prev else p.fiscal_year, today=p.today)


async def _f_funds(db, tenant, p: Periods, prev: bool):
    return await build_funds_flow(db, tenant, fiscal_year=p.prev_fiscal_year if prev else p.fiscal_year, today=p.today)


async def _f_ratio(db, tenant, p: Periods, prev: bool):
    a, b = (p.prev_from, p.prev_to) if prev else (p.cur_from, p.cur_to)
    return await build_ratio_analysis(db, tenant, from_date=a, to_date=b)


async def _f_budget(db, tenant, p: Periods, prev: bool):
    fy = p.prev_fiscal_year if prev else p.fiscal_year
    return await build_budget_analytics(db, tenant, fiscal_year=_fy_label(tenant, fy), budget_id=None, dimension="cost_center")


async def _f_expense(db, tenant, p: Periods, prev: bool):
    a, b = (p.prev_from, p.prev_to) if prev else (p.cur_from, p.cur_to)
    return await build_expense_analysis(db, tenant, from_date=a, to_date=b, group_by="account")


async def _f_control(db, tenant, p: Periods, prev: bool):
    return await build_control_tower(db, tenant, as_of=p.cur_to, severity="all")


REPORT_TABLE: dict[str, tuple[Fetcher, Callable[[Any], list[MetricSpec]]]] = {
    "trial_balance": (_f_tb, extract_trial_balance),
    "balance_sheet": (_f_bs, extract_balance_sheet),
    "profit_loss": (_f_pl, extract_profit_loss),
    "cash_flow_monthly": (_f_cash, extract_cash_flow),
    "funds_flow_monthly": (_f_funds, extract_funds_flow),
    "ratio_analysis": (_f_ratio, extract_ratios),
    "budget_analytics": (_f_budget, extract_budget),
    "expense_analysis": (_f_expense, extract_expense),
    "control_tower": (_f_control, extract_control_tower),
}
NO_COMPARISON_REPORTS = frozenset({"control_tower"})


@dataclass
class ReportFacts:
    book: FactBook
    base_currency: str
    data_as_of: datetime
    notes: list[str] = field(default_factory=list)


async def build_report_facts(db: Any, tenant: Tenant, report: str, periods: Periods) -> ReportFacts:
    """Run the deterministic service(s) and fill the fact catalog. ValueError / LookupError / HTTPException pass through
    for the CURRENT period; a failing comparison period only drops the comparison (and says so in `notes`)."""
    fetch, extract = REPORT_TABLE[report]
    notes: list[str] = []
    current = await fetch(db, tenant, periods, False)
    previous_specs: list[MetricSpec] | None = None
    comparison_label = periods.comparison_label
    if periods.has_prev and report in NO_COMPARISON_REPORTS:
        notes.append("This report is a point-in-time check; no comparison was applied.")
        comparison_label = None
    elif periods.has_prev:
        try:
            previous_specs = extract(await fetch(db, tenant, periods, True))
        except HTTPException:
            raise
        except (ValueError, LookupError):
            notes.append("The comparison period could not be computed; only the current period is described.")
            comparison_label = None
    book = FactBook(comparison_label)
    merge_metrics(book, extract(current), previous_specs)
    return ReportFacts(
        book=book,
        base_currency=getattr(current, "base_currency", None) or "BDT",
        data_as_of=getattr(current, "data_as_of", None) or datetime.utcnow(),
        notes=notes,
    )
