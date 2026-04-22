"""On-time delivery score per order (deterministic, explainable)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.merch import Order
from app.models.production import CutTicket, HourlyProductionEntry, SewingLineStyleConfig


def _f(o: Order) -> float:
    try:
        return float(o.quantity or 0)
    except (TypeError, ValueError):
        return 0.0


def _rm_pct(o: Order) -> float:
    try:
        return float(o.rm_received_pct or 0)
    except (TypeError, ValueError):
        return 0.0


async def score_order_otd(db: AsyncSession, tenant_id: int, o: Order) -> dict[str, Any]:
    today = date.today()
    oqty = _f(o)
    rm = _rm_pct(o)
    delivery = o.delivery_date
    shipped = o.shipped_at

    ctickets = list(
        (await db.execute(select(CutTicket).where(CutTicket.tenant_id == tenant_id, CutTicket.order_id == o.id)))
        .scalars().all()
    )
    cut_pcs = sum(int(t.total_pcs_cut or 0) for t in ctickets)
    cut_pct = round(100 * cut_pcs / oqty, 1) if oqty > 0 else 0.0

    slcf = list(
        (
            await db.execute(
                select(SewingLineStyleConfig).where(
                    SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id == o.id
                )
            )
        ).scalars().all()
    )
    sew_good = sum(float(c.completed_qty or 0) for c in slcf)
    sew_plan = sum(float(c.planned_qty or 0) for c in slcf) or oqty or 1.0
    sew_pct = round(100 * sew_good / sew_plan, 1) if sew_plan else 0.0

    # Run-rate last 14 calendar days (sewing)
    d0 = today - timedelta(days=14)
    hsum = (
        await db.execute(
            select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                HourlyProductionEntry.tenant_id == tenant_id,
                HourlyProductionEntry.order_id == o.id,
                HourlyProductionEntry.production_date >= d0,
                HourlyProductionEntry.department_type.ilike("%sew%"),
            )
        )
    ).scalar_one()
    run_14 = float(hsum or 0)

    predicted_delay_days = 0
    blockers: list[str] = []
    if shipped:
        predicted_delay_days = 0
    elif delivery and delivery < today and not shipped:
        predicted_delay_days = (today - delivery).days
        blockers.append("past_delivery_not_shipped")
    else:
        if rm < 95:
            blockers.append("rm_incomplete")
            predicted_delay_days = max(predicted_delay_days, 7 if rm < 50 else 3)
        if sew_pct < 30 and cut_pct < 10:
            blockers.append("production_late_start")
            predicted_delay_days = max(predicted_delay_days, 5)
        if oqty > 0 and run_14 > 0:
            days_to_finish = max(0.0, (oqty - sew_good) / max(run_14 / 14.0, 0.01))
            if delivery:
                cal_left = max(0, (delivery - today).days)
                if days_to_finish > cal_left + 2:
                    predicted_delay_days = max(predicted_delay_days, int(days_to_finish - cal_left))
                    blockers.append("sewing_run_rate_vs_etd")

    otd_score = max(0.0, min(100.0, 100.0 - predicted_delay_days * 5.0 - (100 - rm) * 0.15))
    return {
        "order_id": o.id,
        "order_code": o.order_code,
        "delivery_date": delivery.isoformat() if delivery else None,
        "rm_received_pct": rm,
        "cut_pct": cut_pct,
        "sewing_pct": sew_pct,
        "predicted_delay_days": predicted_delay_days,
        "blockers": blockers,
        "otd_score": round(otd_score, 1),
    }


async def rollup_contract_otd(db: AsyncSession, tenant_id: int, orders: list[Order]) -> dict[str, Any]:
    if not orders:
        return {"avg_otd_score": None, "worst_order_code": None, "max_predicted_delay_days": 0}
    scores: list[float] = []
    worst_delay = 0
    worst_code = None
    for o in orders:
        s = await score_order_otd(db, tenant_id, o)
        scores.append(float(s["otd_score"]))
        if int(s["predicted_delay_days"]) >= worst_delay:
            worst_delay = int(s["predicted_delay_days"])
            worst_code = o.order_code
    avg = sum(scores) / len(scores) if scores else None
    return {
        "avg_otd_score": round(avg, 1) if avg is not None else None,
        "worst_order_code": worst_code,
        "max_predicted_delay_days": worst_delay,
    }
