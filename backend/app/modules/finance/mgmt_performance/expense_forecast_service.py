"""Operating expense forecast per cost centre x management category (binding rules:
docs/management-performance/02-plan-audit-resolutions.md, "Status rules", "Budget data", "Committed cost").

Per month of the period (all Decimal, base currency):
    actual     posted, in-books voucher lines on expense accounts, signed like budget vs actual
               (`budget_analytics.common.signed_amount_sql`); DIRECT_* and EXCLUDED accounts are never opex
    budget     FINAL budgets of the financial year; quarter / year lines split evenly over their months
               (`line_months` + `spread_amount`, same as Budget Analytics)
    committed  (a) loan interest of repayment-schedule lines due in the month (active utilizations), unless a
                   posted (accrued) interest accrual exists for that utilization and month   -> FINANCE_COST
               (b) open, non-order PO lines (APPROVED / PARTIALLY_RECEIVED) whose item stock group purchase account
                   maps to an operating category; open qty = ordered - accepted received; at the PO expected date
                   (overdue / undated -> current month). Order-linked POs never count (they are product material).
    history    average of the 3 closed months before the current month
    forecast   past month: actual
               current month: actual + max(committed, base x days left / days in month)
               future month:  max(committed, base)
               base = budget when > 0, else history average, else 0
    payroll    current / future month: company projection (payroll_forecast_service); rows of PAYROLL get
               actual + (max(total actual, projection) - total actual) x share (budget share, else actual share,
               else one company row)
Status on period totals: FAILED actual > budget; AT_RISK forecast > budget; WARNING forecast or actual + committed
>= warning % of budget, or (single current month) run-rate > budget; UNBUDGETED no budget but spend; OK.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facility import FacilityUtilization, InterestAccrual, RepaymentScheduleLine
from app.models.finance import CostCenter, VoucherLine, Voucher
from app.models.costing import Item
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem, StockGroup
from app.models.mgmt_performance import MgmtCategoryThreshold
from app.modules.finance.budget_analytics.common import (
    ZERO,
    in_books_conditions,
    join_lines,
    line_months,
    month_end,
    month_key,
    q4,
    resolve_scope,
    signed_amount_sql,
    spread_amount,
    universe_clause,
)
from app.modules.finance.mgmt_performance.access import ViewerScope
from app.modules.finance.mgmt_performance.category_map import CategoryResolver, load_resolver
from app.modules.finance.mgmt_performance.constants import (
    CATEGORY_LABELS,
    DEFAULT_WARNING_PCT,
    DIRECT_CATEGORIES,
    EXCLUDED_CATEGORY,
    HISTORY_MONTHS,
    HUNDRED,
    OPERATING_CATEGORIES,
    SRC_ACTUAL_ONLY,
    SRC_BUDGET,
    SRC_COMMITTED,
    SRC_COMMITTED_WITHIN_BUDGET,
    SRC_HISTORY,
    SRC_PAYROLL,
    STATUS_AT_RISK,
    STATUS_FAILED,
    STATUS_OK,
    STATUS_UNBUDGETED,
    STATUS_UNMAPPED,
    STATUS_WARNING,
)
from app.modules.finance.mgmt_performance.payroll_forecast_service import PayrollProjection, payroll_projection
from app.modules.finance.mgmt_performance.periods import Period, history_window
from app.modules.inventory.open_po_supply_service import usable_received_qty
from app.modules.mfg_intelligence.money import base_currency, fx

OPEN_PO_STATUSES = ("APPROVED", "PARTIALLY_RECEIVED")
OPEN_SCHEDULE_STATUSES = ("upcoming", "due", "overdue", "partially_paid")
MAX_PO_LINES = 20000
MAX_BUDGET_LINE_IDS = 50

Key = tuple[int | None, str]  # (cost centre id, category)


@dataclass
class Cell:
    actual: Decimal = ZERO
    budget: Decimal = ZERO
    committed: Decimal = ZERO
    forecast: Decimal = ZERO
    source: str | None = None


@dataclass
class Row:
    cost_center_id: int | None
    category: str
    months: dict[date, Cell] = field(default_factory=lambda: defaultdict(Cell))
    history_avg: Decimal = ZERO
    budget_line_ids: list[int] = field(default_factory=list)

    def total(self, attr: str) -> Decimal:
        return sum((getattr(c, attr) for c in self.months.values()), ZERO)

    @property
    def sources(self) -> list[str]:
        return sorted({c.source for c in self.months.values() if c.source})


@dataclass
class ForecastResult:
    period: Period
    base_currency: str
    rows: dict[Key, Row]
    unmapped_actual: dict[int, Decimal]  # account -> posted in period
    unmapped_budget: dict[tuple[int | None, int | None], Decimal]  # (cost centre, account) -> budget in period
    direct_posted: dict[str, Decimal]  # DIRECT_* -> posted in period (company level)
    thresholds: dict[str, Decimal]
    payroll: dict[date, PayrollProjection]
    committed_unmapped_lines: int
    reason_codes: list[str]
    resolver: CategoryResolver
    cost_centers: dict[int, CostCenter]
    budgets_used: list[dict[str, Any]]


# ------------------------------------------------------------------ pure rules


def remaining_fraction(month: date, today: date) -> Decimal:
    end = month_end(month)
    days = Decimal((end - month).days + 1)
    left = Decimal(max(0, (end - today).days))
    return left / days


def month_forecast(kind: str, *, actual: Decimal, budget: Decimal, committed: Decimal, history_avg: Decimal,
                   fraction_left: Decimal) -> tuple[Decimal, str]:
    if kind == "past":
        return actual, SRC_ACTUAL_ONLY
    if budget > ZERO:
        base, src = budget, SRC_BUDGET
    elif history_avg > ZERO:
        base, src = history_avg, SRC_HISTORY
    else:
        base, src = ZERO, SRC_COMMITTED
    if kind == "current":
        etc = max(committed, base * fraction_left)
        return q4(actual + etc), src
    return q4(max(committed, base)), src


def run_rate(actual: Decimal, month: date, today: date) -> Decimal | None:
    end = month_end(month)
    elapsed = (min(today, end) - month).days + 1
    if elapsed <= 0:
        return None
    days = (end - month).days + 1
    return q4(actual / Decimal(elapsed) * Decimal(days))


def row_status(*, budget: Decimal, actual: Decimal, committed: Decimal, forecast: Decimal, warning_pct: Decimal,
               run_rate_value: Decimal | None = None) -> str:
    if budget <= ZERO:
        # A company-level commitment that fits inside the category's remaining budget has forecast 0: not unbudgeted.
        spends = actual > ZERO or (committed > ZERO and forecast > ZERO)
        return STATUS_UNBUDGETED if spends else STATUS_OK
    if actual > budget:
        return STATUS_FAILED
    if forecast > budget:
        return STATUS_AT_RISK
    limit = budget * warning_pct / HUNDRED
    if forecast >= limit or (actual + committed) >= limit or (run_rate_value is not None and run_rate_value > budget):
        return STATUS_WARNING
    return STATUS_OK


INCOMPLETE_PAYROLL_REASONS = frozenset({"NO_ACTIVE_EMPLOYEES", "EMPLOYEE_WITHOUT_STRUCTURE"})


def absorb_company_commitments(rows: dict[Key, "Row"], open_months: list[date], period: Period) -> None:
    """Company-level commitments (non-order POs, loan interest) are first set against the rest-of-month budget of the
    same category on the cost-centre rows, so a category forecast is actual + max(committed, remaining budget) and
    the commitment is never added on top of a budget that already covers it."""
    for (cc, cat), company in rows.items():
        if cc is not None:
            continue
        for m in open_months:
            cell = company.months[m]
            if cell.committed <= ZERO:
                continue
            kind = period.month_kind(m)
            frac = remaining_fraction(m, period.today) if kind == "current" else ZERO
            own, _src = month_forecast(kind, actual=cell.actual, budget=cell.budget, committed=ZERO,
                                       history_avg=company.history_avg, fraction_left=frac)
            own_etc = own - cell.actual
            others_etc = sum(
                (r.months[m].forecast - r.months[m].actual for (rcc, rcat), r in rows.items() if rcat == cat and rcc is not None),
                ZERO,
            )
            excess = cell.committed - others_etc
            etc = max(ZERO, own_etc, excess)
            cell.forecast = q4(cell.actual + etc)
            cell.source = SRC_COMMITTED if excess > own_etc and excess > ZERO else SRC_COMMITTED_WITHIN_BUDGET


def apply_payroll_projection(rows: dict[Key, "Row"], m: date, proj: PayrollProjection, new_row) -> None:
    """PAYROLL rows get the company projection: total = max(base, projection), the difference spread by budget share
    (else actual share, else one company row). Base = posted actual; when the projection is incomplete (no employees,
    or employees without a salary structure) base = the normal forecast, so the projection can only raise it."""
    payroll_rows = [r for k, r in rows.items() if k[1] == "PAYROLL"]
    incomplete = bool(INCOMPLETE_PAYROLL_REASONS & set(proj.reason_codes))
    bases = [r.months[m].forecast if incomplete else r.months[m].actual for r in payroll_rows]
    total_base = sum(bases, ZERO)
    target = max(total_base, proj.amount or ZERO)
    delta = target - total_base
    if not payroll_rows and delta == ZERO:
        return
    weights = [r.months[m].budget for r in payroll_rows]
    if sum(weights, ZERO) <= ZERO:
        weights = [max(ZERO, r.months[m].actual) for r in payroll_rows]
    parts = distribute(delta, weights) if delta != ZERO else [ZERO] * len(payroll_rows)
    if not parts:
        company = new_row((None, "PAYROLL"))
        if company not in payroll_rows:
            c = company.months[m]
            payroll_rows = payroll_rows + [company]
            bases = bases + [c.forecast if incomplete else c.actual]
        parts = [delta if r is company else ZERO for r in payroll_rows]
    for r, base_value, part in zip(payroll_rows, bases, parts):
        cell = r.months[m]
        cell.forecast = q4(base_value + part)
        if part != ZERO or not incomplete:
            cell.source = SRC_PAYROLL


def distribute(delta: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """Split `delta` by weights in 4 decimals; the rounding remainder goes to the last part."""
    total = sum(weights, ZERO)
    if not weights or total <= ZERO:
        return []
    parts = [q4(delta * w / total) for w in weights]
    parts[-1] += delta - sum(parts, ZERO)
    return parts


# ------------------------------------------------------------------ data


async def _thresholds(db: AsyncSession, tenant_id: int) -> dict[str, Decimal]:
    out = {c: DEFAULT_WARNING_PCT for c in OPERATING_CATEGORIES}
    for cat, pct in (
        await db.execute(
            select(MgmtCategoryThreshold.category, MgmtCategoryThreshold.warning_pct).where(MgmtCategoryThreshold.tenant_id == tenant_id)
        )
    ).all():
        out[cat] = Decimal(str(pct))
    return out


async def _movement(db: AsyncSession, tenant_id: int, start: date, end: date):
    year_col = func.extract("year", Voucher.voucher_date)
    month_col = func.extract("month", Voucher.voucher_date)
    stmt = join_lines(
        select(
            VoucherLine.account_id, VoucherLine.cost_center_id, year_col, month_col,
            func.coalesce(func.sum(signed_amount_sql()), 0),
        ),
        tenant_id,
    ).where(
        *in_books_conditions(tenant_id),
        universe_clause(set()),
        Voucher.voucher_date >= start,
        Voucher.voucher_date <= end,
    ).group_by(VoucherLine.account_id, VoucherLine.cost_center_id, year_col, month_col)
    return [
        (int(a), int(cc) if cc is not None else None, date(int(y), int(m), 1), Decimal(str(t or 0)))
        for a, cc, y, m, t in (await db.execute(stmt)).all()
    ]


async def _facility_interest(db: AsyncSession, tenant_id: int, base: str, months: list[date], reasons: list[str]) -> dict[date, Decimal]:
    out: dict[date, Decimal] = defaultdict(lambda: ZERO)
    if not months:
        return out
    start, end = months[0], month_end(months[-1])
    rows = (
        await db.execute(
            select(
                RepaymentScheduleLine.facility_utilization_id,
                RepaymentScheduleLine.due_date,
                RepaymentScheduleLine.interest_component,
                FacilityUtilization.currency,
                FacilityUtilization.exchange_rate_to_base,
            )
            .join(FacilityUtilization, and_(
                FacilityUtilization.id == RepaymentScheduleLine.facility_utilization_id,
                FacilityUtilization.tenant_id == tenant_id,
            ))
            .where(
                RepaymentScheduleLine.tenant_id == tenant_id,
                FacilityUtilization.status == "active",
                RepaymentScheduleLine.status.in_(OPEN_SCHEDULE_STATUSES),
                RepaymentScheduleLine.due_date >= start,
                RepaymentScheduleLine.due_date <= end,
            )
        )
    ).all()
    if not rows:
        return out
    accrued = {
        (int(u), m)
        for u, m in (
            await db.execute(
                select(InterestAccrual.facility_utilization_id, InterestAccrual.accrual_month).where(
                    InterestAccrual.tenant_id == tenant_id,
                    func.lower(InterestAccrual.status) == "accrued",
                    InterestAccrual.facility_utilization_id.in_({int(r[0]) for r in rows}),
                )
            )
        ).all()
    }
    for util_id, due, interest, ccy, rate in rows:
        month = due.replace(day=1)
        if (int(util_id), month_key(month)) in accrued:
            continue
        r, _src = fx(ccy, base, rate, "UTILIZATION_EXCHANGE_RATE")
        if r is None:
            if "FACILITY_FX_UNKNOWN" not in reasons:
                reasons.append("FACILITY_FX_UNKNOWN")
            continue
        out[month] += q4(Decimal(str(interest or 0)) * r)
    return out


async def _open_po_commitments(
    db: AsyncSession, tenant_id: int, base: str, resolver: CategoryResolver, months: list[date], current: date,
    reasons: list[str],
) -> tuple[dict[tuple[str, date], Decimal], int]:
    out: dict[tuple[str, date], Decimal] = defaultdict(lambda: ZERO)
    if not months:
        return out, 0
    eff_order = func.coalesce(PurchaseOrderItem.source_order_id, PurchaseOrder.source_order_id)
    rows = (
        await db.execute(
            select(
                PurchaseOrderItem.id, PurchaseOrderItem.quantity, PurchaseOrderItem.unit_price,
                PurchaseOrder.expected_date, PurchaseOrder.currency, PurchaseOrder.exchange_rate_to_base,
                StockGroup.purchase_account_id,
            )
            .join(PurchaseOrder, and_(PurchaseOrder.id == PurchaseOrderItem.purchase_order_id, PurchaseOrder.tenant_id == tenant_id))
            .join(Item, and_(Item.id == PurchaseOrderItem.item_id, Item.tenant_id == tenant_id))
            .outerjoin(StockGroup, and_(StockGroup.id == Item.stock_group_id, StockGroup.tenant_id == tenant_id))
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                eff_order.is_(None),
                func.upper(func.trim(PurchaseOrder.status)).in_(OPEN_PO_STATUSES),
            )
            .order_by(PurchaseOrderItem.id.desc())
            .limit(MAX_PO_LINES + 1)
        )
    ).all()
    if len(rows) > MAX_PO_LINES:
        reasons.append("SOURCE_TRUNCATED:PO_COMMITMENTS")
        rows = rows[:MAX_PO_LINES]
    if not rows:
        return out, 0
    received: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for line_id, acc, rec in (
        await db.execute(
            select(GoodsReceivingItem.purchase_order_line_id, GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty)
            .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
            .where(
                GoodsReceiving.tenant_id == tenant_id,
                GoodsReceivingItem.tenant_id == tenant_id,
                GoodsReceiving.status == "RECEIVED",
                GoodsReceivingItem.purchase_order_line_id.in_([int(r[0]) for r in rows]),
            )
        )
    ).all():
        received[int(line_id)] += usable_received_qty(acc, rec)
    unmapped = 0
    first, last = months[0], months[-1]
    for line_id, qty, price, expected, ccy, rate, purchase_account in rows:
        open_qty = Decimal(str(qty or 0)) - received[int(line_id)]
        if open_qty <= ZERO:
            continue
        cat = resolver.category_for(int(purchase_account)) if purchase_account is not None else None
        if cat not in OPERATING_CATEGORIES:
            unmapped += 1
            continue
        month = expected.replace(day=1) if expected else current
        if month < current:
            month = current
        if month < first or month > last:
            continue
        r, _src = fx(ccy, base, rate, "PO_EXCHANGE_RATE")
        if r is None:
            if "PO_FX_UNKNOWN" not in reasons:
                reasons.append("PO_FX_UNKNOWN")
            continue
        out[(cat, month)] += q4(open_qty * Decimal(str(price or 0)) * r)
    return out, unmapped


async def _budgets(db: AsyncSession, tenant: Any, period: Period, resolver: CategoryResolver):
    """(cell budgets, unmapped budgets, budget line ids per key, budgets used)."""
    scope = await resolve_scope(db, tenant, period.fiscal_year_label, None)
    period_months = set(period.months)
    cells: dict[Key, dict[date, Decimal]] = defaultdict(lambda: defaultdict(lambda: ZERO))
    unmapped: dict[tuple[int | None, int | None], Decimal] = defaultdict(lambda: ZERO)
    line_ids: dict[Key, list[int]] = defaultdict(list)
    for line in scope.lines:
        parts = spread_amount(Decimal(str(line.amount or 0)), line_months(line, scope))
        hit = {m: v for m, v in parts.items() if m in period_months}
        if not hit:
            continue
        cat = resolver.category_for(line.account_id)
        if cat is None:
            unmapped[(line.cost_center_id, line.account_id)] += sum(hit.values(), ZERO)
            continue
        if cat not in OPERATING_CATEGORIES:
            continue
        key = (line.cost_center_id, cat)
        for m, v in hit.items():
            cells[key][m] += v
        if len(line_ids[key]) < MAX_BUDGET_LINE_IDS:
            line_ids[key].append(line.id)
    used = [{"id": b.id, "budget_name": b.budget_name, "fiscal_year": b.fiscal_year} for b in scope.budgets]
    return cells, unmapped, line_ids, used


async def compute_forecast(db: AsyncSession, tenant: Any, period: Period) -> ForecastResult:
    tid = tenant.id
    base = base_currency(tenant)
    resolver = await load_resolver(db, tid)
    thresholds = await _thresholds(db, tid)
    reasons: list[str] = []
    months = period.months
    current = period.current_month
    hist_start, hist_end = history_window(period, HISTORY_MONTHS)
    q_start = min(period.start, hist_start)
    q_end = max(period.end, hist_end)

    rows: dict[Key, Row] = {}

    def row(key: Key) -> Row:
        if key not in rows:
            rows[key] = Row(cost_center_id=key[0], category=key[1])
        return rows[key]

    unmapped_actual: dict[int, Decimal] = defaultdict(lambda: ZERO)
    direct_posted: dict[str, Decimal] = {c: ZERO for c in DIRECT_CATEGORIES}
    history: dict[Key, Decimal] = defaultdict(lambda: ZERO)
    period_months = set(months)
    for account_id, cc, month, amount in await _movement(db, tid, q_start, q_end):
        cat = resolver.category_for(account_id)
        in_period = month in period_months
        in_hist = hist_start <= month <= hist_end
        if cat is None:
            if in_period:
                unmapped_actual[account_id] += amount
            continue
        if cat == EXCLUDED_CATEGORY:
            continue
        if cat in DIRECT_CATEGORIES:
            if in_period:
                direct_posted[cat] += amount
            continue
        if in_period:
            row((cc, cat)).months[month].actual += amount
        if in_hist:
            history[(cc, cat)] += amount

    budget_cells, unmapped_budget, line_ids, budgets_used = await _budgets(db, tenant, period, resolver)
    for key, per_month in budget_cells.items():
        r = row(key)
        for m, v in per_month.items():
            r.months[m].budget += v
        r.budget_line_ids = line_ids.get(key, [])

    open_months = [m for m in months if m >= current]
    for m, amount in (await _facility_interest(db, tid, base, open_months, reasons)).items():
        row((None, "FINANCE_COST")).months[m].committed += amount
    po_commit, committed_unmapped = await _open_po_commitments(db, tid, base, resolver, open_months, current, reasons)
    for (cat, m), amount in po_commit.items():
        row((None, cat)).months[m].committed += amount
    if committed_unmapped:
        reasons.append("COMMITTED_UNMAPPED")

    for key, total in history.items():
        row(key).history_avg = q4(total / Decimal(HISTORY_MONTHS))

    for r in rows.values():
        for m in months:
            kind = period.month_kind(m)
            cell = r.months[m]
            cell.forecast, cell.source = month_forecast(
                kind, actual=cell.actual, budget=cell.budget, committed=cell.committed, history_avg=r.history_avg,
                fraction_left=remaining_fraction(m, period.today) if kind == "current" else ZERO,
            )

    absorb_company_commitments(rows, open_months, period)

    payroll: dict[date, PayrollProjection] = {}
    for m in open_months:
        proj = await payroll_projection(db, tid, m, period.today)
        payroll[m] = proj
        reasons += [c for c in proj.reason_codes if c not in reasons]
        if proj.amount is None:
            continue
        apply_payroll_projection(rows, m, proj, row)

    cc_ids = {k[0] for k in rows if k[0] is not None} | {k[0] for k in unmapped_budget if k[0] is not None}
    cost_centers: dict[int, CostCenter] = {}
    if cc_ids:
        cost_centers = {
            c.id: c
            for c in (await db.execute(select(CostCenter).where(CostCenter.tenant_id == tid, CostCenter.id.in_(cc_ids)))).scalars()
        }
    if not resolver.account_map and not resolver.group_map:
        reasons.append("CATEGORY_MAP_EMPTY")
    if any(v != ZERO for v in unmapped_actual.values()):
        reasons.append("UNMAPPED_EXPENSE_ACCOUNT")
    return ForecastResult(
        period=period, base_currency=base, rows=rows, unmapped_actual=dict(unmapped_actual),
        unmapped_budget=dict(unmapped_budget), direct_posted=direct_posted, thresholds=thresholds, payroll=payroll,
        committed_unmapped_lines=committed_unmapped, reason_codes=reasons, resolver=resolver, cost_centers=cost_centers,
        budgets_used=budgets_used,
    )


# ------------------------------------------------------------------ evaluation + output


@dataclass
class RowFigures:
    key: Key
    budget: Decimal
    actual: Decimal
    committed: Decimal
    forecast: Decimal
    run_rate: Decimal | None
    status: str
    warning_pct: Decimal


def evaluate_row(result: ForecastResult, r: Row) -> RowFigures:
    period = result.period
    budget, actual = q4(r.total("budget")), q4(r.total("actual"))
    committed, forecast = q4(r.total("committed")), q4(r.total("forecast"))
    rr = None
    if period.kind == "month" and period.month_kind(period.start) == "current":
        rr = run_rate(actual, period.start, period.today)
    pct = result.thresholds.get(r.category, DEFAULT_WARNING_PCT)
    status = row_status(budget=budget, actual=actual, committed=committed, forecast=forecast, warning_pct=pct, run_rate_value=rr)
    return RowFigures((r.cost_center_id, r.category), budget, actual, committed, forecast, rr, status, pct)


def opex_totals(result: ForecastResult, keys: set[Key] | None = None) -> dict[str, Decimal]:
    out = {"budget": ZERO, "actual": ZERO, "committed": ZERO, "forecast": ZERO}
    for key, r in result.rows.items():
        if keys is not None and key not in keys:
            continue
        for attr in out:
            out[attr] += r.total(attr)
    return {k: q4(v) for k, v in out.items()}


def _m(v: Decimal | None) -> str | None:
    return format(q4(v), "f") if v is not None else None


def _cc_label(result: ForecastResult, cc_id: int | None) -> str:
    if cc_id is None:
        return "(Company level)"
    cc = result.cost_centers.get(cc_id)
    if cc is None:
        return f"Cost centre #{cc_id}"
    return f"{cc.center_code} - {cc.name}" if cc.center_code else cc.name


def forecast_payload(result: ForecastResult, scope: ViewerScope) -> dict[str, Any]:
    """JSON-safe response, filtered to what the viewer may see."""
    visible: set[Key] = set()
    out_rows: list[dict[str, Any]] = []
    counts: dict[str, int] = defaultdict(int)
    for key in sorted(result.rows, key=lambda k: (k[0] is None, k[0] or 0, OPERATING_CATEGORIES.index(k[1]))):
        r = result.rows[key]
        if not scope.company and (key[0] is None or key[0] not in scope.cost_center_ids):
            continue
        fig = evaluate_row(result, r)
        if fig.budget == ZERO and fig.actual == ZERO and fig.committed == ZERO and fig.forecast == ZERO:
            continue
        restricted = key[1] == "PAYROLL" and not scope.payroll_visible
        if not restricted:  # restricted payroll must not be recoverable from the totals
            visible.add(key)
        counts[fig.status] += 1
        cc = result.cost_centers.get(key[0]) if key[0] is not None else None
        money = (lambda v: None) if restricted else _m
        out_rows.append({
            "cost_center_id": key[0],
            "cost_center_label": _cc_label(result, key[0]),
            "department": (cc.department if cc is not None else None),
            "owner_user_id": (cc.owner_user_id if cc is not None else None),
            "category": key[1],
            "category_label": CATEGORY_LABELS.get(key[1], key[1]),
            "budget": money(fig.budget),
            "actual": money(fig.actual),
            "committed": money(fig.committed),
            "forecast": money(fig.forecast),
            "variance": money(fig.budget - fig.forecast) if fig.budget > ZERO else None,
            "used_pct": (money(fig.forecast / fig.budget * HUNDRED) if fig.budget > ZERO else None),
            "run_rate": money(fig.run_rate),
            "history_avg": money(r.history_avg),
            "warning_pct": _m(fig.warning_pct),
            "status": fig.status,
            "sources": r.sources,
            "restricted": restricted,
            "budget_line_ids": [] if restricted else list(r.budget_line_ids),
            "months": [] if restricted else [
                {
                    "month": month_key(m),
                    "kind": result.period.month_kind(m),
                    "budget": _m(c.budget), "actual": _m(c.actual), "committed": _m(c.committed),
                    "forecast": _m(c.forecast), "source": c.source,
                }
                for m, c in sorted(r.months.items()) if m in set(result.period.months)
            ],
        })
    unmapped_rows: list[dict[str, Any]] = []
    if scope.company:
        for account_id, amount in sorted(result.unmapped_actual.items()):
            if amount == ZERO:
                continue
            counts[STATUS_UNMAPPED] += 1
            unmapped_rows.append({
                "kind": "POSTED", "account_id": account_id, "account_label": result.resolver.account_label(account_id),
                "cost_center_id": None, "amount": _m(amount),
            })
        for (cc_id, account_id), amount in sorted(result.unmapped_budget.items(), key=lambda kv: (kv[0][0] or 0, kv[0][1] or 0)):
            unmapped_rows.append({
                "kind": "BUDGET", "account_id": account_id, "account_label": result.resolver.account_label(account_id),
                "cost_center_id": cc_id, "cost_center_label": _cc_label(result, cc_id), "amount": _m(amount),
            })
    totals = opex_totals(result, visible if not scope.company else None)
    payroll_out = None
    if scope.payroll_visible:
        payroll_out = [
            {
                "month": month_key(m), "source": p.source, "amount": _m(p.amount), "earned_to_date": _m(p.earned_to_date),
                "remaining": _m(p.remaining), "overtime": _m(p.overtime), "employees": p.employees,
                "employees_without_structure": p.employees_without_structure, "reason_codes": p.reason_codes,
            }
            for m, p in sorted(result.payroll.items())
        ]
    return {
        "period": {"kind": result.period.kind, "label": result.period.label, "start": result.period.start,
                   "end": result.period.end, "today": result.period.today},
        "base_currency": result.base_currency,
        "scope": "company" if scope.company else "own_cost_centres",
        "rows": out_rows,
        "unmapped": unmapped_rows,
        "status_counts": dict(counts),
        "totals": {k: _m(v) for k, v in totals.items()},
        "payroll": payroll_out,
        "committed_unmapped_lines": result.committed_unmapped_lines if scope.company else None,
        "budgets_used": result.budgets_used if scope.company else [],
        "thresholds": {k: _m(v) for k, v in result.thresholds.items()},
        "reason_codes": result.reason_codes if scope.company else [],
        "notes": [
            "Forecast - not posted. Actual = posted vouchers; forecast adds committed cost and the time-phased "
            "budget (or the 3-month average) for the rest of the month.",
            "Direct cost accounts (material, processing, landed, selling) are not operating expenses here; they "
            "are part of the finished-goods contribution.",
        ],
    }
