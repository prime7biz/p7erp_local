"""Constants of the governed finance AI package (PLAN Phase 5)."""

from __future__ import annotations

REPORTS: tuple[str, ...] = (
    "trial_balance",
    "balance_sheet",
    "profit_loss",
    "cash_flow_monthly",
    "funds_flow_monthly",
    "ratio_analysis",
    "budget_analytics",
    "expense_analysis",
    "control_tower",
)
COMPARISONS: tuple[str, ...] = ("none", "previous_period", "previous_year")

# Permission key checked fail-closed (a missing key means DENY for non admin / manager roles).
AI_FINANCE_PERMISSION_KEY = "ai.tools.finance.read"
AI_TOOL_NAME = "finance_statement_summary"
AI_FEATURE = "finance_commentary"  # label sent to the tenant AI budget / usage log

# Bounds
MAX_FACTS = 90  # the fact catalog never holds more facts than this
MAX_ROWS_PER_GROUP = 6  # top rows kept per group (cost buckets, balance sheet lines, ...)
MAX_QUESTION_CHARS = 300
MAX_LABEL_CHARS = 90
MAX_FINDINGS = 8
MAX_SUMMARY_CHARS = 1200
MAX_FINDING_CHARS = 600
MAX_FACT_IDS_PER_FINDING = 10
MAX_PROMPT_CHARS = 20000  # facts are dropped from the end until the prompt fits
AI_TIMEOUT_SECONDS = 25

# Deterministic wording thresholds
LARGEST_CHANGES_SHOWN = 3
COST_BUCKETS_SHOWN = 3
ALERTS_SHOWN = 6

# Direction hints for ratios: which way is "good". Anything else is neutral.
RATIO_GOOD_UP = frozenset(
    {"CURRENT_RATIO", "QUICK_RATIO", "GROSS_PROFIT_PCT", "NETT_PROFIT_PCT", "ROI_PCT", "RETURN_ON_WC_PCT"}
)
RATIO_BAD_UP = frozenset({"DEBT_EQUITY", "OPERATING_COST_PCT", "RECEIVABLE_TURNOVER_DAYS"})

# Fallback reason codes (never contain provider text or financial figures)
REASON_AI_OFF_REQUEST = None
REASON_NO_FACTS = "no_facts"
REASON_POLICY = "ai_policy_denied"
REASON_PROVIDER_ERROR = "provider_error"
REASON_PROVIDER_UNAVAILABLE = "provider_unavailable_or_budget_exhausted"
REASON_TIMEOUT = "provider_timeout"
REASON_VALIDATION_PREFIX = "validation_failed:"
