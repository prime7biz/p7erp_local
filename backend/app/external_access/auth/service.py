"""External auth business logic."""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password
from app.common.db_datetime import utc_now_naive
from app.config import get_settings
from app.models import (
    Customer,
    ExternalInvitation,
    ExternalPrincipal,
    ExternalPrincipalRole,
    ExternalRole,
    Tenant,
)

from app.external_access.audit import log_external_action
from app.external_access.constants import (
    JWT_CLAIM_PRINCIPAL_TYPE,
    JWT_CLAIM_TENANT,
    PRINCIPAL_CUSTOMER,
    PRINCIPAL_FINANCIER,
    parse_external_subject,
)
from app.external_access.feature_flags import require_portal_enabled
from app.external_access.tokens import (
    create_external_access_token,
    create_external_password_reset_token,
    create_external_refresh_token,
    decode_external_password_reset_token,
)

logger = logging.getLogger(__name__)


async def resolve_tenant_by_company_code(db: AsyncSession, company_code: str) -> Tenant | None:
    cc = (company_code or "").strip()
    if not cc:
        return None
    result = await db.execute(
        select(Tenant).where(
            func.lower(Tenant.company_code) == cc.lower(),
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def record_failed_login(db: AsyncSession, principal: ExternalPrincipal) -> None:
    settings = get_settings()
    principal.failed_login_count = (principal.failed_login_count or 0) + 1
    if principal.failed_login_count >= settings.external_login_max_attempts:
        principal.locked_at = utc_now_naive()
    await db.flush()


async def clear_failed_login(db: AsyncSession, principal: ExternalPrincipal) -> None:
    principal.failed_login_count = 0
    principal.locked_at = None
    await db.flush()


async def authenticate_external(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    password: str,
    principal_type: str,
) -> ExternalPrincipal:
    if principal_type not in (PRINCIPAL_CUSTOMER, PRINCIPAL_FINANCIER):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid principal_type")
    require_portal_enabled(tenant=tenant, principal_type=principal_type)

    em = (email or "").strip().lower()
    result = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            func.lower(ExternalPrincipal.email) == em,
            ExternalPrincipal.principal_type == principal_type,
        )
    )
    principal = result.scalar_one_or_none()
    if not principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not principal.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")

    settings = get_settings()
    if principal.locked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")

    if not await verify_password(password, principal.password_hash):
        await record_failed_login(db, principal)
        await log_external_action(
            db,
            tenant_id=tenant.id,
            action="EXTERNAL_LOGIN_FAILED",
            resource_type="external_principal",
            resource_id=principal.id,
            external_principal_id=principal.id,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if principal.must_reset_password:
        # Allow login but frontend should force password change — still issue tokens for /me flow
        pass

    await clear_failed_login(db, principal)
    principal.last_login_at = utc_now_naive()
    await db.flush()
    return principal


async def issue_tokens_for_principal(principal: ExternalPrincipal) -> tuple[str, str]:
    access = create_external_access_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
    )
    refresh = create_external_refresh_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
    )
    return access, refresh


async def accept_invitation(
    db: AsyncSession,
    *,
    token: str,
    full_name: str,
    password: str,
    phone: str | None,
    ip_address: str | None,
    user_agent: str | None,
) -> ExternalPrincipal:
    """Validate invite token, create principal, assign roles and access from payload_json."""
    from app.models import ExternalCustomerAccess, ExternalFinancierAccess

    token_plain = (token or "").strip()
    if len(token_plain) < 16:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    # Compare against hashed tokens in pending invitations
    result = await db.execute(
        select(ExternalInvitation).where(
            ExternalInvitation.accepted_at.is_(None),
            ExternalInvitation.expires_at > utc_now_naive(),
        )
    )
    invitations = result.scalars().all()
    matched: ExternalInvitation | None = None
    for inv in invitations:
        if await verify_password(token_plain, inv.token_hash):
            matched = inv
            break
    if not matched:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")

    await db.execute(
        select(ExternalInvitation).where(ExternalInvitation.id == matched.id).with_for_update()
    )
    await db.refresh(matched)
    if matched.accepted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has already been used",
        )
    if matched.expires_at <= utc_now_naive():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired invitation")

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == matched.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if not tenant or not tenant.is_active or tenant.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not available")

    require_portal_enabled(tenant=tenant, principal_type=matched.principal_type)

    em = matched.email.strip().lower()
    existing = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == matched.tenant_id,
            func.lower(ExternalPrincipal.email) == em,
            ExternalPrincipal.principal_type == matched.principal_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already exists")

    payload = matched.payload_json if isinstance(matched.payload_json, dict) else {}
    role_codes = payload.get("role_codes") or []
    if not isinstance(role_codes, list) or not role_codes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation misconfigured")

    resolved_roles: list[ExternalRole] = []
    for code in role_codes:
        if not isinstance(code, str):
            continue
        rr = await db.execute(select(ExternalRole).where(ExternalRole.code == code.strip()))
        role = rr.scalar_one_or_none()
        if role:
            resolved_roles.append(role)
    if not resolved_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation misconfigured")

    customer_ids: list[int] = []
    financier_scope = "orders_and_pipeline"
    fpid_int: int | None = None
    if matched.principal_type == PRINCIPAL_CUSTOMER:
        for cid in payload.get("customer_ids") or []:
            try:
                customer_ids.append(int(cid))
            except (TypeError, ValueError):
                continue
        if not customer_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation misconfigured")
        for cid_int in customer_ids:
            cr = await db.execute(
                select(Customer.id).where(
                    Customer.id == cid_int,
                    Customer.tenant_id == matched.tenant_id,
                )
            )
            if cr.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Invitation references customers that are no longer available. "
                        "Ask your administrator to send a new invitation."
                    ),
                )
    elif matched.principal_type == PRINCIPAL_FINANCIER:
        scope = payload.get("access_scope") or "orders_and_pipeline"
        financier_scope = scope if isinstance(scope, str) else "orders_and_pipeline"
        fpid = payload.get("financier_party_id")
        fpid_int = int(fpid) if fpid is not None and str(fpid).isdigit() else None
        if fpid_int is not None:
            pr = await db.execute(
                select(ExternalPrincipal.id).where(
                    ExternalPrincipal.id == fpid_int,
                    ExternalPrincipal.tenant_id == matched.tenant_id,
                )
            )
            if pr.scalar_one_or_none() is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Invitation references a bank contact that is no longer available. "
                        "Ask your administrator to send a new invitation."
                    ),
                )

    try:
        principal = ExternalPrincipal(
            tenant_id=matched.tenant_id,
            principal_type=matched.principal_type,
            email=matched.email.strip(),
            password_hash=await hash_password(password),
            full_name=full_name.strip(),
            phone=(phone or "").strip() or None,
            is_active=True,
            invited_at=matched.created_at,
            invited_by_user_id=matched.invited_by_user_id,
            accepted_at=utc_now_naive(),
            must_reset_password=False,
        )
        db.add(principal)
        await db.flush()

        for role in resolved_roles:
            db.add(ExternalPrincipalRole(external_principal_id=principal.id, role_id=role.id))

        if matched.principal_type == PRINCIPAL_CUSTOMER:
            for cid_int in customer_ids:
                db.add(
                    ExternalCustomerAccess(
                        tenant_id=matched.tenant_id,
                        external_principal_id=principal.id,
                        customer_id=cid_int,
                        is_primary=False,
                    )
                )
        elif matched.principal_type == PRINCIPAL_FINANCIER:
            db.add(
                ExternalFinancierAccess(
                    tenant_id=matched.tenant_id,
                    external_principal_id=principal.id,
                    financier_party_id=fpid_int,
                    access_scope=financier_scope,
                )
            )

        matched.accepted_at = utc_now_naive()
        await db.flush()

        await log_external_action(
            db,
            tenant_id=tenant.id,
            action="EXTERNAL_INVITE_ACCEPTED",
            resource_type="external_principal",
            resource_id=principal.id,
            external_principal_id=principal.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return principal
    except IntegrityError as exc:
        logger.warning("accept_invitation integrity error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unable to complete registration. The invitation may already be used, "
                "or linked records may have changed. Ask your administrator if this persists."
            ),
        ) from exc


async def request_password_reset(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    principal_type: str,
) -> str | None:
    """Return signed JWT reset token for email (integrate mailer in production)."""
    require_portal_enabled(tenant=tenant, principal_type=principal_type)
    em = (email or "").strip().lower()
    result = await db.execute(
        select(ExternalPrincipal).where(
            ExternalPrincipal.tenant_id == tenant.id,
            func.lower(ExternalPrincipal.email) == em,
            ExternalPrincipal.principal_type == principal_type,
            ExternalPrincipal.is_active.is_(True),
        )
    )
    principal = result.scalar_one_or_none()
    if not principal:
        return None
    await db.flush()
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_PASSWORD_RESET_REQUESTED",
        resource_type="external_principal",
        resource_id=principal.id,
        external_principal_id=principal.id,
    )
    return create_external_password_reset_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
    )


async def reset_password_with_token(
    db: AsyncSession,
    *,
    token: str,
    new_password: str,
) -> None:
    payload = decode_external_password_reset_token((token or "").strip())
    pid = parse_external_subject(payload.get("sub") if isinstance(payload.get("sub"), str) else None)
    if pid is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    tid = payload.get(JWT_CLAIM_TENANT)
    result = await db.execute(select(ExternalPrincipal).where(ExternalPrincipal.id == pid))
    matched = result.scalar_one_or_none()
    if not matched or (tid is not None and int(tid) != matched.tenant_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    pt = payload.get(JWT_CLAIM_PRINCIPAL_TYPE)
    if pt is not None and pt != matched.principal_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    matched.password_hash = await hash_password(new_password)
    matched.password_reset_token_hash = None
    matched.password_reset_expires_at = None
    matched.must_reset_password = False
    matched.failed_login_count = 0
    matched.locked_at = None
    await db.flush()
    await log_external_action(
        db,
        tenant_id=matched.tenant_id,
        action="EXTERNAL_PASSWORD_RESET_COMPLETED",
        resource_type="external_principal",
        resource_id=matched.id,
        external_principal_id=matched.id,
    )
