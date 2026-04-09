from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.authz import ensure_user_in_tenant
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, Role, User
from app.modules.audit.service import log_action
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa
from app.modules.tenant.schemas import TenantCreate, TenantResponse
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
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

    # Auto-generate company_code: 4 uppercase letters from company name + 6 digits (10 chars total)
    letters = re.sub(r"[^A-Za-z]", "", body.name)[:4].upper()
    if len(letters) < 4:
        letters = (letters + "XXXX")[:4]
    company_code = None
    for _ in range(100):  # avoid infinite loop
        digits = str(random.randint(100000, 999999))
        candidate = letters + digits
        existing = await db.execute(select(Tenant).where(Tenant.company_code == candidate))
        if existing.scalar_one_or_none() is None:
            company_code = candidate
            break
    if company_code is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate unique company code; please try again.",
        )

    tenant = Tenant(
        name=body.name,
        domain=domain,
        tenant_type=body.tenant_type,
        company_code=company_code,
        phone=(body.phone or "").strip() or None,
        address=(body.address or "").strip() or None,
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
    await seed_tenant_system_coa(db, tenant.id)
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
    user: User = Depends(get_current_user),
):
    """Return current tenant (from X-Tenant-Id). Use after login to show tenant name and type in UI."""
    ensure_user_in_tenant(user, tenant.id)
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        domain=tenant.domain,
        tenant_type=tenant.tenant_type,
        company_code=tenant.company_code,
        is_active=tenant.is_active,
    )
