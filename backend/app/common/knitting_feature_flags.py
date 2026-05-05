"""Tenant feature helpers for optional Knitting module."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.models import Tenant


def knitting_enabled(tenant: Tenant) -> bool:
    ff = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    return ff.get("knitting_enabled") is True


def require_knitting_enabled(tenant: Tenant) -> None:
    if not knitting_enabled(tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Knitting module is not enabled for this tenant. Turn it on under Settings → Configuration.",
        )
