"""HR compliance / age / medical API routes (Sprint H1)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_HR_AGE_VERIFY,
    PERMISSION_HR_COMPLIANCE_MANAGE,
    PERMISSION_HR_COMPLIANCE_VIEW,
    PERMISSION_HR_MEDICAL_MANAGE,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_age_verification_required,
    is_compliance_tracking_enabled,
    is_medical_certificate_tracking_enabled,
)
from app.database import get_db
from app.models.tenant import Tenant
from app.models.user import User
from app.modules.hr_compliance import service as svc
from app.modules.hr_compliance.compliance_scoring_service import (
    calculate_compliance_score,
    generate_audit_readiness_report,
)
from app.modules.hr_compliance.schemas import (
    AgeVerificationCreate,
    AgeVerificationResponse,
    AuditReadinessReport,
    ComplianceFrameworkCreate,
    ComplianceFrameworkResponse,
    ComplianceRequirementResponse,
    ComplianceScoreResponse,
    EmployeeComplianceRecordCreate,
    EmployeeComplianceRecordResponse,
    EmployeeComplianceRecordUpdate,
    MedicalRecordCreate,
    MedicalRecordResponse,
    MedicalRecordUpdate,
)

router = APIRouter(prefix="/hr/compliance", tags=["hr-compliance"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _require_compliance(tenant: Tenant) -> None:
    if not is_compliance_tracking_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compliance tracking is disabled for this tenant",
        )


@router.get("/frameworks", response_model=list[ComplianceFrameworkResponse])
async def list_frameworks(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    enriched = await svc.list_frameworks_enriched(db, tenant.id)
    out: list[ComplianceFrameworkResponse] = []
    for row, activated_id in enriched:
        payload = ComplianceFrameworkResponse.model_validate(row)
        payload.activated_tenant_framework_id = activated_id
        out.append(payload)
    return out


@router.post("/frameworks", response_model=ComplianceFrameworkResponse, status_code=status.HTTP_201_CREATED)
async def create_framework(
    body: ComplianceFrameworkCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_MANAGE)
    row = await svc.create_framework(db, tenant.id, body)
    return ComplianceFrameworkResponse.model_validate(row)


@router.post("/frameworks/{framework_id}/activate", response_model=ComplianceFrameworkResponse)
async def activate_framework(
    framework_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_MANAGE)
    row = await svc.activate_system_framework(db, tenant.id, framework_id)
    return ComplianceFrameworkResponse.model_validate(row)


@router.get("/requirements", response_model=list[ComplianceRequirementResponse])
async def list_requirements(
    framework_id: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    rows = await svc.list_requirements(db, tenant.id, framework_id)
    return [ComplianceRequirementResponse.model_validate(r) for r in rows]


@router.get("/records", response_model=list[EmployeeComplianceRecordResponse])
async def list_records(
    employee_id: int | None = None,
    requirement_id: int | None = None,
    framework_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    rows = await svc.list_records(
        db, tenant.id, employee_id=employee_id, requirement_id=requirement_id, framework_id=framework_id
    )
    return [EmployeeComplianceRecordResponse.model_validate(r) for r in rows]


@router.post("/records", response_model=EmployeeComplianceRecordResponse, status_code=status.HTTP_201_CREATED)
async def create_record(
    body: EmployeeComplianceRecordCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_MANAGE)
    row = await svc.create_record(db, tenant.id, user.id, body)
    return EmployeeComplianceRecordResponse.model_validate(row)


@router.patch("/records/{record_id}", response_model=EmployeeComplianceRecordResponse)
async def update_record(
    record_id: int,
    body: EmployeeComplianceRecordUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_MANAGE)
    row = await svc.update_record(db, tenant.id, user.id, record_id, body)
    return EmployeeComplianceRecordResponse.model_validate(row)


@router.get("/score/{framework_id}", response_model=ComplianceScoreResponse)
async def get_score(
    framework_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    try:
        return await calculate_compliance_score(db, tenant.id, framework_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.get("/audit-readiness/{framework_id}", response_model=AuditReadinessReport)
async def get_audit_readiness(
    framework_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_compliance(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_COMPLIANCE_VIEW)
    try:
        return await generate_audit_readiness_report(db, tenant.id, framework_id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


# Age + medical under /hr/compliance/employees/... for clear mounting
@router.get("/employees/{employee_id}/age-verifications", response_model=list[AgeVerificationResponse])
async def list_age_verifications(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if not is_age_verification_required(tenant.feature_flags) and not is_compliance_tracking_enabled(
        tenant.feature_flags
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Age verification is disabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_AGE_VERIFY)
    rows = await svc.list_age_verifications(db, tenant.id, employee_id)
    return [AgeVerificationResponse.model_validate(r) for r in rows]


@router.post(
    "/employees/{employee_id}/age-verifications",
    response_model=AgeVerificationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_age_verification(
    employee_id: int,
    body: AgeVerificationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if not is_age_verification_required(tenant.feature_flags) and not is_compliance_tracking_enabled(
        tenant.feature_flags
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Age verification is disabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_AGE_VERIFY)
    row = await svc.create_age_verification(db, tenant.id, employee_id, user.id, body)
    return AgeVerificationResponse.model_validate(row)


@router.get("/employees/{employee_id}/medical-records", response_model=list[MedicalRecordResponse])
async def list_medical_records(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if not is_medical_certificate_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Medical tracking is disabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MEDICAL_MANAGE)
    rows = await svc.list_medical_records(db, tenant.id, employee_id)
    return [MedicalRecordResponse.model_validate(r) for r in rows]


@router.post(
    "/employees/{employee_id}/medical-records",
    response_model=MedicalRecordResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_medical_record(
    employee_id: int,
    body: MedicalRecordCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if not is_medical_certificate_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Medical tracking is disabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MEDICAL_MANAGE)
    row = await svc.create_medical_record(db, tenant.id, employee_id, body)
    return MedicalRecordResponse.model_validate(row)


@router.patch(
    "/employees/{employee_id}/medical-records/{record_id}",
    response_model=MedicalRecordResponse,
)
async def update_medical_record(
    employee_id: int,
    record_id: int,
    body: MedicalRecordUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if not is_medical_certificate_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Medical tracking is disabled")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_MEDICAL_MANAGE)
    row = await svc.update_medical_record(db, tenant.id, employee_id, record_id, body)
    return MedicalRecordResponse.model_validate(row)
