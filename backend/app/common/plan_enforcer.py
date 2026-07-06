"""Subscription plan enforcement (warn or block)."""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import PlatformPlan, TenantSubscription, User

logger = logging.getLogger(__name__)


async def _subscription_plan(db: AsyncSession, tenant_id: int) -> tuple[TenantSubscription | None, PlatformPlan | None]:
    sub = (
        await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not sub:
        return None, None
    plan = await db.get(PlatformPlan, sub.plan_id)
    return sub, plan


async def get_tenant_user_count(db: AsyncSession, tenant_id: int) -> int:
    return int(
        (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id))).scalar() or 0
    )


async def warn_if_over_user_limit(db: AsyncSession, tenant_id: int) -> None:
    """Log a warning if user count exceeds plan max_users (does not block)."""
    _sub, plan = await _subscription_plan(db, tenant_id)
    if not plan or not plan.max_users:
        return
    cnt = await get_tenant_user_count(db, tenant_id)
    if cnt > int(plan.max_users):
        logger.warning("Tenant %s exceeds plan user limit (%s > %s)", tenant_id, cnt, plan.max_users)


async def assert_can_add_user(db: AsyncSession, tenant_id: int) -> None:
    """Block new user creation when enforcement is on and plan limit reached."""
    settings = get_settings()
    if not settings.plan_enforcement_enabled:
        await warn_if_over_user_limit(db, tenant_id)
        return
    _sub, plan = await _subscription_plan(db, tenant_id)
    if not plan or not plan.max_users:
        return
    cnt = await get_tenant_user_count(db, tenant_id)
    if cnt >= int(plan.max_users):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan user limit reached ({plan.max_users}). Upgrade subscription or contact your platform administrator.",
        )


async def assert_subscription_active(db: AsyncSession, tenant_id: int) -> None:
    """Block API usage when subscription is suspended (enforcement mode only)."""
    settings = get_settings()
    if not settings.plan_enforcement_enabled:
        return
    sub, _plan = await _subscription_plan(db, tenant_id)
    if not sub:
        return
    if sub.status in {"suspended", "cancelled", "past_due"}:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Subscription inactive. Please renew to continue.",
        )
