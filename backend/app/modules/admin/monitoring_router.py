"""Platform admin: cross-tenant audit, usage, system health."""

from __future__ import annotations

import csv
import io
import shutil
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AuditLog, TenantUsageDaily
from app.modules.admin.auth import AdminContext, any_admin, super_only
from app.config import get_settings

router = APIRouter(prefix="/monitoring", tags=["platform-admin-monitoring"])


@router.get("/audit")
async def cross_tenant_audit(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    tenant_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    ip: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    cond = []
    if tenant_id is not None:
        cond.append(AuditLog.tenant_id == tenant_id)
    if user_id is not None:
        cond.append(AuditLog.user_id == user_id)
    if action:
        cond.append(AuditLog.action.ilike(f"%{action}%"))
    if date_from:
        cond.append(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        cond.append(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    if ip:
        cond.append(AuditLog.ip_address == ip)
    count_stmt = select(func.count()).select_from(AuditLog)
    if cond:
        count_stmt = count_stmt.where(and_(*cond))
    total = (await db.execute(count_stmt)).scalar_one()
    q = select(AuditLog)
    if cond:
        q = q.where(and_(*cond))
    q = q.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "user_id": r.user_id,
                "action": r.action,
                "resource": r.resource,
                "details": r.details,
                "ip_address": r.ip_address,
                "request_path": r.request_path,
                "response_status": r.response_status,
                "duration_ms": r.duration_ms,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/audit/export")
async def export_audit_csv(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    q = select(AuditLog)
    if tenant_id is not None:
        q = q.where(AuditLog.tenant_id == tenant_id)
    if date_from:
        q = q.where(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(AuditLog.created_at <= datetime.combine(date_to, datetime.max.time()))
    q = q.order_by(AuditLog.created_at.desc()).limit(10000)
    rows = (await db.execute(q)).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["id", "tenant_id", "user_id", "action", "resource", "ip", "path", "status", "ms", "created_at"]
    )
    for r in rows:
        w.writerow(
            [
                r.id,
                r.tenant_id,
                r.user_id,
                r.action,
                r.resource or "",
                r.ip_address or "",
                r.request_path or "",
                r.response_status or "",
                r.duration_ms or "",
                r.created_at.isoformat() if r.created_at else "",
            ]
        )
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.get("/usage")
async def usage_daily_list(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    tenant_id: int | None = None,
):
    q = select(TenantUsageDaily)
    if tenant_id is not None:
        q = q.where(TenantUsageDaily.tenant_id == tenant_id)
    if date_from:
        q = q.where(TenantUsageDaily.date >= date_from)
    if date_to:
        q = q.where(TenantUsageDaily.date <= date_to)
    q = q.order_by(TenantUsageDaily.date.desc()).limit(1000)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "date": r.date.isoformat() if r.date else None,
                "api_calls_count": r.api_calls_count,
                "api_errors_count": r.api_errors_count,
                "active_users_count": r.active_users_count,
                "login_count": r.login_count,
                "storage_bytes_used": r.storage_bytes_used,
                "ai_calls_count": r.ai_calls_count,
                "ai_tokens_used": r.ai_tokens_used,
            }
            for r in rows
        ]
    }


@router.get("/usage/{tid}")
async def usage_tenant(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    limit: int = Query(90, ge=1, le=500),
):
    q = (
        select(TenantUsageDaily)
        .where(TenantUsageDaily.tenant_id == tid)
        .order_by(TenantUsageDaily.date.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    return {
        "tenant_id": tid,
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "date": r.date.isoformat() if r.date else None,
                "api_calls_count": r.api_calls_count,
                "api_errors_count": r.api_errors_count,
                "active_users_count": r.active_users_count,
                "login_count": r.login_count,
                "storage_bytes_used": r.storage_bytes_used,
                "ai_calls_count": r.ai_calls_count,
                "ai_tokens_used": r.ai_tokens_used,
            }
            for r in rows
        ],
    }


@router.get("/system/health")
async def system_health(
    ctx: AdminContext = Depends(any_admin),
):
    s = get_settings()
    total, used, free = shutil.disk_usage(".")
    return {
        "disk": {"total_bytes": total, "used_bytes": used, "free_bytes": free},
        "gemini_enabled": s.gemini_enabled,
        "api_env": s.app_env,
    }


@router.get("/system/db-stats")
async def db_stats(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(
        text(
            """
            SELECT relname AS table_name,
                   pg_total_relation_size(quote_ident(relname)::regclass) AS total_bytes
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(quote_ident(relname)::regclass) DESC
            LIMIT 40
            """
        )
    )
    rows = [{"table_name": x[0], "total_bytes": int(x[1] or 0)} for x in r.all()]
    return {"tables": rows}


@router.get("/system/slow-queries")
async def slow_queries(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    try:
        r = await db.execute(
            text(
                """
                SELECT query, calls, mean_exec_time, total_exec_time
                FROM pg_stat_statements
                ORDER BY mean_exec_time DESC
                LIMIT 15
                """
            )
        )
        return {"items": [{"query": q[0][:500], "calls": q[1], "mean_ms": float(q[2]), "total_ms": float(q[3])} for q in r.all()]}
    except Exception as e:
        raise HTTPException(status_code=501, detail=f"pg_stat_statements not available: {e}") from e
