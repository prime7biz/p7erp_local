"""Platform admin: AI usage, budgets, kill switch."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import AiUsageLog, PlatformSettings, Tenant, TenantAiBudget
from app.modules.admin.auth import AdminContext, any_admin, log_admin_action, super_only

router = APIRouter(prefix="/ai", tags=["platform-admin-ai"])


@router.get("/usage")
async def ai_usage_summary(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    tenant_id: int | None = None,
    limit: int = Query(200, ge=1, le=2000),
):
    q = select(AiUsageLog).order_by(AiUsageLog.id.desc()).limit(limit)
    if tenant_id is not None:
        q = q.where(AiUsageLog.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "user_id": r.user_id,
                "model": r.model,
                "feature": r.feature,
                "total_tokens": r.total_tokens,
                "estimated_cost_usd": float(r.estimated_cost_usd) if r.estimated_cost_usd else None,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.get("/usage/{tid}")
async def ai_usage_tenant(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    limit: int = Query(500, ge=1, le=2000),
):
    q = (
        select(AiUsageLog)
        .where(AiUsageLog.tenant_id == tid)
        .order_by(AiUsageLog.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    return {"tenant_id": tid, "items": [{"id": r.id, "feature": r.feature, "total_tokens": r.total_tokens} for r in rows]}


@router.get("/usage/export")
async def export_usage_csv(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    q = select(AiUsageLog).order_by(AiUsageLog.id.desc()).limit(10000)
    rows = (await db.execute(q)).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "tenant_id", "feature", "model", "total_tokens", "cost_usd", "created_at"])
    for r in rows:
        w.writerow(
            [
                r.id,
                r.tenant_id,
                r.feature or "",
                r.model or "",
                r.total_tokens or "",
                float(r.estimated_cost_usd) if r.estimated_cost_usd else "",
                r.created_at.isoformat() if r.created_at else "",
            ]
        )
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.get("/budgets")
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    r = await db.execute(select(TenantAiBudget))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "tenant_id": b.tenant_id,
                "monthly_token_limit": b.monthly_token_limit,
                "monthly_cost_limit_usd": float(b.monthly_cost_limit_usd),
                "current_month_tokens": b.current_month_tokens,
                "current_month_cost_usd": float(b.current_month_cost_usd),
                "is_throttled": b.is_throttled,
                "reset_day": b.reset_day,
            }
            for b in rows
        ]
    }


@router.put("/budgets/{tenant_id}")
async def put_budget(
    tenant_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404)
    b = await db.get(TenantAiBudget, tenant_id)
    if not b:
        b = TenantAiBudget(tenant_id=tenant_id)
        db.add(b)
        await db.flush()
    if "monthly_token_limit" in body:
        b.monthly_token_limit = int(body["monthly_token_limit"])
    if "monthly_cost_limit_usd" in body:
        b.monthly_cost_limit_usd = Decimal(str(body["monthly_cost_limit_usd"]))
    if "reset_day" in body:
        b.reset_day = int(body["reset_day"])
    if "alert_threshold_pct" in body:
        b.alert_threshold_pct = int(body["alert_threshold_pct"])
    b.is_throttled = False
    b.throttled_at = None
    await db.commit()
    return {"ok": True}


@router.post("/budgets/{tenant_id}/reset")
async def reset_budget(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    b = await db.get(TenantAiBudget, tenant_id)
    if not b:
        b = TenantAiBudget(tenant_id=tenant_id)
        db.add(b)
    b.current_month_tokens = 0
    b.current_month_cost_usd = Decimal("0")
    b.is_throttled = False
    b.throttled_at = None
    await db.commit()
    return {"ok": True}


@router.post("/kill-switch")
async def kill_switch(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    on = bool(body.get("enabled", True))
    row = await db.get(PlatformSettings, 1)
    if not row:
        row = PlatformSettings(id=1, gemini_kill_switch=on)
        db.add(row)
    else:
        row.gemini_kill_switch = on
    row.updated_at = datetime.utcnow()
    await log_admin_action(db, admin_id=ctx.admin.id, action="GEMINI_KILL_SWITCH", resource="platform", details=str(on))
    await db.commit()
    return {"gemini_kill_switch": on}


@router.get("/costs")
async def costs_report(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    r = await db.execute(
        select(
            AiUsageLog.tenant_id,
            func.sum(AiUsageLog.estimated_cost_usd),
            func.count(AiUsageLog.id),
        ).group_by(AiUsageLog.tenant_id)
    )
    rows = r.all()
    return {
        "by_tenant": [
            {"tenant_id": tid, "total_cost_usd": float(tc or 0), "calls": int(cnt or 0)}
            for tid, tc, cnt in rows
        ]
    }
