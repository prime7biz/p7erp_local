"""Celery jobs for User Activity: idle sessions + technical audit retention."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.celery_app import celery_app
from app.common.rls import bind_session_bypass, bind_session_tenant
from app.config import get_settings
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models import Tenant
from app.modules.audit.retention import purge_technical_audit_for_tenant, retention_cutoff
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
    await bind_session_bypass(db)
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


async def purge_api_audit_all_tenants(db: AsyncSession) -> dict[str, Any]:
    settings = get_settings()
    cutoff = retention_cutoff()
    if cutoff is None:
        return {"skipped": True, "reason": "audit_api_retention_disabled"}
    dry_run = bool(getattr(settings, "audit_api_purge_dry_run", True))
    batch_size = max(1, int(getattr(settings, "audit_api_purge_batch_size", 2000) or 2000))
    deleted_total = 0
    would_total = 0
    errors = 0
    await bind_session_bypass(db)
    for tenant_id in await _active_tenant_ids(db):
        try:
            await bind_session_tenant(db, tenant_id)
            await db.execute(text("SET LOCAL statement_timeout = '30000'"))
            result = await purge_technical_audit_for_tenant(
                db,
                tenant_id=tenant_id,
                cutoff=cutoff,
                batch_size=batch_size,
                dry_run=dry_run,
            )
            deleted_total += int(result.get("deleted") or 0)
            would_total += int(result.get("would_delete") or 0)
            if result.get("deleted") or result.get("would_delete"):
                logger.info(
                    "user_activity.purge_api_audit tenant=%s deleted=%s would_delete=%s dry_run=%s",
                    tenant_id,
                    result.get("deleted"),
                    result.get("would_delete"),
                    dry_run,
                )
        except Exception:
            errors += 1
            logger.exception("user_activity.purge_api_audit failed tenant=%s", tenant_id)
            await safe_async_session_rollback(db)
    return {
        "deleted": deleted_total,
        "would_delete": would_total,
        "errors": errors,
        "dry_run": dry_run,
        "cutoff": cutoff.isoformat(),
    }


async def _run_expire() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await expire_sessions_all_tenants(db)


async def _run_purge_api_audit() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await purge_api_audit_all_tenants(db)


@celery_app.task(name="user_activity.expire_sessions")
def expire_user_sessions() -> dict[str, Any]:
    return run_async(_run_expire())


@celery_app.task(name="user_activity.purge_api_audit_logs")
def purge_api_audit_logs() -> dict[str, Any]:
    return run_async(_run_purge_api_audit())
