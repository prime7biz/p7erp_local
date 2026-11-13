"""Dated employee / machine line assignments (Manufacturing Intelligence Phase 2, run R4; migration 298).

Rules
- every client id passes `ensure_owned` (another tenant's id = 404): employee, machine, sewing line, shift
- the employee / machine must be active; the line must be active
- one active line assignment per employee (any line, any role) per date range, and the same per machine. The
  employee / machine row is locked FOR UPDATE first, then the overlap check runs, so two parallel requests cannot
  both pass it. Overlap -> 409 naming the other assignment
- update / end / deactivate need `expected_lock_version` (stale -> 409); employee_id / machine_id never change
- employees are shown by code and name only (like GET /hr/employees/lookup): no salary, NID, phone or bank field
- every write is audited (`log_action`); the service never commits (the router does)
"""
from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.pagination import MAX_PAGE_SIZE
from app.models import DepartmentMachine, Employee, ProductionShift, SewingLine, Tenant, User
from app.models.mfg_planning import (
    ASSIGNMENT_ROLES,
    ROLE_OPERATOR,
    ProductionEmployeeLineAssignment,
    ProductionMachineLineAssignment,
)
from app.modules.audit.service import log_action

MAX_SPAN_DAYS = 3660

EA = ProductionEmployeeLineAssignment
MA = ProductionMachineLineAssignment


def _role(v: str | None) -> str | None:
    if v is None:
        return None
    s = str(v).strip().upper()
    if s not in ASSIGNMENT_ROLES:
        raise ValueError(f"Invalid role. Allowed: {', '.join(ASSIGNMENT_ROLES)}")
    return s


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmployeeAssignmentCreate(_In):
    employee_id: int = Field(..., ge=1)
    sewing_line_id: int = Field(..., ge=1)
    shift_id: int | None = Field(None, ge=1)
    role: str = ROLE_OPERATOR
    valid_from: date
    valid_to: date | None = None
    notes: str | None = Field(None, max_length=2000)

    @field_validator("role")
    @classmethod
    def _v_role(cls, v: str) -> str | None:
        return _role(v)


class EmployeeAssignmentUpdate(_In):
    expected_lock_version: int = Field(..., ge=0)
    sewing_line_id: int | None = Field(None, ge=1)
    shift_id: int | None = Field(None, ge=1)
    role: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    notes: str | None = Field(None, max_length=2000)

    @field_validator("role")
    @classmethod
    def _v_role(cls, v: str | None) -> str | None:
        return _role(v)


class MachineAssignmentCreate(_In):
    machine_id: int = Field(..., ge=1)
    sewing_line_id: int = Field(..., ge=1)
    valid_from: date
    valid_to: date | None = None
    notes: str | None = Field(None, max_length=2000)


class MachineAssignmentUpdate(_In):
    expected_lock_version: int = Field(..., ge=0)
    sewing_line_id: int | None = Field(None, ge=1)
    valid_from: date | None = None
    valid_to: date | None = None
    notes: str | None = Field(None, max_length=2000)


class AssignmentEndIn(_In):
    expected_lock_version: int = Field(..., ge=0)
    valid_to: date


class AssignmentDeactivateIn(_In):
    expected_lock_version: int = Field(..., ge=0)
    reason: str | None = Field(None, max_length=500)


def _err(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _check_dates(start: date, end: date | None) -> None:
    if end is not None and end < start:
        raise _err(422, "valid_to must be on or after valid_from")
    if end is not None and (end - start).days > MAX_SPAN_DAYS:
        raise _err(422, f"An assignment cannot span more than {MAX_SPAN_DAYS} days; leave valid_to empty instead")


def _check_version(row: Any, expected: int) -> None:
    if int(expected) != int(row.lock_version or 0):
        raise _err(409, "The assignment changed since you loaded it. Reload and try again")


async def _owned_line(db: AsyncSession, tenant_id: int, line_id: int) -> SewingLine:
    line = await ensure_owned(db, SewingLine, line_id, tenant_id, "Sewing line", status_code=404)
    if not line.is_active:
        raise _err(422, "The sewing line is not active")
    return line


async def _lock_employee(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    emp = (
        await db.execute(
            select(Employee)
            .where(Employee.tenant_id == tenant_id, Employee.id == employee_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise _err(404, f"Employee {employee_id} not found")
    return emp


async def _lock_machine(db: AsyncSession, tenant_id: int, machine_id: int) -> DepartmentMachine:
    machine = (
        await db.execute(
            select(DepartmentMachine)
            .where(DepartmentMachine.tenant_id == tenant_id, DepartmentMachine.id == machine_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if machine is None:
        raise _err(404, f"Machine {machine_id} not found")
    return machine


async def _overlap(
    db: AsyncSession, model: Any, owner_col: Any, tenant_id: int, owner_id: int, start: date, end: date | None,
    *, exclude_id: int | None,
) -> Any | None:
    conds = [
        model.tenant_id == tenant_id,
        owner_col == owner_id,
        model.is_active.is_(True),
        or_(model.valid_to.is_(None), model.valid_to >= start),
    ]
    if end is not None:
        conds.append(model.valid_from <= end)
    if exclude_id is not None:
        conds.append(model.id != exclude_id)
    return (await db.execute(select(model).where(*conds).order_by(model.id).limit(1))).scalar_one_or_none()


def _overlap_error(kind: str, other: Any) -> HTTPException:
    until = other.valid_to.isoformat() if other.valid_to else "open end"
    return _err(
        409,
        f"This {kind} already has an active line assignment #{other.id} on line {other.sewing_line_id} "
        f"({other.valid_from.isoformat()} to {until}). End it first",
    )


async def _get_row(db: AsyncSession, model: Any, tenant_id: int, row_id: int, *, lock: bool) -> Any:
    stmt = select(model).where(model.tenant_id == tenant_id, model.id == row_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise _err(404, "Line assignment not found")
    return row


async def _audit(db: AsyncSession, tenant: Tenant, user: User, action: str, resource: str, details: str) -> None:
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action=action, resource=resource, details=details)


# --------------------------------------------------------------------------- employees


async def create_employee_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, data: EmployeeAssignmentCreate
) -> ProductionEmployeeLineAssignment:
    tenant_id = tenant.id
    await ensure_owned(db, Employee, data.employee_id, tenant_id, "Employee", status_code=404)
    await _owned_line(db, tenant_id, data.sewing_line_id)
    await ensure_owned(db, ProductionShift, data.shift_id, tenant_id, "Shift", status_code=404)
    _check_dates(data.valid_from, data.valid_to)
    emp = await _lock_employee(db, tenant_id, data.employee_id)
    if not emp.is_active:
        raise _err(422, "The employee is not active")
    other = await _overlap(db, EA, EA.employee_id, tenant_id, emp.id, data.valid_from, data.valid_to, exclude_id=None)
    if other is not None:
        raise _overlap_error("employee", other)
    row = EA(
        tenant_id=tenant_id,
        employee_id=emp.id,
        sewing_line_id=data.sewing_line_id,
        shift_id=data.shift_id,
        role=data.role,
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        is_active=True,
        notes=(data.notes or "").strip() or None,
        lock_version=0,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    db.add(row)
    await db.flush()
    await _audit(
        db, tenant, user, "mfg_employee_line_assignment.create", f"production_employee_line_assignment:{row.id}",
        f"employee_id={row.employee_id} line_id={row.sewing_line_id} role={row.role} "
        f"from={row.valid_from} to={row.valid_to}",
    )
    return row


async def update_employee_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: EmployeeAssignmentUpdate
) -> ProductionEmployeeLineAssignment:
    tenant_id = tenant.id
    sent = data.model_fields_set - {"expected_lock_version"}
    if not sent:
        raise _err(422, "Nothing to change")
    for name in ("sewing_line_id", "role", "valid_from"):
        if name in sent and getattr(data, name) is None:
            raise _err(422, f"{name} cannot be empty")
    peek = await _get_row(db, EA, tenant_id, assignment_id, lock=False)
    if "sewing_line_id" in sent:
        await _owned_line(db, tenant_id, data.sewing_line_id)  # type: ignore[arg-type]
    if "shift_id" in sent:
        await ensure_owned(db, ProductionShift, data.shift_id, tenant_id, "Shift", status_code=404)
    emp = await _lock_employee(db, tenant_id, peek.employee_id)  # lock order: employee, then the assignment
    row = await _get_row(db, EA, tenant_id, assignment_id, lock=True)
    _check_version(row, data.expected_lock_version)
    if not row.is_active:
        raise _err(409, "An inactive assignment cannot be changed")
    if not emp.is_active and sent & {"sewing_line_id", "valid_from", "valid_to"}:
        raise _err(422, "The employee is not active; only end or deactivate this assignment")
    start = data.valid_from if "valid_from" in sent else row.valid_from
    end = data.valid_to if "valid_to" in sent else row.valid_to
    _check_dates(start, end)  # type: ignore[arg-type]
    other = await _overlap(db, EA, EA.employee_id, tenant_id, row.employee_id, start, end, exclude_id=row.id)  # type: ignore[arg-type]
    if other is not None:
        raise _overlap_error("employee", other)
    for name in ("sewing_line_id", "shift_id", "role", "valid_from", "valid_to"):
        if name in sent:
            setattr(row, name, getattr(data, name))
    if "notes" in sent:
        row.notes = (data.notes or "").strip() or None
    row.lock_version = int(row.lock_version or 0) + 1
    row.updated_by_user_id = user.id
    await db.flush()
    await _audit(
        db, tenant, user, "mfg_employee_line_assignment.update", f"production_employee_line_assignment:{row.id}",
        "fields=" + ",".join(sorted(sent)),
    )
    return row


async def _end_or_deactivate(
    db: AsyncSession, model: Any, owner_attr: str, lock_owner: Any, *, tenant: Tenant, user: User, assignment_id: int,
    expected_lock_version: int, valid_to: date | None, deactivate: bool, label: str, reason: str | None = None,
) -> tuple[Any, bool]:
    tenant_id = tenant.id
    peek = await _get_row(db, model, tenant_id, assignment_id, lock=False)
    await lock_owner(db, tenant_id, getattr(peek, owner_attr))
    row = await _get_row(db, model, tenant_id, assignment_id, lock=True)
    if deactivate:
        if not row.is_active:
            return row, False
        _check_version(row, expected_lock_version)
        row.is_active = False
        details = f"deactivated reason={(reason or '').strip()[:300]}"
    else:
        if row.is_active and row.valid_to == valid_to:
            return row, False  # retry of an end that already happened
        _check_version(row, expected_lock_version)
        if not row.is_active:
            raise _err(409, "An inactive assignment cannot be ended")
        _check_dates(row.valid_from, valid_to)
        if row.valid_to is not None and valid_to is not None and valid_to > row.valid_to:
            raise _err(422, "Ending can only shorten an assignment; use update to extend it")
        row.valid_to = valid_to
        details = f"valid_to={valid_to}"
    row.lock_version = int(row.lock_version or 0) + 1
    row.updated_by_user_id = user.id
    await db.flush()
    action = "deactivate" if deactivate else "end"
    await _audit(db, tenant, user, f"mfg_{label}_line_assignment.{action}", f"production_{label}_line_assignment:{row.id}", details)
    return row, True


async def end_employee_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: AssignmentEndIn
) -> tuple[ProductionEmployeeLineAssignment, bool]:
    return await _end_or_deactivate(
        db, EA, "employee_id", _lock_employee, tenant=tenant, user=user, assignment_id=assignment_id,
        expected_lock_version=data.expected_lock_version, valid_to=data.valid_to, deactivate=False, label="employee",
    )


async def deactivate_employee_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: AssignmentDeactivateIn
) -> tuple[ProductionEmployeeLineAssignment, bool]:
    return await _end_or_deactivate(
        db, EA, "employee_id", _lock_employee, tenant=tenant, user=user, assignment_id=assignment_id,
        expected_lock_version=data.expected_lock_version, valid_to=None, deactivate=True, label="employee",
        reason=data.reason,
    )


# --------------------------------------------------------------------------- machines


async def create_machine_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, data: MachineAssignmentCreate
) -> ProductionMachineLineAssignment:
    tenant_id = tenant.id
    await ensure_owned(db, DepartmentMachine, data.machine_id, tenant_id, "Machine", status_code=404)
    await _owned_line(db, tenant_id, data.sewing_line_id)
    _check_dates(data.valid_from, data.valid_to)
    machine = await _lock_machine(db, tenant_id, data.machine_id)
    if not machine.is_active:
        raise _err(422, "The machine is not active")
    other = await _overlap(db, MA, MA.machine_id, tenant_id, machine.id, data.valid_from, data.valid_to, exclude_id=None)
    if other is not None:
        raise _overlap_error("machine", other)
    row = MA(
        tenant_id=tenant_id,
        machine_id=machine.id,
        sewing_line_id=data.sewing_line_id,
        valid_from=data.valid_from,
        valid_to=data.valid_to,
        is_active=True,
        notes=(data.notes or "").strip() or None,
        lock_version=0,
        created_by_user_id=user.id,
        updated_by_user_id=user.id,
    )
    db.add(row)
    await db.flush()
    await _audit(
        db, tenant, user, "mfg_machine_line_assignment.create", f"production_machine_line_assignment:{row.id}",
        f"machine_id={row.machine_id} line_id={row.sewing_line_id} from={row.valid_from} to={row.valid_to}",
    )
    return row


async def update_machine_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: MachineAssignmentUpdate
) -> ProductionMachineLineAssignment:
    tenant_id = tenant.id
    sent = data.model_fields_set - {"expected_lock_version"}
    if not sent:
        raise _err(422, "Nothing to change")
    for name in ("sewing_line_id", "valid_from"):
        if name in sent and getattr(data, name) is None:
            raise _err(422, f"{name} cannot be empty")
    peek = await _get_row(db, MA, tenant_id, assignment_id, lock=False)
    if "sewing_line_id" in sent:
        await _owned_line(db, tenant_id, data.sewing_line_id)  # type: ignore[arg-type]
    machine = await _lock_machine(db, tenant_id, peek.machine_id)
    row = await _get_row(db, MA, tenant_id, assignment_id, lock=True)
    _check_version(row, data.expected_lock_version)
    if not row.is_active:
        raise _err(409, "An inactive assignment cannot be changed")
    if not machine.is_active and sent & {"sewing_line_id", "valid_from", "valid_to"}:
        raise _err(422, "The machine is not active; only end or deactivate this assignment")
    start = data.valid_from if "valid_from" in sent else row.valid_from
    end = data.valid_to if "valid_to" in sent else row.valid_to
    _check_dates(start, end)  # type: ignore[arg-type]
    other = await _overlap(db, MA, MA.machine_id, tenant_id, row.machine_id, start, end, exclude_id=row.id)  # type: ignore[arg-type]
    if other is not None:
        raise _overlap_error("machine", other)
    for name in ("sewing_line_id", "valid_from", "valid_to"):
        if name in sent:
            setattr(row, name, getattr(data, name))
    if "notes" in sent:
        row.notes = (data.notes or "").strip() or None
    row.lock_version = int(row.lock_version or 0) + 1
    row.updated_by_user_id = user.id
    await db.flush()
    await _audit(
        db, tenant, user, "mfg_machine_line_assignment.update", f"production_machine_line_assignment:{row.id}",
        "fields=" + ",".join(sorted(sent)),
    )
    return row


async def end_machine_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: AssignmentEndIn
) -> tuple[ProductionMachineLineAssignment, bool]:
    return await _end_or_deactivate(
        db, MA, "machine_id", _lock_machine, tenant=tenant, user=user, assignment_id=assignment_id,
        expected_lock_version=data.expected_lock_version, valid_to=data.valid_to, deactivate=False, label="machine",
    )


async def deactivate_machine_assignment(
    db: AsyncSession, *, tenant: Tenant, user: User, assignment_id: int, data: AssignmentDeactivateIn
) -> tuple[ProductionMachineLineAssignment, bool]:
    return await _end_or_deactivate(
        db, MA, "machine_id", _lock_machine, tenant=tenant, user=user, assignment_id=assignment_id,
        expected_lock_version=data.expected_lock_version, valid_to=None, deactivate=True, label="machine",
        reason=data.reason,
    )


# --------------------------------------------------------------------------- reads (lists and output)


def _active_on_conds(model: Any, active_on: date) -> list[Any]:
    return [
        model.is_active.is_(True),
        model.valid_from <= active_on,
        or_(model.valid_to.is_(None), model.valid_to >= active_on),
    ]


async def _line_codes(db: AsyncSession, tenant_id: int, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = await db.execute(
        select(SewingLine.id, SewingLine.line_code).where(SewingLine.tenant_id == tenant_id, SewingLine.id.in_(ids))
    )
    return {int(i): c for i, c in rows.all()}


def _base_out(row: Any, line_codes: dict[int, str]) -> dict[str, Any]:
    return {
        "id": row.id,
        "sewing_line_id": row.sewing_line_id,
        "line_code": line_codes.get(int(row.sewing_line_id)),
        "valid_from": row.valid_from,
        "valid_to": row.valid_to,
        "is_active": bool(row.is_active),
        "notes": row.notes,
        "lock_version": int(row.lock_version or 0),
        "created_by_user_id": row.created_by_user_id,
        "updated_by_user_id": row.updated_by_user_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def employee_assignments_out(db: AsyncSession, tenant_id: int, rows: list[Any]) -> list[dict[str, Any]]:
    """Display fields only: employee code + name (never salary, NID, phone, bank)."""
    emp_ids = {int(r.employee_id) for r in rows}
    people: dict[int, tuple[str, str]] = {}
    if emp_ids:
        for eid, code, first, last in (
            await db.execute(
                select(Employee.id, Employee.employee_code, Employee.first_name, Employee.last_name).where(
                    Employee.tenant_id == tenant_id, Employee.id.in_(emp_ids)
                )
            )
        ).all():
            people[int(eid)] = (code, " ".join(x for x in (first, last) if x).strip())
    shift_ids = {int(r.shift_id) for r in rows if r.shift_id}
    shifts: dict[int, str] = {}
    if shift_ids:
        for sid, code in (
            await db.execute(
                select(ProductionShift.id, ProductionShift.shift_code).where(
                    ProductionShift.tenant_id == tenant_id, ProductionShift.id.in_(shift_ids)
                )
            )
        ).all():
            shifts[int(sid)] = code
    line_codes = await _line_codes(db, tenant_id, {int(r.sewing_line_id) for r in rows})
    out = []
    for r in rows:
        code, name = people.get(int(r.employee_id), (None, None))
        item = _base_out(r, line_codes)
        item.update(
            {
                "employee_id": r.employee_id,
                "employee_code": code,
                "employee_name": name,
                "shift_id": r.shift_id,
                "shift_code": shifts.get(int(r.shift_id)) if r.shift_id else None,
                "role": r.role,
            }
        )
        out.append(item)
    return out


async def machine_assignments_out(db: AsyncSession, tenant_id: int, rows: list[Any]) -> list[dict[str, Any]]:
    machine_ids = {int(r.machine_id) for r in rows}
    machines: dict[int, tuple[str, str, str | None]] = {}
    if machine_ids:
        for mid, code, name, mtype in (
            await db.execute(
                select(
                    DepartmentMachine.id, DepartmentMachine.machine_code, DepartmentMachine.name,
                    DepartmentMachine.machine_type,
                ).where(DepartmentMachine.tenant_id == tenant_id, DepartmentMachine.id.in_(machine_ids))
            )
        ).all():
            machines[int(mid)] = (code, name, mtype)
    line_codes = await _line_codes(db, tenant_id, {int(r.sewing_line_id) for r in rows})
    out = []
    for r in rows:
        code, name, mtype = machines.get(int(r.machine_id), (None, None, None))
        item = _base_out(r, line_codes)
        item.update({"machine_id": r.machine_id, "machine_code": code, "machine_name": name, "machine_type": mtype})
        out.append(item)
    return out


async def list_assignments(
    db: AsyncSession,
    tenant_id: int,
    *,
    kind: str,
    sewing_line_id: int | None = None,
    owner_id: int | None = None,
    active_on: date | None = None,
    include_inactive: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    """Bounded, tenant-filtered list. `kind` = employee | machine; `owner_id` = employee_id / machine_id filter."""
    model = EA if kind == "employee" else MA
    owner_col = EA.employee_id if kind == "employee" else MA.machine_id
    limit = max(1, min(int(limit), MAX_PAGE_SIZE))
    conds: list[Any] = [model.tenant_id == tenant_id]
    if sewing_line_id is not None:
        conds.append(model.sewing_line_id == sewing_line_id)
    if owner_id is not None:
        conds.append(owner_col == owner_id)
    if active_on is not None:
        conds.extend(_active_on_conds(model, active_on))
    elif not include_inactive:
        conds.append(model.is_active.is_(True))
    total = (await db.execute(select(func.count()).select_from(model).where(*conds))).scalar_one()
    rows = list(
        (
            await db.execute(
                select(model).where(*conds).order_by(model.sewing_line_id, model.valid_from.desc(), model.id.desc())
                .limit(limit).offset(offset)
            )
        ).scalars().all()
    )
    items = await (employee_assignments_out if kind == "employee" else machine_assignments_out)(db, tenant_id, rows)
    return {"items": items, "total": int(total), "limit": limit, "offset": offset}
