"""Predictive manufacturing heuristics (Phase 4 MVP) — no ML dependencies required."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.models import HourlyProductionEntry, ProductionQcCheck, SewingLine

logger = logging.getLogger(__name__)


def _f(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def build_defect_risk_suggestions(
    db: AsyncSession,
    *,
    tenant_id: int,
    lookback_days: int = 14,
) -> dict[str, Any]:
    """
    Simple defect-risk scores from recent QC fail rates and hourly reject ratios.
    Always returns source=heuristic. Fail-closed on DB errors.
    """
    days = max(3, min(90, int(lookback_days or 14)))
    since = date.today() - timedelta(days=days)
    suggestions: list[dict[str, Any]] = []

    try:
        qc_rows = (
            await db.execute(
                select(
                    ProductionQcCheck.sewing_line_id,
                    ProductionQcCheck.total_checked,
                    ProductionQcCheck.fail_qty,
                    ProductionQcCheck.order_id,
                ).where(
                    ProductionQcCheck.tenant_id == tenant_id,
                    ProductionQcCheck.production_date >= since,
                )
            )
        ).all()

        hourly_rows = (
            await db.execute(
                select(
                    HourlyProductionEntry.line_id,
                    HourlyProductionEntry.good_qty,
                    HourlyProductionEntry.reject_qty,
                    HourlyProductionEntry.order_id,
                ).where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.production_date >= since,
                    HourlyProductionEntry.line_id.is_not(None),
                )
            )
        ).all()

        line_names: dict[int, str] = {}
        line_rows = (
            await db.execute(select(SewingLine.id, SewingLine.name).where(SewingLine.tenant_id == tenant_id))
        ).all()
        for lid, name in line_rows:
            line_names[int(lid)] = str(name or f"Line {lid}")

        by_line: dict[int, dict[str, float]] = {}
        for line_id, total_checked, fail_qty, _order_id in qc_rows:
            if not line_id:
                continue
            bucket = by_line.setdefault(int(line_id), {"checked": 0.0, "fail": 0.0, "good": 0.0, "reject": 0.0})
            bucket["checked"] += _f(total_checked)
            bucket["fail"] += _f(fail_qty)

        for line_id, good_qty, reject_qty, _order_id in hourly_rows:
            if not line_id:
                continue
            bucket = by_line.setdefault(int(line_id), {"checked": 0.0, "fail": 0.0, "good": 0.0, "reject": 0.0})
            bucket["good"] += _f(good_qty)
            bucket["reject"] += _f(reject_qty)

        for line_id, stats in by_line.items():
            qc_rate = (stats["fail"] / stats["checked"]) if stats["checked"] > 0 else 0.0
            produced = stats["good"] + stats["reject"]
            reject_rate = (stats["reject"] / produced) if produced > 0 else 0.0
            # Blend QC fail rate and hourly reject share into 0..1 risk score
            risk = min(1.0, max(0.0, (qc_rate * 0.65) + (reject_rate * 0.35)))
            if stats["checked"] <= 0 and produced <= 0:
                risk = 0.15  # placeholder baseline when no recent data
            severity = "low"
            if risk >= 0.25:
                severity = "high"
            elif risk >= 0.12:
                severity = "medium"
            suggestions.append(
                {
                    "line_id": line_id,
                    "line_name": line_names.get(line_id, f"Line {line_id}"),
                    "risk_score": round(risk, 3),
                    "risk_score_100": int(round(min(100.0, max(0.0, risk * 100.0)))),
                    "severity": severity,
                    "qc_fail_rate": round(qc_rate, 4),
                    "hourly_reject_rate": round(reject_rate, 4),
                    "top_defects": [
                        {
                            "type": "broken_stitch",
                            "probability": round(min(0.55, 0.2 + risk * 0.4), 2),
                            "action": "Check needle condition and thread tension",
                        },
                        {
                            "type": "open_seam",
                            "probability": round(min(0.4, 0.15 + risk * 0.25), 2),
                            "action": "Verify seam allowance and folder setting",
                        },
                        {
                            "type": "measurement",
                            "probability": round(min(0.3, 0.1 + risk * 0.2), 2),
                            "action": "Recalibrate pattern / first-piece audit",
                        },
                    ],
                    "recommended_actions": [
                        "Increase inline QC frequency on first hour",
                        "Coach operators on top defect codes",
                    ]
                    if severity != "low"
                    else ["Continue standard QC sampling"],
                    "suggestion": (
                        "Increase inline QC frequency and coach top defect codes."
                        if severity == "high"
                        else "Monitor first-hour defects and rework ratio."
                        if severity == "medium"
                        else "No elevated defect signal in lookback window."
                    ),
                }
            )

        suggestions.sort(key=lambda x: float(x["risk_score"]), reverse=True)
        if not suggestions:
            suggestions.append(
                {
                    "line_id": None,
                    "line_name": None,
                    "risk_score": 0.1,
                    "risk_score_100": 10,
                    "severity": "low",
                    "qc_fail_rate": 0.0,
                    "hourly_reject_rate": 0.0,
                    "top_defects": [],
                    "recommended_actions": ["Capture QC checks to enable defect scoring"],
                    "suggestion": "No QC/hourly data in lookback — placeholder low risk until shop-floor data exists.",
                }
            )
    except Exception as exc:
        logger.warning("defect_risk_heuristic_failed tenant=%s err=%s", tenant_id, exc)
        await safe_async_session_rollback(db)
        return {
            "success": False,
            "source": "heuristic",
            "lookback_days": days,
            "items": [],
            "limitations": ["Defect-risk heuristic failed; returning empty list."],
        }

    return {
        "success": True,
        "source": "heuristic",
        "lookback_days": days,
        "items": suggestions[:20],
        "limitations": [
            "Scores are simple reject/fail ratios — not a trained ML model.",
        ],
    }


async def build_line_balance_suggestions(
    db: AsyncSession,
    *,
    tenant_id: int,
    lookback_days: int = 7,
) -> dict[str, Any]:
    """
    Suggest line rebalance from hourly output variance across sewing lines.
    Always returns source=heuristic.
    """
    days = max(3, min(60, int(lookback_days or 7)))
    since = date.today() - timedelta(days=days)
    suggestions: list[dict[str, Any]] = []

    try:
        rows = (
            await db.execute(
                select(
                    HourlyProductionEntry.line_id,
                    HourlyProductionEntry.good_qty,
                    HourlyProductionEntry.target_qty,
                ).where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.production_date >= since,
                    HourlyProductionEntry.line_id.is_not(None),
                )
            )
        ).all()

        line_names: dict[int, str] = {}
        for lid, name in (
            await db.execute(select(SewingLine.id, SewingLine.name).where(SewingLine.tenant_id == tenant_id))
        ).all():
            line_names[int(lid)] = str(name or f"Line {lid}")

        by_line: dict[int, dict[str, float]] = {}
        for line_id, good_qty, target_qty in rows:
            if not line_id:
                continue
            bucket = by_line.setdefault(int(line_id), {"good": 0.0, "target": 0.0, "hours": 0.0})
            bucket["good"] += _f(good_qty)
            bucket["target"] += _f(target_qty)
            bucket["hours"] += 1.0

        efficiencies: list[tuple[int, float, float, float]] = []
        for line_id, stats in by_line.items():
            target = stats["target"]
            good = stats["good"]
            eff = (good / target) if target > 0 else (0.75 if good > 0 else 0.5)
            efficiencies.append((line_id, eff, good, target))

        if not efficiencies:
            suggestions.append(
                {
                    "line_id": None,
                    "line_name": None,
                    "efficiency_score": 0.5,
                    "action": "observe",
                    "suggestion": "No hourly production in lookback — placeholder balance suggestion until lines report output.",
                }
            )
        else:
            avg_eff = sum(e[1] for e in efficiencies) / len(efficiencies)
            for line_id, eff, good, target in sorted(efficiencies, key=lambda x: x[1]):
                delta = eff - avg_eff
                if delta <= -0.12:
                    action = "add_capacity"
                    text = "Below peer average — consider moving skilled operators or reducing style changeovers."
                elif delta >= 0.12:
                    action = "share_load"
                    text = "Above peer average — candidate to absorb overflow from bottleneck lines."
                else:
                    action = "hold"
                    text = "Near peer average — keep current manning."
                suggestions.append(
                    {
                        "line_id": line_id,
                        "line_name": line_names.get(line_id, f"Line {line_id}"),
                        "efficiency_score": round(min(1.0, max(0.0, eff)), 3),
                        "peer_avg_efficiency": round(avg_eff, 3),
                        "good_qty": round(good, 2),
                        "target_qty": round(target, 2),
                        "action": action,
                        "suggestion": text,
                    }
                )
    except Exception as exc:
        logger.warning("line_balance_heuristic_failed tenant=%s err=%s", tenant_id, exc)
        await safe_async_session_rollback(db)
        return {
            "success": False,
            "source": "heuristic",
            "lookback_days": days,
            "items": [],
            "limitations": ["Line-balance heuristic failed; returning empty list."],
        }

    return {
        "success": True,
        "source": "heuristic",
        "lookback_days": days,
        "items": suggestions[:20],
        "limitations": [
            "Balance scores compare line efficiency (good/target) vs peer average — advisory only.",
        ],
    }


async def build_maintenance_risk_suggestions(
    db: AsyncSession,
    *,
    tenant_id: int,
    lookback_days: int = 30,
) -> dict[str, Any]:
    """
    Predictive maintenance scores from department machines + recent MACHINE downtime.
    Fail-closed; always source=heuristic.
    """
    from datetime import datetime

    from app.models import DepartmentMachine, ManufacturingDowntimeEvent

    days = max(7, min(120, int(lookback_days or 30)))
    since_dt = datetime.utcnow() - timedelta(days=days)
    items: list[dict[str, Any]] = []

    try:
        machines = (
            await db.execute(
                select(DepartmentMachine).where(
                    DepartmentMachine.tenant_id == tenant_id,
                    DepartmentMachine.is_active.is_(True),
                ).limit(100)
            )
        ).scalars().all()

        downtime_rows = (
            await db.execute(
                select(
                    ManufacturingDowntimeEvent.reason_code,
                    ManufacturingDowntimeEvent.duration_minutes,
                    ManufacturingDowntimeEvent.started_at,
                ).where(
                    ManufacturingDowntimeEvent.tenant_id == tenant_id,
                    ManufacturingDowntimeEvent.started_at >= since_dt,
                    ManufacturingDowntimeEvent.reason_code.in_(["MACHINE", "BREAKDOWN", "MAINTENANCE"]),
                )
            )
        ).all()

        total_dt_hours = 0.0
        event_count = 0
        for _code, duration_minutes, _started in downtime_rows:
            total_dt_hours += _f(duration_minutes) / 60.0
            event_count += 1

        avg_hours_per_machine = (total_dt_hours / max(1, len(machines))) if machines else total_dt_hours

        if not machines:
            items.append(
                {
                    "machine_id": None,
                    "machine_code": None,
                    "machine_name": None,
                    "breakdown_probability": 18,
                    "risk_window_hours": 48,
                    "recommended_action": "No department machines configured — add machines to enable maintenance scoring.",
                    "estimated_downtime_if_not_maintained": 2.0,
                    "last_maintenance": None,
                    "suggested_spare_parts": [],
                    "severity": "low",
                }
            )
        else:
            for m in machines:
                status = (m.status or "active").strip().lower()
                stress = min(1.0, avg_hours_per_machine / 8.0)
                base = 0.25 + (0.35 * stress) + (0.05 * min(event_count, 10))
                if status in {"down", "maintenance", "repair"}:
                    base = max(base, 0.72)
                elif status in {"idle", "standby"}:
                    base *= 0.7
                prob = int(round(min(95.0, max(5.0, base * 100.0))))
                severity = "low"
                if prob >= 71:
                    severity = "high"
                elif prob >= 31:
                    severity = "medium"
                items.append(
                    {
                        "machine_id": str(m.machine_code or m.id),
                        "machine_code": m.machine_code,
                        "machine_name": m.name or m.machine_code,
                        "breakdown_probability": prob,
                        "risk_window_hours": 48 if severity != "low" else 168,
                        "recommended_action": (
                            "Schedule maintenance tonight"
                            if severity == "high"
                            else "Plan preventive check this week"
                            if severity == "medium"
                            else "Continue routine inspection"
                        ),
                        "estimated_downtime_if_not_maintained": round(2.0 + stress * 4.0, 1),
                        "last_maintenance": None,
                        "suggested_spare_parts": ["needle_bar", "feed_dog"] if severity != "low" else [],
                        "severity": severity,
                        "downtime_hours_lookback": round(avg_hours_per_machine, 2),
                    }
                )
            items.sort(key=lambda x: int(x.get("breakdown_probability") or 0), reverse=True)
    except Exception as exc:
        logger.warning("maintenance_risk_heuristic_failed tenant=%s err=%s", tenant_id, exc)
        await safe_async_session_rollback(db)
        return {
            "success": False,
            "source": "heuristic",
            "lookback_days": days,
            "items": [],
            "limitations": ["Maintenance heuristic failed; returning empty list."],
        }

    return {
        "success": True,
        "source": "heuristic",
        "lookback_days": days,
        "items": items[:20],
        "limitations": [
            "Scores blend machine status with recent MACHINE/BREAKDOWN downtime hours — advisory only.",
        ],
    }
