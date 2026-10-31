"""Heuristic HR attendance pattern analysis (Sprint H1)."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_compliance_framework import HrAiAnalysisResult


async def analyze_attendance_patterns(
    db: AsyncSession,
    tenant_id: int,
    *,
    employee_id: int | None = None,
    period_months: int = 6,
    department_id: int | None = None,
    days: int | None = None,
) -> dict[str, Any]:
    if days is not None:
        start = date.today() - timedelta(days=max(1, days))
    else:
        start = date.today() - timedelta(days=max(1, period_months) * 30)

    emp_q = select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
    if employee_id is not None:
        emp_q = emp_q.where(Employee.id == employee_id)
    if department_id is not None:
        emp_q = emp_q.where(Employee.department_id == department_id)
    employees = list((await db.execute(emp_q)).scalars().all())
    emp_ids = [e.id for e in employees]
    if not emp_ids:
        return {
            "period_start": start.isoformat(),
            "patterns": [],
            "anomalies": [],
            "predictions": [],
            "recommendations": ["No active employees in scope."],
        }

    entries = list(
        (
            await db.execute(
                select(AttendanceEntry).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.employee_id.in_(emp_ids),
                    AttendanceEntry.attendance_date >= start,
                )
            )
        )
        .scalars()
        .all()
    )

    by_emp_dow: dict[int, Counter] = defaultdict(Counter)
    late_by_emp: Counter = Counter()
    absent_by_emp: Counter = Counter()
    for e in entries:
        status = (e.status or "").upper()
        dow = e.attendance_date.weekday()  # 0=Mon
        if status in {"ABSENT", "LEAVE", "UNPAID_LEAVE"}:
            by_emp_dow[e.employee_id][dow] += 1
            absent_by_emp[e.employee_id] += 1
        late_mins = int(getattr(e, "late_minutes", 0) or 0)
        if late_mins > 0 or status == "LATE":
            late_by_emp[e.employee_id] += 1

    emp_name = {e.id: f"{e.first_name} {e.last_name or ''}".strip() for e in employees}
    patterns: list[dict] = []
    anomalies: list[dict] = []
    predictions: list[dict] = []
    recommendations: list[str] = []

    for eid in emp_ids:
        mon_fri = by_emp_dow[eid][0] + by_emp_dow[eid][4]
        if mon_fri >= 3:
            patterns.append(
                {
                    "employee_id": eid,
                    "employee_name": emp_name.get(eid),
                    "type": "MONDAY_FRIDAY_ABSENCE",
                    "count": mon_fri,
                    "message": "Frequent Monday/Friday absences — possible leave abuse",
                }
            )
        if late_by_emp[eid] >= 8:
            anomalies.append(
                {
                    "employee_id": eid,
                    "employee_name": emp_name.get(eid),
                    "type": "CHRONIC_LATE",
                    "count": late_by_emp[eid],
                    "message": "Consistent late arrivals",
                }
            )
        # Simple next-Monday absence heuristic
        if by_emp_dow[eid][0] >= 2:
            predictions.append(
                {
                    "employee_id": eid,
                    "employee_name": emp_name.get(eid),
                    "message": f"Employee {emp_name.get(eid)} has elevated probability of absent next Monday",
                    "probability": min(0.9, 0.4 + 0.1 * by_emp_dow[eid][0]),
                }
            )

    # OT risk by department (simple)
    ot_rows = list(
        (
            await db.execute(
                select(OvertimeEntry).where(
                    OvertimeEntry.tenant_id == tenant_id,
                    OvertimeEntry.employee_id.in_(emp_ids),
                )
            )
        )
        .scalars()
        .all()
    )
    # If OvertimeEntry has hours field
    for row in ot_rows[:200]:
        hours = float(getattr(row, "ot_hours", 0) or 0)
        if hours > 12:
            anomalies.append(
                {
                    "employee_id": row.employee_id,
                    "type": "HIGH_OT_DAY",
                    "message": f"High OT day: {hours}h",
                }
            )

    if patterns:
        recommendations.append("Review Monday/Friday absence patterns with supervisors.")
    if anomalies:
        recommendations.append("Investigate chronic lateness and high OT days.")
    if not recommendations:
        recommendations.append("No significant attendance risks detected in the selected period.")

    result = {
        "period_start": start.isoformat(),
        "employee_count": len(emp_ids),
        "patterns": patterns,
        "anomalies": anomalies,
        "predictions": predictions,
        "recommendations": recommendations,
        "heatmap": {
            str(eid): {str(d): by_emp_dow[eid][d] for d in range(7)} for eid in list(by_emp_dow.keys())[:50]
        },
    }
    db.add(
        HrAiAnalysisResult(
            tenant_id=tenant_id,
            analysis_type="ATTENDANCE",
            subject_id=employee_id,
            score=max(0, 100 - len(anomalies) * 5 - len(patterns) * 3),
            payload=result,
        )
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return result
