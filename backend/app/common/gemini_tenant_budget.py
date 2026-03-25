"""Per-tenant Gemini budget checks and usage logging (async)."""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AiUsageLog, PlatformSettings, TenantAiBudget

logger = logging.getLogger(__name__)

# Rough USD per 1M tokens (Flash-lite scale; override via admin later)
_DEFAULT_COST_PER_1M = Decimal("0.075")


async def is_gemini_killed(db: AsyncSession) -> bool:
    row = await db.get(PlatformSettings, 1)
    if row and row.gemini_kill_switch:
        return True
    return not get_settings().gemini_enabled


async def get_or_create_tenant_budget(db: AsyncSession, tenant_id: int) -> TenantAiBudget:
    row = await db.get(TenantAiBudget, tenant_id)
    if row:
        return row
    row = TenantAiBudget(tenant_id=tenant_id)
    db.add(row)
    await db.flush()
    return row


async def allow_gemini_for_tenant(db: AsyncSession, tenant_id: int) -> bool:
    """Return False if kill switch, env disabled, global monthly cap (file), or tenant throttled."""
    if await is_gemini_killed(db):
        return False
    from app.common.gemini_budget import allow_gemini_call

    if not allow_gemini_call():
        return False
    b = await get_or_create_tenant_budget(db, tenant_id)
    s = get_settings()
    if int(s.ai_monthly_budget_limit or 0) > 0:
        pass  # global file already enforced in allow_gemini_call
    if b.is_throttled:
        return False
    if b.monthly_token_limit and b.monthly_token_limit > 0:
        if b.current_month_tokens >= b.monthly_token_limit:
            logger.warning("Tenant %s Gemini token budget exhausted", tenant_id)
            b.is_throttled = True
            b.throttled_at = datetime.utcnow()
            await db.flush()
            return False
    if b.monthly_cost_limit_usd and b.monthly_cost_limit_usd > 0:
        if b.current_month_cost_usd >= b.monthly_cost_limit_usd:
            b.is_throttled = True
            b.throttled_at = datetime.utcnow()
            await db.flush()
            return False
    return True


async def record_gemini_usage(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    model: str | None,
    feature: str | None,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    total_tokens: int | None,
) -> None:
    tt = total_tokens
    if tt is None and prompt_tokens is not None and completion_tokens is not None:
        tt = prompt_tokens + completion_tokens
    est = None
    if tt is not None:
        est = (Decimal(tt) / Decimal(1_000_000)) * _DEFAULT_COST_PER_1M
    db.add(
        AiUsageLog(
            tenant_id=tenant_id,
            user_id=user_id,
            provider="gemini",
            model=model,
            feature=feature,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=tt,
            estimated_cost_usd=est,
        )
    )
    b = await get_or_create_tenant_budget(db, tenant_id)
    if tt:
        b.current_month_tokens = int(getattr(b, "current_month_tokens", 0) or 0) + int(tt)
    if est:
        b.current_month_cost_usd = Decimal(b.current_month_cost_usd or 0) + est
    b.updated_at = datetime.utcnow()
    await db.flush()
