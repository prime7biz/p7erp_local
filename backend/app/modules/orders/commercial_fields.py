"""Protected commercial fields and locked statuses for change-control."""

from __future__ import annotations

from typing import Any

# Order: direct PATCH allowed only when status is NOT in this set.
ORDER_COMMERCIAL_LOCKED_STATUSES: frozenset[str] = frozenset(
    {"CONFIRMED", "IN_PROGRESS", "COMPLETED"}
)

# Quotation: direct PATCH/PUT commercial edits blocked when status is in this set.
QUOTATION_COMMERCIAL_LOCKED_STATUSES: frozenset[str] = frozenset(
    {"APPROVED", "SENT", "CONVERTED"}
)

# Fields that require a change request when entity is locked.
ORDER_PROTECTED_COMMERCIAL_FIELDS: frozenset[str] = frozenset(
    {
        "delivery_date",
        "quantity",
        "commission_mode",
        "commission_type",
        "commission_value",
        "shipping_term",
    }
)

QUOTATION_PROTECTED_COMMERCIAL_FIELDS: frozenset[str] = frozenset(
    {
        "target_price",
        "target_price_currency",
        "exchange_rate",
        "quoted_price",
        "currency",
        "total_amount",
        "shipping_term",
        "commission_mode",
        "commission_type",
        "commission_value",
        "projected_quantity",
        "projected_delivery_date",
        "valid_until",
    }
)


def _norm_status(status: str | None) -> str:
    return (status or "").strip().upper()


def is_order_commercial_locked(status: str | None) -> bool:
    return _norm_status(status) in ORDER_COMMERCIAL_LOCKED_STATUSES


def is_quotation_commercial_locked(status: str | None) -> bool:
    return _norm_status(status) in QUOTATION_COMMERCIAL_LOCKED_STATUSES


def is_protected_order_field(field_key: str) -> bool:
    return field_key in ORDER_PROTECTED_COMMERCIAL_FIELDS


def is_protected_quotation_field(field_key: str) -> bool:
    return field_key in QUOTATION_PROTECTED_COMMERCIAL_FIELDS


def protected_fields_for_entity(entity_type: str) -> frozenset[str]:
    et = (entity_type or "").strip().lower()
    if et == "order":
        return ORDER_PROTECTED_COMMERCIAL_FIELDS
    if et == "quotation":
        return QUOTATION_PROTECTED_COMMERCIAL_FIELDS
    return frozenset()


def list_order_commercial_patch_violations(status: str | None, patch: dict[str, Any]) -> list[str]:
    """Keys in patch that are protected while order is commercially locked."""
    if not is_order_commercial_locked(status):
        return []
    return [k for k, v in patch.items() if k in ORDER_PROTECTED_COMMERCIAL_FIELDS and v is not None]


def list_quotation_commercial_patch_violations(status: str | None, patch: dict[str, Any]) -> list[str]:
    """Return PATCH keys that are blocked while the quotation is commercially locked.

    Note: `QUOTATION_PROTECTED_COMMERCIAL_FIELDS` is also used for change-request allowlists.
    Only keys that exist on `QuotationUpdate` can actually appear in `patch` for PATCH /quotations;
    other protected keys are enforced via full PUT lock or change requests.
    """
    if not is_quotation_commercial_locked(status):
        return []
    return [k for k, v in patch.items() if k in QUOTATION_PROTECTED_COMMERCIAL_FIELDS and v is not None]
