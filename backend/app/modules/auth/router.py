from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy import func

from app.common.auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
    hash_password,
    verify_password,
)
from app.common.authz import ensure_user_is_tenant_admin
from app.config import get_settings
from app.database import get_db
from app.models import Tenant, User, Role
from app.modules.auth.me_schema import MeResponse
from app.modules.audit.service import log_action
from app.modules.auth.schemas import RegisterRequest, TokenResponse, UserResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/auth", tags=["auth"])


def _is_dev_app_env(settings) -> bool:
    return settings.app_env.lower() in {"dev", "development", "local", "test", "testing"}


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

    if not company_code and tenant_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide company_code or tenant_id")
    if not username and not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide username or email")

    tenant = None
    if company_code:
        tenant_result = await db.execute(
            select(Tenant).where(
                func.lower(Tenant.company_code) == company_code.lower(),
                Tenant.is_active.is_(True),
            ).limit(1)
        )
        tenant = tenant_result.scalar_one_or_none()
    elif tenant_id is not None:
        tenant_result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id, Tenant.is_active.is_(True))
        )
        tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user_query = select(User).where(User.tenant_id == tenant.id, User.is_active.is_(True))
    if username:
        user_query = user_query.where(User.username == username)
    elif email:
        user_query = user_query.where(User.email == email)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide username or email")
    user_result = await db.execute(user_query.limit(1))
    user = user_result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    await log_action(db, tenant_id=user.tenant_id, action="LOGIN", user_id=user.id, resource="auth")
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
    tenant_result = await db.execute(select(Tenant).where(Tenant.id == body.tenant_id, Tenant.is_active.is_(True)))
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
            if not supplied or not verify_password(supplied, tenant_hash):
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
        elif not _is_dev_app_env(settings):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "Bootstrap registration is disabled: set BOOTSTRAP_REGISTRATION_KEY or "
                    "tenants.bootstrap_token_hash for this tenant"
                ),
            )
    if not is_bootstrap and not getattr(settings, "allow_public_registration", False):
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required for registration",
            )
        await ensure_user_is_tenant_admin(db, current_user, tenant.id)

    existing = await db.execute(
        select(User).where(User.tenant_id == body.tenant_id, User.email == body.email)
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
    user = User(
        tenant_id=body.tenant_id,
        role_id=role.id,
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    if is_bootstrap and clear_tenant_bootstrap_hash:
        tenant.bootstrap_token_hash = None
    return UserResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        is_active=user.is_active,
    )


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
    )
