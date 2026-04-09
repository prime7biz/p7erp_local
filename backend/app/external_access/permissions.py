"""Role-based permissions for external principals."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ExternalPrincipal, ExternalPrincipalRole

from app.external_access.constants import (
    PRINCIPAL_CUSTOMER,
    PRINCIPAL_FINANCIER,
    ROLE_CUSTOMER_COLLABORATOR,
    ROLE_CUSTOMER_VIEWER,
    ROLE_FINANCIER_ANALYST,
    ROLE_FINANCIER_VIEWER,
    SCOPE_CREDIT_MONITORING,
    SCOPE_FINANCIAL_SUMMARY,
    SCOPE_FULL_FINANCIER_PORTAL,
    SCOPE_ORDERS_AND_PIPELINE,
    SCOPE_RANK,
    SCOPE_TENANT_SUMMARY,
)


async def load_principal_with_roles(db: AsyncSession, principal_id: int) -> ExternalPrincipal | None:
    result = await db.execute(
        select(ExternalPrincipal)
        .options(
            selectinload(ExternalPrincipal.role_links).selectinload(ExternalPrincipalRole.role),
        )
        .where(ExternalPrincipal.id == principal_id)
    )
    return result.scalar_one_or_none()


async def get_role_codes(db: AsyncSession, principal: ExternalPrincipal) -> set[str]:
    p = await load_principal_with_roles(db, principal.id)
    if not p:
        return set()
    out: set[str] = set()
    for link in p.role_links:
        if link.role and link.role.code:
            out.add(link.role.code)
    return out


def customer_can_add_notes(role_codes: set[str]) -> bool:
    return ROLE_CUSTOMER_COLLABORATOR in role_codes


def customer_can_view_portal(role_codes: set[str]) -> bool:
    return bool(
        role_codes & {ROLE_CUSTOMER_VIEWER, ROLE_CUSTOMER_COLLABORATOR}
    )


def financier_can_export_reports(role_codes: set[str]) -> bool:
    return ROLE_FINANCIER_ANALYST in role_codes


def financier_can_view_portal(role_codes: set[str]) -> bool:
    return bool(role_codes & {ROLE_FINANCIER_VIEWER, ROLE_FINANCIER_ANALYST})


def financier_scope_satisfies(required: str, granted: str) -> bool:
    """Return True if granted scope is at least as permissive as required."""
    req = SCOPE_RANK.get(required, 0)
    got = SCOPE_RANK.get(granted, 0)
    return got >= req


async def require_customer_portal_roles(role_codes: set[str]) -> None:
    if not customer_can_view_portal(role_codes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No customer portal role assigned",
        )


async def require_financier_portal_roles(role_codes: set[str]) -> None:
    if not financier_can_view_portal(role_codes):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No financier portal role assigned",
        )


def assert_principal_type(principal: ExternalPrincipal, expected: str) -> None:
    if principal.principal_type != expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Wrong portal for this account",
        )


# Re-export scope names for selectors
__all__ = [
    "SCOPE_TENANT_SUMMARY",
    "SCOPE_ORDERS_AND_PIPELINE",
    "SCOPE_FINANCIAL_SUMMARY",
    "SCOPE_FULL_FINANCIER_PORTAL",
    "financier_scope_satisfies",
    "get_role_codes",
    "customer_can_add_notes",
    "financier_can_export_reports",
    "load_principal_with_roles",
    "require_customer_portal_roles",
    "require_financier_portal_roles",
    "assert_principal_type",
    "PRINCIPAL_CUSTOMER",
    "PRINCIPAL_FINANCIER",
]
