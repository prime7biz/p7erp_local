from __future__ import annotations

import asyncio
import io
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.codegen import next_tenant_code
from app.common.permissions import (
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_COMPLIANCE_MANAGE,
    PERMISSION_HR_COMPLIANCE_VIEW,
    PERMISSION_HR_DOCUMENTS_GENERATE,
    PERMISSION_HR_DOCUMENTS_VIEW,
    PERMISSION_HR_GATE_PASS_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
    assert_soft_permission_allowed,
    internal_permission_granted,
    soft_permission_denied,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_age_verification_required,
    is_auto_document_generation_enabled,
    is_hr_onboarding_workspace_v2_enabled,
)
from app.database import get_db, safe_async_session_rollback
from app.modules.hr_compliance.service import assert_dob_allowed
from app.modules.hr import hr_document_generator_service as hr_pdf
from app.models.hr_compliance_framework import EmployeeAgeVerification
from app.models.hr_payroll import PayrollRunLine
from app.models import (
    AttendanceEntry,
    ComplianceCheck,
    Department,
    Designation,
    Employee,
    EmployeeDocument,
    EmployeeStatusHistory,
    HrSection,
    JobRequisition,
    LeaveRequest,
    PayrollRun,
    Tenant,
    User,
)
from app.modules.audit.service import log_action
from app.models.hr_onboarding import HrGeneratedEmployeeDocument
from app.modules.hr import employee_service, generated_documents
from app.modules.hr import service as hr_domain
from app.modules.hr.compensation_router import employee_pay_snapshot
from app.modules.hr.employee_identity import (
    assert_identity_complete,
    assert_identity_unique,
    identity_required,
    next_employee_code,
)
from app.modules.hr.schemas import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    DesignationCreate,
    DesignationResponse,
    DesignationUpdate,
    EmployeeCreate,
    EmployeeDocumentCreate,
    EmployeeDocumentResponse,
    EmployeeLookupItem,
    EmployeeResponse,
    EmployeeStatusHistoryCreate,
    EmployeeStatusHistoryResponse,
    EmployeeUpdate,
    SectionCreate,
    SectionResponse,
    SectionUpdate,
)

router = APIRouter(prefix="/hr", tags=["hr"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


async def _next_department_code(db: AsyncSession, tenant_id: int) -> str:
    return await next_tenant_code(
        db,
        model=Department,
        tenant_id=tenant_id,
        prefix="DEPT-",
        width=4,
    )


async def _next_designation_code(db: AsyncSession, tenant_id: int) -> str:
    return await next_tenant_code(
        db,
        model=Designation,
        tenant_id=tenant_id,
        prefix="DESG-",
        width=4,
    )


async def _next_employee_code(db: AsyncSession, tenant_id: int, feature_flags=None) -> str:
    return await next_employee_code(db, tenant_id, feature_flags)


_identity_inputs = employee_service.identity_inputs


def _department_to_response(row: Department) -> DepartmentResponse:
    return DepartmentResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        description=row.description,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _designation_to_response(row: Designation) -> DesignationResponse:
    return DesignationResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        department_id=row.department_id,
        code=row.code,
        title=row.title,
        description=row.description,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


EMPLOYEE_SENSITIVE_FIELDS = employee_service.LEGACY_SENSITIVE_FIELDS


async def _can_view_employee_sensitive(db: AsyncSession, user: User, tenant_id: int) -> bool:
    """Manager-type roles and roles granted HR module access see national ID, DOB and address."""
    return (await employee_service.employee_field_access(db, user, tenant_id)).can_view_sensitive


EMPLOYEE_DUPLICATE_DETAIL = "Employee code or attendance device PIN already exists"

_clean_device_pin = employee_service.clean_device_pin
_get_department_or_404 = employee_service.get_department_or_404
_get_designation_or_404 = employee_service.get_designation_or_404
_get_employee_or_404 = employee_service.get_employee_or_404
_validate_fk_values = employee_service.validate_fk_values


def _employee_to_response(
    row: Employee, access: employee_service.EmployeeFieldAccess = employee_service.FULL_ACCESS
) -> EmployeeResponse:
    return employee_service.employee_to_response(row, access)


@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    active_only: bool = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Department).where(Department.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(Department.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Department.code.ilike(term), Department.name.ilike(term)))
    stmt = stmt.order_by(Department.name).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_department_to_response(r) for r in result.scalars().all()]


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    body: DepartmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    code = await _next_department_code(db, tenant.id)
    row = Department(
        tenant_id=tenant.id,
        code=code,
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code or name already exists")
    await db.refresh(row)
    return _department_to_response(row)


@router.patch("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: int,
    body: DepartmentUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_department_or_404(db, tenant.id, department_id)
    payload = body.model_dump(exclude_unset=True)
    if "code" in payload and payload["code"] is not None:
        row.code = payload["code"].strip()
    if "name" in payload and payload["name"] is not None:
        row.name = payload["name"].strip()
    if "description" in payload:
        row.description = payload["description"].strip() if payload["description"] else None
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code or name already exists")
    await db.refresh(row)
    return _department_to_response(row)


@router.delete("/departments/{department_id}")
async def delete_department(
    department_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await _get_department_or_404(db, tenant.id, department_id)
    designation_exists = (
        await db.execute(
            select(Designation.id).where(
                Designation.tenant_id == tenant.id,
                Designation.department_id == department_id,
            )
        )
    ).first()
    employee_exists = (
        await db.execute(
            select(Employee.id).where(
                Employee.tenant_id == tenant.id,
                Employee.department_id == department_id,
            )
        )
    ).first()
    if designation_exists or employee_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department has linked records. Deactivate it instead of deleting.",
        )
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/designations", response_model=list[DesignationResponse])
async def list_designations(
    department_id: int | None = Query(default=None),
    active_only: bool = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Designation).where(Designation.tenant_id == tenant.id)
    if department_id is not None:
        stmt = stmt.where(Designation.department_id == department_id)
    if active_only:
        stmt = stmt.where(Designation.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(or_(Designation.code.ilike(term), Designation.title.ilike(term)))
    stmt = stmt.order_by(Designation.title).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return [_designation_to_response(r) for r in result.scalars().all()]


@router.post("/designations", response_model=DesignationResponse, status_code=status.HTTP_201_CREATED)
async def create_designation(
    body: DesignationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _validate_fk_values(db, tenant.id, body.department_id, None, None)
    code = await _next_designation_code(db, tenant.id)
    row = Designation(
        tenant_id=tenant.id,
        department_id=body.department_id,
        code=code,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Designation code or title already exists")
    await db.refresh(row)
    return _designation_to_response(row)


@router.patch("/designations/{designation_id}", response_model=DesignationResponse)
async def update_designation(
    designation_id: int,
    body: DesignationUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_designation_or_404(db, tenant.id, designation_id)
    payload = body.model_dump(exclude_unset=True)
    await _validate_fk_values(db, tenant.id, payload.get("department_id"), None, None)
    if "department_id" in payload:
        row.department_id = payload["department_id"]
    if "code" in payload and payload["code"] is not None:
        row.code = payload["code"].strip()
    if "title" in payload and payload["title"] is not None:
        row.title = payload["title"].strip()
    if "description" in payload:
        row.description = payload["description"].strip() if payload["description"] else None
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Designation code or title already exists")
    await db.refresh(row)
    return _designation_to_response(row)


@router.delete("/designations/{designation_id}")
async def delete_designation(
    designation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await _get_designation_or_404(db, tenant.id, designation_id)
    employee_exists = (
        await db.execute(
            select(Employee.id).where(
                Employee.tenant_id == tenant.id,
                Employee.designation_id == designation_id,
            )
        )
    ).first()
    if employee_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Designation is linked with employees. Deactivate it instead of deleting.",
        )
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/employees", response_model=list[EmployeeResponse])
async def list_employees(
    department_id: int | None = Query(default=None),
    designation_id: int | None = Query(default=None),
    active_only: bool = Query(default=False),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    if designation_id is not None:
        stmt = stmt.where(Employee.designation_id == designation_id)
    if active_only:
        stmt = stmt.where(Employee.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.employee_code.ilike(term),
                Employee.first_name.ilike(term),
                Employee.last_name.ilike(term),
                Employee.email.ilike(term),
            )
        )
    stmt = stmt.order_by(Employee.employee_code).offset(offset).limit(limit)
    result = await db.execute(stmt)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    return [_employee_to_response(r, access) for r in result.scalars().all()]


@router.get("/employee-access")
async def employee_access(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """What the caller may see / change on the employee workspace (UI hints; the API enforces it)."""
    _ensure_user_tenant(user, tenant)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    manager = (role.name if role else "").strip().lower() in HR_SETUP_BYPASS_ROLES

    def granted(key: str) -> bool:
        return manager or internal_permission_granted(role=role, permission_key=key)

    def not_denied(key: str) -> bool:
        return manager or not soft_permission_denied(role=role, permission_key=key)

    return {
        "can_view_sensitive": access.can_view_sensitive,
        "can_manage_identity": access.can_manage_identity,
        "can_manage_payroll": access.can_manage_payroll,
        "can_manage_gate_pass": granted(PERMISSION_HR_GATE_PASS_MANAGE),
        "can_generate_documents": not_denied(PERMISSION_HR_DOCUMENTS_GENERATE),
        "can_view_compliance": not_denied(PERMISSION_HR_COMPLIANCE_VIEW),
        "can_manage_compliance": granted(PERMISSION_HR_COMPLIANCE_MANAGE),
        "masked_fields": access.masked_fields(),
    }


EMPLOYEE_LOOKUP_MAX_IDS = 500
_INT4_MAX = 2**31 - 1


# Must stay above "/employees/{employee_id}", otherwise "lookup" is parsed as an employee id (422).
@router.get("/employees/lookup", response_model=list[EmployeeLookupItem])
async def lookup_employees(
    ids: str = Query(..., max_length=6000, description="Comma-separated employee ids (max 500)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Code and name for the given ids, so list tables can show people instead of numbers.

    Ids from another tenant (or unknown ids) are simply left out of the answer.
    """
    _ensure_user_tenant(user, tenant)
    wanted: set[int] = set()
    for part in ids.split(","):
        part = part.strip()
        if not part:
            continue
        # ASCII digits only (str.isdigit also accepts "²"), and within the database integer range.
        if not (part.isascii() and part.isdigit() and len(part) <= 10) or not 1 <= int(part) <= _INT4_MAX:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ids must be whole numbers")
        wanted.add(int(part))
    if len(wanted) > EMPLOYEE_LOOKUP_MAX_IDS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {EMPLOYEE_LOOKUP_MAX_IDS} ids per request",
        )
    if not wanted:
        return []
    rows = (
        await db.execute(
            select(
                Employee.id,
                Employee.employee_code,
                Employee.first_name,
                Employee.last_name,
                Employee.department_id,
                Employee.is_active,
            )
            .where(Employee.tenant_id == tenant.id, Employee.id.in_(wanted))
            .order_by(Employee.employee_code)
        )
    ).all()
    return [
        EmployeeLookupItem(
            id=r.id,
            employee_code=r.employee_code,
            full_name=" ".join(p for p in (r.first_name, r.last_name) if p).strip() or r.employee_code,
            department_id=r.department_id,
            is_active=bool(r.is_active),
        )
        for r in rows
    ]


# Must stay above "/employees/{employee_id}", otherwise "export" is parsed as an employee id (422).
@router.get("/employees/export")
async def export_employees(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    data = await hr_domain.export_employees_excel(db, tenant.id)
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="employees.xlsx"'},
    )


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    snapshot = await employee_pay_snapshot(db, tenant, row) if access.can_manage_payroll else None
    return employee_service.employee_to_response(row, access, pay_snapshot=snapshot)


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    try:
        row = await employee_service.build_employee(db, tenant=tenant, user=user, body=body, access=access)
        await log_action(
            db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_CREATED",
            resource=f"hr.employee:{row.id}", details=row.employee_code,
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPLOYEE_DUPLICATE_DETAIL)
    await db.refresh(row)
    return _employee_to_response(row, access)


@router.patch("/employees/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    payload = body.model_dump(exclude_unset=True)
    # The linked login decides whose payslips and ESS data a user sees.
    if "user_id" in payload and payload["user_id"] != row.user_id:
        await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)
    # Activation has its own manager-only endpoints, so a plain edit must not flip it.
    if "is_active" in payload and bool(payload["is_active"]) != bool(row.is_active):
        await _require_manager_or_admin(db, user, tenant.id)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    # Masked fields come back as null in a resubmitted form and must not overwrite real data.
    employee_service.drop_masked_resubmits(access, payload)
    employee_service.assert_protected_writes_allowed(access, payload, row)
    sensitive_before = {
        f: getattr(row, f)
        for f in (*employee_service.IDENTITY_PROFILE_FIELDS, *employee_service.PAYMENT_FIELDS, *EMPLOYEE_SENSITIVE_FIELDS)
    }
    if "date_of_birth" in payload:
        assert_dob_allowed(
            payload.get("date_of_birth"),
            required=is_age_verification_required(tenant.feature_flags),
        )
    await _validate_fk_values(
        db,
        tenant.id,
        payload.get("department_id"),
        payload.get("designation_id"),
        payload.get("reporting_manager_id"),
        user_id=payload.get("user_id"),
        employee_id=employee_id,
        section_id=payload.get("section_id"),
    )
    if "employee_code" in payload and payload["employee_code"] is not None:
        if payload["employee_code"].strip() != row.employee_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The employee number is permanent and cannot be changed",
            )
    new_nid = payload["national_id"] if "national_id" in payload else row.national_id
    new_brn = payload["birth_registration_no"] if "birth_registration_no" in payload else row.birth_registration_no
    new_phone = payload["phone"] if "phone" in payload else row.phone
    if any(k in payload for k in ("national_id", "birth_registration_no", "phone")):
        new_nid, new_brn, new_phone = _identity_inputs(tenant, new_nid, new_brn, new_phone)
        if identity_required(tenant.feature_flags):
            assert_identity_complete(national_id=new_nid, birth_registration_no=new_brn, phone=new_phone)
            await assert_identity_unique(
                db, tenant.id, national_id=new_nid, birth_registration_no=new_brn, exclude_id=row.id
            )
        payload["national_id"], payload["birth_registration_no"], payload["phone"] = new_nid, new_brn, new_phone
    if "birth_registration_no" in payload:
        row.birth_registration_no = payload["birth_registration_no"] or None
    if "first_name" in payload and payload["first_name"] is not None:
        row.first_name = payload["first_name"].strip()
    if "last_name" in payload:
        row.last_name = payload["last_name"].strip() if payload["last_name"] else None
    if "email" in payload:
        row.email = payload["email"].strip() if payload["email"] else None
    if "phone" in payload:
        row.phone = payload["phone"].strip() if payload["phone"] else None
    if "joining_date" in payload:
        row.joining_date = payload["joining_date"]
    if "date_of_birth" in payload:
        row.date_of_birth = payload["date_of_birth"]
    if "gender" in payload:
        row.gender = payload["gender"].strip() if payload["gender"] else None
    if "marital_status" in payload:
        row.marital_status = payload["marital_status"].strip() if payload["marital_status"] else None
    if "blood_group" in payload:
        row.blood_group = payload["blood_group"].strip() if payload["blood_group"] else None
    if "emergency_contact_name" in payload:
        row.emergency_contact_name = payload["emergency_contact_name"].strip() if payload["emergency_contact_name"] else None
    if "emergency_contact_phone" in payload:
        row.emergency_contact_phone = payload["emergency_contact_phone"].strip() if payload["emergency_contact_phone"] else None
    if "address_line" in payload:
        row.address_line = payload["address_line"].strip() if payload["address_line"] else None
    if "city" in payload:
        row.city = payload["city"].strip() if payload["city"] else None
    if "country" in payload:
        row.country = payload["country"].strip() if payload["country"] else None
    if "national_id" in payload:
        row.national_id = payload["national_id"].strip() if payload["national_id"] else None
    if "employment_type" in payload:
        row.employment_type = payload["employment_type"].strip() if payload["employment_type"] else None
    if "confirmation_date" in payload:
        row.confirmation_date = payload["confirmation_date"]
    if "exit_date" in payload:
        row.exit_date = payload["exit_date"]
    if "department_id" in payload:
        row.department_id = payload["department_id"]
    if "designation_id" in payload:
        row.designation_id = payload["designation_id"]
    if "section_id" in payload:
        row.section_id = payload["section_id"]
    if "employee_category" in payload:
        row.employee_category = (
            payload["employee_category"].strip() if payload["employee_category"] else None
        )
    if "reporting_manager_id" in payload:
        row.reporting_manager_id = payload["reporting_manager_id"]
    if "user_id" in payload:
        row.user_id = payload["user_id"]
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    if "attendance_device_pin" in payload:
        row.attendance_device_pin = _clean_device_pin(payload["attendance_device_pin"])
    employee_service.apply_onboarding_fields(row, payload)
    sensitive_changed = sorted(f for f, before in sensitive_before.items() if getattr(row, f) != before)
    try:
        if sensitive_changed:
            await log_action(
                db, tenant_id=tenant.id, user_id=user.id, action="HR_EMPLOYEE_SENSITIVE_UPDATED",
                resource=f"hr.employee:{row.id}", details=",".join(sensitive_changed)[:500],
            )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=EMPLOYEE_DUPLICATE_DETAIL)
    await db.refresh(row)
    return _employee_to_response(row, access)


@router.post("/employees/{employee_id}/activate", response_model=EmployeeResponse)
async def activate_employee(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    row.is_active = True
    await db.commit()
    await db.refresh(row)
    return _employee_to_response(row)


@router.post("/employees/{employee_id}/deactivate", response_model=EmployeeResponse)
async def deactivate_employee(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    row.is_active = False
    await db.commit()
    await db.refresh(row)
    return _employee_to_response(row)


@router.get("/dashboard-data")
async def hr_dashboard_data(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    total_emp = int(
        await db.scalar(select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant.id)) or 0
    )
    active_emp = int(
        await db.scalar(
            select(func.count()).select_from(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.is_active.is_(True),
            )
        )
        or 0
    )
    pending_leave = int(
        await db.scalar(
            select(func.count()).select_from(LeaveRequest).where(
                LeaveRequest.tenant_id == tenant.id,
                LeaveRequest.status == "PENDING",
            )
        )
        or 0
    )
    pending_payroll = int(
        await db.scalar(
            select(func.count()).select_from(PayrollRun).where(
                PayrollRun.tenant_id == tenant.id,
                PayrollRun.status == "FINALIZED",
            )
        )
        or 0
    )
    open_req = int(
        await db.scalar(
            select(func.count()).select_from(JobRequisition).where(
                JobRequisition.tenant_id == tenant.id,
                func.lower(JobRequisition.status) != "closed",
            )
        )
        or 0
    )
    today = today_local()
    att_today = int(
        await db.scalar(
            select(func.count()).select_from(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.attendance_date == today,
            )
        )
        or 0
    )
    present_today = int(
        await db.scalar(
            select(func.count()).select_from(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.attendance_date == today,
                func.upper(func.coalesce(AttendanceEntry.status, "")) != "ABSENT",
            )
        )
        or 0
    )
    att_rate = (present_today / att_today * 100.0) if att_today else 0.0
    return {
        "total_employees": total_emp,
        "active_employees": active_emp,
        "pending_leave_requests": pending_leave,
        "pending_payroll_approvals": pending_payroll,
        "open_recruitment_requisitions": open_req,
        "today_attendance_entries": att_today,
        "today_attendance_rate_percent": round(att_rate, 2),
    }


@router.get("/sections", response_model=list[SectionResponse])
async def list_sections(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(HrSection).where(HrSection.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(HrSection.is_active.is_(True))
    stmt = stmt.order_by(HrSection.code)
    rows = (await db.execute(stmt)).scalars().all()
    return [SectionResponse(**hr_domain.section_to_dict(r)) for r in rows]


@router.post("/sections", response_model=SectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section(
    body: SectionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    code = body.code.strip() if body.code else await hr_domain.next_section_code(db, tenant.id)
    if body.department_id is not None:
        await _get_department_or_404(db, tenant.id, body.department_id)
    if body.parent_section_id is not None:
        await hr_domain.get_section_or_404(db, tenant.id, body.parent_section_id)
    if body.head_employee_id is not None:
        await _get_employee_or_404(db, tenant.id, body.head_employee_id)
    row = HrSection(
        tenant_id=tenant.id,
        code=code,
        name=body.name.strip(),
        section_type=body.section_type.strip(),
        parent_section_id=body.parent_section_id,
        department_id=body.department_id,
        head_employee_id=body.head_employee_id,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Section code already exists")
    await db.refresh(row)
    return SectionResponse(**hr_domain.section_to_dict(row))


@router.patch("/sections/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: int,
    body: SectionUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await hr_domain.get_section_or_404(db, tenant.id, section_id)
    payload = body.model_dump(exclude_unset=True)
    if "code" in payload and payload["code"] is not None:
        row.code = payload["code"].strip()
    if "name" in payload and payload["name"] is not None:
        row.name = payload["name"].strip()
    if "section_type" in payload and payload["section_type"] is not None:
        row.section_type = payload["section_type"].strip()
    if "parent_section_id" in payload:
        if payload["parent_section_id"] is not None:
            await hr_domain.get_section_or_404(db, tenant.id, payload["parent_section_id"])
        row.parent_section_id = payload["parent_section_id"]
    if "department_id" in payload:
        if payload["department_id"] is not None:
            await _get_department_or_404(db, tenant.id, payload["department_id"])
        row.department_id = payload["department_id"]
    if "head_employee_id" in payload:
        if payload["head_employee_id"] is not None:
            await _get_employee_or_404(db, tenant.id, payload["head_employee_id"])
        row.head_employee_id = payload["head_employee_id"]
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Section code already exists")
    await db.refresh(row)
    return SectionResponse(**hr_domain.section_to_dict(row))


@router.get("/employees/{employee_id}/documents", response_model=list[EmployeeDocumentResponse])
async def list_employee_documents(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _get_employee_or_404(db, tenant.id, employee_id)
    rows = (
        await db.execute(
            select(EmployeeDocument)
            .where(EmployeeDocument.tenant_id == tenant.id, EmployeeDocument.employee_id == employee_id)
            .order_by(EmployeeDocument.id.desc())
        )
    ).scalars().all()
    return [
        EmployeeDocumentResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            employee_id=r.employee_id,
            document_type=r.document_type,
            document_number=r.document_number,
            issue_date=r.issue_date,
            expiry_date=r.expiry_date,
            file_path=r.file_path,
            notes=r.notes,
            created_by=r.created_by,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/employees/{employee_id}/documents", response_model=EmployeeDocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_document(
    employee_id: int,
    body: EmployeeDocumentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _get_employee_or_404(db, tenant.id, employee_id)
    row = EmployeeDocument(
        tenant_id=tenant.id,
        employee_id=employee_id,
        document_type=body.document_type.strip(),
        document_number=body.document_number.strip() if body.document_number else None,
        issue_date=body.issue_date,
        expiry_date=body.expiry_date,
        # A client-supplied path is never trusted; files come only from the upload endpoint.
        file_path=None,
        notes=body.notes.strip() if body.notes else None,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return EmployeeDocumentResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        document_type=row.document_type,
        document_number=row.document_number,
        issue_date=row.issue_date,
        expiry_date=row.expiry_date,
        file_path=row.file_path,
        notes=row.notes,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
    )


@router.get("/employees/{employee_id}/status-history", response_model=list[EmployeeStatusHistoryResponse])
async def list_employee_status_history(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _get_employee_or_404(db, tenant.id, employee_id)
    rows = (
        await db.execute(
            select(EmployeeStatusHistory)
            .where(EmployeeStatusHistory.tenant_id == tenant.id, EmployeeStatusHistory.employee_id == employee_id)
            .order_by(EmployeeStatusHistory.effective_date.desc(), EmployeeStatusHistory.id.desc())
        )
    ).scalars().all()
    return [
        EmployeeStatusHistoryResponse(
            id=r.id,
            tenant_id=r.tenant_id,
            employee_id=r.employee_id,
            status=r.status,
            effective_date=r.effective_date,
            remarks=r.remarks,
            changed_by=r.changed_by,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/employees/{employee_id}/status-history", response_model=EmployeeStatusHistoryResponse, status_code=status.HTTP_201_CREATED)
async def create_employee_status_history(
    employee_id: int,
    body: EmployeeStatusHistoryCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _get_employee_or_404(db, tenant.id, employee_id)
    row = EmployeeStatusHistory(
        tenant_id=tenant.id,
        employee_id=employee_id,
        status=body.status.strip(),
        effective_date=body.effective_date,
        remarks=body.remarks.strip() if body.remarks else None,
        changed_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return EmployeeStatusHistoryResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        status=row.status,
        effective_date=row.effective_date,
        remarks=row.remarks,
        changed_by=row.changed_by,
        created_at=row.created_at.isoformat(),
    )


def _require_doc_gen(tenant: Tenant) -> None:
    if not is_auto_document_generation_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Document generation is disabled")


@router.post("/employees/{employee_id}/documents/id-card")
async def generate_id_card(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    emp = await _get_employee_or_404(db, tenant.id, employee_id)
    company = getattr(tenant, "name", None) or "Company"
    pdf = await hr_pdf.build_id_card_for_employee(db, tenant.id, employee_id, company)
    await _record_id_card_issues(db, tenant.id, user.id, [(emp.id, emp.employee_code)])
    await db.commit()
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=id-card.pdf"})


ID_CARD_ISSUE_TYPE = "ID_CARD_ISSUE"


async def _record_id_card_issues(db: AsyncSession, tenant_id: int, user_id: int, employees: list[tuple[int, str]]) -> None:
    """ID-card issue / reprint register (Labour Rules Form 6/6A). The number printed never changes."""
    if not employees:
        return
    counts = dict(
        (
            await db.execute(
                select(EmployeeDocument.employee_id, func.count(EmployeeDocument.id))
                .where(
                    EmployeeDocument.tenant_id == tenant_id,
                    EmployeeDocument.document_type == ID_CARD_ISSUE_TYPE,
                    EmployeeDocument.employee_id.in_([e for e, _c in employees]),
                )
                .group_by(EmployeeDocument.employee_id)
            )
        ).all()
    )
    today = date.today()
    for emp_id, code in employees:
        n = int(counts.get(emp_id, 0))
        db.add(
            EmployeeDocument(
                tenant_id=tenant_id,
                employee_id=emp_id,
                document_type=ID_CARD_ISSUE_TYPE,
                document_number=code,
                issue_date=today,
                notes="First issue" if n == 0 else f"Reprint #{n}",
                created_by=user_id,
            )
        )


GENERATION_REQUEST_PATTERN = r"^[A-Za-z0-9_-]+$"


def _signed_pdf_response(row: HrGeneratedEmployeeDocument, pdf: bytes, *, outdated: bool = False) -> Response:
    filename = f"{row.document_type.lower().replace('_', '-')}-v{row.document_version}.pdf"
    return Response(
        pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Verification-Id": row.verification_id,
            "X-Document-Version": str(row.document_version),
            "X-Document-Outdated": "true" if outdated else "false",
            "Access-Control-Expose-Headers": "X-Verification-Id, X-Document-Version, X-Document-Outdated",
        },
    )


async def _issue_signed_document(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    employee_id: int,
    document_type: str,
    reissue: bool,
    request_id: str | None,
) -> Response:
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    tenant_id, user_id = tenant.id, user.id
    try:
        row, created, outdated = await generated_documents.issue_document(
            db, tenant=tenant, user_id=user_id, employee_id=employee_id, document_type=document_type,
            access=access, reissue=reissue, request_id=request_id,
        )
        if created:
            await log_action(
                db, tenant_id=tenant_id, user_id=user_id, action="HR_DOCUMENT_ISSUED",
                resource=f"hr.employee:{employee_id}:generated-document:{row.id}",
                details=f"{document_type} v{row.document_version} {row.verification_id}",
            )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail="The document was issued at the same time; try again")
    pdf = await asyncio.to_thread(generated_documents.render_pdf, row)
    return _signed_pdf_response(row, pdf, outdated=outdated)


@router.post("/employees/{employee_id}/documents/appointment-letter")
async def generate_appointment_letter(
    employee_id: int,
    reissue: bool = Query(default=False),
    request_id: str | None = Query(default=None, min_length=8, max_length=64, pattern=GENERATION_REQUEST_PATTERN),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Signed, versioned letter (QR -> public verification) for tenants on the unified workspace;
    the original unsigned letter otherwise, so switching the flag off restores the old behaviour."""
    if is_hr_onboarding_workspace_v2_enabled(tenant.feature_flags):
        return await _issue_signed_document(db, tenant, user, employee_id, "APPOINTMENT_LETTER", reissue, request_id)
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    emp = await _get_employee_or_404(db, tenant.id, employee_id)
    dept = await _owned_or_none(db, Department, emp.department_id, tenant.id)
    desig = await _owned_or_none(db, Designation, emp.designation_id, tenant.id)
    mgr = await _owned_or_none(db, Employee, emp.reporting_manager_id, tenant.id)
    pdf = hr_pdf.generate_appointment_letter_pdf(
        emp,
        dept_name=dept.name if dept else None,
        desig_title=desig.title if desig else None,
        manager_name=f"{mgr.first_name} {mgr.last_name or ''}".strip() if mgr else None,
        company_name=getattr(tenant, "name", None) or "Company",
        show_address=(await employee_service.employee_field_access(db, user, tenant.id)).can_view_sensitive,
    )
    return Response(
        pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=appointment-letter.pdf"}
    )


async def _owned_or_none(db: AsyncSession, model, row_id: int | None, tenant_id: int):
    if row_id is None:
        return None
    row = await db.get(model, row_id)
    return row if row is not None and row.tenant_id == tenant_id else None


@router.post("/employees/{employee_id}/documents/job-description")
async def generate_job_description(
    employee_id: int,
    reissue: bool = Query(default=False),
    request_id: str | None = Query(default=None, min_length=8, max_length=64, pattern=GENERATION_REQUEST_PATTERN),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Job description from the designation's description, signed and versioned like the letter."""
    return await _issue_signed_document(db, tenant, user, employee_id, "JOB_DESCRIPTION", reissue, request_id)


@router.get("/employees/{employee_id}/generated-documents")
async def list_generated_documents(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_VIEW)
    await _get_employee_or_404(db, tenant.id, employee_id)
    rows = (
        await db.execute(
            select(HrGeneratedEmployeeDocument)
            .where(HrGeneratedEmployeeDocument.tenant_id == tenant.id, HrGeneratedEmployeeDocument.employee_id == employee_id)
            .order_by(HrGeneratedEmployeeDocument.document_type, HrGeneratedEmployeeDocument.document_version.desc())
            .limit(200)
        )
    ).scalars().all()
    return [generated_documents.document_out(r) for r in rows]


@router.get("/generated-documents/{document_id}/pdf")
async def download_generated_document(
    document_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_VIEW)
    row = await db.get(HrGeneratedEmployeeDocument, document_id)
    if row is None or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Document not found")
    access = await employee_service.employee_field_access(db, user, tenant.id)
    generated_documents.assert_can_read_snapshot(row.snapshot, access)
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_DOCUMENT_DOWNLOADED",
        resource=f"hr.employee:{row.employee_id}:generated-document:{row.id}",
    )
    await db.commit()
    pdf = await asyncio.to_thread(generated_documents.render_pdf, row)
    return _signed_pdf_response(row, pdf)


@router.post("/employees/{employee_id}/documents/age-verification-cert")
async def generate_age_verification_cert(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    emp = await _get_employee_or_404(db, tenant.id, employee_id)
    ver = (
        await db.execute(
            select(EmployeeAgeVerification)
            .where(
                EmployeeAgeVerification.tenant_id == tenant.id,
                EmployeeAgeVerification.employee_id == employee_id,
            )
            .order_by(EmployeeAgeVerification.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    pdf = hr_pdf.generate_age_verification_cert_pdf(
        emp, ver, company_name=getattr(tenant, "name", None) or "Company", verifier_label=user.username or "HR"
    )
    return Response(
        pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=age-verification.pdf"}
    )


@router.post("/employees/{employee_id}/documents/joining-letter")
async def generate_joining_letter(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    emp = await _get_employee_or_404(db, tenant.id, employee_id)
    pdf = hr_pdf.generate_joining_letter_pdf(emp, company_name=getattr(tenant, "name", None) or "Company")
    return Response(
        pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=joining-letter.pdf"}
    )


@router.post("/employees/{employee_id}/documents/payslip")
async def generate_employee_payslip_pdf(
    employee_id: int,
    run_id: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    emp = await _get_employee_or_404(db, tenant.id, employee_id)
    run = (
        await db.execute(select(PayrollRun).where(PayrollRun.id == run_id, PayrollRun.tenant_id == tenant.id))
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    line = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.run_id == run_id,
                PayrollRunLine.employee_id == employee_id,
                PayrollRunLine.tenant_id == tenant.id,
            )
        )
    ).scalar_one_or_none()
    pdf = hr_pdf.generate_payslip_pdf(
        emp, run=run, line=line, company_name=getattr(tenant, "name", None) or "Company"
    )
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=payslip.pdf"})


@router.post("/employees/bulk-documents/id-cards")
async def generate_bulk_id_cards(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    _require_doc_gen(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_HR_DOCUMENTS_GENERATE)
    data = await hr_pdf.build_bulk_id_cards_zip(db, tenant.id, getattr(tenant, "name", None) or "Company")
    await _record_id_card_issues(db, tenant.id, user.id, await hr_pdf.employee_ids_for_bulk_cards(db, tenant.id))
    await db.commit()
    return Response(
        data,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=id-cards.zip"},
    )


@router.post("/employees/import")
async def import_employees(
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    return await hr_domain.import_employees_excel(db, tenant, user, file)


@router.get("/compliance-checks", response_model=list[dict])
async def list_compliance_checks(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    rows = (
        await db.execute(select(ComplianceCheck).where(ComplianceCheck.tenant_id == tenant.id).limit(500))
    ).scalars().all()
    return [
        {
            "id": r.id,
            "employee_id": r.employee_id,
            "check_type": r.check_type,
            "status": r.status,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "completed_date": r.completed_date.isoformat() if r.completed_date else None,
            "notes": r.notes,
        }
        for r in rows
    ]


@router.post("/compliance-checks", status_code=status.HTTP_201_CREATED)
async def create_compliance_check(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee_id = int(body.get("employee_id", 0))
    await _get_employee_or_404(db, tenant.id, employee_id)
    row = ComplianceCheck(
        tenant_id=tenant.id,
        employee_id=employee_id,
        check_type=str(body.get("check_type", "GENERAL")),
        status=str(body.get("status", "OPEN")),
        due_date=body.get("due_date"),
        notes=str(body.get("notes") or "") or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "ok": True}
