"""Optional interest accrual on Asset / Liability chart-of-accounts ledgers."""

from __future__ import annotations

SOURCE_MODULE = "COA_INTEREST"
ACCRUAL_UNIQUE_KEY = "uq_coa_interest_accruals_tenant_acct_period"
MAX_CATCHUP_PERIODS = 12
MIN_INTEREST = "0.01"
