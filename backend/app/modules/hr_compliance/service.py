"""HR compliance framework service (Sprint H1)."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.database import safe_async_session_rollback
from app.models.hr import Employee, EmployeeDocument
from app.models.hr_compliance_framework import (
    ComplianceFramework,
    ComplianceRequirement,
    EmployeeAgeVerification,
    EmployeeComplianceRecord,
    EmployeeMedicalRecord,
)
from app.modules.hr_compliance.age_utils import calculate_age, classify_worker_age
from app.modules.hr_compliance.schemas import (
    AgeVerificationCreate,
    ComplianceFrameworkCreate,
    EmployeeComplianceRecordCreate,
    EmployeeComplianceRecordUpdate,
    MedicalRecordCreate,
    MedicalRecordUpdate,
)


async def list_frameworks(db: AsyncSession, tenant_id: int) -> list[ComplianceFramework]:
    rows = (
        await db.execute(
            select(ComplianceFramework).where(
                (ComplianceFramework.tenant_id == tenant_id)
                | ((ComplianceFramework.tenant_id.is_(None)) & (ComplianceFramework.is_system.is_(True)))
            )
        )
    ).scalars().all()
    return list(rows)


async def list_frameworks_enriched(
    db: AsyncSession, tenant_id: int
) -> list[tuple[ComplianceFramework, int | None]]:
    """Return frameworks with activated_tenant_framework_id for system templates."""
    rows = await list_frameworks(db, tenant_id)
    tenant_by_name = {
        r.framework_name: r.id for r in rows if r.tenant_id == tenant_id and not r.is_system
    }
    enriched: list[tuple[ComplianceFramework, int | None]] = []
    for r in rows:
        activated_id: int | None = None
        if r.is_system and r.tenant_id is None:
            activated_id = tenant_by_name.get(r.framework_name)
        enriched.append((r, activated_id))
    return enriched


async def create_framework(
    db: AsyncSession, tenant_id: int, body: ComplianceFrameworkCreate
) -> ComplianceFramework:
    row = ComplianceFramework(
        tenant_id=tenant_id,
        framework_name=body.framework_name.strip().upper(),
        version=body.version,
        is_system=False,
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def activate_system_framework(
    db: AsyncSession, tenant_id: int, system_framework_id: int
) -> ComplianceFramework:
    """Copy a system template framework + requirements into the tenant."""
    src = (
        await db.execute(
            select(ComplianceFramework).where(
                ComplianceFramework.id == system_framework_id,
                ComplianceFramework.is_system.is_(True),
                ComplianceFramework.tenant_id.is_(None),
            )
        )
    ).scalar_one_or_none()
    if src is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System framework not found")

    existing = (
        await db.execute(
            select(ComplianceFramework).where(
                ComplianceFramework.tenant_id == tenant_id,
                ComplianceFramework.framework_name == src.framework_name,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    copy = ComplianceFramework(
        tenant_id=tenant_id,
        framework_name=src.framework_name,
        version=src.version,
        is_system=False,
        is_active=True,
    )
    db.add(copy)
    await db.flush()

    src_reqs = list(
        (
            await db.execute(
                select(ComplianceRequirement).where(
                    ComplianceRequirement.framework_id == src.id,
                    ComplianceRequirement.tenant_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for r in src_reqs:
        db.add(
            ComplianceRequirement(
                tenant_id=tenant_id,
                framework_id=copy.id,
                requirement_code=r.requirement_code,
                title=r.title,
                description=r.description,
                category=r.category,
                verification_method=r.verification_method,
                required_documents=r.required_documents,
                is_active=True,
            )
        )
    await db.commit()
    await db.refresh(copy)
    return copy


async def list_requirements(
    db: AsyncSession, tenant_id: int, framework_id: int
) -> list[ComplianceRequirement]:
    fw = (
        await db.execute(
            select(ComplianceFramework).where(
                ComplianceFramework.id == framework_id,
                (ComplianceFramework.tenant_id == tenant_id) | (ComplianceFramework.tenant_id.is_(None)),
            )
        )
    ).scalar_one_or_none()
    if fw is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Framework not found")
    rows = (
        await db.execute(
            select(ComplianceRequirement).where(
                ComplianceRequirement.framework_id == framework_id,
                (ComplianceRequirement.tenant_id == tenant_id) | (ComplianceRequirement.tenant_id.is_(None)),
            )
        )
    ).scalars().all()
    return list(rows)


async def list_records(
    db: AsyncSession,
    tenant_id: int,
    employee_id: int | None = None,
    requirement_id: int | None = None,
    framework_id: int | None = None,
) -> list[EmployeeComplianceRecord]:
    q = select(EmployeeComplianceRecord).where(EmployeeComplianceRecord.tenant_id == tenant_id)
    if employee_id is not None:
        q = q.where(EmployeeComplianceRecord.employee_id == employee_id)
    if requirement_id is not None:
        q = q.where(EmployeeComplianceRecord.requirement_id == requirement_id)
    if framework_id is not None:
        req_ids = [
            r.id
            for r in (
                await db.execute(
                    select(ComplianceRequirement.id).where(
                        ComplianceRequirement.framework_id == framework_id,
                        (ComplianceRequirement.tenant_id == tenant_id)
                        | (ComplianceRequirement.tenant_id.is_(None)),
                    )
                )
            )
            .scalars()
            .all()
        ]
        if not req_ids:
            return []
        q = q.where(EmployeeComplianceRecord.requirement_id.in_(req_ids))
    return list((await db.execute(q)).scalars().all())


async def create_record(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    body: EmployeeComplianceRecordCreate,
) -> EmployeeComplianceRecord:
    emp = (
        await db.execute(
            select(Employee).where(Employee.id == body.employee_id, Employee.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    req = (
        await db.execute(
            select(ComplianceRequirement).where(
                ComplianceRequirement.id == body.requirement_id,
                ComplianceRequirement.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if req is None:
        # Distinguish system template vs missing so callers activate first
        system_req = (
            await db.execute(
                select(ComplianceRequirement).where(
                    ComplianceRequirement.id == body.requirement_id,
                    ComplianceRequirement.tenant_id.is_(None),
                )
            )
        ).scalar_one_or_none()
        if system_req is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Activate the system framework first, then record against the tenant requirement copy",
            )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    await ensure_owned(db, EmployeeDocument, body.evidence_document_id, tenant_id, "Document", status_code=404)

    status_val = (body.status or "PENDING").upper()
    row = EmployeeComplianceRecord(
        tenant_id=tenant_id,
        employee_id=body.employee_id,
        requirement_id=body.requirement_id,
        status=status_val,
        evidence_document_id=body.evidence_document_id,
        notes=body.notes,
        verified_by=user_id if status_val in {"COMPLIANT", "NON_COMPLIANT", "WAIVED"} else None,
        verified_at=datetime.utcnow() if status_val in {"COMPLIANT", "NON_COMPLIANT", "WAIVED"} else None,
    )
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not create record (duplicate?)")
    await db.refresh(row)
    return row


async def update_record(
    db: AsyncSession,
    tenant_id: int,
    user_id: int,
    record_id: int,
    body: EmployeeComplianceRecordUpdate,
) -> EmployeeComplianceRecord:
    row = (
        await db.execute(
            select(EmployeeComplianceRecord).where(
                EmployeeComplianceRecord.id == record_id,
                EmployeeComplianceRecord.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    payload = body.model_dump(exclude_unset=True)
    await ensure_owned(db, EmployeeDocument, payload.get("evidence_document_id"), tenant_id, "Document", status_code=404)
    if "status" in payload and payload["status"]:
        payload["status"] = str(payload["status"]).upper()
        if payload["status"] in {"COMPLIANT", "NON_COMPLIANT", "WAIVED", "UNDER_REVIEW"}:
            row.verified_by = user_id
            row.verified_at = datetime.utcnow()
    for k, v in payload.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return row


def assert_dob_allowed(dob, *, required: bool) -> None:
    """Raise HTTP 400 if age < 15 when age verification is required."""
    if dob is None:
        if required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Date of birth is required when age verification is enabled",
            )
        return
    age = calculate_age(dob)
    status_code, _, reason = classify_worker_age(age)
    if status_code == "REJECTED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)


async def create_age_verification(
    db: AsyncSession,
    tenant_id: int,
    employee_id: int,
    user_id: int,
    body: AgeVerificationCreate,
) -> EmployeeAgeVerification:
    emp = (
        await db.execute(
            select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    await ensure_owned(db, EmployeeDocument, body.document_id, tenant_id, "Document", status_code=404)

    age = calculate_age(body.date_of_birth)
    status_val, is_compliant, reason = classify_worker_age(age)
    if status_val == "REJECTED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    # Young worker becomes BSCI compliant only when light-work notes provided
    notes = body.notes
    if status_val == "YOUNG_WORKER":
        if notes and "light" in notes.lower():
            is_compliant = True
        else:
            is_compliant = False
            notes = (notes or "") + " Young worker: light work only; hazardous work restricted."

    emp.date_of_birth = body.date_of_birth
    row = EmployeeAgeVerification(
        tenant_id=tenant_id,
        employee_id=employee_id,
        verification_method=body.verification_method.strip().upper(),
        document_id=body.document_id,
        date_of_birth=body.date_of_birth,
        age_at_verification=age,
        status=status_val,
        is_bsci_compliant=is_compliant,
        verified_by=user_id,
        verified_at=datetime.utcnow(),
        notes=notes.strip() if notes else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_age_verifications(
    db: AsyncSession, tenant_id: int, employee_id: int
) -> list[EmployeeAgeVerification]:
    return list(
        (
            await db.execute(
                select(EmployeeAgeVerification)
                .where(
                    EmployeeAgeVerification.tenant_id == tenant_id,
                    EmployeeAgeVerification.employee_id == employee_id,
                )
                .order_by(EmployeeAgeVerification.id.desc())
            )
        )
        .scalars()
        .all()
    )


async def create_medical_record(
    db: AsyncSession, tenant_id: int, employee_id: int, body: MedicalRecordCreate
) -> EmployeeMedicalRecord:
    emp = (
        await db.execute(
            select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    await ensure_owned(db, EmployeeDocument, body.document_id, tenant_id, "Document", status_code=404)
    row = EmployeeMedicalRecord(
        tenant_id=tenant_id,
        employee_id=employee_id,
        certificate_number=body.certificate_number,
        examination_date=body.examination_date,
        expiry_date=body.expiry_date,
        doctor_name=body.doctor_name,
        doctor_registration=body.doctor_registration,
        hospital_clinic=body.hospital_clinic,
        fitness_status=(body.fitness_status or "PENDING").upper(),
        conditions=body.conditions,
        restrictions=body.restrictions,
        document_id=body.document_id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_medical_records(
    db: AsyncSession, tenant_id: int, employee_id: int
) -> list[EmployeeMedicalRecord]:
    return list(
        (
            await db.execute(
                select(EmployeeMedicalRecord)
                .where(
                    EmployeeMedicalRecord.tenant_id == tenant_id,
                    EmployeeMedicalRecord.employee_id == employee_id,
                )
                .order_by(EmployeeMedicalRecord.id.desc())
            )
        )
        .scalars()
        .all()
    )


async def update_medical_record(
    db: AsyncSession,
    tenant_id: int,
    employee_id: int,
    record_id: int,
    body: MedicalRecordUpdate,
) -> EmployeeMedicalRecord:
    row = (
        await db.execute(
            select(EmployeeMedicalRecord).where(
                EmployeeMedicalRecord.id == record_id,
                EmployeeMedicalRecord.tenant_id == tenant_id,
                EmployeeMedicalRecord.employee_id == employee_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    payload = body.model_dump(exclude_unset=True)
    await ensure_owned(db, EmployeeDocument, payload.get("document_id"), tenant_id, "Document", status_code=404)
    if "fitness_status" in payload and payload["fitness_status"]:
        payload["fitness_status"] = str(payload["fitness_status"]).upper()
    for k, v in payload.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return row
