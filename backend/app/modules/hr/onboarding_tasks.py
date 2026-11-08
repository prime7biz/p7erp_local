"""Truthful onboarding checklist: a task is COMPLETED only while a real source record proves it.

Nothing here creates consent or medical evidence. ``sync_onboarding_tasks`` is called by the
workflows that create or withdraw evidence (photo, document upload, biometric consent, medical
record) and when the checklist is read; it completes DUE tasks that now have evidence and reopens
COMPLETED tasks whose evidence was withdrawn. WAIVED tasks never change. Nothing here commits.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_medical_certificate_tracking_enabled
from app.models import Tenant
from app.models.hr import Employee, EmployeeDocument
from app.models.hr_attendance_device import AttendanceDevice
from app.models.hr_compliance_framework import EmployeeMedicalRecord
from app.models.hr_lifecycle import HrEmployeeBiometricEnrollment, HrEmployeePrivacyConsent
from app.models.hr_onboarding import HrEmployeeOnboardingTask

SECURE_DOCUMENT_PREFIX = "hr_secure:document:"
IDENTITY_SCAN_TYPES = ("NID_SCAN", "BIRTH_REGISTRATION_SCAN")
CONSENT_PURPOSE = {
    "PHOTO_CONSENT": "PHOTO",
    "IDENTITY_DOCUMENT_CONSENT": "IDENTITY_DOCUMENT",
    "CV_CONSENT": "CV",
}
BIOMETRIC_MODALITY = {"FINGERPRINT_CONSENT": "FINGERPRINT", "FACE_CONSENT": "FACE"}
# A medical record still PENDING (or UNFIT, which needs follow-up) does not finish the task.
MEDICAL_RESULT_STATUSES = ("FIT", "RESTRICTED")
TASK_LABELS = {
    "PHOTO_CONSENT": "Photo privacy consent",
    "FINGERPRINT_CONSENT": "Fingerprint consent",
    "FACE_CONSENT": "Face consent",
    "IDENTITY_DOCUMENT_CONSENT": "Identity document consent",
    "CV_CONSENT": "CV consent",
    "MEDICAL_EXAM": "Medical fitness examination",
    "REQUIRED_DOCUMENTS": "NID or birth registration scan",
    "EMPLOYEE_PHOTO": "Employee photo",
}
# Workspace tab where the evidence is recorded.
TASK_TABS = {
    "PHOTO_CONSENT": "identity",
    "FINGERPRINT_CONSENT": "identity",
    "FACE_CONSENT": "identity",
    "IDENTITY_DOCUMENT_CONSENT": "documents",
    "CV_CONSENT": "documents",
    "MEDICAL_EXAM": "medical",
    "REQUIRED_DOCUMENTS": "documents",
    "EMPLOYEE_PHOTO": "identity",
}


async def applicable_task_types(db: AsyncSession, tenant: Tenant) -> list[str]:
    """Only tasks an existing workflow can complete. Identity-document and CV consents have no
    capture screen yet, so they are not created (they would stay DUE forever)."""
    types = ["EMPLOYEE_PHOTO", "PHOTO_CONSENT", "REQUIRED_DOCUMENTS"]
    has_device = (
        await db.execute(
            select(AttendanceDevice.id).where(AttendanceDevice.tenant_id == tenant.id, AttendanceDevice.is_active.is_(True)).limit(1)
        )
    ).first()
    if has_device:
        types += ["FINGERPRINT_CONSENT", "FACE_CONSENT"]
    if is_medical_certificate_tracking_enabled(tenant.feature_flags):
        types.append("MEDICAL_EXAM")
    return types


async def create_onboarding_tasks(
    db: AsyncSession, *, tenant: Tenant, employee: Employee, actor_id: int | None
) -> list[HrEmployeeOnboardingTask]:
    """Create missing DUE tasks (idempotent per employee + task type), then reconcile evidence."""
    existing = {
        t.task_type
        for t in (
            await db.execute(
                select(HrEmployeeOnboardingTask).where(
                    HrEmployeeOnboardingTask.tenant_id == tenant.id,
                    HrEmployeeOnboardingTask.employee_id == employee.id,
                )
            )
        ).scalars()
    }
    start = employee.joining_date or date.today()
    for task_type in await applicable_task_types(db, tenant):
        if task_type in existing:
            continue
        db.add(
            HrEmployeeOnboardingTask(
                tenant_id=tenant.id,
                employee_id=employee.id,
                task_type=task_type,
                status="DUE",
                due_date=start if task_type == "MEDICAL_EXAM" else start + timedelta(days=7),
            )
        )
    await db.flush()
    return await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=employee.id, actor_id=actor_id)


async def _evidence(db: AsyncSession, tenant_id: int, employee: Employee, task_type: str) -> tuple[str, int] | None:
    if task_type == "EMPLOYEE_PHOTO":
        return ("hr_employees", employee.id) if employee.photo_path else None
    if task_type in CONSENT_PURPOSE:
        consent_id = (
            await db.execute(
                select(HrEmployeePrivacyConsent.id).where(
                    HrEmployeePrivacyConsent.tenant_id == tenant_id,
                    HrEmployeePrivacyConsent.employee_id == employee.id,
                    HrEmployeePrivacyConsent.purpose == CONSENT_PURPOSE[task_type],
                    HrEmployeePrivacyConsent.withdrawn_at.is_(None),
                ).limit(1)
            )
        ).scalar_one_or_none()
        return ("hr_employee_privacy_consents", consent_id) if consent_id else None
    if task_type in BIOMETRIC_MODALITY:
        enrollment_id = (
            await db.execute(
                select(HrEmployeeBiometricEnrollment.id).where(
                    HrEmployeeBiometricEnrollment.tenant_id == tenant_id,
                    HrEmployeeBiometricEnrollment.employee_id == employee.id,
                    HrEmployeeBiometricEnrollment.modality == BIOMETRIC_MODALITY[task_type],
                    HrEmployeeBiometricEnrollment.consent_withdrawn_at.is_(None),
                    HrEmployeeBiometricEnrollment.status.in_(("PENDING", "ENROLLED")),
                ).order_by(HrEmployeeBiometricEnrollment.id).limit(1)
            )
        ).scalar_one_or_none()
        return ("hr_employee_biometric_enrollments", enrollment_id) if enrollment_id else None
    if task_type == "MEDICAL_EXAM":
        record_id = (
            await db.execute(
                select(EmployeeMedicalRecord.id).where(
                    EmployeeMedicalRecord.tenant_id == tenant_id,
                    EmployeeMedicalRecord.employee_id == employee.id,
                    EmployeeMedicalRecord.fitness_status.in_(MEDICAL_RESULT_STATUSES),
                ).order_by(EmployeeMedicalRecord.examination_date.desc()).limit(1)
            )
        ).scalar_one_or_none()
        return ("hr_employee_medical_records", record_id) if record_id else None
    if task_type == "REQUIRED_DOCUMENTS":
        doc_id = (
            await db.execute(
                select(EmployeeDocument.id).where(
                    EmployeeDocument.tenant_id == tenant_id,
                    EmployeeDocument.employee_id == employee.id,
                    EmployeeDocument.document_type.in_(IDENTITY_SCAN_TYPES),
                    EmployeeDocument.file_path.like(f"{SECURE_DOCUMENT_PREFIX}%"),
                ).order_by(EmployeeDocument.id).limit(1)
            )
        ).scalar_one_or_none()
        return ("hr_employee_documents", doc_id) if doc_id else None
    return None


async def sync_onboarding_tasks(
    db: AsyncSession, *, tenant_id: int, employee_id: int, actor_id: int | None
) -> list[HrEmployeeOnboardingTask]:
    tasks = list(
        (
            await db.execute(
                select(HrEmployeeOnboardingTask)
                .where(HrEmployeeOnboardingTask.tenant_id == tenant_id, HrEmployeeOnboardingTask.employee_id == employee_id)
                .order_by(HrEmployeeOnboardingTask.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )
    if not tasks:
        return tasks
    employee = await db.get(Employee, employee_id)
    if employee is None or employee.tenant_id != tenant_id:
        return []
    changed = False
    for task in tasks:
        if task.status == "WAIVED":
            continue
        proof = await _evidence(db, tenant_id, employee, task.task_type)
        if proof is not None and (task.status != "COMPLETED" or (task.source_table, task.source_id) != proof):
            task.status = "COMPLETED"
            task.source_table, task.source_id = proof
            task.completed_at = task.completed_at or datetime.utcnow()
            task.completed_by = task.completed_by or actor_id
            changed = True
        elif proof is None and task.status == "COMPLETED":
            task.status, task.source_table, task.source_id = "DUE", None, None
            task.completed_at = task.completed_by = None
            changed = True
    if changed:
        await db.flush()
    return tasks


def task_out(task: HrEmployeeOnboardingTask) -> dict:
    return {
        "id": task.id,
        "employee_id": task.employee_id,
        "task_type": task.task_type,
        "label": TASK_LABELS.get(task.task_type, task.task_type),
        "tab": TASK_TABS.get(task.task_type),
        "status": task.status,
        "source_table": task.source_table,
        "source_id": task.source_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "waived_at": task.waived_at.isoformat() if task.waived_at else None,
        "waive_reason": task.waive_reason,
    }
