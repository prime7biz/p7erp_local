"""Background tasks for platform admin (usage aggregation, billing, AI budgets, backups)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.storage import get_media_root
from app.models import AiUsageLog, AuditLog, BackupSchedule, BillingInvoice, Tenant, TenantAiBudget, TenantUsageDaily
from app.modules.admin.backup_service import run_full_backup_job, run_tenant_export_job, cleanup_expired_backups


def _tenant_media_size(tenant_id: int) -> int:
    import os

    root = get_media_root() / str(tenant_id)
    if not root.exists():
        return 0
    total = 0
    for dp, _, fns in os.walk(root):
        for fn in fns:
            try:
                total += os.path.getsize(os.path.join(dp, fn))
            except OSError:
                pass
    return total


async def aggregate_yesterday_usage(db: AsyncSession) -> None:
    """Roll up yesterday's audit + AI into tenant_usage_daily."""
    y = date.today() - timedelta(days=1)
    start = datetime.combine(y, datetime.min.time())
    end = datetime.combine(y, datetime.max.time())
    tenants = (await db.execute(select(Tenant.id).where(Tenant.deleted_at.is_(None)))).scalars().all()
    for tid in tenants:
        api_calls = (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.tenant_id == tid, AuditLog.created_at >= start, AuditLog.created_at <= end)
            )
        ).scalar() or 0
        api_err = (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.tenant_id == tid,
                    AuditLog.created_at >= start,
                    AuditLog.created_at <= end,
                    AuditLog.response_status.isnot(None),
                    AuditLog.response_status >= 400,
                )
            )
        ).scalar() or 0
        logins = (
            await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(
                    AuditLog.tenant_id == tid,
                    AuditLog.created_at >= start,
                    AuditLog.created_at <= end,
                    AuditLog.action == "LOGIN",
                )
            )
        ).scalar() or 0
        active_u = (
            await db.execute(
                select(func.count(distinct(AuditLog.user_id))).where(
                    AuditLog.tenant_id == tid,
                    AuditLog.created_at >= start,
                    AuditLog.created_at <= end,
                    AuditLog.user_id.isnot(None),
                )
            )
        ).scalar() or 0
        ai_calls = (
            await db.execute(
                select(func.count())
                .select_from(AiUsageLog)
                .where(AiUsageLog.tenant_id == tid, AiUsageLog.created_at >= start, AiUsageLog.created_at <= end)
            )
        ).scalar() or 0
        ai_tok = (
            await db.execute(
                select(func.coalesce(func.sum(AiUsageLog.total_tokens), 0)).where(
                    AiUsageLog.tenant_id == tid,
                    AiUsageLog.created_at >= start,
                    AiUsageLog.created_at <= end,
                )
            )
        ).scalar() or 0
        storage = _tenant_media_size(tid)
        stmt = insert(TenantUsageDaily).values(
            tenant_id=tid,
            date=y,
            api_calls_count=int(api_calls),
            api_errors_count=int(api_err),
            active_users_count=int(active_u),
            login_count=int(logins),
            storage_bytes_used=storage,
            ai_calls_count=int(ai_calls),
            ai_tokens_used=int(ai_tok),
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_tenant_usage_daily_tenant_date",
            set_={
                "api_calls_count": int(api_calls),
                "api_errors_count": int(api_err),
                "active_users_count": int(active_u),
                "login_count": int(logins),
                "storage_bytes_used": storage,
                "ai_calls_count": int(ai_calls),
                "ai_tokens_used": int(ai_tok),
            },
        )
        await db.execute(stmt)


async def mark_overdue_invoices(db: AsyncSession) -> None:
    today = date.today()
    rows = (
        await db.execute(
            select(BillingInvoice).where(
                BillingInvoice.status == "sent",
                BillingInvoice.due_date.isnot(None),
                BillingInvoice.due_date < today,
            )
        )
    ).scalars().all()
    for inv in rows:
        inv.status = "overdue"


async def reset_ai_budgets_for_new_month(db: AsyncSession) -> None:
    """Reset tenant AI counters on the 1st UTC (best-effort)."""
    if datetime.utcnow().day != 1:
        return
    rows = (await db.execute(select(TenantAiBudget))).scalars().all()
    for b in rows:
        b.current_month_tokens = 0
        b.current_month_cost_usd = 0
        b.is_throttled = False
        b.throttled_at = None


async def process_due_backup_schedules(db: AsyncSession) -> None:
    now = datetime.utcnow()
    rows = (
        await db.execute(
            select(BackupSchedule).where(BackupSchedule.is_active.is_(True), BackupSchedule.next_run_at.isnot(None))
        )
    ).scalars().all()
    for sch in rows:
        if sch.next_run_at and sch.next_run_at <= now:
            from app.models import BackupJob

            if sch.tenant_id:
                j = BackupJob(
                    tenant_id=sch.tenant_id,
                    backup_type="tenant",
                    status="queued",
                    initiated_by=sch.created_by,
                )
                db.add(j)
                await db.flush()
                await run_tenant_export_job(db, j.id, sch.tenant_id)
            else:
                j = BackupJob(backup_type="full", status="queued", initiated_by=sch.created_by)
                db.add(j)
                await db.flush()
                await run_full_backup_job(db, j.id)
            if sch.frequency == "daily":
                sch.next_run_at = now + timedelta(days=1)
            elif sch.frequency == "weekly":
                sch.next_run_at = now + timedelta(days=7)
            else:
                sch.next_run_at = now + timedelta(days=30)
            sch.last_run_at = now
    cleanup_expired_backups()


async def run_platform_daily_maintenance(db: AsyncSession) -> None:
    await aggregate_yesterday_usage(db)
    await mark_overdue_invoices(db)
    await reset_ai_budgets_for_new_month(db)
    await process_due_backup_schedules(db)
