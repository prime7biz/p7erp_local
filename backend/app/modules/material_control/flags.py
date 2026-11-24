"""Strict tenant flag for Material Control hub (default OFF)."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.common.tenant_feature_keys import is_material_control_hub_v1_enabled
from app.models import Tenant


def require_material_control_hub(tenant: Tenant) -> None:
    """Whole feature is hidden (404) unless ``material_control_hub_v1`` is exactly true."""
    if not is_material_control_hub_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
