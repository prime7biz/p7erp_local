"""Constants for the Control Tower and GL profitability (PLAN Phase 3). Every tunable value lives here."""

from __future__ import annotations

from decimal import Decimal

from app.modules.finance.statements.constants import (
    COGS,
    DIRECT_EXPENSES,
    DIRECT_INCOMES,
    INDIRECT_EXPENSES,
    INDIRECT_INCOMES,
    PURCHASE_ACCOUNTS,
    SALES_ACCOUNTS,
)

# ---- Control cards ---------------------------------------------------------------------------------------
SEVERITIES = ("high", "medium", "low")

# code -> (label, severity). Order = display order.
CARD_DEFS: dict[str, tuple[str, str]] = {
    "GRN_NOT_BILLED": ("GRNs not billed", "medium"),
    "CHALLAN_NOT_INVOICED": ("Delivery challans not invoiced", "high"),
    "VENDOR_BILL_VARIANCE": ("Vendor bills outside price/quantity tolerance", "low"),
    "NEGATIVE_CASH": ("Cash / bank ledgers with a credit balance", "high"),
    "NEGATIVE_STOCK": ("Items with negative stock", "high"),
    "OVERDUE_RECEIVABLES": ("Overdue receivables", "high"),
    "OVERDUE_PAYABLES": ("Overdue payables", "medium"),
    "BUDGET_BREACH": ("Budget lines at or over 100%", "high"),
    "BUDGET_WARNING": ("Budget lines at 80% or more", "medium"),
    "STOCK_GL_MISMATCH": ("Stock valuation differs from the GL inventory ledger", "high"),
    "VOUCHERS_PENDING_APPROVAL": ("Vouchers waiting for approval", "medium"),
    "VOUCHERS_DRAFT_OLD": ("Draft vouchers older than 7 days", "low"),
}

# Open question 9 (RECOMMENDED DEFAULT): informational only, never blocking. Greater of 2% or BDT 500.
VARIANCE_TOLERANCE_PERCENT = Decimal("0.02")
VARIANCE_TOLERANCE_MIN_AMOUNT = Decimal("500")

# Open question 16 (RECOMMENDED DEFAULT): alert at 80% and 100%; no new blocking rule.
BUDGET_WARNING_PERCENT = Decimal("80")
BUDGET_BREACH_PERCENT = Decimal("100")
MAX_BUDGETS_SCANNED = 50  # FINAL budgets read per request (newest first); keeps the query count bounded

# Voucher workflow statuses (finance/router.py transition table). POSTED / CANCELLED / REJECTED / REVERSED never count.
PENDING_APPROVAL_STATUSES = ("SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED")
DRAFT_STATUS = "DRAFT"
DRAFT_OLD_DAYS = 7

# Overdue source (open question 8 has no single authoritative bill-wise ledger yet): outstanding_bills.
OVERDUE_SOURCE = "outstanding_bills"
OVERDUE_CLOSED_STATUSES = ("PAID", "SETTLED", "CLOSED", "CANCELLED", "VOID", "REJECTED")

HREF_TEMPLATE = "/app/finance/home?tab=exceptions&exception={code}"

# ---- Profitability buckets ---------------------------------------------------------------------------------
# P&L accounts are placed in a bucket by the account group's statement class, then refined by the line's cost nature
# (VoucherLine.cost_nature_override, else ChartOfAccount.cost_nature). Revenue is credit minus debit; every cost
# bucket is debit minus credit (so a credit note reduces the cost).
REVENUE_CLASSES = frozenset({SALES_ACCOUNTS, DIRECT_INCOMES})
COST_CLASSES = frozenset({COGS, PURCHASE_ACCOUNTS, DIRECT_EXPENSES, INDIRECT_EXPENSES})

# Explicit cost nature wins (any cost class).
NATURE_TO_BUCKET: dict[str, str] = {
    "MATERIAL": "material",
    "CM": "cm",
    "OTHER": "other",
    "NON_OPERATING": "finance_cost",
}
# No cost nature set: class default. DIRECT_EXPENSES is NOT guessed (it could be CM or material) -> "other".
CLASS_DEFAULT_BUCKET: dict[str, str] = {
    PURCHASE_ACCOUNTS: "material",
    COGS: "material",
    INDIRECT_EXPENSES: "overhead",
    DIRECT_EXPENSES: "other",
}
# Indirect income (interest, discount received...) reduces "other" cost; it is never revenue.
INCOME_TO_OTHER_CLASSES = frozenset({INDIRECT_INCOMES})

COST_BUCKETS = ("material", "cm", "overhead", "finance_cost", "other")
SORT_FIELDS = ("order_code", "order_date", "revenue", "nett_profit", "margin_percent")
