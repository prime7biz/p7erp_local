"""Crew roles, templates, daily crew sheets, HR validation, attendance sync."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AttendanceEntry,
    DepartmentMachine,
    Designation,
    Employee,
    IeOperationsLibrary,
    LeaveRequest,
    LineCrewDaily,
    LineCrewSheetHeader,
    LineCrewTemplate,
    ProductionCrewRole,
    ProductionShift,
    SewingLine,
    Tenant,
    UnitCrewDaily,
    UnitCrewTemplate,
    User,
    WorkerSkill,
)
from app.modules.production.schemas import (
    CrewDailyBulkUpsert,
    CrewDailyInitRequest,
    CrewDailyRowResponse,
    CrewRoleCreate,
    CrewRoleResponse,
    CrewRoleUpdate,
    CrewTemplateBulkUpsert,
    CrewTemplateRowResponse,
    HrAvailableResponse,
)

router = APIRouter(prefix="/production", tags=["production-crew"])

OPTIONAL_DEPARTMENTS = {"knitting", "dyeing", "printing", "aop", "embroidery", "elastic", "washing"}


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _role_resp(x: ProductionCrewRole) -> CrewRoleResponse:
    return CrewRoleResponse(
        id=x.id,
        tenant_id=x.tenant_id,
        department_type=x.department_type,
        role_key=x.role_key,
        role_name=x.role_name,
        is_named=x.is_named,
        designation_id=x.designation_id,
        designation_filter=x.designation_filter,
        sort_order=x.sort_order,
        is_active=x.is_active,
    )


def _employee_name(e: Employee | None) -> str | None:
    if not e:
        return None
    return f"{e.first_name} {e.last_name or ''}".strip() or e.employee_code


async def _seed_roles_if_empty(db: AsyncSession, tenant_id: int) -> None:
    existing = await db.execute(
        select(func.count(ProductionCrewRole.id)).where(ProductionCrewRole.tenant_id == tenant_id)
    )
    if int(existing.scalar_one() or 0) > 0:
        return
    seed = {
        "sewing": [
            ("line_incharge", "Line In-charge", True, "Line Incharge"),
            ("sewing_operator", "Sewing Operator", False, None),
            ("sewing_helper", "Sewing Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
            ("iron_man", "Iron Man", False, None),
            ("final_qc", "Final QC", False, None),
            ("folding_man", "Folding Man", False, None),
            ("packing_man", "Packing Man", False, None),
        ],
        "knitting": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("machine_operator", "Machine Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "dyeing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("lab_technician", "Lab Technician", False, None),
        ],
        "printing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "aop": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "embroidery": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
        ],
        "elastic": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
        ],
        "washing": [
            ("supervisor", "Supervisor", True, "Supervisor"),
            ("operator", "Operator", False, None),
            ("helper", "Helper", False, None),
            ("quality_inspector", "Quality Inspector", False, None),
        ],
    }
    for dept, defs in seed.items():
        for idx, (key, name, is_named, designation_filter) in enumerate(defs):
            db.add(
                ProductionCrewRole(
                    tenant_id=tenant_id,
                    department_type=dept,
                    role_key=key,
                    role_name=name,
                    is_named=is_named,
                    designation_filter=designation_filter,
                    sort_order=idx,
                    is_active=True,
                )
            )
    await db.flush()
    # Link designation_id when HR master has matching title
    seeded = list(
        (await db.execute(select(ProductionCrewRole).where(ProductionCrewRole.tenant_id == tenant_id))).scalars().all()
    )
    for pr in seeded:
        if pr.designation_id is not None or not pr.designation_filter:
            continue
        d = await _designation_by_filter(db, tenant_id, pr.designation_filter)
        if d:
            pr.designation_id = d.id
    await db.commit()


async def _designation_by_filter(db: AsyncSession, tenant_id: int, designation_filter: str | None) -> Designation | None:
    if not designation_filter:
        return None
    r = await db.execute(
        select(Designation)
        .where(
            Designation.tenant_id == tenant_id,
            func.lower(Designation.title) == designation_filter.strip().lower(),
            Designation.is_active.is_(True),
        )
        .limit(1)
    )
    return r.scalar_one_or_none()


async def _designation_for_role(db: AsyncSession, tenant_id: int, role: ProductionCrewRole) -> Designation | None:
    if role.designation_id:
        d = await db.get(Designation, role.designation_id)
        if d and d.tenant_id == tenant_id and d.is_active:
            return d
        return None
    return await _designation_by_filter(db, tenant_id, role.designation_filter)


async def _employees_available_for_filter(
    db: AsyncSession,
    *,
    tenant_id: int,
    designation_filter: str | None,
    for_date: date,
    designation_id: int | None = None,
) -> tuple[list[Employee], int, int]:
    q = select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
    des: Designation | None = None
    if designation_id is not None:
        des = await db.get(Designation, designation_id)
        if not des or des.tenant_id != tenant_id or not des.is_active:
            return [], 0, 0
    elif designation_filter:
        des = await _designation_by_filter(db, tenant_id, designation_filter)

    if designation_id is not None or designation_filter:
        if not des:
            return [], 0, 0
        q = q.where(Employee.designation_id == des.id)
    employees = list((await db.execute(q)).scalars().all())
    if not employees:
        return [], 0, 0
    employee_ids = [e.id for e in employees]
    leave_q = await db.execute(
        select(LeaveRequest.employee_id)
        .where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.employee_id.in_(employee_ids),
            LeaveRequest.status == "APPROVED",
            LeaveRequest.from_date <= for_date,
            LeaveRequest.to_date >= for_date,
        )
        .group_by(LeaveRequest.employee_id)
    )
    leave_ids = {int(x[0]) for x in leave_q.all()}
    available = [e for e in employees if e.id not in leave_ids]
    return available, len(employees), len(leave_ids)


async def _employees_available_for_role(
    db: AsyncSession,
    *,
    tenant_id: int,
    role: ProductionCrewRole,
    for_date: date,
) -> tuple[list[Employee], int, int]:
    """Resolve designation from role (FK or title) and return available employees."""
    q = select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
    des = await _designation_for_role(db, tenant_id, role)
    if role.designation_id or role.designation_filter:
        if not des:
            return [], 0, 0
        q = q.where(Employee.designation_id == des.id)
    employees = list((await db.execute(q)).scalars().all())
    if not employees:
        return [], 0, 0
    employee_ids = [e.id for e in employees]
    leave_q = await db.execute(
        select(LeaveRequest.employee_id)
        .where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.employee_id.in_(employee_ids),
            LeaveRequest.status == "APPROVED",
            LeaveRequest.from_date <= for_date,
            LeaveRequest.to_date >= for_date,
        )
        .group_by(LeaveRequest.employee_id)
    )
    leave_ids = {int(x[0]) for x in leave_q.all()}
    available = [e for e in employees if e.id not in leave_ids]
    return available, len(employees), len(leave_ids)


async def _validate_named_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    role: ProductionCrewRole,
    employee_id: int,
    shift_id: int,
    production_date: date,
    context_line_id: int | None,
    context_department_type: str | None,
    context_machine_id: int | None,
) -> str | None:
    e = await db.get(Employee, employee_id)
    if not e or e.tenant_id != tenant_id or not e.is_active:
        return "Selected employee is not active in this tenant."

    if role.designation_id or role.designation_filter:
        d = await _designation_for_role(db, tenant_id, role)
        if d and e.designation_id != d.id:
            return f"Employee does not match required designation: {role.designation_filter or d.title}."

    lr = await db.execute(
        select(LeaveRequest.id).where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.status == "APPROVED",
            LeaveRequest.from_date <= production_date,
            LeaveRequest.to_date >= production_date,
        )
    )
    if lr.scalar_one_or_none() is not None:
        return "Selected employee is on approved leave for this date."

    # no double assignment for same shift+date
    q_line = (
        select(LineCrewDaily.id)
        .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewDaily.crew_role_id)
        .where(
            LineCrewDaily.tenant_id == tenant_id,
            LineCrewDaily.shift_id == shift_id,
            LineCrewDaily.production_date == production_date,
            LineCrewDaily.employee_id == employee_id,
            ProductionCrewRole.is_named.is_(True),
        )
    )
    if context_line_id is not None:
        q_line = q_line.where(LineCrewDaily.sewing_line_id != context_line_id)
    q_unit = (
        select(UnitCrewDaily.id)
        .join(ProductionCrewRole, ProductionCrewRole.id == UnitCrewDaily.crew_role_id)
        .where(
            UnitCrewDaily.tenant_id == tenant_id,
            UnitCrewDaily.shift_id == shift_id,
            UnitCrewDaily.production_date == production_date,
            UnitCrewDaily.employee_id == employee_id,
            ProductionCrewRole.is_named.is_(True),
        )
    )
    if context_department_type is not None:
        q_unit = q_unit.where(
            or_(
                UnitCrewDaily.department_type != context_department_type,
                UnitCrewDaily.machine_id != context_machine_id,
            )
        )
    has_line = (await db.execute(q_line.limit(1))).scalar_one_or_none() is not None
    has_unit = (await db.execute(q_unit.limit(1))).scalar_one_or_none() is not None
    if has_line or has_unit:
        return "Employee already assigned as named role on another line/unit for this shift."
    return None


async def _skill_warning_for_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    role: ProductionCrewRole,
    employee_id: int,
) -> str | None:
    op = (
        await db.execute(
            select(IeOperationsLibrary)
            .where(
                IeOperationsLibrary.tenant_id == tenant_id,
                func.lower(IeOperationsLibrary.operation_code) == func.lower(role.role_key),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if not op:
        return None
    ws = (
        await db.execute(
            select(WorkerSkill).where(
                WorkerSkill.tenant_id == tenant_id,
                WorkerSkill.employee_id == employee_id,
                WorkerSkill.ie_operation_id == op.id,
                WorkerSkill.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not ws:
        return f"No skill certification for operation '{op.name}'."
    if ws.skill_level in ("trainee",):
        return f"Skill level is '{ws.skill_level}' for '{op.name}' — consider training."
    return None


async def _enrich_daily_with_skill_warnings(
    db: AsyncSession, tenant_id: int, rows: list[CrewDailyRowResponse]
) -> list[CrewDailyRowResponse]:
    out: list[CrewDailyRowResponse] = []
    for r in rows:
        warn = None
        if r.is_named and r.employee_id:
            role = await db.get(ProductionCrewRole, r.crew_role_id)
            if role:
                warn = await _skill_warning_for_assignment(
                    db, tenant_id=tenant_id, role=role, employee_id=r.employee_id
                )
        if warn:
            out.append(r.model_copy(update={"validation_warning": warn}))
        else:
            out.append(r)
    return out


async def _over_alloc_warning(
    db: AsyncSession,
    *,
    tenant_id: int,
    role: ProductionCrewRole,
    shift_id: int,
    production_date: date,
    planned_total_after_save: int,
) -> str | None:
    available, _, _ = await _employees_available_for_role(db, tenant_id=tenant_id, role=role, for_date=production_date)
    net = len(available)
    if planned_total_after_save > net:
        return (
            f"Over-allocation for role '{role.role_name}': planned {planned_total_after_save}, "
            f"available {net} (after leave)."
        )
    return None


@router.get("/crew-roles", response_model=list[CrewRoleResponse])
async def list_crew_roles(
    department_type: str | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    await _seed_roles_if_empty(db, tenant.id)
    q = select(ProductionCrewRole).where(ProductionCrewRole.tenant_id == tenant.id)
    if department_type:
        q = q.where(ProductionCrewRole.department_type == department_type)
    q = q.order_by(ProductionCrewRole.department_type, ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
    rows = list((await db.execute(q)).scalars().all())
    return [_role_resp(x) for x in rows]


@router.post("/crew-roles", response_model=CrewRoleResponse)
async def create_crew_role(
    body: CrewRoleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    des_id = body.designation_id
    if des_id is not None:
        d = await db.get(Designation, des_id)
        if not d or d.tenant_id != tenant.id:
            raise HTTPException(404, "Designation not found")
    row = ProductionCrewRole(
        tenant_id=tenant.id,
        department_type=body.department_type.strip().lower(),
        role_key=body.role_key.strip().lower(),
        role_name=body.role_name.strip(),
        is_named=body.is_named,
        designation_id=des_id,
        designation_filter=body.designation_filter.strip() if body.designation_filter else None,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _role_resp(row)


@router.patch("/crew-roles/{crew_role_id}", response_model=CrewRoleResponse)
async def update_crew_role(
    crew_role_id: int,
    body: CrewRoleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionCrewRole, crew_role_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Crew role not found")
    payload = body.model_dump(exclude_unset=True)
    if "designation_id" in payload and payload["designation_id"] is not None:
        d = await db.get(Designation, payload["designation_id"])
        if not d or d.tenant_id != tenant.id:
            raise HTTPException(404, "Designation not found")
    for field, val in payload.items():
        setattr(row, field, val)
    await db.commit()
    await db.refresh(row)
    return _role_resp(row)


@router.delete("/crew-roles/{crew_role_id}", status_code=204)
async def delete_crew_role(
    crew_role_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    row = await db.get(ProductionCrewRole, crew_role_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(404, "Crew role not found")
    await db.delete(row)
    await db.commit()


@router.get("/hr-available", response_model=HrAvailableResponse)
async def get_hr_available(
    date_str: str = Query(..., alias="date"),
    designation_id: int | None = Query(None),
    designation_filter: str | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(date_str)
    effective_filter = designation_filter
    if designation_id is not None:
        des = await db.get(Designation, designation_id)
        if not des or des.tenant_id != tenant.id:
            raise HTTPException(404, "Designation not found")
        effective_filter = des.title
    available, active_count, on_leave_count = await _employees_available_for_filter(
        db,
        tenant_id=tenant.id,
        designation_filter=None if designation_id is not None else designation_filter,
        for_date=d,
        designation_id=designation_id,
    )
    return HrAvailableResponse(
        designation_id=designation_id,
        designation_filter=effective_filter,
        date=d.isoformat(),
        available_count=len(available),
        active_count=active_count,
        on_leave_count=on_leave_count,
        employees=[
            {"id": e.id, "employee_code": e.employee_code, "name": _employee_name(e), "designation_id": e.designation_id}
            for e in available
        ],
    )


@router.get("/hr-employees")
async def list_hr_employees_for_picker(
    designation_filter: str | None = Query(None),
    designation_id: int | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    q = (
        select(Employee, Designation)
        .join(Designation, Designation.id == Employee.designation_id, isouter=True)
        .where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True))
        .order_by(Employee.employee_code)
    )
    if designation_id is not None:
        des = await db.get(Designation, designation_id)
        if not des or des.tenant_id != tenant.id:
            raise HTTPException(404, "Designation not found")
        q = q.where(Employee.designation_id == designation_id)
    elif designation_filter:
        q = q.where(func.lower(Designation.title) == designation_filter.strip().lower())
    rows = (await db.execute(q)).all()
    return {
        "items": [
            {
                "id": e.id,
                "employee_code": e.employee_code,
                "name": _employee_name(e),
                "designation_id": e.designation_id,
                "designation_title": d.title if d else None,
                "user_id": e.user_id,
            }
            for e, d in rows
        ]
    }


def _default_line_template_counts(role_key: str, line: SewingLine) -> int:
    """When no saved line crew template exists, derive counts from line master."""
    rk = (role_key or "").strip().lower()
    if rk == "line_incharge":
        return 1
    if rk == "sewing_operator":
        return max(0, int(line.default_operator_count or 0))
    if rk == "sewing_helper":
        return max(0, int(line.default_helper_count or 0))
    return 0


async def _template_rows_for_line(db: AsyncSession, tenant_id: int, line_id: int) -> list[CrewTemplateRowResponse]:
    line = await db.get(SewingLine, line_id)
    roles = list(
        (
            await db.execute(
                select(ProductionCrewRole)
                .where(
                    ProductionCrewRole.tenant_id == tenant_id,
                    ProductionCrewRole.department_type == "sewing",
                    ProductionCrewRole.is_active.is_(True),
                )
                .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
            )
        ).scalars().all()
    )
    existing = list(
        (
            await db.execute(
                select(LineCrewTemplate).where(
                    LineCrewTemplate.tenant_id == tenant_id,
                    LineCrewTemplate.sewing_line_id == line_id,
                )
            )
        ).scalars().all()
    )
    by_role = {x.crew_role_id: x for x in existing}
    template_empty = len(existing) == 0
    employee_ids = [x.employee_id for x in existing if x.employee_id is not None]
    emp_map: dict[int, Employee] = {}
    if employee_ids:
        emp_rows = list((await db.execute(select(Employee).where(Employee.id.in_(employee_ids)))).scalars().all())
        emp_map = {e.id: e for e in emp_rows}

    out: list[CrewTemplateRowResponse] = []
    for role in roles:
        t = by_role.get(role.id)
        if t:
            dc = int(t.default_count or 0)
            eid = t.employee_id
        elif template_empty and line is not None:
            dc = _default_line_template_counts(role.role_key, line)
            eid = None
        else:
            dc = 0
            eid = None
        out.append(
            CrewTemplateRowResponse(
                crew_role_id=role.id,
                role_key=role.role_key,
                role_name=role.role_name,
                is_named=role.is_named,
                designation_id=role.designation_id,
                designation_filter=role.designation_filter,
                default_count=dc,
                employee_id=eid,
                employee_name=_employee_name(emp_map.get(eid)) if eid else None,
                sort_order=role.sort_order,
            )
        )
    return out


@router.get("/sewing-lines/{line_id}/crew-template", response_model=list[CrewTemplateRowResponse])
async def get_line_crew_template(
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    line = await db.get(SewingLine, line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(404, "Sewing line not found")
    await _seed_roles_if_empty(db, tenant.id)
    return await _template_rows_for_line(db, tenant.id, line_id)


@router.put("/sewing-lines/{line_id}/crew-template", response_model=list[CrewTemplateRowResponse])
async def put_line_crew_template(
    line_id: int,
    body: CrewTemplateBulkUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    line = await db.get(SewingLine, line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(404, "Sewing line not found")
    await _seed_roles_if_empty(db, tenant.id)
    for row in body.rows:
        role = await db.get(ProductionCrewRole, row.crew_role_id)
        if not role or role.tenant_id != tenant.id or role.department_type != "sewing":
            raise HTTPException(400, f"Invalid sewing crew role: {row.crew_role_id}")
        if role.is_named and row.employee_id is None:
            raise HTTPException(400, f"Role '{role.role_name}' requires employee selection.")
        ex = (
            await db.execute(
                select(LineCrewTemplate).where(
                    LineCrewTemplate.tenant_id == tenant.id,
                    LineCrewTemplate.sewing_line_id == line_id,
                    LineCrewTemplate.crew_role_id == role.id,
                )
            )
        ).scalar_one_or_none()
        if ex:
            ex.default_count = max(0, int(row.default_count or 0))
            ex.employee_id = row.employee_id
        else:
            db.add(
                LineCrewTemplate(
                    tenant_id=tenant.id,
                    sewing_line_id=line_id,
                    crew_role_id=role.id,
                    default_count=max(0, int(row.default_count or 0)),
                    employee_id=row.employee_id,
                )
            )
    await db.commit()
    return await _template_rows_for_line(db, tenant.id, line_id)


async def _template_rows_for_unit(
    db: AsyncSession, tenant_id: int, department_type: str, machine_id: int | None
) -> list[CrewTemplateRowResponse]:
    roles = list(
        (
            await db.execute(
                select(ProductionCrewRole)
                .where(
                    ProductionCrewRole.tenant_id == tenant_id,
                    ProductionCrewRole.department_type == department_type,
                    ProductionCrewRole.is_active.is_(True),
                )
                .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
            )
        ).scalars().all()
    )
    existing = list(
        (
            await db.execute(
                select(UnitCrewTemplate).where(
                    UnitCrewTemplate.tenant_id == tenant_id,
                    UnitCrewTemplate.department_type == department_type,
                    UnitCrewTemplate.machine_id == machine_id,
                )
            )
        ).scalars().all()
    )
    by_role = {x.crew_role_id: x for x in existing}
    employee_ids = [x.employee_id for x in existing if x.employee_id is not None]
    emp_map: dict[int, Employee] = {}
    if employee_ids:
        emp_rows = list((await db.execute(select(Employee).where(Employee.id.in_(employee_ids)))).scalars().all())
        emp_map = {e.id: e for e in emp_rows}

    out: list[CrewTemplateRowResponse] = []
    for role in roles:
        t = by_role.get(role.id)
        out.append(
            CrewTemplateRowResponse(
                crew_role_id=role.id,
                role_key=role.role_key,
                role_name=role.role_name,
                is_named=role.is_named,
                designation_id=role.designation_id,
                designation_filter=role.designation_filter,
                default_count=t.default_count if t else 0,
                employee_id=t.employee_id if t else None,
                employee_name=_employee_name(emp_map.get(t.employee_id)) if t and t.employee_id else None,
                sort_order=role.sort_order,
            )
        )
    return out


@router.get("/units/{department_type}/crew-template", response_model=list[CrewTemplateRowResponse])
async def get_unit_crew_template(
    department_type: str,
    machine_id: int | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    dept = department_type.strip().lower()
    if dept not in OPTIONAL_DEPARTMENTS:
        raise HTTPException(400, "Invalid optional department")
    if machine_id is not None:
        m = await db.get(DepartmentMachine, machine_id)
        if not m or m.tenant_id != tenant.id:
            raise HTTPException(404, "Machine not found")
    await _seed_roles_if_empty(db, tenant.id)
    return await _template_rows_for_unit(db, tenant.id, dept, machine_id)


@router.put("/units/{department_type}/crew-template", response_model=list[CrewTemplateRowResponse])
async def put_unit_crew_template(
    department_type: str,
    body: CrewTemplateBulkUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    dept = department_type.strip().lower()
    if dept not in OPTIONAL_DEPARTMENTS:
        raise HTTPException(400, "Invalid optional department")
    if body.machine_id is not None:
        m = await db.get(DepartmentMachine, body.machine_id)
        if not m or m.tenant_id != tenant.id:
            raise HTTPException(404, "Machine not found")
    await _seed_roles_if_empty(db, tenant.id)
    for row in body.rows:
        role = await db.get(ProductionCrewRole, row.crew_role_id)
        if not role or role.tenant_id != tenant.id or role.department_type != dept:
            raise HTTPException(400, f"Invalid {dept} crew role: {row.crew_role_id}")
        if role.is_named and row.employee_id is None:
            raise HTTPException(400, f"Role '{role.role_name}' requires employee selection.")
        ex = (
            await db.execute(
                select(UnitCrewTemplate).where(
                    UnitCrewTemplate.tenant_id == tenant.id,
                    UnitCrewTemplate.department_type == dept,
                    UnitCrewTemplate.machine_id == body.machine_id,
                    UnitCrewTemplate.crew_role_id == role.id,
                )
            )
        ).scalar_one_or_none()
        if ex:
            ex.default_count = max(0, int(row.default_count or 0))
            ex.employee_id = row.employee_id
        else:
            db.add(
                UnitCrewTemplate(
                    tenant_id=tenant.id,
                    department_type=dept,
                    machine_id=body.machine_id,
                    crew_role_id=role.id,
                    default_count=max(0, int(row.default_count or 0)),
                    employee_id=row.employee_id,
                )
            )
    await db.commit()
    return await _template_rows_for_unit(db, tenant.id, dept, body.machine_id)


async def _init_daily_from_template(
    db: AsyncSession,
    *,
    tenant_id: int,
    d: date,
    shift_id: int,
    line_id: int | None,
    department_type: str | None,
    machine_id: int | None,
) -> None:
    if line_id is not None:
        existing_count = (
            await db.execute(
                select(func.count(LineCrewDaily.id)).where(
                    LineCrewDaily.tenant_id == tenant_id,
                    LineCrewDaily.sewing_line_id == line_id,
                    LineCrewDaily.shift_id == shift_id,
                    LineCrewDaily.production_date == d,
                )
            )
        ).scalar_one()
        if int(existing_count or 0) > 0:
            return
        template_rows = list(
            (
                await db.execute(
                    select(LineCrewTemplate)
                    .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewTemplate.crew_role_id)
                    .where(
                        LineCrewTemplate.tenant_id == tenant_id,
                        LineCrewTemplate.sewing_line_id == line_id,
                        ProductionCrewRole.is_active.is_(True),
                    )
                )
            ).scalars().all()
        )
        for t in template_rows:
            db.add(
                LineCrewDaily(
                    tenant_id=tenant_id,
                    sewing_line_id=line_id,
                    shift_id=shift_id,
                    production_date=d,
                    crew_role_id=t.crew_role_id,
                    planned_count=t.default_count or 0,
                    employee_id=t.employee_id,
                )
            )
        await db.commit()
        return

    if department_type is None:
        return
    existing_count = (
        await db.execute(
            select(func.count(UnitCrewDaily.id)).where(
                UnitCrewDaily.tenant_id == tenant_id,
                UnitCrewDaily.department_type == department_type,
                UnitCrewDaily.machine_id == machine_id,
                UnitCrewDaily.shift_id == shift_id,
                UnitCrewDaily.production_date == d,
            )
        )
    ).scalar_one()
    if int(existing_count or 0) > 0:
        return
    template_rows = list(
        (
            await db.execute(
                select(UnitCrewTemplate)
                .join(ProductionCrewRole, ProductionCrewRole.id == UnitCrewTemplate.crew_role_id)
                .where(
                    UnitCrewTemplate.tenant_id == tenant_id,
                    UnitCrewTemplate.department_type == department_type,
                    UnitCrewTemplate.machine_id == machine_id,
                    ProductionCrewRole.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    for t in template_rows:
        db.add(
            UnitCrewDaily(
                tenant_id=tenant_id,
                department_type=department_type,
                machine_id=machine_id,
                shift_id=shift_id,
                production_date=d,
                crew_role_id=t.crew_role_id,
                planned_count=t.default_count or 0,
                employee_id=t.employee_id,
            )
        )
    await db.commit()


async def _daily_rows(
    db: AsyncSession,
    *,
    tenant_id: int,
    d: date,
    shift_id: int,
    line_id: int | None,
    department_type: str | None,
    machine_id: int | None,
) -> list[CrewDailyRowResponse]:
    if line_id is not None:
        rows = list(
            (
                await db.execute(
                    select(LineCrewDaily, ProductionCrewRole, Employee)
                    .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewDaily.crew_role_id)
                    .join(Employee, Employee.id == LineCrewDaily.employee_id, isouter=True)
                    .where(
                        LineCrewDaily.tenant_id == tenant_id,
                        LineCrewDaily.sewing_line_id == line_id,
                        LineCrewDaily.shift_id == shift_id,
                        LineCrewDaily.production_date == d,
                    )
                    .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
                )
            ).all()
        )
    else:
        rows = list(
            (
                await db.execute(
                    select(UnitCrewDaily, ProductionCrewRole, Employee)
                    .join(ProductionCrewRole, ProductionCrewRole.id == UnitCrewDaily.crew_role_id)
                    .join(Employee, Employee.id == UnitCrewDaily.employee_id, isouter=True)
                    .where(
                        UnitCrewDaily.tenant_id == tenant_id,
                        UnitCrewDaily.department_type == department_type,
                        UnitCrewDaily.machine_id == machine_id,
                        UnitCrewDaily.shift_id == shift_id,
                        UnitCrewDaily.production_date == d,
                    )
                    .order_by(ProductionCrewRole.sort_order, ProductionCrewRole.role_name)
                )
            ).all()
        )
    out: list[CrewDailyRowResponse] = []
    for daily, role, emp in rows:
        shortfall = max(0, int(daily.planned_count or 0) - int(daily.actual_present or 0))
        out.append(
            CrewDailyRowResponse(
                id=daily.id,
                crew_role_id=role.id,
                role_key=role.role_key,
                role_name=role.role_name,
                is_named=role.is_named,
                designation_id=role.designation_id,
                designation_filter=role.designation_filter,
                planned_count=int(daily.planned_count or 0),
                actual_present=int(daily.actual_present or 0),
                shortfall=shortfall,
                employee_id=daily.employee_id,
                employee_name=_employee_name(emp),
                notes=daily.notes,
                sort_order=role.sort_order,
                validation_warning=None,
            )
        )
    return out


@router.get("/crew-daily", response_model=list[CrewDailyRowResponse])
async def get_crew_daily(
    production_date: str = Query(...),
    shift_id: int = Query(...),
    line_id: int | None = Query(None),
    department_type: str | None = Query(None),
    machine_id: int | None = Query(None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)
    sh = await db.get(ProductionShift, shift_id)
    if not sh or sh.tenant_id != tenant.id:
        raise HTTPException(404, "Shift not found")
    if line_id is None and not department_type:
        raise HTTPException(400, "Provide line_id or department_type")
    dept = department_type.strip().lower() if department_type else None
    if dept and dept not in OPTIONAL_DEPARTMENTS:
        raise HTTPException(400, "Invalid optional department")
    await _init_daily_from_template(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=shift_id,
        line_id=line_id,
        department_type=dept,
        machine_id=machine_id,
    )
    rows = await _daily_rows(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=shift_id,
        line_id=line_id,
        department_type=dept,
        machine_id=machine_id,
    )
    return await _enrich_daily_with_skill_warnings(db, tenant.id, rows)


@router.post("/crew-daily/init-from-template", response_model=list[CrewDailyRowResponse])
async def init_crew_daily_from_template(
    body: CrewDailyInitRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(body.production_date)
    await _init_daily_from_template(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=body.shift_id,
        line_id=body.line_id,
        department_type=body.department_type.strip().lower() if body.department_type else None,
        machine_id=body.machine_id,
    )
    dept = body.department_type.strip().lower() if body.department_type else None
    rows = await _daily_rows(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=body.shift_id,
        line_id=body.line_id,
        department_type=dept,
        machine_id=body.machine_id,
    )
    return await _enrich_daily_with_skill_warnings(db, tenant.id, rows)


@router.put("/crew-daily", response_model=list[CrewDailyRowResponse])
async def put_crew_daily(
    body: CrewDailyBulkUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(body.production_date)
    dept = body.department_type.strip().lower() if body.department_type else None
    if body.line_id is not None:
        hdr = (
            await db.execute(
                select(LineCrewSheetHeader).where(
                    LineCrewSheetHeader.tenant_id == tenant.id,
                    LineCrewSheetHeader.sewing_line_id == body.line_id,
                    LineCrewSheetHeader.shift_id == body.shift_id,
                    LineCrewSheetHeader.production_date == d,
                )
            )
        ).scalar_one_or_none()
        if hdr and hdr.status in ("approved", "locked"):
            raise HTTPException(400, "This crew sheet is approved or locked and cannot be edited.")
    await _init_daily_from_template(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=body.shift_id,
        line_id=body.line_id,
        department_type=dept,
        machine_id=body.machine_id,
    )

    warnings: list[str] = []
    for row in body.rows:
        role = await db.get(ProductionCrewRole, row.crew_role_id)
        if not role or role.tenant_id != tenant.id:
            raise HTTPException(400, f"Invalid crew role: {row.crew_role_id}")
        if role.is_named:
            if row.employee_id is None:
                raise HTTPException(400, f"Role '{role.role_name}' requires employee.")
            invalid_reason = await _validate_named_assignment(
                db,
                tenant_id=tenant.id,
                role=role,
                employee_id=row.employee_id,
                shift_id=body.shift_id,
                production_date=d,
                context_line_id=body.line_id,
                context_department_type=dept,
                context_machine_id=body.machine_id,
            )
            if invalid_reason:
                raise HTTPException(400, invalid_reason)

        if body.line_id is not None:
            ex = (
                await db.execute(
                    select(LineCrewDaily).where(
                        LineCrewDaily.tenant_id == tenant.id,
                        LineCrewDaily.sewing_line_id == body.line_id,
                        LineCrewDaily.shift_id == body.shift_id,
                        LineCrewDaily.production_date == d,
                        LineCrewDaily.crew_role_id == row.crew_role_id,
                    )
                )
            ).scalar_one_or_none()
            if not ex:
                ex = LineCrewDaily(
                    tenant_id=tenant.id,
                    sewing_line_id=body.line_id,
                    shift_id=body.shift_id,
                    production_date=d,
                    crew_role_id=row.crew_role_id,
                )
                db.add(ex)
            ex.planned_count = max(0, int(row.planned_count or 0))
            ex.employee_id = row.employee_id
            ex.notes = row.notes
        else:
            ex = (
                await db.execute(
                    select(UnitCrewDaily).where(
                        UnitCrewDaily.tenant_id == tenant.id,
                        UnitCrewDaily.department_type == dept,
                        UnitCrewDaily.machine_id == body.machine_id,
                        UnitCrewDaily.shift_id == body.shift_id,
                        UnitCrewDaily.production_date == d,
                        UnitCrewDaily.crew_role_id == row.crew_role_id,
                    )
                )
            ).scalar_one_or_none()
            if not ex:
                ex = UnitCrewDaily(
                    tenant_id=tenant.id,
                    department_type=dept or "",
                    machine_id=body.machine_id,
                    shift_id=body.shift_id,
                    production_date=d,
                    crew_role_id=row.crew_role_id,
                )
                db.add(ex)
            ex.planned_count = max(0, int(row.planned_count or 0))
            ex.employee_id = row.employee_id
            ex.notes = row.notes

        if not role.is_named:
            total_line = (
                await db.execute(
                    select(func.coalesce(func.sum(LineCrewDaily.planned_count), 0)).where(
                        LineCrewDaily.tenant_id == tenant.id,
                        LineCrewDaily.shift_id == body.shift_id,
                        LineCrewDaily.production_date == d,
                        LineCrewDaily.crew_role_id == row.crew_role_id,
                    )
                )
            ).scalar_one()
            total_unit = (
                await db.execute(
                    select(func.coalesce(func.sum(UnitCrewDaily.planned_count), 0)).where(
                        UnitCrewDaily.tenant_id == tenant.id,
                        UnitCrewDaily.shift_id == body.shift_id,
                        UnitCrewDaily.production_date == d,
                        UnitCrewDaily.crew_role_id == row.crew_role_id,
                    )
                )
            ).scalar_one()
            planned_total_after = int(total_line or 0) + int(total_unit or 0)
            warn = await _over_alloc_warning(
                db,
                tenant_id=tenant.id,
                role=role,
                shift_id=body.shift_id,
                production_date=d,
                planned_total_after_save=planned_total_after,
            )
            if warn:
                warnings.append(warn)

    if warnings and not body.override_validation:
        raise HTTPException(
            400,
            {
                "message": "Crew allocation has warnings. Re-submit with override_validation=true to proceed.",
                "warnings": warnings,
            },
        )
    await db.commit()
    out = await _daily_rows(
        db,
        tenant_id=tenant.id,
        d=d,
        shift_id=body.shift_id,
        line_id=body.line_id,
        department_type=dept,
        machine_id=body.machine_id,
    )
    out = await _enrich_daily_with_skill_warnings(db, tenant.id, out)
    if warnings and out:
        merged = "; ".join(warnings)
        first = out[0]
        prev = first.validation_warning
        combo = f"{prev}; {merged}" if prev else merged
        out[0] = first.model_copy(update={"validation_warning": combo})
    return out


@router.get("/crew-daily/substitute-suggestions")
async def crew_substitute_suggestions(
    production_date: str = Query(...),
    shift_id: int = Query(...),
    line_id: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Flag named roles where the assignee is on approved leave; suggest substitutes from the same pool."""
    _ensure(user, tenant)
    d = date.fromisoformat(production_date)
    rows = list(
        (
            await db.execute(
                select(LineCrewDaily, ProductionCrewRole)
                .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewDaily.crew_role_id)
                .where(
                    LineCrewDaily.tenant_id == tenant.id,
                    LineCrewDaily.sewing_line_id == line_id,
                    LineCrewDaily.shift_id == shift_id,
                    LineCrewDaily.production_date == d,
                    ProductionCrewRole.is_named.is_(True),
                )
            )
        ).all()
    )
    gaps: list[dict] = []
    for daily, role in rows:
        if not daily.employee_id:
            continue
        on_leave = (
            await db.execute(
                select(LeaveRequest.id).where(
                    LeaveRequest.tenant_id == tenant.id,
                    LeaveRequest.employee_id == daily.employee_id,
                    LeaveRequest.status == "APPROVED",
                    LeaveRequest.from_date <= d,
                    LeaveRequest.to_date >= d,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if on_leave is None:
            continue
        pool, _, _ = await _employees_available_for_role(
            db, tenant_id=tenant.id, role=role, for_date=d
        )
        pool = [e for e in pool if e.id != daily.employee_id][:12]
        gaps.append(
            {
                "crew_role_id": role.id,
                "role_name": role.role_name,
                "current_employee_id": daily.employee_id,
                "suggested_substitutes": [
                    {"id": e.id, "employee_code": e.employee_code, "name": _employee_name(e)} for e in pool
                ],
            }
        )
    return {"production_date": d.isoformat(), "line_id": line_id, "shift_id": shift_id, "gaps": gaps}


async def sync_crew_actual_present(db: AsyncSession, *, tenant_id: int, production_date: date) -> dict[str, int]:
    line_rows = list(
        (
            await db.execute(
                select(LineCrewDaily, ProductionCrewRole)
                .join(ProductionCrewRole, ProductionCrewRole.id == LineCrewDaily.crew_role_id)
                .where(LineCrewDaily.tenant_id == tenant_id, LineCrewDaily.production_date == production_date)
            )
        ).all()
    )
    unit_rows = list(
        (
            await db.execute(
                select(UnitCrewDaily, ProductionCrewRole)
                .join(ProductionCrewRole, ProductionCrewRole.id == UnitCrewDaily.crew_role_id)
                .where(UnitCrewDaily.tenant_id == tenant_id, UnitCrewDaily.production_date == production_date)
            )
        ).all()
    )
    updated = 0
    for daily, role in line_rows:
        planned = max(0, int(daily.planned_count or 0))
        if role.is_named:
            if not daily.employee_id:
                daily.actual_present = 0
            else:
                one = (
                    await db.execute(
                        select(func.count(AttendanceEntry.id)).where(
                            AttendanceEntry.tenant_id == tenant_id,
                            AttendanceEntry.attendance_date == production_date,
                            AttendanceEntry.employee_id == daily.employee_id,
                            AttendanceEntry.status == "PRESENT",
                        )
                    )
                ).scalar_one()
                daily.actual_present = 1 if int(one or 0) > 0 else 0
        else:
            available, _, _ = await _employees_available_for_role(
                db, tenant_id=tenant_id, role=role, for_date=production_date
            )
            ids = [e.id for e in available]
            if ids:
                present_count = (
                    await db.execute(
                        select(func.count(AttendanceEntry.id)).where(
                            AttendanceEntry.tenant_id == tenant_id,
                            AttendanceEntry.attendance_date == production_date,
                            AttendanceEntry.employee_id.in_(ids),
                            AttendanceEntry.status == "PRESENT",
                        )
                    )
                ).scalar_one()
                pool = int(present_count or 0)
                daily.actual_present = min(planned, pool) if planned else pool
            else:
                daily.actual_present = 0
        updated += 1
    for daily, role in unit_rows:
        planned = max(0, int(daily.planned_count or 0))
        if role.is_named:
            if not daily.employee_id:
                daily.actual_present = 0
            else:
                one = (
                    await db.execute(
                        select(func.count(AttendanceEntry.id)).where(
                            AttendanceEntry.tenant_id == tenant_id,
                            AttendanceEntry.attendance_date == production_date,
                            AttendanceEntry.employee_id == daily.employee_id,
                            AttendanceEntry.status == "PRESENT",
                        )
                    )
                ).scalar_one()
                daily.actual_present = 1 if int(one or 0) > 0 else 0
        else:
            available, _, _ = await _employees_available_for_role(
                db, tenant_id=tenant_id, role=role, for_date=production_date
            )
            ids = [e.id for e in available]
            if ids:
                present_count = (
                    await db.execute(
                        select(func.count(AttendanceEntry.id)).where(
                            AttendanceEntry.tenant_id == tenant_id,
                            AttendanceEntry.attendance_date == production_date,
                            AttendanceEntry.employee_id.in_(ids),
                            AttendanceEntry.status == "PRESENT",
                        )
                    )
                ).scalar_one()
                pool = int(present_count or 0)
                daily.actual_present = min(planned, pool) if planned else pool
            else:
                daily.actual_present = 0
        updated += 1
    await db.commit()
    return {"updated_rows": updated}


@router.post("/crew-daily/sync-attendance")
async def sync_crew_attendance(
    date_str: str = Query(..., alias="date"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = date.fromisoformat(date_str)
    return {"ok": True, **(await sync_crew_actual_present(db, tenant_id=tenant.id, production_date=d))}


@router.get("/crew-daily/filters")
async def crew_daily_filter_defaults(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    shifts = list(
        (
            await db.execute(
                select(ProductionShift).where(ProductionShift.tenant_id == tenant.id, ProductionShift.is_active.is_(True))
            )
        ).scalars().all()
    )
    lines = list(
        (
            await db.execute(select(SewingLine).where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True)))
        ).scalars().all()
    )
    return {
        "shifts": [{"id": s.id, "code": s.shift_code, "name": s.name} for s in shifts],
        "lines": [{"id": l.id, "line_code": l.line_code, "name": l.name} for l in lines],
        "optional_units": sorted(list(OPTIONAL_DEPARTMENTS)),
    }
