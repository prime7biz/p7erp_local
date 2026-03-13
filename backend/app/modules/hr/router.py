from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Department, Designation, Employee, Role, Tenant, User
from app.modules.hr.schemas import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
    DesignationCreate,
    DesignationResponse,
    DesignationUpdate,
    EmployeeCreate,
    EmployeeResponse,
    EmployeeUpdate,
)

router = APIRouter(prefix="/hr", tags=["hr"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
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
) -> None:
    if department_id is not None:
        await _get_department_or_404(db, tenant_id, department_id)
    if designation_id is not None:
        await _get_designation_or_404(db, tenant_id, designation_id)
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
        await db.rollback()
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
        await db.rollback()
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
    await _require_manager_or_admin(db, user)
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
        await db.rollback()
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
        await db.rollback()
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
    await _require_manager_or_admin(db, user)
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
        reporting_manager_id=body.reporting_manager_id,
        user_id=body.user_id,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
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
    if "reporting_manager_id" in payload:
        row.reporting_manager_id = payload["reporting_manager_id"]
    if "user_id" in payload:
        row.user_id = payload["user_id"]
    if "is_active" in payload:
        row.is_active = bool(payload["is_active"])
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
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
    await _require_manager_or_admin(db, user)
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
    await _require_manager_or_admin(db, user)
    row = await _get_employee_or_404(db, tenant.id, employee_id)
    row.is_active = False
    await db.commit()
    await db.refresh(row)
    return _employee_to_response(row)
