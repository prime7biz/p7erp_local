"""Rule-weighted turnover risk scoring (Sprint H1)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_compliance_framework import HrAiAnalysisResult
from app.models.hr_leave import LeaveBalance


async def predict_turnover_risk(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True)).limit(500)
            )
        )
        .scalars()
        .all()
    )
    start = date.today() - timedelta(days=90)
    predictions: list[dict] = []

    for emp in employees:
        factors: list[str] = []
        score = 10
        # Tenure
        if emp.joining_date:
            years = (date.today() - emp.joining_date).days / 365.25
            if years < 1:
                score += 15
                factors.append("Tenure under 1 year")
            elif years > 4:
                score += 10
                factors.append("Long tenure without recent promotion signal")
        # Absences
        absent = (
            await db.execute(
                select(func.count())
                .select_from(AttendanceEntry)
                .where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.employee_id == emp.id,
                    AttendanceEntry.attendance_date >= start,
                    AttendanceEntry.status.in_(["ABSENT", "LEAVE", "UNPAID_LEAVE"]),
                )
            )
        ).scalar() or 0
        if absent >= 5:
            score += 20
            factors.append(f"{absent} absences in last 90 days")
        # Leave balance high
        try:
            bal = (
                await db.execute(
                    select(LeaveBalance).where(
                        LeaveBalance.tenant_id == tenant_id,
                        LeaveBalance.employee_id == emp.id,
                    )
                )
            ).scalars().first()
            if bal is not None:
                remaining = float(getattr(bal, "closing_balance_days", 0) or 0)
                if remaining >= 30:
                    score += 15
                    factors.append(f"High leave balance ({remaining} days)")
        except Exception:
            pass

        score = min(100, score)
        level = "LOW"
        if score >= 75:
            level = "CRITICAL"
        elif score >= 55:
            level = "HIGH"
        elif score >= 35:
            level = "MEDIUM"

        actions = []
        if level in {"HIGH", "CRITICAL"}:
            actions.append("Schedule retention interview")
            if any("leave" in f.lower() for f in factors):
                actions.append("Review leave usage and workload")
            if any("absence" in f.lower() for f in factors):
                actions.append("Discuss attendance with supervisor")

        if score >= 35 or factors:
            predictions.append(
                {
                    "employee_id": emp.id,
                    "employee_name": f"{emp.first_name} {emp.last_name or ''}".strip(),
                    "employee_code": emp.employee_code,
                    "risk_score": score,
                    "risk_level": level,
                    "probability_of_exit_6m": round(min(0.95, score / 100.0), 2),
                    "key_factors": factors,
                    "recommended_actions": actions,
                }
            )

    predictions.sort(key=lambda x: x["risk_score"], reverse=True)
    payload = {"predictions": predictions[:100], "count": len(predictions)}
    db.add(
        HrAiAnalysisResult(
            tenant_id=tenant_id,
            analysis_type="TURNOVER",
            subject_id=None,
            score=predictions[0]["risk_score"] if predictions else 0,
            payload=payload,
        )
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return payload
