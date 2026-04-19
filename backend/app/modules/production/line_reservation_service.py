"""Sewing line reservations (SewingLineStyleConfig reservation_status lifecycle)."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.control_tower_flags import auto_line_booking_enabled
from app.models import FactoryCalendarOverride, Order, Quotation, Tenant
from app.models.production import OperationBulletin, SewingLine, SewingLineStyleConfig
from app.modules.audit.service import log_action
from app.modules.production.calendar_service import add_working_days
from app.modules.production.readiness_service import get_order_chain_readiness
from app.modules.production.settings_router import _get_or_create_settings

_RESERVATION_ACTIVE = frozenset({"SOFT_BOOKED", "FIRM_BOOKED", "IN_PROGRESS", "COMPLETED"})


async def _calendar_map(db: AsyncSession, tenant_id: int) -> dict[date, str]:
    r = await db.execute(select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant_id))
    return {x.override_date: x.override_type for x in r.scalars().all()}


def _material_readiness_pct(readiness: dict) -> float:
    ch = readiness.get("chain") or {}
    mat = ch.get("material_readiness") or {}
    total = int(mat.get("total") or 0)
    if total <= 0:
        return 0.0
    ready = int(mat.get("ready_count") or 0)
    return round(100.0 * ready / total, 2)


def _firm_threshold(tenant: Tenant) -> float:
    ff = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    raw = ff.get("material_readiness_firm_threshold_pct", 80)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 80.0


async def maybe_auto_propose_line_booking(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    user_id: int | None = None,
) -> SewingLineStyleConfig | None:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or not auto_line_booking_enabled(tenant):
        return None
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return None
    existing = (
        await db.execute(
            select(SewingLineStyleConfig.id).where(
                SewingLineStyleConfig.tenant_id == tenant_id,
                SewingLineStyleConfig.order_id == order_id,
                SewingLineStyleConfig.reservation_status.in_(tuple(_RESERVATION_ACTIVE | {"DRAFT"})),
            )
        )
    ).first()
    if existing:
        return None
    return await propose_line_reservation(db, tenant_id=tenant_id, order_id=order_id, user_id=user_id)


async def propose_line_reservation(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    user_id: int | None = None,
) -> SewingLineStyleConfig:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Order not found")

    style_id = getattr(order, "style_id", None)
    if style_id is None and order.quotation_id:
        q = await db.get(Quotation, order.quotation_id)
        if q and q.tenant_id == tenant_id:
            style_id = q.style_id

    ob: OperationBulletin | None = None
    if style_id:
        ob_r = await db.execute(
            select(OperationBulletin)
            .where(OperationBulletin.tenant_id == tenant_id, OperationBulletin.style_id == style_id)
            .order_by(OperationBulletin.version_no.desc())
            .limit(1)
        )
        ob = ob_r.scalar_one_or_none()

    line_r = await db.execute(
        select(SewingLine).where(SewingLine.tenant_id == tenant_id).order_by(SewingLine.line_code.asc()).limit(1)
    )
    line = line_r.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=400, detail="No sewing lines defined for this tenant")

    s = await _get_or_create_settings(db, tenant_id)
    weekend = list(s.weekend_days or [])
    ov = await _calendar_map(db, tenant_id)
    sd = date.today()
    planned_end = add_working_days(sd, 5, weekend_days=weekend, overrides=ov)

    qty = float(order.quantity or 0)
    smv_pp = None
    if ob and ob.total_smv is not None and qty > 0:
        smv_pp = float(ob.total_smv) / qty

    row = SewingLineStyleConfig(
        tenant_id=tenant_id,
        line_id=line.id,
        order_id=order.id,
        style_id=style_id,
        ob_id=ob.id if ob else None,
        machine_count=int(line.running_machine_count or 0),
        operator_count=0,
        helper_count=0,
        target_efficiency_pct=65,
        shift_id=None,
        start_date=sd,
        planned_end_date=planned_end,
        status="planned",
        reservation_status="DRAFT",
        planned_qty=qty,
        smv_per_piece=smv_pp,
        total_smv_minutes=float(ob.total_smv) if ob and ob.total_smv is not None else None,
        sort_order=0,
    )
    db.add(row)
    await db.flush()
    if user_id:
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="LINE_RESERVATION_PROPOSE",
            resource="sewing_line_style_config",
            details=f"order_id={order_id} config_id={row.id}",
        )
    return row


async def confirm_reservation_soft(
    db: AsyncSession, *, tenant_id: int, config_id: int, user_id: int
) -> SewingLineStyleConfig:
    row = await db.get(SewingLineStyleConfig, config_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.reservation_status not in ("DRAFT",):
        raise HTTPException(status_code=409, detail="Only DRAFT reservations can move to SOFT_BOOKED")
    row.reservation_status = "SOFT_BOOKED"
    row.soft_booked_at = datetime.utcnow()
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="LINE_RESERVATION_SOFT",
        resource="sewing_line_style_config",
        details=f"config_id={config_id}",
    )
    return row


async def confirm_reservation_firm(
    db: AsyncSession, *, tenant_id: int, config_id: int, user_id: int
) -> SewingLineStyleConfig:
    row = await db.get(SewingLineStyleConfig, config_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.reservation_status not in ("DRAFT", "SOFT_BOOKED"):
        raise HTTPException(status_code=409, detail="Only DRAFT/SOFT reservations can become FIRM_BOOKED")
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=400, detail="Tenant not found")
    if row.order_id:
        readiness = await get_order_chain_readiness(db, tenant_id, row.order_id)
        pct = _material_readiness_pct(readiness)
        if pct < _firm_threshold(tenant):
            raise HTTPException(
                status_code=409,
                detail=f"Material readiness {pct}% is below firm booking threshold ({_firm_threshold(tenant)}%)",
            )
    row.reservation_status = "FIRM_BOOKED"
    row.firm_booked_at = datetime.utcnow()
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="LINE_RESERVATION_FIRM",
        resource="sewing_line_style_config",
        details=f"config_id={config_id}",
    )
    return row


async def release_reservation(
    db: AsyncSession, *, tenant_id: int, config_id: int, user_id: int
) -> SewingLineStyleConfig:
    row = await db.get(SewingLineStyleConfig, config_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.reservation_status == "CANCELLED":
        return row
    row.reservation_status = "CANCELLED"
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="LINE_RESERVATION_RELEASE",
        resource="sewing_line_style_config",
        details=f"config_id={config_id}",
    )
    return row
