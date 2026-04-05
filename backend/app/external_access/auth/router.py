"""External portal authentication HTTP routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import ExternalPrincipal, Tenant

from app.external_access.auth.schemas import (
    ExternalAcceptInviteRequest,
    ExternalLoginRequest,
    ExternalMeResponse,
    ExternalMessageResponse,
    ExternalRefreshRequest,
    ExternalRequestPasswordResetRequest,
    ExternalResetPasswordRequest,
    ExternalTokenResponse,
)
from app.external_access.auth.service import (
    accept_invitation,
    authenticate_external,
    issue_tokens_for_principal,
    request_password_reset,
    reset_password_with_token,
    resolve_tenant_by_company_code,
)
from app.external_access.constants import (
    FF_CUSTOMER_NOTES_ENABLED,
    FF_CUSTOMER_PORTAL_ENABLED,
    FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
    FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    FF_FINANCIER_PROJECTION_ENABLED,
)
from app.external_access.feature_flags import is_customer_portal_enabled, is_financier_portal_enabled
from app.external_access.permissions import get_role_codes
from app.external_access.tokens import decode_external_refresh_token, get_current_external_principal
from app.external_access.constants import JWT_CLAIM_PRINCIPAL_TYPE, JWT_CLAIM_TENANT, parse_external_subject

router = APIRouter(prefix="/auth", tags=["external-auth"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/login", response_model=ExternalTokenResponse)
async def external_login(
    body: ExternalLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tenant = await resolve_tenant_by_company_code(db, body.company_code)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    principal = await authenticate_external(
        db,
        tenant=tenant,
        email=str(body.email),
        password=body.password,
        principal_type=body.principal_type,
    )
    access, refresh = await issue_tokens_for_principal(principal)
    from app.external_access.audit import log_external_action

    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_LOGIN",
        resource_type="external_principal",
        resource_id=principal.id,
        external_principal_id=principal.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return ExternalTokenResponse(
        access_token=access,
        refresh_token=refresh,
        tenant_id=tenant.id,
        principal_type=principal.principal_type,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def external_logout(
    principal: Annotated[ExternalPrincipal, Depends(get_current_external_principal)],
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Client discards tokens; server records logout for audit."""
    from app.external_access.audit import log_external_action

    await log_external_action(
        db,
        tenant_id=principal.tenant_id,
        action="EXTERNAL_LOGOUT",
        resource_type="external_principal",
        resource_id=principal.id,
        external_principal_id=principal.id,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    return None


@router.post("/refresh", response_model=ExternalTokenResponse)
async def external_refresh(
    body: ExternalRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    payload = decode_external_refresh_token(body.refresh_token)
    pid = parse_external_subject(payload.get("sub") if isinstance(payload.get("sub"), str) else None)
    if pid is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    result = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.id == pid,
            ExternalPrincipal.is_active.is_(True),
        )
    )
    principal = result.scalar_one_or_none()
    if not principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    tid = payload.get(JWT_CLAIM_TENANT)
    if tid is not None and int(tid) != principal.tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    pt = payload.get(JWT_CLAIM_PRINCIPAL_TYPE)
    if pt is not None and pt != principal.principal_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if principal.locked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")
    access, refresh = await issue_tokens_for_principal(principal)
    return ExternalTokenResponse(
        access_token=access,
        refresh_token=refresh,
        tenant_id=principal.tenant_id,
        principal_type=principal.principal_type,
    )


@router.post("/accept-invite", response_model=ExternalTokenResponse)
async def external_accept_invite(
    body: ExternalAcceptInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    principal = await accept_invitation(
        db,
        token=body.token,
        full_name=body.full_name,
        password=body.password,
        phone=body.phone,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    access, refresh = await issue_tokens_for_principal(principal)
    return ExternalTokenResponse(
        access_token=access,
        refresh_token=refresh,
        tenant_id=principal.tenant_id,
        principal_type=principal.principal_type,
    )


@router.post("/request-password-reset", response_model=ExternalMessageResponse)
async def external_request_password_reset(
    body: ExternalRequestPasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    tenant = await resolve_tenant_by_company_code(db, body.company_code)
    settings = get_settings()
    reset_jwt: str | None = None
    if tenant:
        reset_jwt = await request_password_reset(
            db,
            tenant=tenant,
            email=str(body.email),
            principal_type=body.principal_type,
        )
    # Always same message (no email enumeration)
    msg = "If an account exists for this email, password reset instructions have been sent."
    if (
        reset_jwt
        and settings.app_env.lower() in {"dev", "development", "local", "test", "testing"}
    ):
        msg = f"{msg} (dev token: {reset_jwt})"
    return ExternalMessageResponse(message=msg)


@router.post("/reset-password", response_model=ExternalMessageResponse)
async def external_reset_password(
    body: ExternalResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    await reset_password_with_token(db, token=body.token, new_password=body.new_password)
    return ExternalMessageResponse(message="Password updated")


@router.get("/me", response_model=ExternalMeResponse)
async def external_me(
    principal: Annotated[ExternalPrincipal, Depends(get_current_external_principal)],
    db: AsyncSession = Depends(get_db),
):
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == principal.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    role_codes = sorted(await get_role_codes(db, principal))
    raw = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    feature_subset = {
        k: raw.get(k)
        for k in (
            FF_CUSTOMER_PORTAL_ENABLED,
            FF_FINANCIER_PORTAL_ENABLED,
            FF_CUSTOMER_NOTES_ENABLED,
            FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
            FF_FINANCIER_PROJECTION_ENABLED,
            FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
        )
        if k in raw
    }
    if not feature_subset:
        feature_subset = {
            FF_CUSTOMER_PORTAL_ENABLED: is_customer_portal_enabled(tenant),
            FF_FINANCIER_PORTAL_ENABLED: is_financier_portal_enabled(tenant),
        }

    return ExternalMeResponse(
        principal_id=principal.id,
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        company_code=tenant.company_code,
        email=principal.email,
        full_name=principal.full_name,
        principal_type=principal.principal_type,
        role_codes=role_codes,
        feature_flags=feature_subset,
        must_reset_password=principal.must_reset_password,
    )
