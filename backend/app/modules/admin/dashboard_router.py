"""Aggregated dashboard metrics for platform admin."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_sync
from app.database import get_db
from app.models import (
    BackupJob,
    BillingInvoice,
    PlatformAdmin,
    PlatformAnnouncement,
    PlatformSettings,
    SupportTicket,
    Tenant,
    TenantAiBudget,
    TenantSubscription,
)
from app.modules.admin.auth import AdminContext, any_admin

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["platform-admin-dashboard"])


@router.get("/summary")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    total_tenants = (
        await db.execute(select(func.count()).select_from(Tenant).where(Tenant.deleted_at.is_(None)))
    ).scalar_one()
    active_tenants = (
        await db.execute(
            select(func.count()).select_from(Tenant).where(Tenant.deleted_at.is_(None), Tenant.is_active.is_(True))
        )
    ).scalar_one()
    inactive_tenants = int((total_tenants or 0) - (active_tenants or 0))

    paid_sum = await db.execute(select(func.coalesce(func.sum(BillingInvoice.total), 0)).where(BillingInvoice.status == "paid"))
    mrr_approx_usd = float(paid_sum.scalar() or 0)

    overdue_invoices = (
        await db.execute(select(func.count()).select_from(BillingInvoice).where(BillingInvoice.status == "overdue"))
    ).scalar_one()

    since = datetime.utcnow() - timedelta(hours=24)
    failed_backups_24h = (
        await db.execute(
            select(func.count())
            .select_from(BackupJob)
            .where(BackupJob.status == "failed", BackupJob.created_at >= since)
        )
    ).scalar_one()

    throttled_ai_tenants = (
        await db.execute(select(func.count()).select_from(TenantAiBudget).where(TenantAiBudget.is_throttled.is_(True)))
    ).scalar_one()

    row = await db.get(PlatformSettings, 1)
    gemini_kill_switch = bool(row.gemini_kill_switch) if row else False
    maintenance_mode = bool(row.maintenance_mode) if row else False

    open_tickets = (
        await db.execute(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.status.not_in(["closed", "resolved", "cancelled", "done"]))
        )
    ).scalar_one()
    active_subscriptions = (
        await db.execute(
            select(func.count())
            .select_from(TenantSubscription)
            .where(TenantSubscription.status.in_(["active", "trial"]))
        )
    ).scalar_one()
    platform_admin_count = (
        await db.execute(select(func.count()).select_from(PlatformAdmin).where(PlatformAdmin.is_active.is_(True)))
    ).scalar_one()

    now = datetime.utcnow()
    pending_announcements = (
        await db.execute(
            select(func.count())
            .select_from(PlatformAnnouncement)
            .where(
                PlatformAnnouncement.is_active.is_(True),
                or_(PlatformAnnouncement.starts_at.is_(None), PlatformAnnouncement.starts_at <= now),
                or_(PlatformAnnouncement.expires_at.is_(None), PlatformAnnouncement.expires_at >= now),
            )
        )
    ).scalar_one()

    return {
        "total_tenants": int(total_tenants or 0),
        "active_tenants": int(active_tenants or 0),
        "inactive_tenants": inactive_tenants,
        "mrr_approx_usd": mrr_approx_usd,
        "overdue_invoices": int(overdue_invoices or 0),
        "failed_backups_24h": int(failed_backups_24h or 0),
        "throttled_ai_tenants": int(throttled_ai_tenants or 0),
        "gemini_kill_switch": gemini_kill_switch,
        "maintenance_mode": maintenance_mode,
        "open_tickets": int(open_tickets or 0),
        "active_subscriptions": int(active_subscriptions or 0),
        "platform_admin_count": int(platform_admin_count or 0),
        "pending_announcements": int(pending_announcements or 0),
    }


def _psutil_cpu_mem() -> tuple[float, float]:
    import psutil

    cpu = float(psutil.cpu_percent(interval=0.25))
    vm = psutil.virtual_memory()
    return cpu, float(vm.percent)


@router.post("/ai-analyze")
async def ai_analyze_server(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    """On-demand Gemini analysis of current server snapshot (global budget)."""
    try:
        summary = await dashboard_summary(db, ctx)  # type: ignore[arg-type]
    except Exception:
        _log.exception("ai_analyze: failed to load summary")
        raise HTTPException(status_code=500, detail="Failed to load dashboard metrics")

    total, used, free = shutil.disk_usage(".")
    disk_pct = round((used / total) * 100, 2) if total else 0.0
    cpu_pct = mem_pct = None
    try:
        cpu_pct, mem_pct = await asyncio.to_thread(_psutil_cpu_mem)
    except Exception:
        _log.warning("ai_analyze: psutil unavailable", exc_info=True)

    payload = {
        "summary": summary,
        "disk": {"total_bytes": total, "used_bytes": used, "free_bytes": free, "used_percent": disk_pct},
        "cpu_percent": round(cpu_pct, 2) if cpu_pct is not None else None,
        "memory_percent": round(mem_pct, 2) if mem_pct is not None else None,
    }

    prompt = (
        "You are a senior SRE reviewing a multi-tenant SaaS ERP API host. "
        "Given ONLY the JSON metrics below, assess risk and operational health.\n"
        "Respond with a single JSON object on one line, no markdown, no code fences:\n"
        '{"severity":"ok"|"warning"|"critical","analysis":"2-4 short paragraphs plain text"}\n'
        f"METRICS_JSON:\n{json.dumps(payload, default=str)}"
    )

    raw = generate_text_sync(prompt)
    if not raw:
        raise HTTPException(
            status_code=503,
            detail="AI analysis unavailable (Gemini disabled, budget exhausted, or API error).",
        )

    severity = "warning"
    analysis = raw.strip()
    try:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            parsed = json.loads(m.group(0))
            if isinstance(parsed, dict):
                sev = str(parsed.get("severity") or "").lower()
                if sev in ("ok", "warning", "critical"):
                    severity = sev
                if parsed.get("analysis"):
                    analysis = str(parsed["analysis"]).strip()
    except Exception:
        _log.warning("ai_analyze: JSON parse fallback to raw text", exc_info=True)

    return {
        "severity": severity,
        "analysis": analysis,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/maintenance-tasks")
async def maintenance_tasks(ctx: AdminContext = Depends(any_admin)):
    """Describe scheduled platform jobs (implemented in `app.modules.admin.tasks`). Not triggered from this UI."""
    return {
        "scheduler_note": (
            "These tasks are run by the platform job runner or cron calling "
            "`run_platform_daily_maintenance` (see `app.modules.admin.tasks`)."
        ),
        "tasks": [
            {
                "id": "aggregate_yesterday_usage",
                "name": "Daily usage aggregation",
                "description": (
                    "Rolls API audit and AI usage into `tenant_usage_daily` for the prior UTC day."
                ),
            },
            {
                "id": "mark_overdue_invoices",
                "name": "Mark overdue invoices",
                "description": "Sets sent invoices to overdue when past due date.",
            },
            {
                "id": "reset_ai_budgets_for_new_month",
                "name": "AI budget monthly reset",
                "description": "On UTC day 1, resets monthly token/cost counters and throttling flags.",
            },
            {
                "id": "process_due_backup_schedules",
                "name": "Scheduled backups",
                "description": "Queues full or tenant backup jobs when backup schedules are due.",
            },
            {
                "id": "run_platform_daily_maintenance",
                "name": "Platform daily maintenance",
                "description": "Runs usage aggregation, overdue invoices, AI reset, and backup schedules in sequence.",
            },
        ],
    }
