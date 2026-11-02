"""External auth business logic."""

from __future__ import annotations

import hmac
import logging
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password, verify_password, verify_password_constant_time
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
    PRINCIPAL_SUPPLIER,
    parse_external_subject,
)
from app.external_access.feature_flags import require_portal_enabled
from app.external_access.tokens import (
    PASSWORD_RESET_TOKEN_HOURS,
    bump_session_version,
    create_external_access_token,
    create_external_password_reset_token,
    create_external_refresh_token,
    decode_external_password_reset_token,
    hash_reset_jti,
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


def _external_lock_active(principal: ExternalPrincipal) -> bool:
    """True while a timed lock is in force; clears an expired lock in place."""
    from app.common.login_lockout import lockout_minutes, lockout_still_active

    if principal.locked_at is None:
        return False
    minutes = lockout_minutes(getattr(get_settings(), "external_login_lockout_minutes", 30))
    if lockout_still_active(principal.locked_at, minutes=minutes):
        return True
    principal.locked_at = None
    principal.failed_login_count = 0
    return False


def _assert_external_not_locked(principal: ExternalPrincipal) -> None:
    if _external_lock_active(principal):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")


def _invalid_credentials() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


async def authenticate_external(
    db: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    password: str,
    principal_type: str,
) -> ExternalPrincipal:
    if principal_type not in (PRINCIPAL_CUSTOMER, PRINCIPAL_FINANCIER, PRINCIPAL_SUPPLIER):
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
    password_ok = await verify_password_constant_time(
        password, principal.password_hash if principal else None
    )
    # Missing, inactive and locked accounts all get the same generic 401 so the
    # response cannot be used to discover which portal emails exist.
    if not principal or not principal.is_active:
        raise _invalid_credentials()
    if _external_lock_active(principal):
        # Only reveal the lock to someone who already proved the password.
        if password_ok:
            _assert_external_not_locked(principal)
        raise _invalid_credentials()

    if not password_ok:
        await record_failed_login(db, principal)
        await log_external_action(
            db,
            tenant_id=tenant.id,
            action="EXTERNAL_LOGIN_FAILED",
            resource_type="external_principal",
            resource_id=principal.id,
            external_principal_id=principal.id,
        )
        await db.commit()
        raise _invalid_credentials()

    if principal.must_reset_password:
        # Allow login but frontend should force password change — still issue tokens for /me flow
        pass

    await clear_failed_login(db, principal)
    principal.last_login_at = utc_now_naive()
    await db.flush()
    return principal


async def issue_tokens_for_principal(principal: ExternalPrincipal) -> tuple[str, str]:
    sv = int(getattr(principal, "session_version", 0) or 0)
    access = create_external_access_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
        session_version=sv,
    )
    refresh = create_external_refresh_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
        session_version=sv,
    )
    return access, refresh


_LEGACY_INVITE_SCAN_LIMIT = 200


async def _find_pending_invitation(db: AsyncSession, token_plain: str) -> ExternalInvitation | None:
    pending = (
        ExternalInvitation.accepted_at.is_(None),
        ExternalInvitation.expires_at > utc_now_naive(),
    )
    prefix, sep, secret = token_plain.partition(".")
    if sep and prefix.isdigit() and secret:
        inv = (
            await db.execute(select(ExternalInvitation).where(ExternalInvitation.id == int(prefix), *pending))
        ).scalar_one_or_none()
        if inv and await verify_password(secret, inv.token_hash):
            return inv
        return None
    # Links sent before id-prefixed tokens: bounded scan of the newest pending invites.
    rows = (
        await db.execute(
            select(ExternalInvitation)
            .where(*pending)
            .order_by(ExternalInvitation.id.desc())
            .limit(_LEGACY_INVITE_SCAN_LIMIT)
        )
    ).scalars().all()
    for inv in rows:
        if await verify_password(token_plain, inv.token_hash):
            return inv
    return None


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

    matched = await _find_pending_invitation(db, token_plain)
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
    vendor_ids: list[int] = []
    financier_scope = "orders_and_pipeline"
    fpid_int: int | None = None
    if matched.principal_type == PRINCIPAL_SUPPLIER:
        from app.models import Vendor

        for vid in payload.get("vendor_ids") or []:
            try:
                vendor_ids.append(int(vid))
            except (TypeError, ValueError):
                continue
        if not vendor_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation misconfigured")
        found = (
            await db.execute(select(Vendor.id).where(Vendor.id.in_(vendor_ids), Vendor.tenant_id == matched.tenant_id))
        ).scalars().all()
        if set(found) != set(vendor_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Invitation references suppliers that are no longer available. "
                    "Ask your administrator to send a new invitation."
                ),
            )
    elif matched.principal_type == PRINCIPAL_CUSTOMER:
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

        if matched.principal_type == PRINCIPAL_SUPPLIER:
            from app.models.supplier_portal import ExternalSupplierAccess

            for vid in sorted(set(vendor_ids)):
                db.add(
                    ExternalSupplierAccess(
                        tenant_id=matched.tenant_id, external_principal_id=principal.id, vendor_id=vid
                    )
                )
        elif matched.principal_type == PRINCIPAL_CUSTOMER:
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
    token, jti = create_external_password_reset_token(
        principal_id=principal.id,
        principal_type=principal.principal_type,
        tenant_id=principal.tenant_id,
    )
    # Only the latest emailed link works, and only once (cleared on use).
    principal.password_reset_token_hash = hash_reset_jti(jti)
    principal.password_reset_expires_at = utc_now_naive() + timedelta(hours=PASSWORD_RESET_TOKEN_HOURS)
    await db.flush()
    await log_external_action(
        db,
        tenant_id=tenant.id,
        action="EXTERNAL_PASSWORD_RESET_REQUESTED",
        resource_type="external_principal",
        resource_id=principal.id,
        external_principal_id=principal.id,
    )
    return token


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
    if not matched.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    jti = payload.get("jti")
    stored = matched.password_reset_token_hash
    expires_at = matched.password_reset_expires_at
    if (
        not isinstance(jti, str)
        or not stored
        or not hmac.compare_digest(stored, hash_reset_jti(jti))
        or expires_at is None
        or expires_at <= utc_now_naive()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or already used reset link")

    matched.password_hash = await hash_password(new_password)
    matched.password_reset_token_hash = None
    matched.password_reset_expires_at = None
    matched.must_reset_password = False
    matched.failed_login_count = 0
    matched.locked_at = None
    bump_session_version(matched)
    await db.flush()
    await log_external_action(
        db,
        tenant_id=matched.tenant_id,
        action="EXTERNAL_PASSWORD_RESET_COMPLETED",
        resource_type="external_principal",
        resource_id=matched.id,
        external_principal_id=matched.id,
    )
