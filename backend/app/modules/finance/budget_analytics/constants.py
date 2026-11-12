"""Every tunable value of the budget analytics package (PLAN Phase 4). Nothing here blocks a workflow."""

from __future__ import annotations

from decimal import Decimal

from app.modules.finance.statements.constants import COGS, DIRECT_EXPENSES, INDIRECT_EXPENSES, PURCHASE_ACCOUNTS

# ---- Budget status thresholds (open question 16, RECOMMENDED DEFAULT: 80 / 100 / 110, no new blocking) ---------------
# used_percent = actual / budget x 100.  status: < 80 within | >= 80 warning | >= 100 over | >= 110 critical.
WARNING_PERCENT = Decimal("80")
OVER_PERCENT = Decimal("100")
CRITICAL_PERCENT = Decimal("110")
STATUS_WITHIN, STATUS_WARNING, STATUS_OVER, STATUS_CRITICAL = "within", "warning", "over", "critical"

DIMENSIONS = ("cost_center", "account", "month", "department")
MAX_BUDGETS_SCANNED = 50  # budgets of one fiscal year read per request

# ---- Expense classes (statement class of the account group, own or inherited) -----------------------------------------
EXPENSE_CLASSES = frozenset({DIRECT_EXPENSES, INDIRECT_EXPENSES, COGS, PURCHASE_ACCOUNTS})
EXPENSE_NATURE = "expense"  # AccountGroup.nature (case-insensitive) used for groups that have no statement class

EXPENSE_GROUP_BY = ("month", "account", "cost_center", "vendor")
MAX_ANALYSIS_DAYS = 3660  # ten years; keeps the grouped query small

# ---- Expense controls --------------------------------------------------------------------------------------------------
CONTROL_CODES: dict[str, tuple[str, str]] = {  # code -> (label, severity)
    "UNUSUAL_INCREASE": ("Account spend far above its recent average", "medium"),
    "UNBUDGETED_SPEND": ("Spend with no FINAL budget line", "medium"),
    "REPEATED_AMOUNT": ("Same account, amount and party / narration repeated within days", "medium"),
    "MISSING_COST_CENTRE": ("Expense lines without a cost centre", "low"),
    "BUDGET_ALERT": ("Budget lines at 80% / 100% / 110% or more", "high"),
}
# UNUSUAL_INCREASE: spend of the as-of month (up to as_of_date) > 150% of the average of the 3 full months before it,
# and at least the minimum amount (base currency). A zero average never triggers (no history to compare with).
UNUSUAL_INCREASE_RATIO_PERCENT = Decimal("150")
UNUSUAL_INCREASE_MIN_AMOUNT = Decimal("10000")
UNUSUAL_INCREASE_TRAILING_MONTHS = 3
# REPEATED_AMOUNT: same account + same base amount + same party key, posted within 7 days of the previous one.
REPEATED_WINDOW_DAYS = 7
REPEATED_LOOKBACK_DAYS = 90
REPEATED_MIN_AMOUNT = Decimal("1")
MAX_REPEAT_SCAN_LINES = 5000  # newest expense debit lines read; the response says when this cut applied
MAX_EVIDENCE_IDS = 10  # voucher ids listed per exception item
MAX_ITEMS_PER_RULE = 100  # items returned per rule (total count is always exact)
