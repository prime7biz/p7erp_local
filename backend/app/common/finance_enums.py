"""Finance API enum literals (go-live remediation Phase 5)."""

from typing import Literal

# Default catalog; tenants may define additional codes via voucher_types settings.
DefaultVoucherType = Literal["PAYMENT", "RECEIPT", "JOURNAL", "CONTRA", "MJ", "PJ", "LCJ"]
