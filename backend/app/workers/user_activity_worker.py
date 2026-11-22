"""Celery jobs for User Activity Phase 2: expire idle login sessions."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.config import get_settings
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models import Tenant
from app.modules.auth.session_service import expire_stale_sessions_for_tenant, session_tracking_enabled
from app.workers.async_runner import run_async

logger = logging.getLogger(__name__)


async def _active_tenant_ids(db: AsyncSession) -> list[int]:
    rows = (
        await db.execute(
            select(Tenant.id).where(Tenant.is_active.is_(True), Tenant.deleted_at.is_(None)).order_by(Tenant.id)
        )
    ).scalars().all()
    return [int(t) for t in rows]


async def expire_sessions_all_tenants(db: AsyncSession) -> dict[str, Any]:
    if not session_tracking_enabled():
        return {"skipped": True, "reason": "user_session_tracking_disabled"}
    minutes = int(getattr(get_settings(), "user_session_idle_expire_minutes", 1440) or 1440)
    idle_before = datetime.utcnow() - timedelta(minutes=max(minutes, 60))
    closed_total = 0
    errors = 0
    for tenant_id in await _active_tenant_ids(db):
        try:
            await bind_session_tenant(db, tenant_id)
            await db.execute(text("SET LOCAL statement_timeout = '15000'"))
            closed = await expire_stale_sessions_for_tenant(db, tenant_id=tenant_id, idle_before=idle_before)
            await db.commit()
            closed_total += closed
            if closed:
                logger.info("user_activity.expire_sessions tenant=%s closed=%s", tenant_id, closed)
        except Exception:
            errors += 1
            logger.exception("user_activity.expire_sessions failed tenant=%s", tenant_id)
            await safe_async_session_rollback(db)
    return {"closed": closed_total, "errors": errors}


async def _run_expire() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await expire_sessions_all_tenants(db)


@celery_app.task(name="user_activity.expire_sessions")
def expire_user_sessions() -> dict[str, Any]:
    return run_async(_run_expire())
