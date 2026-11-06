"""Budget utilization checks for voucher post (warn / block modes)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import (
    BUDGET_MODE_OFF,
    get_budget_enforcement_mode,
)
from app.models import Budget, BudgetLine, Voucher, VoucherLine


def _to_float(v: object) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip() or 0)
    except (TypeError, ValueError):
        return 0.0


@dataclass
class BudgetCheckResult:
    ok: bool
    mode: str
    remaining: float | None
    warnings: list[str] = field(default_factory=list)
    over_budget: bool = False
    has_budget: bool = False
    budget_amount: float | None = None
    used_amount: float | None = None
    pending_amount: float | None = None
    projected: float | None = None
    status: str = "within_budget"  # within_budget | near_limit | exceeded
    can_post: bool = True
    warning_message: str | None = None
    enforcement_mode: str = "off"


async def evaluate_voucher_budget(
    db: AsyncSession,
    *,
    tenant_id: int,
    feature_flags: Any,
    voucher: Voucher,
    lines: list[VoucherLine],
) -> BudgetCheckResult:
    """Compare voucher cost-center spend to FINAL budgets for the voucher month.

    Only lines with ``cost_center_id`` are checked. If no matching FINAL budget
    lines exist for the period, enforcement is a no-op (ok=True).
    """
    mode = get_budget_enforcement_mode(feature_flags)
    if mode == BUDGET_MODE_OFF:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    cc_lines = [ln for ln in lines if ln.cost_center_id is not None]
    if not cc_lines:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    period_month = (voucher.voucher_date or today_local()).strftime("%Y-%m")
    budget_rows = list(
        (
            await db.execute(
                select(Budget).where(
                    Budget.tenant_id == tenant_id,
                    Budget.status == "FINAL",
                )
            )
        )
        .scalars()
        .all()
    )
    if not budget_rows:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    budget_ids = [b.id for b in budget_rows]
    budget_lines = list(
        (
            await db.execute(
                select(BudgetLine).where(
                    BudgetLine.tenant_id == tenant_id,
                    BudgetLine.budget_id.in_(budget_ids),
                    BudgetLine.period_month == period_month,
                    BudgetLine.cost_center_id.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not budget_lines:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
        )

    posted_rows = list(
        (
            await db.execute(
                select(VoucherLine, Voucher)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .where(
                    VoucherLine.tenant_id == tenant_id,
                    Voucher.status == "POSTED",
                    Voucher.id != voucher.id,
                    VoucherLine.cost_center_id.isnot(None),
                )
            )
        ).all()
    )
    pending_rows = list(
        (
            await db.execute(
                select(VoucherLine, Voucher)
                .join(Voucher, VoucherLine.voucher_id == Voucher.id)
                .where(
                    VoucherLine.tenant_id == tenant_id,
                    Voucher.status.in_(["DRAFT", "CHECKED", "RECOMMENDED", "APPROVED"]),
                    Voucher.id != voucher.id,
                    VoucherLine.cost_center_id.isnot(None),
                )
            )
        ).all()
    )

    # Aggregate proposed debit impact by (cost_center_id, account_id) — use absolute
    # amount for budget consumption (expense-style utilization).
    proposed: dict[tuple[int, int | None], float] = {}
    for ln in cc_lines:
        key = (int(ln.cost_center_id), int(ln.account_id) if ln.account_id else None)
        amt = _to_float(ln.amount)
        if (ln.entry_type or "").upper() == "CREDIT":
            continue
        proposed[key] = proposed.get(key, 0.0) + amt

    warnings: list[str] = []
    min_remaining: float | None = None
    over = False
    near = False
    tracked_budget = 0.0
    tracked_used = 0.0
    tracked_pending = 0.0
    tracked_projected = 0.0
    has_budget = False

    for bl in budget_lines:
        if bl.cost_center_id is None:
            continue
        budget_amt = _to_float(bl.amount)
        posted_actual = 0.0
        for voucher_line, _v in posted_rows:
            if voucher_line.cost_center_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and voucher_line.account_id != bl.account_id:
                continue
            if (voucher_line.entry_type or "").upper() != "DEBIT":
                continue
            v_date = _v.voucher_date
            if v_date is None or v_date.strftime("%Y-%m") != period_month:
                continue
            posted_actual += _to_float(voucher_line.amount)

        pending_actual = 0.0
        for voucher_line, _v in pending_rows:
            if voucher_line.cost_center_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and voucher_line.account_id != bl.account_id:
                continue
            if (voucher_line.entry_type or "").upper() != "DEBIT":
                continue
            v_date = _v.voucher_date
            if v_date is None or v_date.strftime("%Y-%m") != period_month:
                continue
            pending_actual += _to_float(voucher_line.amount)

        proposed_amt = 0.0
        for (cc_id, acct_id), amt in proposed.items():
            if cc_id != bl.cost_center_id:
                continue
            if bl.account_id is not None and acct_id != bl.account_id:
                continue
            proposed_amt += amt

        if proposed_amt <= 0 and posted_actual <= 0 and pending_actual <= 0:
            continue

        has_budget = True
        projected = posted_actual + pending_actual + proposed_amt
        remaining = round(budget_amt - projected, 4)
        tracked_budget += budget_amt
        tracked_used += posted_actual
        tracked_pending += pending_actual
        tracked_projected += projected
        if min_remaining is None or remaining < min_remaining:
            min_remaining = remaining
        util_pct = (projected / budget_amt * 100.0) if budget_amt > 0 else 0.0
        if projected > budget_amt + 1e-9:
            over = True
            warnings.append(
                f"Budget exceeded for cost center {bl.cost_center_id}"
                + (f" / account {bl.account_id}" if bl.account_id else "")
                + f" in {period_month}: budget={round(budget_amt, 2)}, "
                f"projected={round(projected, 2)}, remaining={remaining}"
            )
        elif util_pct >= 90.0:
            near = True
            warnings.append(
                f"Budget near limit for cost center {bl.cost_center_id}"
                + (f" / account {bl.account_id}" if bl.account_id else "")
                + f" in {period_month}: {round(util_pct, 1)}% utilized. Remaining: {remaining}"
            )

    if not has_budget:
        return BudgetCheckResult(
            ok=True,
            mode=mode,
            remaining=None,
            warnings=[],
            enforcement_mode=mode,
            status="within_budget",
            can_post=True,
            has_budget=False,
        )

    if over:
        status = "exceeded"
    elif near:
        status = "near_limit"
    else:
        status = "within_budget"

    can_post = True
    if over and mode == "block":
        can_post = False

    warning_message = "; ".join(warnings) if warnings else None
    return BudgetCheckResult(
        ok=can_post,
        mode=mode,
        remaining=min_remaining,
        warnings=warnings,
        over_budget=over,
        has_budget=True,
        budget_amount=round(tracked_budget, 4),
        used_amount=round(tracked_used, 4),
        pending_amount=round(tracked_pending, 4),
        projected=round(tracked_projected, 4),
        status=status,
        can_post=can_post,
        warning_message=warning_message,
        enforcement_mode=mode,
    )
