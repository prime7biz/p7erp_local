"""Compliance score and audit readiness (Sprint H1)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_compliance_framework import (
    ComplianceFramework,
    ComplianceRequirement,
    EmployeeComplianceRecord,
)
from app.modules.hr_compliance.schemas import (
    AuditReadinessGap,
    AuditReadinessReport,
    ComplianceScoreResponse,
)


def _employee_weight(category: str | None) -> float:
    cat = (category or "").strip().upper()
    if cat in {"WORKER", "OPERATOR", "PRODUCTION"}:
        return 1.5
    return 1.0


async def calculate_compliance_score(
    db: AsyncSession,
    tenant_id: int,
    framework_id: int,
) -> ComplianceScoreResponse:
    fw = (
        await db.execute(
            select(ComplianceFramework).where(
                ComplianceFramework.id == framework_id,
                (ComplianceFramework.tenant_id == tenant_id) | (ComplianceFramework.tenant_id.is_(None)),
            )
        )
    ).scalar_one_or_none()
    if fw is None:
        raise ValueError("Framework not found")

    reqs = list(
        (
            await db.execute(
                select(ComplianceRequirement).where(
                    ComplianceRequirement.framework_id == framework_id,
                    ComplianceRequirement.is_active.is_(True),
                    (ComplianceRequirement.tenant_id == tenant_id) | (ComplianceRequirement.tenant_id.is_(None)),
                )
            )
        )
        .scalars()
        .all()
    )
    req_ids = [r.id for r in reqs]
    total_req = len(req_ids)

    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )

    records = []
    if req_ids and employees:
        records = list(
            (
                await db.execute(
                    select(EmployeeComplianceRecord).where(
                        EmployeeComplianceRecord.tenant_id == tenant_id,
                        EmployeeComplianceRecord.requirement_id.in_(req_ids),
                    )
                )
            )
            .scalars()
            .all()
        )

    by_key = {(r.employee_id, r.requirement_id): r for r in records}
    compliant = 0
    non_compliant = 0
    pending = 0
    weighted_num = 0.0
    weighted_den = 0.0

    for emp in employees:
        w = _employee_weight(emp.employee_category)
        for req in reqs:
            rec = by_key.get((emp.id, req.id))
            status = (rec.status if rec else "PENDING").upper()
            if status == "COMPLIANT":
                compliant += 1
                weighted_num += w
            elif status in {"NON_COMPLIANT"}:
                non_compliant += 1
            else:
                pending += 1
            weighted_den += w

    total_cells = max(compliant + non_compliant + pending, 1)
    score = round(100.0 * compliant / total_cells, 2) if total_req and employees else 0.0
    weighted = round(100.0 * weighted_num / weighted_den, 2) if weighted_den else score

    return ComplianceScoreResponse(
        framework_id=framework_id,
        framework_name=fw.framework_name,
        total_requirements=total_req,
        compliant_count=compliant,
        non_compliant_count=non_compliant,
        pending_count=pending,
        score_percent=score,
        employee_count=len(employees),
        weighted_score_percent=weighted,
    )


async def generate_audit_readiness_report(
    db: AsyncSession,
    tenant_id: int,
    framework_id: int,
) -> AuditReadinessReport:
    score = await calculate_compliance_score(db, tenant_id, framework_id)
    fw = (
        await db.execute(select(ComplianceFramework).where(ComplianceFramework.id == framework_id))
    ).scalar_one()

    reqs = list(
        (
            await db.execute(
                select(ComplianceRequirement).where(
                    ComplianceRequirement.framework_id == framework_id,
                    ComplianceRequirement.is_active.is_(True),
                    (ComplianceRequirement.tenant_id == tenant_id) | (ComplianceRequirement.tenant_id.is_(None)),
                )
            )
        )
        .scalars()
        .all()
    )
    req_by_id = {r.id: r for r in reqs}
    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    emp_by_id = {e.id: e for e in employees}
    req_ids = list(req_by_id.keys())
    records = []
    if req_ids:
        records = list(
            (
                await db.execute(
                    select(EmployeeComplianceRecord).where(
                        EmployeeComplianceRecord.tenant_id == tenant_id,
                        EmployeeComplianceRecord.requirement_id.in_(req_ids),
                    )
                )
            )
            .scalars()
            .all()
        )
    by_key = {(r.employee_id, r.requirement_id): r for r in records}

    gaps: list[AuditReadinessGap] = []
    non_compliant_summary: list[dict] = []
    for emp in employees:
        for req in reqs:
            rec = by_key.get((emp.id, req.id))
            status = (rec.status if rec else "PENDING").upper()
            if status == "COMPLIANT":
                continue
            missing = list(req.required_documents or [])
            if rec and rec.evidence_document_id:
                missing = []
            gap = AuditReadinessGap(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                employee_name=f"{emp.first_name} {emp.last_name or ''}".strip(),
                requirement_id=req.id,
                requirement_code=req.requirement_code,
                title=req.title,
                status=status,
                missing_documents=missing,
                evidence_document_id=rec.evidence_document_id if rec else None,
            )
            gaps.append(gap)
            if status == "NON_COMPLIANT":
                non_compliant_summary.append(
                    {
                        "employee_id": emp.id,
                        "requirement_code": req.requirement_code,
                        "title": req.title,
                        "notes": rec.notes if rec else None,
                    }
                )

    action_plan: list[str] = []
    if any(g.status == "PENDING" for g in gaps):
        action_plan.append("Complete pending evidence uploads for open requirements.")
    if non_compliant_summary:
        action_plan.append("Remediate NON_COMPLIANT items and re-verify before audit.")
    age_gaps = [g for g in gaps if "child" in g.title.lower() or g.requirement_code in {"1.1", "P3", "ETI-4"}]
    if age_gaps:
        action_plan.append(f"Complete age verification for {len({g.employee_id for g in age_gaps})} workers.")
    if score.score_percent < 90:
        action_plan.append("Target ≥90% compliance score before inviting external auditors.")

    return AuditReadinessReport(
        framework_id=framework_id,
        framework_name=fw.framework_name,
        score_percent=score.score_percent,
        gaps=gaps,
        non_compliant_summary=non_compliant_summary,
        action_plan=action_plan,
    )
