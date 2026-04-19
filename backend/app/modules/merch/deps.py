"""Shared merchandising dependencies and small helpers."""

from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status

from app.models import Tenant, User

from .constants import STYLE_LIFECYCLE_STAGES, STYLE_PRIORITY_VALUES, STYLE_RISK_VALUES


def ensure_tenant(user: User, tenant: Tenant) -> None:
    """Reject requests where JWT user tenant does not match resolved tenant (Rule 1: tenant isolation)."""
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def to_decimal(value: str | int | float | Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal("0")


def normalize_style_stage(value: str | None) -> str:
    normalized = (value or "INQUIRY").strip().upper()
    if normalized not in STYLE_LIFECYCLE_STAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid lifecycle_stage. Allowed: {', '.join(sorted(STYLE_LIFECYCLE_STAGES))}",
        )
    return normalized


def normalize_optional_choice(value: str | None, allowed_values: set[str], field_name: str) -> str | None:
    if value is None:
        return None
    normalized = value.strip().upper()
    if not normalized:
        return None
    if normalized not in allowed_values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid {field_name}. Allowed: {', '.join(sorted(allowed_values))}",
        )
    return normalized


def to_float_safe(value: str | int | float | Decimal | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


# Backward-compatible aliases for internal router code
_ensure_tenant = ensure_tenant
_to_decimal = to_decimal
_normalize_style_stage = normalize_style_stage
_normalize_optional_choice = normalize_optional_choice
_to_float_safe = to_float_safe
