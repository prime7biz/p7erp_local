"""Phase 14: deterministic advisory capacity and sequencing hints (no board mutation)."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OperationBulletin, Order, ProductionShift, SewingLine, SewingLineStyleConfig, TenantProductionSettings
from app.modules.production.calendar_service import count_working_days_between, net_shift_minutes


async def build_capacity_and_sequencing_advisory(
    db: AsyncSession,
    *,
    tenant_id: int,
    from_date: date,
    to_date: date,
) -> dict[str, Any]:
    """Advisory-only snapshot: line load proxy vs rough capacity, sequencing by due/risk."""
    cal = await _calendar_context(db, tenant_id)
    overrides = cal["overrides"]
    weekend_days = cal["weekend_days"]
    working_days = max(
        1,
        count_working_days_between(from_date, to_date, weekend_days=weekend_days, overrides=overrides),
    )

    lines = (
        await db.execute(select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True)))
    ).scalars().all()
    line_by_id = {ln.id: ln for ln in lines}

    cfg_rows = (
        await db.execute(
            select(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tenant_id,
                SewingLineStyleConfig.start_date <= to_date,
                (SewingLineStyleConfig.planned_end_date.is_(None))
                | (SewingLineStyleConfig.planned_end_date >= from_date),
            )
        )
    ).scalars().all()

    ob_ids = {c.ob_id for c in cfg_rows if c.ob_id}
    ob_smv: dict[int, float] = {}
    if ob_ids:
        obr = await db.execute(
            select(OperationBulletin.id, OperationBulletin.total_smv).where(
                OperationBulletin.tenant_id == tenant_id,
                OperationBulletin.id.in_(ob_ids),
            )
        )
        for oid, tsmv in obr.all():
            try:
                v = float(tsmv or 0)
            except (TypeError, ValueError):
                v = 0.0
            if v > 0:
                ob_smv[int(oid)] = v

    shifts = (
        await db.execute(
            select(ProductionShift).where(ProductionShift.tenant_id == tenant_id, ProductionShift.is_active.is_(True))
        )
    ).scalars().all()
    if shifts:
        mins = [net_shift_minutes(s.start_time, s.end_time, int(s.break_minutes or 0)) for s in shifts]
        capacity_minutes_per_line_day = float(sum(mins) / len(mins))
    else:
        capacity_minutes_per_line_day = 480.0

    line_load_units: dict[int, float] = {lid: 0.0 for lid in line_by_id}
    line_smv_minutes: dict[int, float] = {lid: 0.0 for lid in line_by_id}
    for c in cfg_rows:
        if c.line_id not in line_by_id:
            continue
        rem = float(c.planned_qty or 0) - float(c.completed_qty or 0)
        if rem < 0:
            rem = 0.0
        line_load_units[c.line_id] = line_load_units.get(c.line_id, 0.0) + rem
        if c.ob_id and int(c.ob_id) in ob_smv:
            line_smv_minutes[c.line_id] = line_smv_minutes.get(c.line_id, 0.0) + rem * ob_smv[int(c.ob_id)]

    line_snapshots = []
    for lid, ln in line_by_id.items():
        mc = int(ln.running_machine_count or ln.default_machine_count or 1)
        op = int(ln.default_operator_count or 1)
        cap_units = mc * op * capacity_minutes_per_line_day * working_days
        load_qty = line_load_units.get(lid, 0.0)
        smv_min = line_smv_minutes.get(lid, 0.0)
        load_for_util = smv_min if smv_min > 0 else load_qty
        utilization = (load_for_util / cap_units) if cap_units > 0 else None
        rc = ["CAPACITY_PROXY_MINUTES_MACHINES_OPERATORS"]
        if smv_min > 0:
            rc.append("LOAD_FROM_OB_TOTAL_SMV")
        else:
            rc.append("LOAD_FALLBACK_REMAINING_QTY_NO_OB")
        line_snapshots.append(
            {
                "line_id": lid,
                "line_code": ln.line_code,
                "rough_capacity_units": round(cap_units, 2),
                "planned_remaining_load_proxy": round(load_qty, 3),
                "estimated_sewing_minutes_ob_smv": round(smv_min, 2) if smv_min > 0 else None,
                "utilization_ratio": round(utilization, 4) if utilization is not None else None,
                "utilization_basis": "ob_total_smv_minutes" if smv_min > 0 else "remaining_qty_proxy",
                "reason_codes": rc,
            }
        )

    order_dates: dict[int, date | None] = {}
    oids = {c.order_id for c in cfg_rows if c.order_id}
    if oids:
        r = await db.execute(select(Order.id, Order.delivery_date).where(Order.tenant_id == tenant_id, Order.id.in_(oids)))
        for oid, dd in r.all():
            order_dates[oid] = dd

    sequencing = []
    for c in sorted(
        cfg_rows,
        key=lambda x: (
            order_dates.get(x.order_id or 0) or date.max,
            -(float(x.planned_qty or 0) - float(x.completed_qty or 0)),
            x.start_date,
            x.id,
        ),
    ):
        rem = float(c.planned_qty or 0) - float(c.completed_qty or 0)
        due = order_dates.get(c.order_id or 0)
        ob_id = int(c.ob_id) if c.ob_id else None
        smv_piece = ob_smv.get(ob_id) if ob_id else None
        est_min = round(rem * smv_piece, 2) if smv_piece and rem > 0 else None
        sequencing.append(
            {
                "config_id": c.id,
                "line_id": c.line_id,
                "order_id": c.order_id,
                "ob_id": ob_id,
                "ob_total_smv_per_piece": round(smv_piece, 4) if smv_piece else None,
                "estimated_sewing_minutes_remaining": est_min,
                "start_date": c.start_date.isoformat(),
                "planned_end_date": c.planned_end_date.isoformat() if c.planned_end_date else None,
                "remaining_qty_proxy": round(rem, 3),
                "delivery_date": due.isoformat() if due else None,
                "hint": "earlier_due_first_then_larger_remaining",
                "confidence": 0.82 if smv_piece else 0.75,
                "reason_codes": ["RULE_DUE_DATE_THEN_QTY", "OB_SMV_WHEN_LINKED"] if smv_piece else ["RULE_DUE_DATE_THEN_QTY"],
            }
        )

    return {
        "window": {"from": from_date.isoformat(), "to": to_date.isoformat(), "working_days": working_days},
        "lines": line_snapshots,
        "sequencing_hints": sequencing,
        "disclaimer": "Advisory proxy only — not a capacity guarantee; confirm with IE and live floor data.",
    }


async def _calendar_context(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    from app.models import FactoryCalendarOverride

    r = await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    row = r.scalar_one_or_none()
    weekend_days = None
    if row and isinstance(row.weekend_days, list):
        weekend_days = [str(x) for x in row.weekend_days]

    r2 = await db.execute(select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant_id))
    overrides = {x.override_date: x.override_type for x in r2.scalars().all()}
    return {"weekend_days": weekend_days, "overrides": overrides}
