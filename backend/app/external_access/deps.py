"""Shared FastAPI dependencies for external portal routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ExternalCustomerAccess, ExternalFinancierAccess, ExternalPrincipal, Tenant

from app.external_access.constants import PRINCIPAL_CUSTOMER, PRINCIPAL_FINANCIER
from app.external_access.feature_flags import require_portal_enabled
from app.external_access.permissions import assert_principal_type
from app.external_access.tokens import get_current_external_principal


async def require_customer_external(
    principal: Annotated[ExternalPrincipal, Depends(get_current_external_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExternalPrincipal:
    assert_principal_type(principal, PRINCIPAL_CUSTOMER)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    require_portal_enabled(tenant=tenant, principal_type=PRINCIPAL_CUSTOMER)
    return principal


async def require_financier_external(
    principal: Annotated[ExternalPrincipal, Depends(get_current_external_principal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExternalPrincipal:
    assert_principal_type(principal, PRINCIPAL_FINANCIER)
    tr = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tr.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    require_portal_enabled(tenant=tenant, principal_type=PRINCIPAL_FINANCIER)
    return principal


async def get_allowed_customer_ids(db: AsyncSession, principal: ExternalPrincipal) -> list[int]:
    r = await db.execute(
        select(ExternalCustomerAccess.customer_id).where(
            ExternalCustomerAccess.external_principal_id == principal.id,
            ExternalCustomerAccess.tenant_id == principal.tenant_id,
        )
    )
    return [row[0] for row in r.all()]


async def get_financier_scopes(db: AsyncSession, principal: ExternalPrincipal) -> list[str]:
    r = await db.execute(
        select(ExternalFinancierAccess.access_scope).where(
            ExternalFinancierAccess.external_principal_id == principal.id,
            ExternalFinancierAccess.tenant_id == principal.tenant_id,
        )
    )
    return [row[0] for row in r.all() if row[0]]


async def financier_max_scope(db: AsyncSession, principal: ExternalPrincipal) -> str | None:
    from app.external_access.constants import SCOPE_RANK

    scopes = await get_financier_scopes(db, principal)
    if not scopes:
        return None
    best = scopes[0]
    for s in scopes[1:]:
        if SCOPE_RANK.get(s, 0) > SCOPE_RANK.get(best, 0):
            best = s
    return best


def require_financier_scope(required_scope: str):
    """Dependency factory: principal must have at least `required_scope` financier access."""

    async def _dep(
        principal: Annotated[ExternalPrincipal, Depends(require_financier_external)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ) -> ExternalPrincipal:
        from app.external_access.permissions import financier_scope_satisfies

        max_s = await financier_max_scope(db, principal)
        if not max_s or not financier_scope_satisfies(required_scope, max_s):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient financier access scope",
            )
        return principal

    return _dep
