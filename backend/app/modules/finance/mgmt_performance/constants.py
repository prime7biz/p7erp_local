"""Shared constants for Management Performance (binding rules: docs/management-performance/02-plan-audit-resolutions.md)."""

from __future__ import annotations

from decimal import Decimal

from app.models.mgmt_performance import (
    ALL_CATEGORIES,
    DIRECT_CATEGORIES,
    EXCLUDED_CATEGORY,
    OPERATING_CATEGORIES,
)

ZERO = Decimal("0")
HUNDRED = Decimal("100")
DEFAULT_WARNING_PCT = Decimal("90")
HISTORY_MONTHS = 3

CATEGORY_LABELS: dict[str, str] = {
    "PAYROLL": "Salary, wages, overtime and benefits",
    "FINANCE_COST": "Bank interest, bank charges, finance cost",
    "UTILITIES": "Electricity, gas, water, internet",
    "TRANSPORT": "Transport and vehicles (not in product cost)",
    "ADMIN": "Rent, office, software, professional, admin",
    "FACTORY_OVERHEAD": "Factory overhead not in product cost",
    "SALES_MARKETING": "Sales, marketing, samples, customer support",
    "TAX": "Taxes, duties and regulatory cost",
    "DIRECT_MATERIAL": "Direct: raw material and accessories",
    "DIRECT_PROCESS": "Direct: knitting, dyeing, printing, washing, embroidery",
    "DIRECT_LANDED": "Direct: freight, duty, insurance, clearing",
    # Buying commission comes from the order terms; map commission expense accounts to EXCLUDED, never here.
    "DIRECT_SELLING": "Direct: export, shipping and C&F cost (not commission)",
    EXCLUDED_CATEGORY: "Not counted (neither operating nor direct)",
}

# Budget status, worst first (02 "Status rules").
STATUS_FAILED = "FAILED"
STATUS_AT_RISK = "AT_RISK"
STATUS_WARNING = "WARNING"
STATUS_OK = "OK"
STATUS_UNBUDGETED = "UNBUDGETED"
STATUS_UNMAPPED = "UNMAPPED"
STATUS_RANK = {STATUS_OK: 0, STATUS_WARNING: 1, STATUS_AT_RISK: 2, STATUS_FAILED: 3}

SRC_ACTUAL_ONLY = "ACTUAL_CLOSED_MONTH"
SRC_BUDGET = "BUDGET_TIME_PHASED"
SRC_HISTORY = "HISTORY_3M"
SRC_COMMITTED = "COMMITTED_ONLY"
SRC_COMMITTED_WITHIN_BUDGET = "COMMITTED_WITHIN_BUDGET"
SRC_PAYROLL = "PAYROLL_PROJECTION"

LANDED_SELLING = ("DIRECT_LANDED", "DIRECT_SELLING")

__all__ = [
    "ALL_CATEGORIES",
    "CATEGORY_LABELS",
    "DEFAULT_WARNING_PCT",
    "DIRECT_CATEGORIES",
    "EXCLUDED_CATEGORY",
    "HISTORY_MONTHS",
    "HUNDRED",
    "LANDED_SELLING",
    "OPERATING_CATEGORIES",
    "STATUS_RANK",
    "ZERO",
]
