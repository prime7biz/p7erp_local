"""Daily attendance aggregate for Manpower hub (Phase 4)."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Department, Employee, HrSection
from app.models.hr_attendance import AttendanceEntry
from app.models.production import LineCrewDaily, SewingLine
from app.modules.hr_manpower.organogram_service import ON_FLOOR_STATUSES

GroupBy = Literal["department", "section", "line", "category"]


async def build_daily_attendance(
    db: AsyncSession,
    tenant_id: int,
    *,
    on: date,
    group_by: GroupBy = "department",
) -> dict[str, Any]:
    if group_by not in ("department", "section", "line", "category"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="group_by must be department, section, line, or category",
        )

    employees = list(
        (
            await db.execute(
                select(Employee).where(
                    Employee.tenant_id == tenant_id,
                    Employee.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    emp_ids = [int(e.id) for e in employees]
    standing_by_group: dict[str, int] = {}
    emp_group: dict[int, str] = {}

    def _key(label: str | None) -> str:
        return label if label and label.strip() else "Unmapped"

    if group_by == "department":
        names: dict[int, str] = {}
        ids = {int(e.department_id) for e in employees if e.department_id}
        if ids:
            for d in (
                await db.execute(
                    select(Department).where(Department.tenant_id == tenant_id, Department.id.in_(ids))
                )
            ).scalars().all():
                names[int(d.id)] = d.name
        for e in employees:
            label = names.get(int(e.department_id)) if e.department_id else None
            k = _key(label)
            emp_group[int(e.id)] = k
            standing_by_group[k] = standing_by_group.get(k, 0) + 1
    elif group_by == "section":
        names = {}
        ids = {int(e.section_id) for e in employees if e.section_id}
        if ids:
            for s in (
                await db.execute(
                    select(HrSection).where(HrSection.tenant_id == tenant_id, HrSection.id.in_(ids))
                )
            ).scalars().all():
                names[int(s.id)] = s.name
        for e in employees:
            label = names.get(int(e.section_id)) if e.section_id else None
            k = _key(label)
            emp_group[int(e.id)] = k
            standing_by_group[k] = standing_by_group.get(k, 0) + 1
    elif group_by == "category":
        for e in employees:
            k = _key(e.employee_category)
            emp_group[int(e.id)] = k
            standing_by_group[k] = standing_by_group.get(k, 0) + 1
    else:  # line — employees linked via named LineCrewDaily for that date
        line_names: dict[int, str] = {}
        for line in (
            await db.execute(select(SewingLine).where(SewingLine.tenant_id == tenant_id))
        ).scalars().all():
            line_names[int(line.id)] = f"{line.line_code} — {line.name}"
        daily_rows = list(
            (
                await db.execute(
                    select(LineCrewDaily).where(
                        LineCrewDaily.tenant_id == tenant_id,
                        LineCrewDaily.production_date == on,
                        LineCrewDaily.employee_id.is_not(None),
                    )
                )
            ).scalars().all()
        )
        assigned: set[int] = set()
        for row in daily_rows:
            eid = int(row.employee_id)  # type: ignore[arg-type]
            if eid not in emp_ids:
                continue
            k = _key(line_names.get(int(row.sewing_line_id)))
            emp_group[eid] = k
            assigned.add(eid)
        for e in employees:
            if int(e.id) not in assigned:
                emp_group[int(e.id)] = "Unmapped"
        for eid, k in emp_group.items():
            standing_by_group[k] = standing_by_group.get(k, 0) + 1

    attendance: dict[int, str] = {}
    if emp_ids:
        for eid, st in (
            await db.execute(
                select(AttendanceEntry.employee_id, AttendanceEntry.status).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.attendance_date == on,
                    AttendanceEntry.employee_id.in_(emp_ids),
                )
            )
        ).all():
            attendance[int(eid)] = (st or "").strip().upper()

    groups: dict[str, dict[str, int]] = {}
    for k in standing_by_group:
        groups[k] = {
            "standing": standing_by_group[k],
            "present": 0,
            "late": 0,
            "half_day": 0,
            "absent": 0,
            "leave": 0,
            "not_marked": 0,
            "on_floor": 0,
        }

    for e in employees:
        k = emp_group[int(e.id)]
        bucket = groups[k]
        st = attendance.get(int(e.id))
        if st is None or st == "":
            bucket["not_marked"] += 1
        elif st == "PRESENT":
            bucket["present"] += 1
        elif st == "LATE":
            bucket["late"] += 1
        elif st == "HALF_DAY":
            bucket["half_day"] += 1
        elif st == "ABSENT":
            bucket["absent"] += 1
        elif st == "LEAVE":
            bucket["leave"] += 1
        else:
            bucket["not_marked"] += 1
        if st in ON_FLOOR_STATUSES:
            bucket["on_floor"] += 1

    rows = []
    for name in sorted(groups.keys(), key=lambda x: (x == "Unmapped", x.lower())):
        g = groups[name]
        standing = g["standing"]
        absent_pct = None
        if standing > 0:
            # Absent % vs standing: ABSENT + not marked (common shop-floor view).
            absent_like = g["absent"] + g["not_marked"]
            absent_pct = round(100.0 * absent_like / standing, 2)
        rows.append(
            {
                "group_key": name,
                "standing": standing,
                "present": g["present"],
                "late": g["late"],
                "half_day": g["half_day"],
                "absent": g["absent"],
                "leave": g["leave"],
                "not_marked": g["not_marked"],
                "on_floor": g["on_floor"],
                "absent_pct": absent_pct,
            }
        )

    return {
        "date": on.isoformat(),
        "group_by": group_by,
        "rows": rows,
        "totals": {
            "standing": sum(r["standing"] for r in rows),
            "present": sum(r["present"] for r in rows),
            "late": sum(r["late"] for r in rows),
            "half_day": sum(r["half_day"] for r in rows),
            "absent": sum(r["absent"] for r in rows),
            "leave": sum(r["leave"] for r in rows),
            "not_marked": sum(r["not_marked"] for r in rows),
            "on_floor": sum(r["on_floor"] for r in rows),
        },
    }
