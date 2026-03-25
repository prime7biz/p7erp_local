"""Heuristic plan suggestions: orders to lines by delivery date and readiness."""
from __future__ import annotations

import math
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OperationBulletin, Order, SewingLine, SewingLineStyleConfig
from app.modules.production.calendar_service import add_working_days
from app.modules.production.readiness_service import get_order_readiness


async def suggest_assignments(
    db: AsyncSession,
    tenant_id: int,
    *,
    start_date: date,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
    target_efficiency_pct: float,
    net_minutes_per_day: float,
) -> list[dict[str, Any]]:
    """Return suggested line assignments for orders not yet fully planned."""
    r = await db.execute(
        select(Order)
        .where(Order.tenant_id == tenant_id)
        .where(Order.status.notin_(["CANCELLED", "cancelled"]))
        .order_by(Order.delivery_date.asc().nulls_last(), Order.id.asc())
    )
    orders = list(r.scalars().all())

    r2 = await db.execute(
        select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True)).order_by(SewingLine.line_code)
    )
    lines = list(r2.scalars().all())
    if not lines:
        return []

    # existing configs
    r3 = await db.execute(select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == tenant_id))
    existing = {c.order_id for c in r3.scalars().all() if c.order_id}

    suggestions: list[dict[str, Any]] = []
    line_idx = 0
    cur_start = start_date

    for o in orders:
        if o.id in existing:
            continue
        readiness = await get_order_readiness(db, tenant_id, o.id)
        if readiness.get("error") or not readiness.get("style_id"):
            suggestions.append(
                {
                    "order_id": o.id,
                    "order_code": o.order_code,
                    "skipped": True,
                    "reason": readiness.get("message") or readiness.get("error") or "no_style",
                }
            )
            continue
        if not readiness.get("all_ready"):
            suggestions.append(
                {
                    "order_id": o.id,
                    "order_code": o.order_code,
                    "skipped": True,
                    "reason": "material_not_ready",
                }
            )
            continue

        sid = readiness["style_id"]
        ob_r = await db.execute(
            select(OperationBulletin)
            .where(OperationBulletin.tenant_id == tenant_id)
            .where(OperationBulletin.style_id == sid)
            .order_by(OperationBulletin.version_no.desc())
            .limit(1)
        )
        ob = ob_r.scalar_one_or_none()
        total_smv = float(ob.total_smv) if ob else 12.0
        qty = float(o.quantity or 0)
        if qty <= 0:
            continue

        line = lines[line_idx % len(lines)]
        line_idx += 1
        ops = line.default_operator_count or 25
        target_per_hour = (ops * (target_efficiency_pct / 100.0) * 60.0) / max(total_smv, 0.01)
        target_per_day = target_per_hour * (net_minutes_per_day / 60.0)
        days_needed = max(1, int(math.ceil(qty / max(target_per_day, 0.01))))
        end_planned = add_working_days(cur_start, days_needed, weekend_days=weekend_days, overrides=overrides)

        suggestions.append(
            {
                "order_id": o.id,
                "order_code": o.order_code,
                "line_id": line.id,
                "line_code": line.line_code,
                "ob_id": ob.id if ob else None,
                "total_smv": total_smv,
                "target_per_day": round(target_per_day, 2),
                "days_needed": days_needed,
                "suggested_start": cur_start.isoformat(),
                "suggested_end": end_planned.isoformat(),
                "skipped": False,
            }
        )
        cur_start = end_planned

    return suggestions
