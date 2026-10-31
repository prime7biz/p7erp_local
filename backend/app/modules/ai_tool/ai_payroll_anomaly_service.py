"""Payroll anomaly heuristics (Sprint H1)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_compliance_framework import HrAiAnalysisResult
from app.models.hr_payroll import PayrollCalculationSnapshot, PayrollRun, PayrollRunLine


async def detect_payroll_anomalies(
    db: AsyncSession, tenant_id: int, payroll_run_id: int
) -> dict[str, Any]:
    run = (
        await db.execute(
            select(PayrollRun).where(PayrollRun.id == payroll_run_id, PayrollRun.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if run is None:
        return {"run_id": payroll_run_id, "anomalies": [], "error": "Payroll run not found"}

    lines = list(
        (
            await db.execute(
                select(PayrollRunLine).where(
                    PayrollRunLine.tenant_id == tenant_id, PayrollRunLine.run_id == payroll_run_id
                )
            )
        )
        .scalars()
        .all()
    )
    anomalies: list[dict[str, Any]] = []
    emp_ids = [ln.employee_id for ln in lines]
    employees = {
        e.id: e
        for e in (
            await db.execute(select(Employee).where(Employee.id.in_(emp_ids)))
        ).scalars().all()
    } if emp_ids else {}

    # Prior run lines for same employees (simple: previous run id - 1 not reliable; skip if none)
    prior_by_emp: dict[int, PayrollRunLine] = {}
    prior_runs = list(
        (
            await db.execute(
                select(PayrollRun)
                .where(PayrollRun.tenant_id == tenant_id, PayrollRun.id != payroll_run_id)
                .order_by(PayrollRun.id.desc())
                .limit(3)
            )
        )
        .scalars()
        .all()
    )
    if prior_runs:
        prior_lines = list(
            (
                await db.execute(
                    select(PayrollRunLine).where(
                        PayrollRunLine.tenant_id == tenant_id,
                        PayrollRunLine.run_id == prior_runs[0].id,
                        PayrollRunLine.employee_id.in_(emp_ids) if emp_ids else False,
                    )
                )
            )
            .scalars()
            .all()
        ) if emp_ids else []
        prior_by_emp = {p.employee_id: p for p in prior_lines}

    snapshots: dict[int, PayrollCalculationSnapshot] = {}
    if lines:
        line_ids = [ln.id for ln in lines]
        for s in (
            await db.execute(
                select(PayrollCalculationSnapshot).where(
                    PayrollCalculationSnapshot.tenant_id == tenant_id,
                    PayrollCalculationSnapshot.payroll_run_line_id.in_(line_ids),
                )
            )
        ).scalars().all():
            # map snapshot back to employee via line
            for ln in lines:
                if ln.id == s.payroll_run_line_id:
                    snapshots[ln.employee_id] = s
                    break

    seen_emp: set[int] = set()
    for ln in lines:
        emp = employees.get(ln.employee_id)
        name = f"{emp.first_name} {emp.last_name or ''}".strip() if emp else str(ln.employee_id)
        if ln.employee_id in seen_emp:
            anomalies.append(
                {
                    "employee_id": ln.employee_id,
                    "employee_name": name,
                    "severity": "high",
                    "code": "DUPLICATE_PAYMENT",
                    "message": "Duplicate payroll line for employee",
                    "suggested_fix": "Remove duplicate line before finalize",
                }
            )
        seen_emp.add(ln.employee_id)

        if ln.net_pay is not None and Decimal(ln.net_pay) < 0:
            anomalies.append(
                {
                    "employee_id": ln.employee_id,
                    "employee_name": name,
                    "severity": "critical",
                    "code": "NEGATIVE_NET",
                    "message": f"Negative net pay: {ln.net_pay}",
                    "suggested_fix": "Review deductions and advances",
                }
            )

        prior = prior_by_emp.get(ln.employee_id)
        if prior and prior.gross_pay and Decimal(prior.gross_pay) > 0:
            ratio = float(Decimal(ln.gross_pay) / Decimal(prior.gross_pay))
            if ratio >= 1.20:
                anomalies.append(
                    {
                        "employee_id": ln.employee_id,
                        "employee_name": name,
                        "severity": "high",
                        "code": "SALARY_SPIKE",
                        "message": f"Gross pay spike {int((ratio - 1) * 100)}% vs prior run",
                        "suggested_fix": "Confirm increment or OT/bonus entry",
                    }
                )

        snap = snapshots.get(ln.employee_id)
        if snap is not None:
            ot_hours = float(getattr(snap, "ot_hours", 0) or 0)
            if ot_hours > 60:
                anomalies.append(
                    {
                        "employee_id": ln.employee_id,
                        "employee_name": name,
                        "severity": "high",
                        "code": "OT_LIMIT",
                        "message": f"OT hours {ot_hours} exceed 60h/week compliance limit",
                        "suggested_fix": "Cap OT or obtain documented exception",
                    }
                )
            absent = int(getattr(snap, "absent_days", 0) or 0)
            attendance_days = int(getattr(snap, "attendance_days", 0) or 0)
            if Decimal(ln.net_pay or 0) > 0 and attendance_days == 0 and absent > 0:
                anomalies.append(
                    {
                        "employee_id": ln.employee_id,
                        "employee_name": name,
                        "severity": "medium",
                        "code": "PAID_NO_ATTENDANCE",
                        "message": "Paid with zero attendance days in snapshot",
                        "suggested_fix": "Verify leave paid status or attendance import",
                    }
                )

    payload = {"run_id": payroll_run_id, "anomalies": anomalies, "count": len(anomalies)}
    db.add(
        HrAiAnalysisResult(
            tenant_id=tenant_id,
            analysis_type="PAYROLL_ANOMALY",
            subject_id=payroll_run_id,
            score=max(0, 100 - len(anomalies) * 10),
            payload=payload,
        )
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return payload
