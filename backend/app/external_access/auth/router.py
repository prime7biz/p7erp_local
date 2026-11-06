"""External portal authentication HTTP routes."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth_cookies import (
    clear_external_refresh_cookie,
    has_csrf_header,
    read_external_refresh_cookie,
    refresh_cookie_enabled,
    require_csrf_header,
    set_external_refresh_cookie,
)
from app.common.email_service import send_external_password_reset_email
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
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
    FF_SUPPLIER_PORTAL_ENABLED,
    PRINCIPAL_FINANCIER,
)
from app.external_access.feature_flags import (
    is_customer_portal_enabled,
    is_financier_portal_enabled,
    is_supplier_portal_enabled,
    require_portal_enabled,
)
from app.external_access.permissions import get_role_codes
from app.external_access.tokens import (
    assert_session_version_current,
    bump_session_version,
    decode_external_refresh_token,
    get_current_external_principal,
)
from app.external_access.constants import JWT_CLAIM_PRINCIPAL_TYPE, JWT_CLAIM_TENANT, parse_external_subject

router = APIRouter(prefix="/auth", tags=["external-auth"])
logger = logging.getLogger(__name__)
_bearer_required = HTTPBearer()
_bearer_optional = HTTPBearer(auto_error=False)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _token_response(
    request: Request,
    response: Response,
    *,
    access: str,
    refresh: str,
    principal: ExternalPrincipal,
) -> ExternalTokenResponse:
    """Token payload; in cookie mode the refresh token also goes into the HttpOnly cookie.

    Clients that send X-Requested-With: p7 understand cookie mode and get no refresh token in the
    body. Older clients (no header) still get it in the body so an open browser tab keeps working.
    """
    cookie_mode = refresh_cookie_enabled()
    body_refresh = refresh
    if cookie_mode:
        set_external_refresh_cookie(response, refresh)
        if has_csrf_header(request):
            body_refresh = ""
    return ExternalTokenResponse(
        access_token=access,
        refresh_token=body_refresh,
        tenant_id=principal.tenant_id,
        principal_type=principal.principal_type,
        refresh_cookie=cookie_mode,
    )


def _error_clearing_refresh_cookie(exc: HTTPException) -> JSONResponse:
    """Same error the client would have got, plus removal of the refresh cookie that caused it."""
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)
    clear_external_refresh_cookie(response)
    return response


async def _principal_for_refresh_token(db: AsyncSession, token: str) -> ExternalPrincipal:
    """Active principal named by a refresh token; rejects revoked (session_version) and mismatched tokens."""
    payload = decode_external_refresh_token(token)
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
    assert_session_version_current(payload, principal)
    return principal


@router.post("/login", response_model=ExternalTokenResponse)
async def external_login(
    body: ExternalLoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    from app.common.login_lockout import enforce_login_rate_limit

    await enforce_login_rate_limit(
        request,
        company_key=body.company_code or "",
        scope="external",
    )
    tenant = await resolve_tenant_by_company_code(db, body.company_code)
    if not tenant:
        from app.common.auth import verify_password_constant_time

        await verify_password_constant_time(body.password, None)
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
    return _token_response(request, response, access=access, refresh=refresh, principal=principal)


async def _logout_principal(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_optional)],
) -> ExternalPrincipal | None:
    """Who is logging out: Bearer access token, or (cookie mode) the refresh cookie + CSRF header.

    Returns None when only a stale cookie is left, so logout can still clear it.
    """
    cookie_token = read_external_refresh_cookie(request) if refresh_cookie_enabled() else None
    if credentials is not None:
        try:
            return await get_current_external_principal(db, credentials)
        except HTTPException:
            if not cookie_token:
                raise
    if cookie_token:
        require_csrf_header(request)
        try:
            return await _principal_for_refresh_token(db, cookie_token)
        except HTTPException:
            return None
    # Same "Not authenticated" error as before cookie support existed.
    await _bearer_required(request)
    return None


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def external_logout(
    principal: Annotated[ExternalPrincipal | None, Depends(_logout_principal)],
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Revoke every token for this principal (all devices), record logout, clear the refresh cookie."""
    from app.external_access.audit import log_external_action

    if principal is not None:
        bump_session_version(principal)
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
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    if refresh_cookie_enabled():
        clear_external_refresh_cookie(response)
    return response


@router.post("/refresh", response_model=ExternalTokenResponse)
async def external_refresh(
    request: Request,
    response: Response,
    body: ExternalRefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """New token pair from a refresh token sent in the JSON body or (cookie mode) the HttpOnly cookie."""
    body_token = body.refresh_token if body is not None else None
    cookie_token = read_external_refresh_cookie(request) if refresh_cookie_enabled() else None
    if body_token:
        via_cookie = False
        token = body_token
    elif cookie_token:
        require_csrf_header(request)
        via_cookie = True
        token = cookie_token
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="refresh_token is required")
    try:
        principal = await _refresh_principal(db, token)
    except HTTPException as exc:
        if not via_cookie:
            raise
        await safe_async_session_rollback(db)
        return _error_clearing_refresh_cookie(exc)
    access, refresh = await issue_tokens_for_principal(principal)
    return _token_response(request, response, access=access, refresh=refresh, principal=principal)


async def _refresh_principal(db: AsyncSession, token: str) -> ExternalPrincipal:
    principal = await _principal_for_refresh_token(db, token)
    if principal.locked_at is not None:
        from app.common.login_lockout import lockout_minutes, lockout_still_active

        minutes = lockout_minutes(getattr(get_settings(), "external_login_lockout_minutes", 30))
        if lockout_still_active(principal.locked_at, minutes=minutes):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")
        principal.locked_at = None
        principal.failed_login_count = 0
    tenant_row = await db.execute(
        select(Tenant).where(
            Tenant.id == principal.tenant_id,
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    tenant = tenant_row.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    require_portal_enabled(tenant=tenant, principal_type=principal.principal_type)
    return principal


@router.post("/accept-invite", response_model=ExternalTokenResponse)
async def external_accept_invite(
    body: ExternalAcceptInviteRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    from app.common.login_lockout import enforce_login_rate_limit

    await enforce_login_rate_limit(request, company_key="invite", scope="accept_invite")
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
    return _token_response(request, response, access=access, refresh=refresh, principal=principal)


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
    if reset_jwt and tenant:
        try:
            await send_external_password_reset_email(
                to_email=str(body.email),
                recipient_name=None,
                tenant_name=tenant.name,
                company_code=tenant.company_code,
                principal_type=body.principal_type.strip().lower(),
                reset_token=reset_jwt,
            )
        except Exception as exc:
            logger.warning(
                "External password reset email failed for %s (%s): %s",
                body.email,
                body.principal_type,
                exc,
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
            FF_SUPPLIER_PORTAL_ENABLED,
        )
        if k in raw
    }
    if not feature_subset:
        feature_subset = {
            FF_CUSTOMER_PORTAL_ENABLED: is_customer_portal_enabled(tenant),
            FF_FINANCIER_PORTAL_ENABLED: is_financier_portal_enabled(tenant),
            FF_SUPPLIER_PORTAL_ENABLED: is_supplier_portal_enabled(tenant),
        }

    financier_scope: str | None = None
    if principal.principal_type == PRINCIPAL_FINANCIER:
        from app.external_access.deps import financier_max_scope

        financier_scope = await financier_max_scope(db, principal)

    return ExternalMeResponse(
        principal_id=principal.id,
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        company_code=tenant.company_code,
        tenant_address=(tenant.address or "").strip() or None,
        tenant_phone=(tenant.phone or "").strip() or None,
        email=principal.email,
        full_name=principal.full_name,
        principal_type=principal.principal_type,
        role_codes=role_codes,
        feature_flags=feature_subset,
        must_reset_password=principal.must_reset_password,
        financier_access_scope=financier_scope,
    )
