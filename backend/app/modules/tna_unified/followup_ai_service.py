"""Phase 15: advisory TNA / follow-up insights (delay risk, missing ownership, suggestions)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ManufacturingTnaPlan, ManufacturingTnaPlanTask, Order, OrderFollowupAction


def _open_merch(status_value: str | None) -> bool:
    return (status_value or "").strip().lower() in {
        "pending",
        "in_progress",
        "submitted",
        "rejected",
        "resubmitted",
        "on_hold",
    }


def _open_mfg(status_value: str | None) -> bool:
    return (status_value or "").strip().lower() not in {"done", "cancelled"}


async def build_followup_insights(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int | None = None,
) -> dict[str, Any]:
    today = date.today()
    horizon = today + timedelta(days=7)
    overdue_merch = 0
    missing_owner_merch = 0
    overdue_mfg = 0
    missing_owner_mfg = 0
    upcoming_open = 0

    stmt = (
        select(OrderFollowupAction, Order.order_code)
        .join(Order, OrderFollowupAction.order_id == Order.id)
        .where(OrderFollowupAction.tenant_id == tenant_id, Order.tenant_id == tenant_id)
    )
    if order_id is not None:
        stmt = stmt.where(OrderFollowupAction.order_id == order_id)
    merch_result = await db.execute(stmt)

    merch_overdue_rows: list[tuple[OrderFollowupAction, str, int]] = []
    for action, order_code in merch_result.all():
        st = (action.status or "").strip().lower()
        if not _open_merch(st):
            continue
        pd = action.planned_date
        if pd is not None and today < pd <= horizon:
            upcoming_open += 1
        if pd is not None and pd < today:
            overdue_merch += 1
            merch_overdue_rows.append((action, order_code or "", (today - pd).days))
        if action.assigned_to_id is None:
            missing_owner_merch += 1

    plan_stmt = select(ManufacturingTnaPlan).where(ManufacturingTnaPlan.tenant_id == tenant_id)
    if order_id is not None:
        plan_stmt = plan_stmt.where(ManufacturingTnaPlan.order_id == order_id)
    plans = (await db.execute(plan_stmt)).scalars().all()
    plan_by_id: dict[int, ManufacturingTnaPlan] = {p.id: p for p in plans}
    mfg_overdue_rows: list[tuple[ManufacturingTnaPlanTask, str | None, int]] = []

    if plans:
        plan_ids = [p.id for p in plans]
        tasks = (
            await db.execute(
                select(ManufacturingTnaPlanTask).where(
                    ManufacturingTnaPlanTask.tenant_id == tenant_id,
                    ManufacturingTnaPlanTask.plan_id.in_(plan_ids),
                )
            )
        ).scalars().all()
        order_ids_needing_code = {
            plan_by_id[t.plan_id].order_id
            for t in tasks
            if t.plan_id in plan_by_id and plan_by_id[t.plan_id].order_id is not None
        }
        order_code_by_id: dict[int, str | None] = {}
        if order_ids_needing_code:
            orows = await db.execute(
                select(Order.id, Order.order_code).where(
                    Order.tenant_id == tenant_id,
                    Order.id.in_({oid for oid in order_ids_needing_code if oid}),
                )
            )
            for oid, oc in orows.all():
                order_code_by_id[int(oid)] = oc

        for t in tasks:
            st = (t.status or "").strip().lower()
            if not _open_mfg(st):
                continue
            pd = t.planned_date
            if today < pd <= horizon:
                upcoming_open += 1
            if pd < today:
                overdue_mfg += 1
                plan = plan_by_id.get(t.plan_id)
                oid = plan.order_id if plan else None
                oc = order_code_by_id.get(oid) if oid else None
                mfg_overdue_rows.append((t, oc, (today - pd).days))
            if t.owner_user_id is None:
                missing_owner_mfg += 1

    total_overdue = overdue_merch + overdue_mfg
    total_missing = missing_owner_merch + missing_owner_mfg
    base_risk = min(100.0, float(total_overdue * 12 + total_missing * 5))
    pressure = float(total_overdue) / max(1.0, float(upcoming_open))
    trend_adjust = min(25.0, max(0.0, (pressure - 1.0) * 8.0))
    delay_risk_score = min(100.0, base_risk + trend_adjust)

    delay_prediction = {
        "horizon_days": 7,
        "open_actions_due_in_horizon": upcoming_open,
        "overdue_open_actions": total_overdue,
        "backlog_pressure_ratio": round(pressure, 3),
        "band": "elevated" if pressure >= 2.0 and total_overdue >= 3 else ("watch" if pressure >= 1.2 else "stable"),
        "confidence": 0.55 if upcoming_open == 0 and total_overdue == 0 else min(0.88, 0.5 + 0.02 * min(total_overdue, 15)),
        "reason_codes": ["OVERDUE_VS_UPCOMING_RATIO", "HEURISTIC_TREND_NOT_FORECAST"],
    }

    alerts = []
    if total_overdue:
        alerts.append(
            {
                "severity": "warn" if total_overdue < 10 else "high",
                "code": "OVERDUE_ACTIONS",
                "message": f"{total_overdue} open action(s) past planned date.",
                "confidence": 0.9,
                "reason_codes": ["PLANNED_DATE_BEFORE_TODAY"],
            }
        )
    if total_missing:
        alerts.append(
            {
                "severity": "info",
                "code": "UNASSIGNED_ACTIONS",
                "message": f"{total_missing} open action(s) without an owner.",
                "confidence": 0.85,
                "reason_codes": ["ASSIGNEE_NULL"],
            }
        )
    if delay_prediction["band"] == "elevated":
        alerts.append(
            {
                "severity": "medium",
                "code": "DELAY_PRESSURE",
                "message": "Overdue backlog is large relative to work due in the next 7 days — risk of cascading slips.",
                "confidence": delay_prediction["confidence"],
                "reason_codes": ["BACKLOG_PRESSURE_RATIO"],
            }
        )

    suggestions: list[dict[str, Any]] = []
    merch_overdue_rows.sort(key=lambda x: -x[2])
    for action, oc, days in merch_overdue_rows[:5]:
        suggestions.append(
            {
                "source_system": "merch",
                "source_action_id": action.id,
                "order_id": action.order_id,
                "order_code": oc or None,
                "title": action.title,
                "days_overdue": days,
                "suggested_next_step": "Assign owner and reschedule or close with documented reason.",
                "confidence": 0.8,
                "reason_codes": ["OVERDUE_MERCH_FOLLOWUP"],
            }
        )
    mfg_overdue_rows.sort(key=lambda x: -x[2])
    for task, oc, days in mfg_overdue_rows[:5]:
        suggestions.append(
            {
                "source_system": "manufacturing",
                "source_action_id": task.id,
                "order_id": plan_by_id[task.plan_id].order_id if task.plan_id in plan_by_id else None,
                "order_code": oc,
                "title": task.task_name,
                "days_overdue": days,
                "suggested_next_step": "Confirm floor status with production; update actual/owner or replan task.",
                "confidence": 0.78,
                "reason_codes": ["OVERDUE_MFG_TNA_TASK"],
            }
        )

    return {
        "as_of": today.isoformat(),
        "order_id": order_id,
        "counts": {
            "overdue_merch": overdue_merch,
            "overdue_mfg": overdue_mfg,
            "missing_owner_merch": missing_owner_merch,
            "missing_owner_mfg": missing_owner_mfg,
            "open_due_next_7_days": upcoming_open,
        },
        "delay_risk_score": round(delay_risk_score, 2),
        "delay_prediction": delay_prediction,
        "follow_up_suggestions": suggestions[:10],
        "alerts": alerts,
        "disclaimer": "Heuristic risk and trend-style signals — not a statistical forecast; validate with planners.",
    }
