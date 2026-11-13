"""People and machines on a sewing line per day from dated line assignments (read-only; Phase 2, R4).

Used by the capacity engine ONLY when the tenant flag `mfg_integrated_planning_v1` is on (callers decide).

- Operators of a line on a day = distinct active employees with an active OPERATOR assignment covering that day
  (inactive employees are left out). An assignment with a shift works that shift; one without a shift works the
  line's day pool (the same shifts Phase 1 would use).
- Today only: when attendance is recorded for at least one assigned operator, only those PRESENT, LATE or HALF_DAY
  count (counts only, no other HR data). With no attendance recorded yet the assigned count is used.
- Machines of a line on a day = active machine assignments covering that day. Machines are a separate constraint:
  they never multiply operators and never replace them.
- Only ids, dates, shift and counts are read. No salary, NID, phone or bank field is ever selected.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AttendanceEntry, DepartmentMachine, Employee
from app.models.mfg_planning import (
    ROLE_OPERATOR,
    ProductionEmployeeLineAssignment,
    ProductionMachineLineAssignment,
)

PRESENT_STATUSES = ("PRESENT", "LATE", "HALF_DAY")
MAX_ASSIGNMENT_ROWS = 50000


@dataclass
class DayStaff:
    """Operators (per shift id, None = day pool) and machines of one line on one day."""

    operators_by_shift: dict[int | None, int] = field(default_factory=dict)
    machines: int = 0
    attendance_used: bool = False
    attendance_missing: bool = False

    @property
    def operators(self) -> int:
        return sum(self.operators_by_shift.values())


@dataclass
class AssignmentStaffing:
    by_line_day: dict[tuple[int, date], DayStaff]
    notices: list[str]

    def get(self, line_id: int, day: date) -> DayStaff | None:
        return self.by_line_day.get((line_id, day))


def _covers(valid_from: date, valid_to: date | None, day: date) -> bool:
    return valid_from <= day and (valid_to is None or valid_to >= day)


async def load_assignment_staffing(
    db: AsyncSession,
    tenant_id: int,
    *,
    line_ids: list[int],
    days_by_line: dict[int, list[date]],
    today: date | None,
) -> AssignmentStaffing:
    """Batched: one query for operator assignments, one for machines, one for today's attendance."""
    notices: list[str] = []
    out: dict[tuple[int, date], DayStaff] = {}
    all_days = [d for ds in days_by_line.values() for d in ds]
    if not line_ids or not all_days:
        return AssignmentStaffing(out, notices)
    lo, hi = min(all_days), max(all_days)

    ea = ProductionEmployeeLineAssignment
    emp_rows = (
        await db.execute(
            select(ea.employee_id, ea.sewing_line_id, ea.shift_id, ea.valid_from, ea.valid_to)
            .join(Employee, (Employee.id == ea.employee_id) & (Employee.tenant_id == tenant_id))
            .where(
                ea.tenant_id == tenant_id,
                ea.sewing_line_id.in_(line_ids),
                ea.is_active.is_(True),
                ea.role == ROLE_OPERATOR,
                Employee.is_active.is_(True),
                ea.valid_from <= hi,
                or_(ea.valid_to.is_(None), ea.valid_to >= lo),
            )
            .order_by(ea.id)
            .limit(MAX_ASSIGNMENT_ROWS)
        )
    ).all()
    ma = ProductionMachineLineAssignment
    machine_rows = (
        await db.execute(
            select(ma.machine_id, ma.sewing_line_id, ma.valid_from, ma.valid_to)
            .join(DepartmentMachine, (DepartmentMachine.id == ma.machine_id) & (DepartmentMachine.tenant_id == tenant_id))
            .where(
                ma.tenant_id == tenant_id,
                ma.sewing_line_id.in_(line_ids),
                ma.is_active.is_(True),
                DepartmentMachine.is_active.is_(True),
                ma.valid_from <= hi,
                or_(ma.valid_to.is_(None), ma.valid_to >= lo),
            )
            .order_by(ma.id)
            .limit(MAX_ASSIGNMENT_ROWS)
        )
    ).all()
    if len(emp_rows) >= MAX_ASSIGNMENT_ROWS or len(machine_rows) >= MAX_ASSIGNMENT_ROWS:
        notices.append(f"ASSIGNMENTS_TRUNCATED: only the first {MAX_ASSIGNMENT_ROWS} assignments were used")

    emps_by_line: dict[int, list] = {}
    for r in emp_rows:
        emps_by_line.setdefault(int(r.sewing_line_id), []).append(r)
    machines_by_line: dict[int, list] = {}
    for r in machine_rows:
        machines_by_line.setdefault(int(r.sewing_line_id), []).append(r)

    present_today: set[int] = set()
    recorded_today: set[int] = set()
    if today is not None and lo <= today <= hi:
        today_emp_ids = {
            int(r.employee_id) for r in emp_rows if _covers(r.valid_from, r.valid_to, today)
        }
        if today_emp_ids:
            recorded = (
                await db.execute(
                    select(AttendanceEntry.employee_id, AttendanceEntry.status).where(
                        AttendanceEntry.tenant_id == tenant_id,
                        AttendanceEntry.attendance_date == today,
                        AttendanceEntry.employee_id.in_(today_emp_ids),
                    )
                )
            ).all()
            recorded_today = {int(eid) for eid, _st in recorded}
            present_today = {int(eid) for eid, st in recorded if (st or "").strip().upper() in PRESENT_STATUSES}

    for lid in line_ids:
        if lid not in emps_by_line and lid not in machines_by_line:
            continue
        for day in days_by_line.get(lid, []):
            staff = DayStaff()
            seen: set[int] = set()
            # Attendance is used per line: only when at least one of this line's operators has a record today,
            # so a line whose attendance is not entered yet never looks empty.
            line_recorded = day == today and any(
                int(r.employee_id) in recorded_today
                for r in emps_by_line.get(lid, [])
                if _covers(r.valid_from, r.valid_to, day)
            )
            for r in emps_by_line.get(lid, []):
                if not _covers(r.valid_from, r.valid_to, day) or int(r.employee_id) in seen:
                    continue
                seen.add(int(r.employee_id))
                if day == today:
                    if not line_recorded:
                        staff.attendance_missing = True
                    else:
                        staff.attendance_used = True
                        if int(r.employee_id) not in present_today:
                            continue
                key = int(r.shift_id) if r.shift_id else None
                staff.operators_by_shift[key] = staff.operators_by_shift.get(key, 0) + 1
            staff.machines = len(
                {int(r.machine_id) for r in machines_by_line.get(lid, []) if _covers(r.valid_from, r.valid_to, day)}
            )
            if seen or staff.machines:
                if seen and day == today and staff.attendance_used and not staff.operators_by_shift:
                    staff.operators_by_shift[None] = 0  # assigned, recorded, nobody present
                out[(lid, day)] = staff
    return AssignmentStaffing(out, notices)
