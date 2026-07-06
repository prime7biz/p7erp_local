"""Shared tenant provisioning helpers (admin API + Celery workers)."""

from __future__ import annotations

import random
import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.system_roles import SYSTEM_ROLE_SEEDS
from app.models import PlatformPlan, Role, Tenant, TenantSubscription
from app.models.tenant import TenantType
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa


async def generate_company_code(db: AsyncSession, name: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", name)[:4].upper()
    if len(letters) < 4:
        letters = (letters + "XXXX")[:4]
    for _ in range(100):
        digits = str(random.randint(100000, 999999))
        candidate = letters + digits
        existing = await db.execute(select(Tenant.id).where(Tenant.company_code == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate unique company code")


async def provision_tenant_row(
    db: AsyncSession,
    *,
    name: str,
    tenant_type: TenantType,
    domain: str | None,
    plan_id: int | None,
) -> Tenant:
    company_code = await generate_company_code(db, name)
    tenant = Tenant(
        name=name.strip(),
        domain=domain,
        tenant_type=tenant_type,
        company_code=company_code,
        country_code="BD",
    )
    db.add(tenant)
    await db.flush()
    for role_name, display in SYSTEM_ROLE_SEEDS:
        db.add(
            Role(
                tenant_id=tenant.id,
                name=role_name,
                display_name=display,
                permissions={},
                is_system=True,
            )
        )
    await db.flush()
    await seed_tenant_system_coa(db, tenant.id)
    if plan_id:
        plan = await db.get(PlatformPlan, plan_id)
        if plan:
            db.add(
                TenantSubscription(
                    tenant_id=tenant.id,
                    plan_id=plan_id,
                    provider="platform_manual",
                    status="active",
                    billing_cycle="monthly",
                )
            )
    return tenant
