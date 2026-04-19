"""Per-tenant Gemini budget checks and usage logging (async)."""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AiUsageLog, PlatformSettings, TenantAiBudget

logger = logging.getLogger(__name__)

# Rough USD per 1M tokens (Flash-lite scale; override via admin later)
_DEFAULT_COST_PER_1M = Decimal("0.075")


async def is_platform_ai_kill_switch_on(db: AsyncSession) -> bool:
    row = await db.get(PlatformSettings, 1)
    return bool(row and row.gemini_kill_switch)


async def is_gemini_killed(db: AsyncSession) -> bool:
    """True when platform kill-switch is on or Gemini is disabled in env."""
    if await is_platform_ai_kill_switch_on(db):
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


async def _tenant_token_and_cost_budget_allows(db: AsyncSession, tenant_id: int) -> bool:
    b = await get_or_create_tenant_budget(db, tenant_id)
    if b.is_throttled:
        return False
    if b.monthly_token_limit and b.monthly_token_limit > 0:
        if b.current_month_tokens >= b.monthly_token_limit:
            logger.warning("Tenant %s AI token budget exhausted", tenant_id)
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


async def allow_gemini_for_tenant(db: AsyncSession, tenant_id: int) -> bool:
    """Return False if kill switch, env disabled, global monthly cap (file), or tenant throttled."""
    if not get_settings().gemini_enabled:
        return False
    if await is_platform_ai_kill_switch_on(db):
        return False
    from app.common.gemini_budget import allow_gemini_call

    if not allow_gemini_call():
        return False
    return await _tenant_token_and_cost_budget_allows(db, tenant_id)


async def allow_openrouter_tenant_text(db: AsyncSession, tenant_id: int) -> bool:
    """Budget gate for OpenRouter-backed tenant text (generate_text_for_tenant) without requiring Gemini."""
    from app.common.gemini_budget import allow_gemini_call
    from app.modules.ai_tool.llm_provider.openrouter_provider import openrouter_is_configured

    s = get_settings()
    if not getattr(s, "openrouter_tenant_text_enabled", False):
        return False
    if not openrouter_is_configured():
        return False
    if await is_platform_ai_kill_switch_on(db):
        return False
    if not allow_gemini_call():
        return False
    return await _tenant_token_and_cost_budget_allows(db, tenant_id)


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
    provider: str = "gemini",
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
            provider=(provider or "gemini")[:32],
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
