from __future__ import annotations

import io
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
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
from app.modules.hr import service as hr_domain
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


async def _next_employee_code(db: AsyncSession, tenant_id: int) -> str:
    return await next_tenant_code(
        db,
        model=Employee,
        tenant_id=tenant_id,
        prefix="EMP-",
        width=5,
    )


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


def _employee_to_response(row: Employee) -> EmployeeResponse:
    return EmployeeResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_code=row.employee_code,
        first_name=row.first_name,
        last_name=row.last_name,
        email=row.email,
        phone=row.phone,
        joining_date=row.joining_date,
        date_of_birth=row.date_of_birth,
        gender=row.gender,
        marital_status=row.marital_status,
        blood_group=row.blood_group,
        emergency_contact_name=row.emergency_contact_name,
        emergency_contact_phone=row.emergency_contact_phone,
        address_line=row.address_line,
        city=row.city,
        country=row.country,
        national_id=row.national_id,
        employment_type=row.employment_type,
        confirmation_date=row.confirmation_date,
        exit_date=row.exit_date,
        department_id=row.department_id,
        designation_id=row.designation_id,
        section_id=row.section_id,
        employee_category=row.employee_category,
        reporting_manager_id=row.reporting_manager_id,
        user_id=row.user_id,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


async def _get_department_or_404(db: AsyncSession, tenant_id: int, department_id: int) -> Department:
    row = await db.get(Department, department_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return row


async def _get_designation_or_404(db: AsyncSession, tenant_id: int, designation_id: int) -> Designation:
    row = await db.get(Designation, designation_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Designation not found")
    return row


async def _get_employee_or_404(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    row = await db.get(Employee, employee_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return row


async def _validate_fk_values(
    db: AsyncSession,
    tenant_id: int,
    department_id: int | None,
    designation_id: int | None,
    reporting_manager_id: int | None,
    user_id: int | None = None,
    employee_id: int | None = None,
    section_id: int | None = None,
) -> None:
    if department_id is not None:
        await _get_department_or_404(db, tenant_id, department_id)
    if designation_id is not None:
        await _get_designation_or_404(db, tenant_id, designation_id)
    if section_id is not None:
        sec = await db.get(HrSection, section_id)
        if not sec or sec.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    if reporting_manager_id is not None:
        manager = await _get_employee_or_404(db, tenant_id, reporting_manager_id)
        if employee_id is not None and manager.id == employee_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee cannot report to self")
        if employee_id is not None:
            # Guard against manager-cycle chains like A->B->C->A.
            cursor_id = manager.reporting_manager_id
            while cursor_id is not None:
                parent = await _get_employee_or_404(db, tenant_id, cursor_id)
                if parent.id == employee_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Reporting manager creates a cycle in hierarchy",
                    )
                cursor_id = parent.reporting_manager_id
    if user_id is not None:
        linked_user = await db.get(User, user_id)
        if not linked_user or linked_user.tenant_id != tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked user not found in tenant")
        existing_link = (
            await db.execute(
                select(Employee.id).where(
                    Employee.tenant_id == tenant_id,
                    Employee.user_id == user_id,
                    Employee.id != (employee_id or 0),
                )
            )
        ).first()
        if existing_link:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This user is already linked to another employee",
            )


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
    return [_employee_to_response(r) for r in result.scalars().all()]


@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    return _employee_to_response(row)


@router.post("/employees", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee_code = await _next_employee_code(db, tenant.id)
    await _validate_fk_values(
        db,
        tenant.id,
        body.department_id,
        body.designation_id,
        body.reporting_manager_id,
        user_id=body.user_id,
        section_id=body.section_id,
    )
    row = Employee(
        tenant_id=tenant.id,
        employee_code=employee_code,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip() if body.last_name else None,
        email=body.email.strip() if body.email else None,
        phone=body.phone.strip() if body.phone else None,
        joining_date=body.joining_date,
        date_of_birth=body.date_of_birth,
        gender=body.gender.strip() if body.gender else None,
        marital_status=body.marital_status.strip() if body.marital_status else None,
        blood_group=body.blood_group.strip() if body.blood_group else None,
        emergency_contact_name=body.emergency_contact_name.strip() if body.emergency_contact_name else None,
        emergency_contact_phone=body.emergency_contact_phone.strip() if body.emergency_contact_phone else None,
        address_line=body.address_line.strip() if body.address_line else None,
        city=body.city.strip() if body.city else None,
        country=body.country.strip() if body.country else None,
        national_id=body.national_id.strip() if body.national_id else None,
        employment_type=body.employment_type.strip() if body.employment_type else None,
        confirmation_date=body.confirmation_date,
        exit_date=body.exit_date,
        department_id=body.department_id,
        designation_id=body.designation_id,
        section_id=body.section_id,
        employee_category=body.employee_category.strip() if body.employee_category else None,
        reporting_manager_id=body.reporting_manager_id,
        user_id=body.user_id,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee code already exists")
    await db.refresh(row)
    return _employee_to_response(row)


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
        row.employee_code = payload["employee_code"].strip()
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
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee code already exists")
    await db.refresh(row)
    return _employee_to_response(row)


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
    today = date.today()
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
        file_path=body.file_path,
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
