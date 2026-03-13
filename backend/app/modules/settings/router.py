from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user, hash_password
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import AuditLog, CommissionMode, Role, Tenant, User
from app.modules.audit.service import log_action
from app.modules.settings.schemas import (
    BackupHistoryRow,
    BackupStatusResponse,
    SettingsAuditLogListResponse,
    SettingsAuditLogRow,
    SettingsChequeTemplatesListResponse,
    SettingsChequeTemplateRow,
    SettingsConfigResponse,
    SettingsConfigUpdate,
    SettingsPricingResponse,
    SettingsRoleCreate,
    SettingsRoleResponse,
    SettingsRoleUpdate,
    SettingsUserCreate,
    SettingsUserResponse,
    SettingsUserUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _is_protected_role(role: Role) -> bool:
    return role.name.lower() == "admin"


async def _get_tenant_role(db: AsyncSession, tenant_id: int, role_id: int) -> Role:
    result = await db.execute(select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found")
    return role


async def _get_tenant_user(db: AsyncSession, tenant_id: int, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return target


@router.get("/config", response_model=SettingsConfigResponse)
async def get_settings_config(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    _ensure_user_tenant(user, tenant)
    return SettingsConfigResponse(
        tenant_id=tenant.id,
        company_name=tenant.name,
        company_code=tenant.company_code,
        domain=tenant.domain,
        logo=tenant.logo,
        tenant_type=tenant.tenant_type,
        default_commission_mode=tenant.default_commission_mode or CommissionMode.EXCLUDE,
        is_active=tenant.is_active,
    )


@router.put("/config", response_model=SettingsConfigResponse)
async def update_settings_config(
    body: SettingsConfigUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)

    domain = (body.domain or "").strip() or None
    if domain != tenant.domain:
        existing_domain = await db.execute(
            select(Tenant).where(Tenant.domain == domain, Tenant.id != tenant.id)
        )
        if existing_domain.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already in use")

    tenant.name = body.company_name.strip()
    tenant.domain = domain
    tenant.logo = (body.logo or "").strip() or None
    tenant.tenant_type = body.tenant_type
    if body.default_commission_mode is not None:
        tenant.default_commission_mode = body.default_commission_mode
    await db.flush()
    await db.refresh(tenant)

    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_UPDATE",
        resource="settings.config",
        details=f"Updated company profile for tenant {tenant.id}",
    )

    return SettingsConfigResponse(
        tenant_id=tenant.id,
        company_name=tenant.name,
        company_code=tenant.company_code,
        domain=tenant.domain,
        logo=tenant.logo,
        tenant_type=tenant.tenant_type,
        default_commission_mode=tenant.default_commission_mode or CommissionMode.EXCLUDE,
        is_active=tenant.is_active,
    )


@router.get("/roles", response_model=list[SettingsRoleResponse])
async def list_settings_roles(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    result = await db.execute(select(Role).where(Role.tenant_id == tenant.id).order_by(Role.display_name.asc()))
    rows = result.scalars().all()
    return [
        SettingsRoleResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            name=r.name,
            display_name=r.display_name,
            permissions=r.permissions or {},
        )
        for r in rows
    ]


@router.post("/roles", response_model=SettingsRoleResponse, status_code=status.HTTP_201_CREATED)
async def create_settings_role(
    body: SettingsRoleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    role_name = body.name.strip().lower()
    existing = await db.execute(
        select(Role).where(func.lower(Role.name) == role_name, Role.tenant_id == tenant.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role name already exists")

    role = Role(
        tenant_id=tenant.id,
        name=role_name,
        display_name=body.display_name.strip(),
        permissions=body.permissions or {},
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_ROLE_CREATE",
        resource="settings.role",
        details=f"Created role {role.name}",
    )
    return SettingsRoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        display_name=role.display_name,
        permissions=role.permissions or {},
    )


@router.patch("/roles/{role_id}", response_model=SettingsRoleResponse)
async def update_settings_role(
    role_id: int,
    body: SettingsRoleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    role = await _get_tenant_role(db, tenant.id, role_id)

    if body.display_name is not None:
        role.display_name = body.display_name.strip()
    if body.permissions is not None:
        role.permissions = body.permissions

    await db.flush()
    await db.refresh(role)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_ROLE_UPDATE",
        resource="settings.role",
        details=f"Updated role {role.name}",
    )
    return SettingsRoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        name=role.name,
        display_name=role.display_name,
        permissions=role.permissions or {},
    )


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_settings_role(
    role_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    role = await _get_tenant_role(db, tenant.id, role_id)
    if _is_protected_role(role):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin role cannot be deleted")

    role_users = await db.execute(
        select(func.count()).select_from(User).where(User.tenant_id == tenant.id, User.role_id == role.id)
    )
    user_count = role_users.scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role is assigned to users. Reassign users before delete.",
        )

    await db.delete(role)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_ROLE_DELETE",
        resource="settings.role",
        details=f"Deleted role {role.name}",
    )


@router.get("/users", response_model=list[SettingsUserResponse])
async def list_settings_users(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(User, Role)
        .join(Role, User.role_id == Role.id)
        .where(User.tenant_id == tenant.id)
        .order_by(User.id.asc())
    )
    rows = result.all()
    return [
        SettingsUserResponse(
            id=u.id,
            tenant_id=u.tenant_id,
            role_id=u.role_id,
            email=u.email,
            username=u.username,
            first_name=u.first_name,
            last_name=u.last_name,
            is_active=u.is_active,
            role_name=r.display_name,
        )
        for u, r in rows
    ]


@router.post("/users", response_model=SettingsUserResponse, status_code=status.HTTP_201_CREATED)
async def create_settings_user(
    body: SettingsUserCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    role = await _get_tenant_role(db, tenant.id, body.role_id)

    email_value = body.email.strip().lower()
    username_value = body.username.strip().lower()
    existing = await db.execute(
        select(User).where(
            User.tenant_id == tenant.id,
            (func.lower(User.email) == email_value) | (func.lower(User.username) == username_value),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with same email or username already exists",
        )

    new_user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=email_value,
        username=body.username.strip(),
        password_hash=hash_password(body.password),
        first_name=(body.first_name or "").strip() or None,
        last_name=(body.last_name or "").strip() or None,
        is_active=body.is_active,
    )
    db.add(new_user)
    await db.flush()
    await db.refresh(new_user)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_USER_CREATE",
        resource="settings.user",
        details=f"Created user {new_user.username}",
    )
    return SettingsUserResponse(
        id=new_user.id,
        tenant_id=new_user.tenant_id,
        role_id=new_user.role_id,
        email=new_user.email,
        username=new_user.username,
        first_name=new_user.first_name,
        last_name=new_user.last_name,
        is_active=new_user.is_active,
        role_name=role.display_name,
    )


@router.patch("/users/{target_user_id}", response_model=SettingsUserResponse)
async def update_settings_user(
    target_user_id: int,
    body: SettingsUserUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    target = await _get_tenant_user(db, tenant.id, target_user_id)

    if body.role_id is not None:
        role = await _get_tenant_role(db, tenant.id, body.role_id)
        target.role_id = role.id

    if body.email is not None:
        new_email = body.email.strip().lower()
        existing_email = await db.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                func.lower(User.email) == new_email,
                User.id != target.id,
            )
        )
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")
        target.email = new_email

    if body.username is not None:
        new_username = body.username.strip()
        existing_username = await db.execute(
            select(User).where(
                User.tenant_id == tenant.id,
                func.lower(User.username) == new_username.lower(),
                User.id != target.id,
            )
        )
        if existing_username.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already in use")
        target.username = new_username

    if body.first_name is not None:
        target.first_name = body.first_name.strip() or None
    if body.last_name is not None:
        target.last_name = body.last_name.strip() or None
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password is not None:
        target.password_hash = hash_password(body.password)

    await db.flush()
    await db.refresh(target)
    role_result = await db.execute(select(Role).where(Role.id == target.role_id))
    role = role_result.scalar_one()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_USER_UPDATE",
        resource="settings.user",
        details=f"Updated user {target.username}",
    )
    return SettingsUserResponse(
        id=target.id,
        tenant_id=target.tenant_id,
        role_id=target.role_id,
        email=target.email,
        username=target.username,
        first_name=target.first_name,
        last_name=target.last_name,
        is_active=target.is_active,
        role_name=role.display_name,
    )


@router.post("/users/{target_user_id}/deactivate", response_model=SettingsUserResponse)
async def deactivate_settings_user(
    target_user_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    target = await _get_tenant_user(db, tenant.id, target_user_id)
    if target.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
    target.is_active = False
    await db.flush()
    await db.refresh(target)
    role = await _get_tenant_role(db, tenant.id, target.role_id)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_USER_DEACTIVATE",
        resource="settings.user",
        details=f"Deactivated user {target.username}",
    )
    return SettingsUserResponse(
        id=target.id,
        tenant_id=target.tenant_id,
        role_id=target.role_id,
        email=target.email,
        username=target.username,
        first_name=target.first_name,
        last_name=target.last_name,
        is_active=target.is_active,
        role_name=role.display_name,
    )


@router.post("/users/{target_user_id}/activate", response_model=SettingsUserResponse)
async def activate_settings_user(
    target_user_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    target = await _get_tenant_user(db, tenant.id, target_user_id)
    target.is_active = True
    await db.flush()
    await db.refresh(target)
    role = await _get_tenant_role(db, tenant.id, target.role_id)
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_USER_ACTIVATE",
        resource="settings.user",
        details=f"Activated user {target.username}",
    )
    return SettingsUserResponse(
        id=target.id,
        tenant_id=target.tenant_id,
        role_id=target.role_id,
        email=target.email,
        username=target.username,
        first_name=target.first_name,
        last_name=target.last_name,
        is_active=target.is_active,
        role_name=role.display_name,
    )


@router.delete("/users/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_settings_user(
    target_user_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    target = await _get_tenant_user(db, tenant.id, target_user_id)
    if target.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    username = target.username
    await db.delete(target)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SETTINGS_USER_DELETE",
        resource="settings.user",
        details=f"Deleted user {username}",
    )


@router.get("/audit", response_model=SettingsAuditLogListResponse)
async def list_settings_audit_logs(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None),
    resource: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
):
    _ensure_user_tenant(user, tenant)

    filters = [AuditLog.tenant_id == tenant.id]
    if action:
        filters.append(AuditLog.action == action)
    if resource:
        filters.append(AuditLog.resource == resource)
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if search:
        filters.append(func.lower(func.coalesce(AuditLog.details, "")).like(f"%{search.lower()}%"))
    if created_from:
        filters.append(AuditLog.created_at >= created_from)
    if created_to:
        filters.append(AuditLog.created_at <= created_to)

    total_result = await db.execute(select(func.count()).select_from(AuditLog).where(*filters))
    total = total_result.scalar() or 0

    result = await db.execute(
        select(AuditLog)
        .where(*filters)
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
        .offset(offset)
    )
    rows = result.scalars().all()
    return SettingsAuditLogListResponse(
        items=[
            SettingsAuditLogRow(
                id=r.id,
                tenant_id=r.tenant_id,
                user_id=r.user_id,
                action=r.action,
                resource=r.resource,
                details=r.details,
                created_at=r.created_at,
            )
            for r in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/backup/history", response_model=list[BackupHistoryRow])
async def list_backup_history(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
):
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.backup")
        .order_by(desc(AuditLog.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        BackupHistoryRow(
            id=r.id,
            created_at=r.created_at,
            status="restore_triggered" if r.action == "BACKUP_RESTORE_TRIGGERED" else "success",
            note=r.details,
            initiated_by_user_id=r.user_id,
        )
        for r in rows
    ]


@router.post("/backup/restore/{backup_log_id}", response_model=BackupStatusResponse)
async def trigger_backup_restore(
    backup_log_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    backup_log = await db.get(AuditLog, backup_log_id)
    if not backup_log or backup_log.tenant_id != tenant.id or backup_log.resource != "settings.backup":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup snapshot not found")

    message = f"Restore triggered from snapshot #{backup_log_id}."
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="BACKUP_RESTORE_TRIGGERED",
        resource="settings.backup",
        details=message,
    )

    latest = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.backup")
        .order_by(desc(AuditLog.created_at))
        .limit(1)
    )
    row = latest.scalar_one_or_none()
    return BackupStatusResponse(
        enabled=True,
        provider="local-storage",
        retention_days=30,
        last_backup_at=row.created_at if row else None,
        last_backup_status="restore_triggered",
        last_backup_note=message,
    )


@router.get("/backup/status", response_model=BackupStatusResponse)
async def get_backup_status(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)

    latest = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id, AuditLog.action == "BACKUP_TRIGGERED")
        .order_by(desc(AuditLog.created_at))
        .limit(1)
    )
    row = latest.scalar_one_or_none()
    return BackupStatusResponse(
        enabled=True,
        provider="local-storage",
        retention_days=30,
        last_backup_at=row.created_at if row else None,
        last_backup_status="success" if row else "never_run",
        last_backup_note=row.details if row else "No backup has been triggered yet.",
    )


@router.post("/backup/trigger", response_model=BackupStatusResponse)
async def trigger_backup(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)

    message = "Manual backup triggered from Settings module."
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="BACKUP_TRIGGERED",
        resource="settings.backup",
        details=message,
    )

    latest = await db.execute(
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant.id, AuditLog.action == "BACKUP_TRIGGERED")
        .order_by(desc(AuditLog.created_at))
        .limit(1)
    )
    row = latest.scalar_one_or_none()

    return BackupStatusResponse(
        enabled=True,
        provider="local-storage",
        retention_days=30,
        last_backup_at=row.created_at if row else None,
        last_backup_status="success",
        last_backup_note=row.details if row else message,
    )


@router.get("/pricing", response_model=SettingsPricingResponse)
async def get_settings_pricing(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Stub: return current plan/subscription for the tenant."""
    _ensure_user_tenant(user, tenant)
    return SettingsPricingResponse(
        plan="trial",
        display_name="Trial",
        max_users=None,
        features=["Full access during trial", "All modules", "Email support"],
    )


@router.get("/cheque-templates", response_model=SettingsChequeTemplatesListResponse)
async def list_settings_cheque_templates(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
):
    """Stub: list cheque templates for the tenant (empty until implemented)."""
    _ensure_user_tenant(user, tenant)
    return SettingsChequeTemplatesListResponse(items=[], total=0)

