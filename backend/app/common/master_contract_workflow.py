"""Master contract / LC lifecycle constants (bank-document truth for pipeline)."""

from __future__ import annotations

# Canonical statuses (new); legacy values kept for backward compatibility.
MASTER_CONTRACT_STATUS_VALUES: frozenset[str] = frozenset(
    {
        "DRAFT",
        "APPLIED",
        "OPENED",
        "ADVISED",
        "AMENDMENT",
        "EXPIRED",
        "CLOSED",
        # Legacy / informal values still seen in data and cost-center auto-create
        "OPEN",
        "ACTIVE",
        "CONFIRMED",
    }
)

# Order pipeline LC_RECEIVED is satisfied when master contract is past "paper record only".
LC_RECEIVED_OPERATIONAL_STATUSES: frozenset[str] = frozenset(
    {
        "ADVISED",
        "OPENED",
        "AMENDMENT",
        # Treat legacy active-like states as advised for existing tenants
        "OPEN",
        "ACTIVE",
        "CONFIRMED",
    }
)


def normalize_master_contract_status(raw: str | None) -> str:
    return (raw or "DRAFT").strip().upper() or "DRAFT"


def is_lc_received_status(status: str | None) -> bool:
    return normalize_master_contract_status(status) in LC_RECEIVED_OPERATIONAL_STATUSES
