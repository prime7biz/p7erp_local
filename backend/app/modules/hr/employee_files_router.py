"""Employee number format, photo, CV / document uploads and biometric enrollment references.

GET  /hr/employee-number-format            any HR user (preview of the next number)
PUT  /hr/employee-number-format            manager/admin
POST /hr/employees/{id}/photo              hr.identity.manage; needs privacy-notice fields (PDPA 2026 s.5)
GET  /hr/employees/{id}/photo              any HR user who can open the employee (audited)
DELETE /hr/employees/{id}/photo            hr.identity.manage (file erased, consent withdrawn)
POST /hr/employees/{id}/documents/upload   hr.identity.manage (CV / resume / scans)
GET  /hr/employees/{id}/documents/{doc}/download   hr.documents.view (audited)
GET  /hr/employees/{id}/biometric-enrollments      hr.biometric.manage
POST /hr/employees/{id}/biometric-enrollments      hr.biometric.manage (reference + consent only)
POST /hr/biometric-enrollments/{id}/enrolled       hr.biometric.manage
POST /hr/biometric-enrollments/{id}/withdraw       hr.biometric.manage -> device deletion task
POST /hr/biometric-enrollments/{id}/confirm-deletion   hr.biometric.manage

Prime7 never receives fingerprint templates, fingerprint images or face embeddings.
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common import hr_secure_files
from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_BIOMETRIC_MANAGE,
    PERMISSION_HR_DOCUMENTS_VIEW,
    PERMISSION_HR_IDENTITY_MANAGE,
    assert_hr_manager_or_permission,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee, EmployeeDocument
from app.models.hr_attendance_device import AttendanceDevice
from app.models.hr_lifecycle import HrEmployeeBiometricEnrollment, HrEmployeePrivacyConsent
from app.modules.audit.service import log_action
from app.modules.hr.onboarding_tasks import sync_onboarding_tasks
from app.modules.hr.employee_identity import (
    EMPLOYEE_NUMBER_FORMAT_KEY,
    number_format,
    preview_next_code,
    validate_number_format,
)
from app.modules.hr_localization.rules_router import require_manager_admin

router = APIRouter(prefix="/hr", tags=["hr-employee-files"])

PRIVACY_NOTICE_VERSION = "BD-PDPA-2026-v1"
LAWFUL_BASES = ("CONSENT", "EMPLOYMENT_LAW")
SECURE_PREFIX = "hr_secure:document:"


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _employee(db: AsyncSession, tenant_id: int, employee_id: int, *, lock: bool = False) -> Employee:
    stmt = select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    emp = (await db.execute(stmt)).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


# --- Employee number format -----------------------------------------------------------------------


class NumberFormatBody(BaseModel):
    prefix: str = Field(..., max_length=12)
    width: int = Field(..., ge=3, le=10)


async def _counter_value(db: AsyncSession, tenant_id: int) -> int:
    row = (
        await db.execute(
            text("SELECT last_value FROM tenant_code_counters WHERE tenant_id = :t AND entity_key = 'hr_employees'"),
            {"t": tenant_id},
        )
    ).scalar_one_or_none()
    if row is not None:
        return int(row)
    seeded = (await db.execute(text("SELECT COALESCE(MAX(id), 0) FROM hr_employees WHERE tenant_id = :t"), {"t": tenant_id})).scalar_one()
    return int(seeded)


@router.get("/employee-number-format")
async def get_number_format(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    prefix, width = number_format(tenant.feature_flags)
    last = await _counter_value(db, tenant.id)
    return {"prefix": prefix, "width": width, "next_code": preview_next_code(tenant.feature_flags, last)}


@router.put("/employee-number-format")
async def put_number_format(
    body: NumberFormatBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    fmt = validate_number_format(body.prefix, body.width)
    locked = (
        await db.execute(select(Tenant).where(Tenant.id == tenant.id).with_for_update().execution_options(populate_existing=True))
    ).scalar_one()
    flags = dict(locked.feature_flags) if isinstance(locked.feature_flags, dict) else {}
    before = flags.get(EMPLOYEE_NUMBER_FORMAT_KEY)
    flags[EMPLOYEE_NUMBER_FORMAT_KEY] = fmt
    locked.feature_flags = flags
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_NUMBER_FORMAT_CHANGED",
                     resource="hr.settings", details=f"{before} -> {fmt} (sequence continues; numbers are never reused)")
    await db.commit()
    await db.refresh(locked)
    last = await _counter_value(db, tenant.id)
    return {**fmt, "next_code": preview_next_code(locked.feature_flags, last)}


# --- Photo ----------------------------------------------------------------------------------------


async def _active_consent(db: AsyncSession, tenant_id: int, employee_id: int, purpose: str) -> HrEmployeePrivacyConsent | None:
    return (
        await db.execute(
            select(HrEmployeePrivacyConsent).where(
                HrEmployeePrivacyConsent.tenant_id == tenant_id,
                HrEmployeePrivacyConsent.employee_id == employee_id,
                HrEmployeePrivacyConsent.purpose == purpose,
                HrEmployeePrivacyConsent.withdrawn_at.is_(None),
            )
        )
    ).scalar_one_or_none()


@router.post("/employees/{employee_id}/photo")
async def upload_photo(
    employee_id: int,
    file: UploadFile = File(...),
    lawful_basis: str = Form("CONSENT"),
    privacy_notice_acknowledged: bool = Form(False),
    retention_until: date | None = Form(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Face photos are biometric data under the Personal Data Protection Act 2026 (s.2(14))."""
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_IDENTITY_MANAGE)
    if lawful_basis not in LAWFUL_BASES:
        raise HTTPException(status_code=400, detail="lawful_basis must be CONSENT or EMPLOYMENT_LAW")
    if not privacy_notice_acknowledged:
        raise HTTPException(status_code=400, detail="Show the employee the privacy notice and tick the acknowledgement first")
    emp = await _employee(db, tenant.id, employee_id, lock=True)
    stored, _kind, size = await hr_secure_files.save(file, tenant.id, "photo")
    old = emp.photo_path
    emp.photo_path = stored
    if await _active_consent(db, tenant.id, emp.id, "PHOTO") is None:
        db.add(
            HrEmployeePrivacyConsent(
                tenant_id=tenant.id, employee_id=emp.id, purpose="PHOTO", notice_version=PRIVACY_NOTICE_VERSION,
                lawful_basis=lawful_basis, retention_until=retention_until,
                purpose_text="Employee ID card, gate identification and HR file",
                transfer_disclosure="Not shared outside the company; printed on the employee's own ID card",
                captured_by=user.id,
            )
        )
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_PHOTO_UPLOADED",
                     resource=f"hr.employee:{emp.id}", details=f"{size} bytes")
    await db.flush()
    await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=emp.id, actor_id=user.id)
    await db.commit()
    if old and old != stored:
        hr_secure_files.delete(tenant.id, "photo", old)
    return {"has_photo": True}


@router.get("/employees/{employee_id}/photo")
async def get_photo(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_VIEW)
    emp = await _employee(db, tenant.id, employee_id)
    if not emp.photo_path:
        raise HTTPException(status_code=404, detail="No photo")
    data, mime = hr_secure_files.read(tenant.id, "photo", emp.photo_path)
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_PHOTO_VIEWED", resource=f"hr.employee:{emp.id}")
    await db.commit()
    return Response(data, media_type=mime, headers={"Cache-Control": "private, no-store"})


@router.delete("/employees/{employee_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_IDENTITY_MANAGE)
    emp = await _employee(db, tenant.id, employee_id, lock=True)
    old, emp.photo_path = emp.photo_path, None
    consent = await _active_consent(db, tenant.id, emp.id, "PHOTO")
    if consent is not None:
        consent.withdrawn_at, consent.withdrawn_by = datetime.utcnow(), user.id
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_PHOTO_DELETED", resource=f"hr.employee:{emp.id}")
    await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=emp.id, actor_id=user.id)
    await db.commit()
    if old:
        hr_secure_files.delete(tenant.id, "photo", old)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Documents (CV / resume / scans) --------------------------------------------------------------

DOCUMENT_TYPES = ("CV", "RESUME", "NID_SCAN", "BIRTH_REGISTRATION_SCAN", "CERTIFICATE", "MEDICAL", "OTHER")


@router.post("/employees/{employee_id}/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    employee_id: int,
    file: UploadFile = File(...),
    document_type: str = Form("CV"),
    notes: str | None = Form(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_IDENTITY_MANAGE)
    doc_type = (document_type or "").strip().upper()
    if doc_type not in DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail=f"document_type must be one of {', '.join(DOCUMENT_TYPES)}")
    emp = await _employee(db, tenant.id, employee_id)
    stored, kind, size = await hr_secure_files.save(file, tenant.id, "document")
    row = EmployeeDocument(
        tenant_id=tenant.id, employee_id=emp.id, document_type=doc_type, file_path=f"{SECURE_PREFIX}{stored}",
        notes=(notes or "").strip() or None, issue_date=date.today(), created_by=user.id,
    )
    db.add(row)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_DOCUMENT_UPLOADED",
                     resource=f"hr.employee:{emp.id}:doc:{row.id}", details=f"{doc_type} {kind} {size} bytes")
    await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=emp.id, actor_id=user.id)
    await db.commit()
    return {"id": row.id, "document_type": doc_type, "file_type": kind, "has_file": True, "created_at": row.created_at.isoformat()}


@router.get("/employees/{employee_id}/documents/{document_id}/download")
async def download_document(
    employee_id: int,
    document_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_VIEW)
    doc = await db.get(EmployeeDocument, document_id)
    if doc is None or doc.tenant_id != tenant.id or doc.employee_id != employee_id:
        raise HTTPException(status_code=404, detail="Document not found")
    if not (doc.file_path or "").startswith(SECURE_PREFIX):
        raise HTTPException(status_code=404, detail="No file attached")
    data, mime = hr_secure_files.read(tenant.id, "document", doc.file_path[len(SECURE_PREFIX) :])
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_DOCUMENT_DOWNLOADED",
                     resource=f"hr.employee:{employee_id}:doc:{doc.id}")
    await db.commit()
    return Response(data, media_type=mime, headers={
        "Content-Disposition": f'attachment; filename="{doc.document_type.lower()}-{doc.id}"',
        "Cache-Control": "private, no-store",
    })


# --- Biometric enrollment references --------------------------------------------------------------

BIO_FIELDS = (
    "id", "employee_id", "device_id", "modality", "device_user_ref", "status", "privacy_notice_version", "lawful_basis",
    "purpose_text", "retention_until", "device_transfer_disclosure", "consent_captured_at", "consent_withdrawn_at",
    "enrolled_at", "test_punch_at", "deletion_requested_at", "deletion_confirmed_at",
)


def _bio_out(row: HrEmployeeBiometricEnrollment) -> dict:
    out = {}
    for f in BIO_FIELDS:
        v = getattr(row, f)
        out[f] = v.isoformat() if isinstance(v, (date, datetime)) else v
    return out


class BiometricCreate(BaseModel):
    modality: str = Field(..., pattern="^(FINGERPRINT|FACE)$")
    device_id: int | None = None
    lawful_basis: str = Field(default="CONSENT", pattern="^(CONSENT|EMPLOYMENT_LAW)$")
    privacy_notice_acknowledged: bool
    retention_until: date | None = None


@router.get("/employees/{employee_id}/biometric-enrollments")
async def list_biometrics(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    await _employee(db, tenant.id, employee_id)
    rows = (
        await db.execute(
            select(HrEmployeeBiometricEnrollment).where(
                HrEmployeeBiometricEnrollment.tenant_id == tenant.id, HrEmployeeBiometricEnrollment.employee_id == employee_id
            ).order_by(HrEmployeeBiometricEnrollment.id)
        )
    ).scalars().all()
    return [_bio_out(r) for r in rows]


@router.post("/employees/{employee_id}/biometric-enrollments", status_code=status.HTTP_201_CREATED)
async def create_biometric(
    employee_id: int,
    body: BiometricCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    if not body.privacy_notice_acknowledged:
        raise HTTPException(status_code=400, detail="Show the employee the biometric privacy notice and record the acknowledgement first")
    emp = await _employee(db, tenant.id, employee_id, lock=True)
    if body.device_id is not None:
        dev = await db.get(AttendanceDevice, body.device_id)
        if dev is None or dev.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Device not found")
    dup = (
        await db.execute(
            select(HrEmployeeBiometricEnrollment.id).where(
                HrEmployeeBiometricEnrollment.tenant_id == tenant.id,
                HrEmployeeBiometricEnrollment.employee_id == emp.id,
                HrEmployeeBiometricEnrollment.modality == body.modality,
                HrEmployeeBiometricEnrollment.device_id.is_(None) if body.device_id is None
                else HrEmployeeBiometricEnrollment.device_id == body.device_id,
                HrEmployeeBiometricEnrollment.status != "DELETED",
            )
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Enrollment #{dup[0]} already exists for this device and modality")
    old_deleted = (
        await db.execute(
            select(HrEmployeeBiometricEnrollment).where(
                HrEmployeeBiometricEnrollment.tenant_id == tenant.id,
                HrEmployeeBiometricEnrollment.employee_id == emp.id,
                HrEmployeeBiometricEnrollment.modality == body.modality,
                HrEmployeeBiometricEnrollment.device_id.is_(None) if body.device_id is None
                else HrEmployeeBiometricEnrollment.device_id == body.device_id,
            )
        )
    ).scalar_one_or_none()
    now = datetime.utcnow()
    fields = dict(
        device_user_ref=emp.attendance_device_pin or emp.employee_code, status="PENDING",
        privacy_notice_version=PRIVACY_NOTICE_VERSION, lawful_basis=body.lawful_basis,
        purpose_text="Attendance IN/OUT recording on the company's biometric terminal",
        retention_until=body.retention_until,
        device_transfer_disclosure="Template stays on the terminal; only punch time and user number reach Prime7",
        consent_captured_at=now, consent_captured_by=user.id, consent_withdrawn_at=None, consent_withdrawn_by=None,
        enrolled_at=None, enrolled_by=None, test_punch_at=None, deletion_requested_at=None,
        deletion_confirmed_at=None, deletion_confirmed_by=None,
    )
    if old_deleted is not None:
        row = old_deleted
        for k, v in fields.items():
            setattr(row, k, v)
    else:
        row = HrEmployeeBiometricEnrollment(
            tenant_id=tenant.id, employee_id=emp.id, device_id=body.device_id, modality=body.modality, **fields
        )
        db.add(row)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_BIOMETRIC_CONSENT_RECORDED",
                     resource=f"hr.employee:{emp.id}:biometric:{row.id}", details=f"{body.modality} {body.lawful_basis}")
    await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=emp.id, actor_id=user.id)
    await db.commit()
    await db.refresh(row)
    return _bio_out(row)


async def _bio_locked(db: AsyncSession, tenant_id: int, enrollment_id: int) -> HrEmployeeBiometricEnrollment:
    row = (
        await db.execute(
            select(HrEmployeeBiometricEnrollment).where(
                HrEmployeeBiometricEnrollment.id == enrollment_id, HrEmployeeBiometricEnrollment.tenant_id == tenant_id
            ).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    return row


class EnrolledBody(BaseModel):
    test_punch_confirmed: bool = False


@router.post("/biometric-enrollments/{enrollment_id}/enrolled")
async def mark_enrolled(
    enrollment_id: int,
    body: EnrolledBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    row = await _bio_locked(db, tenant.id, enrollment_id)
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Enrollment is {row.status}")
    row.status, row.enrolled_at, row.enrolled_by = "ENROLLED", datetime.utcnow(), user.id
    if body.test_punch_confirmed:
        row.test_punch_at = datetime.utcnow()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_BIOMETRIC_ENROLLED",
                     resource=f"hr.biometric:{row.id}", details=row.modality)
    await db.commit()
    await db.refresh(row)
    return _bio_out(row)


@router.post("/biometric-enrollments/{enrollment_id}/withdraw")
async def withdraw_biometric(
    enrollment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Consent withdrawn (PDPA 2026 s.13): stop use and create a device-side deletion task."""
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    row = await _bio_locked(db, tenant.id, enrollment_id)
    if row.status in ("DELETION_PENDING", "DELETED"):
        return _bio_out(row)
    now = datetime.utcnow()
    row.status, row.consent_withdrawn_at, row.consent_withdrawn_by, row.deletion_requested_at = "DELETION_PENDING", now, user.id, now
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_BIOMETRIC_CONSENT_WITHDRAWN",
                     resource=f"hr.biometric:{row.id}", details="Delete the user from the terminal, then confirm")
    await sync_onboarding_tasks(db, tenant_id=tenant.id, employee_id=row.employee_id, actor_id=user.id)
    await db.commit()
    await db.refresh(row)
    return _bio_out(row)


@router.post("/biometric-enrollments/{enrollment_id}/confirm-deletion")
async def confirm_biometric_deletion(
    enrollment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    row = await _bio_locked(db, tenant.id, enrollment_id)
    if row.status != "DELETION_PENDING":
        raise HTTPException(status_code=409, detail="Withdraw consent first; deletion is confirmed after removing the user from the terminal")
    row.status, row.deletion_confirmed_at, row.deletion_confirmed_by = "DELETED", datetime.utcnow(), user.id
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_BIOMETRIC_DELETION_CONFIRMED", resource=f"hr.biometric:{row.id}")
    await db.commit()
    await db.refresh(row)
    return _bio_out(row)


@router.get("/biometric-enrollments/deletion-tasks")
async def deletion_tasks(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Open device-side deletions, including enrollments whose retention period has ended."""
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_BIOMETRIC_MANAGE)
    rows = (
        await db.execute(
            select(HrEmployeeBiometricEnrollment).where(
                HrEmployeeBiometricEnrollment.tenant_id == tenant.id,
                (HrEmployeeBiometricEnrollment.status == "DELETION_PENDING")
                | (
                    (HrEmployeeBiometricEnrollment.status == "ENROLLED")
                    & (HrEmployeeBiometricEnrollment.retention_until < date.today())
                ),
            ).limit(500)
        )
    ).scalars().all()
    return [_bio_out(r) for r in rows]
