"""Per-tenant feature flags for external portals."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

from app.models import Tenant

from app.external_access.constants import (
    FF_CUSTOMER_NOTES_ENABLED,
    FF_CUSTOMER_PORTAL_ENABLED,
    FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
    FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    FF_FINANCIER_PROJECTION_ENABLED,
    PRINCIPAL_CUSTOMER,
    PRINCIPAL_FINANCIER,
)


def _flags(tenant: Tenant) -> dict[str, Any]:
    raw = tenant.feature_flags
    return raw if isinstance(raw, dict) else {}


def is_customer_portal_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_CUSTOMER_PORTAL_ENABLED))


def is_financier_portal_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_FINANCIER_PORTAL_ENABLED))


def is_customer_notes_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_CUSTOMER_NOTES_ENABLED))


def is_financier_financial_summary_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED))


def is_financier_projection_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_FINANCIER_PROJECTION_ENABLED))


def is_external_document_download_enabled(tenant: Tenant) -> bool:
    return bool(_flags(tenant).get(FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED))


def require_portal_enabled(*, tenant: Tenant, principal_type: str) -> None:
    if principal_type == PRINCIPAL_CUSTOMER and not is_customer_portal_enabled(tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer portal is not enabled for this organization",
        )
    if principal_type == PRINCIPAL_FINANCIER and not is_financier_portal_enabled(tenant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Financier portal is not enabled for this organization",
        )
