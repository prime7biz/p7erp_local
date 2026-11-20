"""Fixed authority class and module codes (system configuration, not editable roles)."""

from __future__ import annotations

AUTHORITY_SUPER = "SUPER"
AUTHORITY_CLASS_1 = "CLASS_1"
AUTHORITY_CLASS_2 = "CLASS_2"
AUTHORITY_CLASS_3 = "CLASS_3"
AUTHORITY_CLASS_4 = "CLASS_4"

AUTHORITY_CLASSES: tuple[str, ...] = (
    AUTHORITY_SUPER,
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
)

# Align with PERMISSION_REGISTRY top-level keys + common ERP areas used for grants.
AUTHORITY_MODULE_CODES: tuple[str, ...] = (
    "merch",
    "inventory",
    "production",
    "finance",
    "hr",
    "trade",
    "commercial",
    "facility",
    "settings",
    "reports",
    "ai",
    "business_overview",
)

CLASS1_APPROVAL_PENDING = "PENDING_CLASS1"
CLASS1_APPROVAL_APPROVED = "APPROVED"
CLASS1_APPROVAL_REJECTED = "REJECTED"
CLASS1_APPROVAL_STATUSES: tuple[str, ...] = (
    CLASS1_APPROVAL_PENDING,
    CLASS1_APPROVAL_APPROVED,
    CLASS1_APPROVAL_REJECTED,
)
