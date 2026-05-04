import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy import func

from app.common.auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
    hash_password,
    verify_password,
)
from app.common.email_service import (
    send_forgot_password_email,
    send_password_changed_notification_email,
    send_registration_confirmation_email,
    send_staff_welcome_email,
)
from app.common.authz import ensure_user_is_tenant_admin
from app.config import get_settings
from app.database import get_db
from app.models import Tenant, User, Role
from app.modules.auth.me_schema import MeResponse
from app.modules.auth.legal_acceptance import CURRENT_LEGAL_ACCEPTANCE_VERSION
from app.modules.audit.service import log_action
from app.common.username import generate_unique_username_for_tenant
from app.external_access.feature_flags import is_customer_portal_enabled, is_financier_portal_enabled
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResolveTenantRequest,
    ResolveTenantResponse,
    TokenResponse,
    UserResponse,
)
from app.modules.staff_invite.schemas import AcceptStaffInviteRequest
from app.modules.staff_invite.service import accept_staff_invitation
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])
PASSWORD_RESET_EXPIRE_MINUTES = 60
PASSWORD_RESET_TOKEN_USE = "password_reset"
logger = logging.getLogger(__name__)


def _create_password_reset_token(*, user: User, expires_at: datetime) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user.id),
        "tenant_id": user.tenant_id,
        "use": PASSWORD_RESET_TOKEN_USE,
        "jti": secrets.token_urlsafe(24),
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _decode_password_reset_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")


async def _resolve_user_for_forgot_password(
    db: AsyncSession,
    *,
    email: str,
    company_code: str | None,
) -> tuple[User | None, Tenant | None]:
    normalized_email = email.strip().lower()
    normalized_company_code = (company_code or "").strip().lower() or None

    if normalized_company_code:
        tenant_result = await db.execute(
            select(Tenant).where(
                func.lower(Tenant.company_code) == normalized_company_code,
                Tenant.is_active.is_(True),
                Tenant.deleted_at.is_(None),
            ).limit(1)
        )
        tenant = tenant_result.scalar_one_or_none()
        if not tenant:
            return None, None
        user_result = await db.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                User.is_active.is_(True),
                func.lower(User.email) == normalized_email,
            ).limit(1)
        )
        return user_result.scalar_one_or_none(), tenant

    # Email-only: same address may exist in multiple tenants — pick the most recently active user
    # (last_login DESC NULLS LAST, then highest id). JWT reset token still carries tenant_id for /reset-password.
    matches = await db.execute(
        select(User, Tenant)
        .join(Tenant, Tenant.id == User.tenant_id)
        .where(
            func.lower(User.email) == normalized_email,
            User.is_active.is_(True),
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
        .order_by(User.last_login.desc().nulls_last(), User.id.desc())
        .limit(5)
    )
    rows = matches.all()
    if not rows:
        return None, None
    user, tenant = rows[0]
    return user, tenant


@router.post("/resolve-tenant", response_model=ResolveTenantResponse)
async def resolve_tenant_public(
    body: ResolveTenantRequest,
    db: AsyncSession = Depends(get_db),
):
    """Public: validate company code and return non-sensitive tenant info for the unified login UI."""
    cc = body.company_code.strip()
    if not cc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_code is required")
    tenant_result = await db.execute(
        select(Tenant).where(
            func.lower(Tenant.company_code) == cc.lower(),
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        ).limit(1)
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    available = ["staff", "admin"]
    if is_customer_portal_enabled(tenant):
        available.append("customer")
    if is_financier_portal_enabled(tenant):
        available.append("financier")
    return ResolveTenantResponse(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        company_code=tenant.company_code,
        logo_url=tenant.logo,
        available_roles=available,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login: company_code (or companyCode) + username + password. Accepts raw JSON; no Pydantic body to avoid 422."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body")
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Body must be a JSON object")
    password = body.get("password")
    if not password or not isinstance(password, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password is required")
    # Accept both snake_case (P7) and camelCase (reference)
    company_code = (body.get("company_code") or body.get("companyCode") or "").strip() or None
    tenant_id = body.get("tenant_id")
    if tenant_id is not None and not isinstance(tenant_id, int):
        try:
            tenant_id = int(tenant_id)
        except (TypeError, ValueError):
            tenant_id = None
    username = (body.get("username") or "").strip() or None
    email = (body.get("email") or "").strip() or None
    login_as_raw = (body.get("login_as") or body.get("loginAs") or "").strip().lower() or None

    if login_as_raw in ("customer", "financier"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use POST /api/external/auth/login for customer or financier portal access",
        )

    if not company_code and tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide company_code or tenant_id")
    if not username and not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide email or username")

    tenant = None
    if company_code:
        tenant_result = await db.execute(
            select(Tenant).where(
                func.lower(Tenant.company_code) == company_code.lower(),
                Tenant.is_active.is_(True),
                Tenant.deleted_at.is_(None),
            ).limit(1)
        )
        tenant = tenant_result.scalar_one_or_none()
    elif tenant_id is not None:
        tenant_result = await db.execute(
            select(Tenant).where(
                Tenant.id == tenant_id,
                Tenant.is_active.is_(True),
                Tenant.deleted_at.is_(None),
            )
        )
        tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user_query = select(User).where(User.tenant_id == tenant.id, User.is_active.is_(True))
    if username:
        un = username.strip()
        # Many clients put an email in the "username" field; accept that shape.
        if "@" in un:
            user_query = user_query.where(func.lower(User.email) == un.lower())
        else:
            user_query = user_query.where(
                User.username.isnot(None),
                func.lower(User.username) == un.lower(),
            )
    elif email:
        em = email.strip().lower()
        user_query = user_query.where(func.lower(User.email) == em)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide email or username")
    user_result = await db.execute(user_query.limit(1))
    user = user_result.scalar_one_or_none()
    if not user or not await verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    role_row = await db.execute(select(Role).where(Role.id == user.role_id, Role.tenant_id == tenant.id).limit(1))
    role_obj = role_row.scalar_one_or_none()
    is_admin = role_obj is not None and role_obj.name.lower() == "admin"

    if login_as_raw == "admin" and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account does not have admin privileges",
        )
    if login_as_raw != "admin" and is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin accounts must use the Tenant admin login option",
        )

    user.last_login = datetime.utcnow()
    await db.flush()
    await log_action(db, tenant_id=user.tenant_id, action="LOGIN", user_id=user.id, resource="auth")
    token = create_access_token(subject=user.id)
    return TokenResponse(access_token=token, tenant_id=tenant.id)


@router.post("/accept-staff-invite", response_model=TokenResponse)
async def accept_staff_invite_public(
    body: AcceptStaffInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Public: accept staff invitation and return internal JWT (same as login)."""
    user, tenant = await accept_staff_invitation(
        db,
        token=body.token,
        password=body.password,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    try:
        await send_staff_welcome_email(
            to_email=user.email,
            recipient_name=user.first_name or user.email,
            tenant_name=tenant.name,
            company_code=tenant.company_code,
        )
    except Exception as exc:
        logger.warning("Staff welcome email failed for user_id=%s: %s", user.id, exc)
    try:
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="STAFF_INVITE_ACCEPTED",
            resource="auth",
        )
    except Exception as exc:
        logger.warning("Staff invite accept audit failed: %s", exc)
    token = create_access_token(subject=user.id)
    return TokenResponse(access_token=token, tenant_id=tenant.id)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    body: RegisterRequest,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Register a new user under a tenant with admin-controlled access by default."""
    settings = get_settings()
    tenant_result = await db.execute(
        select(Tenant).where(
            Tenant.id == body.tenant_id,
            Tenant.is_active.is_(True),
            Tenant.deleted_at.is_(None),
        )
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    user_count_result = await db.execute(
        select(func.count()).select_from(User).where(User.tenant_id == body.tenant_id)
    )
    user_count = int(user_count_result.scalar() or 0)
    is_bootstrap = user_count == 0
    clear_tenant_bootstrap_hash = False
    if is_bootstrap:
        supplied = (request.headers.get("X-Bootstrap-Key") or "").strip() or (body.bootstrap_key or "").strip()
        env_key = (getattr(settings, "bootstrap_registration_key", None) or "").strip()
        tenant_hash = (tenant.bootstrap_token_hash or "").strip() or None

        if tenant_hash:
            if not supplied or not await verify_password(supplied, tenant_hash):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bootstrap token required or invalid",
                )
            clear_tenant_bootstrap_hash = True
        elif env_key:
            if supplied != env_key:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Bootstrap registration key required or invalid",
                )
    if not is_bootstrap and not getattr(settings, "allow_public_registration", False):
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for registration",
            )
        await ensure_user_is_tenant_admin(db, current_user, tenant.id)
    if is_bootstrap and not body.accepted_legal_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Legal terms acceptance is required to register this tenant",
        )

    email_norm = str(body.email).strip().lower()
    existing = await db.execute(
        select(User).where(User.tenant_id == body.tenant_id, func.lower(User.email) == email_norm)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered for this tenant")
    role_name = "admin" if is_bootstrap else "user"
    role_result = await db.execute(
        select(Role).where(Role.tenant_id == body.tenant_id, Role.name == role_name).limit(1)
    )
    role = role_result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant has no roles; contact admin")
    uname = (body.username or "").strip() or None
    if uname:
        exists_un = await db.execute(
            select(User).where(
                User.tenant_id == body.tenant_id,
                User.username.isnot(None),
                func.lower(User.username) == uname.lower(),
            ).limit(1)
        )
        if exists_un.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use for this tenant")
    if not uname:
        uname = await generate_unique_username_for_tenant(db, body.tenant_id, email_norm)
    user = User(
        tenant_id=body.tenant_id,
        role_id=role.id,
        email=email_norm,
        username=uname,
        password_hash=await hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    if is_bootstrap:
        acceptance_version = (body.legal_acceptance_version or "").strip() or CURRENT_LEGAL_ACCEPTANCE_VERSION
        tenant.legal_acceptance_version = acceptance_version
        tenant.legal_accepted_at = datetime.now(UTC).replace(tzinfo=None)
        tenant.legal_accepted_by_email = email_norm
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="TENANT_LEGAL_ACCEPTANCE",
            resource="tenant",
            details=f"{acceptance_version}::{body.email}",
        )
    if is_bootstrap and clear_tenant_bootstrap_hash:
        tenant.bootstrap_token_hash = None
    try:
        await send_registration_confirmation_email(
            to_email=user.email,
            recipient_name=user.first_name or user.username or user.email,
            tenant_name=tenant.name,
            company_code=tenant.company_code,
        )
    except Exception as exc:
        logger.warning("Registration confirmation email failed for user_id=%s: %s", user.id, exc)
    return UserResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_active=user.is_active,
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    user, tenant = await _resolve_user_for_forgot_password(
        db,
        email=str(body.email),
        company_code=body.company_code,
    )
    if user and tenant:
        expires_at = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
        reset_token = _create_password_reset_token(user=user, expires_at=expires_at)
        user.password_reset_token_hash = _hash_reset_token(reset_token)
        user.password_reset_expires_at = expires_at
        await db.flush()
        try:
            await send_forgot_password_email(
                to_email=user.email,
                reset_token=reset_token,
                recipient_name=user.first_name or user.username or user.email,
            )
        except Exception as exc:
            logger.warning("Forgot password email failed for user_id=%s: %s", user.id, exc)
        try:
            await log_action(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                action="FORGOT_PASSWORD_REQUESTED",
                resource="auth",
            )
        except Exception as exc:
            logger.warning("Forgot password audit log failed for user_id=%s: %s", user.id, exc)
    return MessageResponse(message="If an account exists for this email, password reset instructions have been sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    token_plain = (body.token or "").strip()
    payload = _decode_password_reset_token(token_plain)
    if payload.get("use") != PASSWORD_RESET_TOKEN_USE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    sub = payload.get("sub")
    try:
        user_id = int(sub) if sub is not None else 0
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    tid_claim = payload.get("tenant_id")
    user_result = await db.execute(select(User).where(User.id == user_id, User.is_active.is_(True)))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if tid_claim is not None and int(tid_claim) != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if not user.password_reset_token_hash or user.password_reset_expires_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if user.password_reset_expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset link expired")
    if _hash_reset_token(token_plain) != user.password_reset_token_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    user.password_hash = await hash_password(body.new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    await db.flush()
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if tenant:
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="PASSWORD_RESET_COMPLETED",
            resource="auth",
        )
    try:
        await send_password_changed_notification_email(
            to_email=user.email,
            recipient_name=user.first_name or user.username or user.email,
        )
    except Exception as exc:
        logger.warning("Password changed notification email failed for user_id=%s: %s", user.id, exc)
    return MessageResponse(message="Password updated")


@router.get("/me", response_model=MeResponse)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current user and tenant (name, tenant_type). Call with Bearer token and X-Tenant-Id."""
    from sqlalchemy import select
    from app.models import Tenant

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_result.scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    role_result = await db.execute(select(Role).where(Role.id == user.role_id).limit(1))
    role_obj = role_result.scalar_one_or_none()
    role_name = role_obj.name if role_obj else ""
    role_permissions = role_obj.permissions if role_obj and isinstance(role_obj.permissions, dict) else {}
    return MeResponse(
        user_id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        tenant_name=tenant.name,
        tenant_type=tenant.tenant_type,
        company_code=tenant.company_code,
        feature_flags=tenant.feature_flags if isinstance(tenant.feature_flags, dict) else None,
        role_name=role_name,
        role_permissions=role_permissions,
    )
