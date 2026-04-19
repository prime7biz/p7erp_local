"""Feature flag helpers for the operational control tower."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models import Tenant


def control_tower_enabled(tenant: Tenant) -> bool:
    ff = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    return bool(ff.get("control_tower_enabled"))


def require_control_tower_enabled(tenant: Tenant) -> None:
    if not control_tower_enabled(tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Control tower is not enabled for this tenant",
        )


def auto_line_booking_enabled(tenant: Tenant) -> bool:
    ff = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    return bool(ff.get("auto_line_booking_enabled"))
