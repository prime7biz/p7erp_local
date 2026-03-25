"""Hourly production entries and efficiency summaries."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import HourlyProductionEntry, OperationBulletin, SewingLineStyleConfig, Tenant, User
from app.modules.production.schemas import HourlyEntryUpsert

router = APIRouter(prefix="/production/hourly", tags=["production-hourly"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/upsert")
async def upsert_hourly(
    body: HourlyEntryUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(body.production_date)
    # find existing similar row (best-effort match)
    q = select(HourlyProductionEntry).where(
        HourlyProductionEntry.tenant_id == tenant.id,
        HourlyProductionEntry.department_type == body.department_type,
        HourlyProductionEntry.production_date == d,
        HourlyProductionEntry.hour_slot == body.hour_slot,
    )
    if body.line_id:
        q = q.where(HourlyProductionEntry.line_id == body.line_id)
    else:
        q = q.where(HourlyProductionEntry.line_id.is_(None))
    if body.machine_id:
        q = q.where(HourlyProductionEntry.machine_id == body.machine_id)
    else:
        q = q.where(HourlyProductionEntry.machine_id.is_(None))
    r = await db.execute(q.limit(1))
    row = r.scalar_one_or_none()
    if row:
        row.target_qty = body.target_qty
        row.good_qty = body.good_qty
        row.reject_qty = body.reject_qty
        row.rework_qty = body.rework_qty
        row.input_qty = body.input_qty
        row.output_qty = body.output_qty
        row.uom = body.uom
        row.remarks = body.remarks
        row.shift_id = body.shift_id
        row.order_id = body.order_id
        row.style_id = body.style_id
        row.line_style_config_id = body.line_style_config_id
        row.entered_by_user_id = user.id
    else:
        row = HourlyProductionEntry(
            tenant_id=tenant.id,
            department_type=body.department_type,
            line_id=body.line_id,
            machine_id=body.machine_id,
            line_style_config_id=body.line_style_config_id,
            order_id=body.order_id,
            style_id=body.style_id,
            shift_id=body.shift_id,
            production_date=d,
            hour_slot=body.hour_slot,
            target_qty=body.target_qty,
            good_qty=body.good_qty,
            reject_qty=body.reject_qty,
            rework_qty=body.rework_qty,
            input_qty=body.input_qty,
            output_qty=body.output_qty,
            uom=body.uom,
            remarks=body.remarks,
            entered_by_user_id=user.id,
        )
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id}


@router.get("/sheet")
async def get_sheet(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    department_type: str = Query(...),
    production_date: date = Query(...),
    line_id: int | None = None,
    machine_id: int | None = None,
):
    _ensure(user, tenant)
    q = select(HourlyProductionEntry).where(
        HourlyProductionEntry.tenant_id == tenant.id,
        HourlyProductionEntry.department_type == department_type,
        HourlyProductionEntry.production_date == production_date,
    )
    if line_id:
        q = q.where(HourlyProductionEntry.line_id == line_id)
    if machine_id:
        q = q.where(HourlyProductionEntry.machine_id == machine_id)
    q = q.order_by(HourlyProductionEntry.hour_slot)
    r = await db.execute(q)
    rows = list(r.scalars().all())
    return {
        "items": [
            {
                "id": x.id,
                "hour_slot": x.hour_slot,
                "target_qty": float(x.target_qty) if x.target_qty is not None else None,
                "good_qty": float(x.good_qty) if x.good_qty is not None else None,
                "reject_qty": float(x.reject_qty) if x.reject_qty is not None else None,
                "rework_qty": float(x.rework_qty) if x.rework_qty is not None else None,
            }
            for x in rows
        ]
    }


@router.get("/summary")
async def summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    line_style_config_id: int = Query(...),
    production_date: date = Query(...),
):
    _ensure(user, tenant)
    cfg = await db.get(SewingLineStyleConfig, line_style_config_id)
    if not cfg or cfg.tenant_id != tenant.id:
        raise HTTPException(404, "Config not found")
    r = await db.execute(
        select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
            HourlyProductionEntry.tenant_id == tenant.id,
            HourlyProductionEntry.line_style_config_id == line_style_config_id,
            HourlyProductionEntry.production_date == production_date,
        )
    )
    good = float(r.scalar() or 0)
    total_smv = 12.0
    if cfg.ob_id:
        ob = await db.get(OperationBulletin, cfg.ob_id)
        if ob:
            total_smv = float(ob.total_smv or 12)
    earned = good * total_smv
    ops = cfg.operator_count or 1
    net_min = 480.0
    avail = ops * net_min
    eff = (earned / avail * 100.0) if avail > 0 else 0.0
    return {
        "good_qty_day": good,
        "earned_minutes": round(earned, 2),
        "efficiency_pct": round(eff, 2),
        "planned_qty": float(cfg.planned_qty or 0),
    }
