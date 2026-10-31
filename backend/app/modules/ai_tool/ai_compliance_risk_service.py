"""Pre-audit compliance risk heuristics (Sprint H1)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_compliance_framework import (
    EmployeeAgeVerification,
    EmployeeComplianceRecord,
    EmployeeMedicalRecord,
    HrAiAnalysisResult,
)
from app.modules.hr_compliance.compliance_scoring_service import calculate_compliance_score


async def predict_compliance_risks(
    db: AsyncSession, tenant_id: int, framework_id: int
) -> dict[str, Any]:
    risks: list[dict[str, Any]] = []
    try:
        score = await calculate_compliance_score(db, tenant_id, framework_id)
        score_pct = score.score_percent
        framework_name = score.framework_name
    except Exception:
        score_pct = 0.0
        framework_name = "Unknown"

    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    emp_ids = [e.id for e in employees]

    # Age verification gaps
    verified = set()
    if emp_ids:
        rows = list(
            (
                await db.execute(
                    select(EmployeeAgeVerification).where(
                        EmployeeAgeVerification.tenant_id == tenant_id,
                        EmployeeAgeVerification.employee_id.in_(emp_ids),
                        EmployeeAgeVerification.is_bsci_compliant.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        verified = {r.employee_id for r in rows}
    missing_age = [e for e in employees if e.id not in verified]
    if missing_age:
        risks.append(
            {
                "code": "AGE_VERIFICATION_MISSING",
                "severity": "critical",
                "probability": 0.9,
                "impact": "Child labor audit failure",
                "message": f"{len(missing_age)} workers missing age verification (BSCI risk)",
                "employee_ids": [e.id for e in missing_age[:50]],
                "mitigation": "Complete age verification certificates before audit",
            }
        )

    # Medical expiry / missing
    today = date.today()
    med_ok = set()
    if emp_ids:
        meds = list(
            (
                await db.execute(
                    select(EmployeeMedicalRecord).where(
                        EmployeeMedicalRecord.tenant_id == tenant_id,
                        EmployeeMedicalRecord.employee_id.in_(emp_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
        for m in meds:
            if m.fitness_status in {"FIT", "FIT_WITH_RESTRICTIONS"} and (
                m.expiry_date is None or m.expiry_date >= today
            ):
                med_ok.add(m.employee_id)
            elif m.expiry_date and m.expiry_date < today + timedelta(days=30):
                risks.append(
                    {
                        "code": "MEDICAL_EXPIRING",
                        "severity": "high",
                        "probability": 0.7,
                        "impact": "Health & safety non-compliance",
                        "message": f"Medical certificate expiring soon for employee {m.employee_id}",
                        "employee_ids": [m.employee_id],
                        "mitigation": "Schedule medical re-examination",
                    }
                )
    missing_med = [e for e in employees if e.id not in med_ok]
    if len(missing_med) >= 3:
        risks.append(
            {
                "code": "MEDICAL_MISSING",
                "severity": "high",
                "probability": 0.75,
                "impact": "Occupational health & safety clause",
                "message": f"{len(missing_med)} employees without valid medical certificate",
                "employee_ids": [e.id for e in missing_med[:50]],
                "mitigation": "Upload and track medical certificates",
            }
        )

    if score_pct < 80:
        risks.append(
            {
                "code": "LOW_COMPLIANCE_SCORE",
                "severity": "high",
                "probability": 0.8,
                "impact": "Audit readiness",
                "message": f"{framework_name} readiness score {score_pct}% — below 80% target",
                "mitigation": "Close pending evidence gaps in compliance records",
            }
        )

    pending = list(
        (
            await db.execute(
                select(EmployeeComplianceRecord).where(
                    EmployeeComplianceRecord.tenant_id == tenant_id,
                    EmployeeComplianceRecord.status.in_(["PENDING", "NON_COMPLIANT"]),
                ).limit(200)
            )
        )
        .scalars()
        .all()
    )
    if pending:
        risks.append(
            {
                "code": "OPEN_COMPLIANCE_RECORDS",
                "severity": "medium",
                "probability": 0.6,
                "impact": "Evidence package incomplete",
                "message": f"{len(pending)} open/non-compliant compliance records",
                "mitigation": "Verify evidence and update statuses",
            }
        )

    recommendations = [r.get("mitigation") for r in risks if r.get("mitigation")]
    payload = {
        "framework_id": framework_id,
        "framework_name": framework_name,
        "score_percent": score_pct,
        "risks": risks,
        "recommendations": recommendations,
        "critical_count": sum(1 for r in risks if r.get("severity") == "critical"),
    }
    db.add(
        HrAiAnalysisResult(
            tenant_id=tenant_id,
            analysis_type="COMPLIANCE_RISK",
            subject_id=framework_id,
            score=int(score_pct),
            payload=payload,
        )
    )
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return payload
