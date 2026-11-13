"""Order SMV and factory cost per minute (CPM) for cost at completion (Phase 3, doc 14 section 13 Q6, 14 N2). Read-only.

Order SMV: one representative row per order (its first line plan row with an operation bulletin, else its first plan
row, else only the order's style) through the Phase 1 `smv_resolver` (OB -> style approved OB -> [integrated
planning: style standard SMV] -> plan row SMV -> UNKNOWN). Order SAH minutes = order qty x SMV.

CPM (finance-approved `cpm_override` from planning settings wins):
    numerator   = tenant-wide POSTED, in-books, base-currency P&L lines that finance's public `bucket_of`
                  (with `load_group_classification`) puts in the `cm` bucket (debit - credit), no order filter
    denominator = earned SAH minutes = sewing-department hourly good qty of entries with an order x that order's SMV
    window      = the 3 most recent accounting periods that ended before today; all 3 must be locked (closed)
CPM is UNKNOWN when a period is missing / not locked, the cm total <= 0 or earned minutes <= 0. Uncoded
DIRECT_EXPENSES lines (bucket `other`) are reported as warning CPM_UNCODED_DIRECT_EXPENSES. Nothing in finance is
edited; only its public helpers are imported.

Query budget: periods 1, groups 2, GL grouped 1, sewing output 1, plan rows 1, SMV <= 3 (independent of orders).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HourlyProductionEntry, Order
from app.models.finance import AccountingPeriod, ChartOfAccount, Voucher, VoucherLine
from app.modules.finance.advanced_voucher_service import (
    voucher_counts_in_books_status_clause,
    voucher_in_books_clause,
)
from app.modules.finance.control.constants import NATURE_TO_BUCKET
from app.modules.finance.control.profitability_service import bucket_of
from app.modules.finance.posting_core import line_base_amount_sql
from app.modules.finance.statements.classification_service import load_group_classification
from app.modules.finance.statements.constants import DIRECT_EXPENSES
from app.modules.mfg_intelligence.decimals import ZERO, to_dec
from app.modules.mfg_intelligence.line_loading_service import fetch_order_plan_rows
from app.modules.mfg_intelligence.money import positive, q4
from app.modules.mfg_intelligence.smv_resolver import SmvResult, resolve_smv_for_rows

CPM_PERIODS = 3
SRC_CPM_OVERRIDE = "CPM_OVERRIDE"
SRC_CPM_COMPUTED = "CPM_TRAILING_LOCKED_PERIODS"
SEWING = "sewing"


def sewing_clause():
    return func.lower(func.trim(HourlyProductionEntry.department_type)) == SEWING


@dataclass
class CpmResult:
    value: Decimal | None
    source: str | None
    period_start: date | None = None
    period_end: date | None = None
    cm_total: Decimal | None = None
    earned_minutes: Decimal | None = None
    reason_codes: list[str] = field(default_factory=list)
    warnings: list[dict[str, Any]] = field(default_factory=list)


def _representative_rows(orders: dict[int, int | None], plan_rows: list[Any]) -> list[Any]:
    """One synthetic row per order (id = order id) for `resolve_smv_for_rows`."""
    by_order: dict[int, list[Any]] = {}
    for r in plan_rows:
        by_order.setdefault(int(r.order_id), []).append(r)
    out: list[Any] = []
    for oid, style_id in orders.items():
        rows = by_order.get(oid, [])
        pick = next((r for r in rows if r.ob_id), rows[0] if rows else None)
        out.append(
            SimpleNamespace(
                id=oid,
                ob_id=pick.ob_id if pick is not None else None,
                style_id=(pick.style_id if pick is not None and pick.style_id else style_id),
                smv_per_piece=pick.smv_per_piece if pick is not None else None,
            )
        )
    return out


async def order_smv_map(
    db: AsyncSession,
    tenant_id: int,
    orders: dict[int, int | None],
    *,
    use_style_standard: bool,
    plan_rows: list[Any] | None = None,
) -> dict[int, SmvResult]:
    """{order id: SmvResult}. `orders` = {order id: style id}. `plan_rows` may be passed when already loaded."""
    if not orders:
        return {}
    if plan_rows is None:
        plan_rows = await fetch_order_plan_rows(db, tenant_id, list(orders), include_completed=True)
    return await resolve_smv_for_rows(
        db, tenant_id, _representative_rows(orders, plan_rows), use_style_standard=use_style_standard
    )


async def compute_cpm(
    db: AsyncSession, tenant_id: int, *, today: date, override: Decimal | None, use_style_standard: bool
) -> CpmResult:
    if override is not None:
        return CpmResult(value=override, source=SRC_CPM_OVERRIDE, reason_codes=["CPM_FROM_OVERRIDE"])
    periods = (
        await db.execute(
            select(AccountingPeriod.start_date, AccountingPeriod.end_date, AccountingPeriod.is_closed)
            .where(AccountingPeriod.tenant_id == tenant_id, AccountingPeriod.end_date < today)
            .order_by(AccountingPeriod.end_date.desc(), AccountingPeriod.id.desc())
            .limit(CPM_PERIODS)
        )
    ).all()
    if len(periods) < CPM_PERIODS:
        return CpmResult(value=None, source=None, reason_codes=["CPM_UNKNOWN", "CPM_PERIODS_MISSING"])
    start = min(p[0] for p in periods)
    end = max(p[1] for p in periods)
    result = CpmResult(value=None, source=SRC_CPM_COMPUTED, period_start=start, period_end=end)
    if not all(bool(p[2]) for p in periods):
        result.reason_codes += ["CPM_UNKNOWN", "CPM_PERIOD_NOT_LOCKED"]
        return result

    groups = await load_group_classification(db, tenant_id)
    nature = func.coalesce(VoucherLine.cost_nature_override, ChartOfAccount.cost_nature)
    entry = func.upper(VoucherLine.entry_type)
    gl_rows = (
        await db.execute(
            select(ChartOfAccount.group_id, nature, entry, func.coalesce(func.sum(line_base_amount_sql()), 0))
            .select_from(VoucherLine)
            .join(Voucher, Voucher.id == VoucherLine.voucher_id)
            .join(ChartOfAccount, and_(ChartOfAccount.id == VoucherLine.account_id, ChartOfAccount.tenant_id == tenant_id))
            .where(
                VoucherLine.tenant_id == tenant_id,
                Voucher.tenant_id == tenant_id,
                voucher_counts_in_books_status_clause(),
                voucher_in_books_clause(),
                Voucher.voucher_date >= start,
                Voucher.voucher_date <= end,
            )
            .group_by(ChartOfAccount.group_id, nature, entry)
        )
    ).all()
    cm_total = ZERO
    uncoded = ZERO
    for group_id, line_nature, side, total in gl_rows:
        group = groups.get(group_id)
        placed = bucket_of(group, line_nature)
        if placed is None:
            continue
        amount = to_dec(total) or ZERO
        signed = amount if side == "DEBIT" else -amount
        if placed[0] == "cm":
            cm_total += signed
        elif (
            placed[0] == "other"
            and group is not None
            and group.effective_class == DIRECT_EXPENSES
            and (line_nature or "").strip().upper() not in NATURE_TO_BUCKET
        ):
            uncoded += signed
    result.cm_total = q4(cm_total)
    if uncoded != ZERO:
        result.warnings.append({"code": "CPM_UNCODED_DIRECT_EXPENSES", "amount": format(q4(uncoded), "f")})

    output = {
        int(oid): (to_dec(good) or ZERO, sid)
        for oid, sid, good in (
            await db.execute(
                select(HourlyProductionEntry.order_id, Order.style_id, func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0))
                .join(Order, and_(Order.id == HourlyProductionEntry.order_id, Order.tenant_id == tenant_id))
                .where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.order_id.is_not(None),
                    sewing_clause(),
                    HourlyProductionEntry.production_date >= start,
                    HourlyProductionEntry.production_date <= end,
                )
                .group_by(HourlyProductionEntry.order_id, Order.style_id)
            )
        ).all()
    }
    smv = await order_smv_map(
        db, tenant_id, {oid: sid for oid, (_g, sid) in output.items()}, use_style_standard=use_style_standard
    )
    earned = ZERO
    missing_smv = 0
    for oid, (good, _sid) in output.items():
        s = smv.get(oid)
        if s is None or s.value is None:
            missing_smv += 1 if good > ZERO else 0
            continue
        earned += good * s.value
    result.earned_minutes = q4(earned)
    if missing_smv:
        result.warnings.append({"code": "CPM_OUTPUT_WITHOUT_SMV", "count": missing_smv})
    if cm_total <= ZERO:
        result.reason_codes += ["CPM_UNKNOWN", "CPM_NO_CM_POSTING"]
        return result
    if earned <= ZERO:
        result.reason_codes += ["CPM_UNKNOWN", "CPM_NO_EARNED_MINUTES"]
        return result
    result.value = q4(cm_total / earned)
    if positive(result.value) is None:
        result.value = None
        result.reason_codes += ["CPM_UNKNOWN"]
    return result
