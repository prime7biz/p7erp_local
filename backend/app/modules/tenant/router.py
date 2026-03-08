from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, Role
from app.modules.audit.service import log_action
from app.modules.tenant.schemas import TenantCreate, TenantResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("", response_model=TenantResponse)
async def create_tenant(
    body: TenantCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new tenant (e.g. for sign-up). No auth required for public sign-up flow."""
    import re
    import random

    domain = (body.domain or "").strip() or None
    if domain:
        existing = await db.execute(select(Tenant).where(Tenant.domain == domain))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Domain already registered")

    # Auto-generate company_code from company name (slug + uniqueness suffix)
    slug = re.sub(r"[^a-zA-Z0-9]", "", body.name)[:20].upper() or "T"
    company_code = slug
    while True:
        existing_code = await db.execute(select(Tenant).where(Tenant.company_code == company_code))
        if existing_code.scalar_one_or_none() is None:
            break
        company_code = f"{slug}{random.randint(100, 9999)}"[:20]

    tenant = Tenant(
        name=body.name,
        domain=domain,
        tenant_type=body.tenant_type,
        company_code=company_code,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions={},
    )
    db.add(admin_role)
    await db.flush()
    user_role = Role(
        tenant_id=tenant.id,
        name="user",
        display_name="User",
        permissions={},
    )
    db.add(user_role)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, action="TENANT_CREATE", resource="tenant", details=tenant.company_code or tenant.name)
    await db.refresh(tenant)
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        domain=tenant.domain,
        tenant_type=tenant.tenant_type,
        company_code=tenant.company_code,
        is_active=tenant.is_active,
    )


@router.get("/me", response_model=TenantResponse)
async def get_my_tenant(
    tenant: Tenant = Depends(require_tenant),
):
    """Return current tenant (from X-Tenant-Id). Use after login to show tenant name and type in UI."""
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        domain=tenant.domain,
        tenant_type=tenant.tenant_type,
        company_code=tenant.company_code,
        is_active=tenant.is_active,
    )
