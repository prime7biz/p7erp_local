"""Optional subscription plan checks (warn-only by default)."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlatformPlan, TenantSubscription, User

logger = logging.getLogger(__name__)


async def warn_if_over_user_limit(db: AsyncSession, tenant_id: int) -> None:
    """Log a warning if user count exceeds plan max_users (does not block)."""
    sub = (
        await db.execute(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    ).scalar_one_or_none()
    if not sub:
        return
    plan = await db.get(PlatformPlan, sub.plan_id)
    if not plan or not plan.max_users:
        return
    cnt = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id))).scalar() or 0
    if int(cnt) > int(plan.max_users):
        logger.warning(
            "Tenant %s exceeds plan user limit (%s > %s)", tenant_id, cnt, plan.max_users
        )
