"""Organogram + attendance bridge (Phase 4).

Employee reporting tree with Suggested | Approved | Present columns.
Suggested comes from floor role ``designation_id`` rollups when the floor flag is on;
approved from sanctioned strength; present_today from attendance on-floor statuses.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_manpower_floor_suggested_v1_enabled
from app.models.hr import Department, Designation, Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.production import ProductionCrewRole
from app.models.tenant import Tenant
from app.modules.hr_manpower import sanctioned_service as sanc_svc
from app.modules.production import manpower_floor_service as floor_svc

# Same statuses Daily Crew uses for actual_present (crew_router._ON_FLOOR_STATUSES).
ON_FLOOR_STATUSES = ("PRESENT", "LATE", "HALF_DAY")

# Hard caps (plan).
MAX_ORG_DEPTH = 8
MAX_ORG_NODES = 500
MAX_ROOTS_PAGE = 100


async def _present_today_ids(
    db: AsyncSession, tenant_id: int, on: date, employee_ids: list[int]
) -> set[int]:
    if not employee_ids:
        return set()
    rows = (
        await db.execute(
            select(AttendanceEntry.employee_id).where(
                AttendanceEntry.tenant_id == tenant_id,
                AttendanceEntry.attendance_date == on,
                AttendanceEntry.employee_id.in_(employee_ids),
                AttendanceEntry.status.in_(ON_FLOOR_STATUSES),
            )
        )
    ).scalars().all()
    return {int(x) for x in rows}


async def _suggested_by_designation(db: AsyncSession, tenant: Tenant) -> dict[int, int]:
    """Sum floor suggested counts keyed by crew role designation_id (when floor flag on)."""
    if not is_manpower_floor_suggested_v1_enabled(tenant.feature_flags):
        return {}
    floor = await floor_svc.build_floor_suggested(db, tenant.id, limit=200, offset=0)
    out: dict[int, int] = {}
    for item in floor.get("items") or []:
        for role in item.get("roles") or []:
            desig = role.get("designation_id")
            if desig is None:
                continue
            out[int(desig)] = out.get(int(desig), 0) + int(role.get("suggested_count") or 0)
    # Also include roles that have designation but zero count from template gaps —
    # still useful as keys. Counts already summed.
    roles = list(
        (
            await db.execute(
                select(ProductionCrewRole).where(
                    ProductionCrewRole.tenant_id == tenant.id,
                    ProductionCrewRole.is_active.is_(True),
                    ProductionCrewRole.designation_id.is_not(None),
                )
            )
        ).scalars().all()
    )
    for r in roles:
        out.setdefault(int(r.designation_id), 0)  # type: ignore[arg-type]
    return out


async def _approved_by_cell(
    db: AsyncSession, tenant_id: int, on: date
) -> dict[tuple[int, int], int]:
    rows = await sanc_svc.list_sanctioned(db, tenant_id, as_of=on, limit=500, offset=0)
    return {
        (int(r.department_id), int(r.designation_id)): int(r.approved_quota)
        for r in rows
    }


async def build_organogram(
    db: AsyncSession,
    tenant: Tenant,
    *,
    on: date,
    root_offset: int = 0,
    root_limit: int = 50,
) -> dict[str, Any]:
    if root_limit < 1 or root_limit > MAX_ROOTS_PAGE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"root_limit must be 1..{MAX_ROOTS_PAGE}",
        )
    employees = list(
        (
            await db.execute(
                select(Employee).where(
                    Employee.tenant_id == tenant.id,
                    Employee.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    by_id = {int(e.id): e for e in employees}
    # Drop reporting edges that point outside this tenant's active set (cross-tenant / inactive).
    children: dict[int | None, list[Employee]] = {}
    for e in employees:
        mgr = e.reporting_manager_id
        if mgr is not None and int(mgr) not in by_id:
            mgr = None
        children.setdefault(mgr, []).append(e)

    for bucket in children.values():
        bucket.sort(key=lambda x: ((x.employee_code or ""), int(x.id)))

    roots = children.get(None, [])
    total_roots = len(roots)
    page_roots = roots[root_offset : root_offset + root_limit]

    suggested = await _suggested_by_designation(db, tenant)
    approved = await _approved_by_cell(db, tenant.id, on)
    all_ids = [int(e.id) for e in employees]
    present_ids = await _present_today_ids(db, tenant.id, on, all_ids)

    dept_names: dict[int, str] = {}
    desig_titles: dict[int, str] = {}
    dept_ids = {int(e.department_id) for e in employees if e.department_id}
    desig_ids = {int(e.designation_id) for e in employees if e.designation_id}
    if dept_ids:
        for d in (
            await db.execute(select(Department).where(Department.tenant_id == tenant.id, Department.id.in_(dept_ids)))
        ).scalars().all():
            dept_names[int(d.id)] = d.name
    if desig_ids:
        for d in (
            await db.execute(select(Designation).where(Designation.tenant_id == tenant.id, Designation.id.in_(desig_ids)))
        ).scalars().all():
            desig_titles[int(d.id)] = d.title

    nodes_emitted = 0
    truncated = False

    def node_payload(e: Employee, depth: int) -> dict[str, Any]:
        dept_id = int(e.department_id) if e.department_id else None
        desig_id = int(e.designation_id) if e.designation_id else None
        cell_approved = (
            approved.get((dept_id, desig_id)) if dept_id is not None and desig_id is not None else None
        )
        return {
            "employee_id": int(e.id),
            "employee_code": e.employee_code,
            "name": f"{e.first_name or ''} {e.last_name or ''}".strip() or e.employee_code,
            "department_id": dept_id,
            "department_name": dept_names.get(dept_id) if dept_id else None,
            "designation_id": desig_id,
            "designation_title": desig_titles.get(desig_id) if desig_id else None,
            "depth": depth,
            "suggested": suggested.get(desig_id, None) if desig_id else None,
            "approved_quota": cell_approved,
            "present_standing": True,
            "present_today": int(e.id) in present_ids,
            "children": [],
        }

    def walk(e: Employee, depth: int) -> dict[str, Any] | None:
        nonlocal nodes_emitted, truncated
        if nodes_emitted >= MAX_ORG_NODES:
            truncated = True
            return None
        if depth > MAX_ORG_DEPTH:
            truncated = True
            return None
        nodes_emitted += 1
        payload = node_payload(e, depth)
        if depth < MAX_ORG_DEPTH:
            for child in children.get(int(e.id), []):
                if nodes_emitted >= MAX_ORG_NODES:
                    truncated = True
                    break
                child_node = walk(child, depth + 1)
                if child_node is not None:
                    payload["children"].append(child_node)
        return payload

    tree = []
    for r in page_roots:
        n = walk(r, 0)
        if n is not None:
            tree.append(n)
        if truncated:
            break

    return {
        "date": on.isoformat(),
        "roots": tree,
        "root_offset": root_offset,
        "root_limit": root_limit,
        "total_roots": total_roots,
        "nodes_returned": nodes_emitted,
        "max_depth": MAX_ORG_DEPTH,
        "max_nodes": MAX_ORG_NODES,
        "truncated": truncated,
    }


async def attendance_bridge(
    db: AsyncSession, tenant_id: int, *, on: date
) -> dict[str, Any]:
    """Thin aggregate: standing active headcount vs on-floor present for a date."""
    standing = int(
        (
            await db.execute(
                select(func.count()).select_from(Employee).where(
                    Employee.tenant_id == tenant_id,
                    Employee.is_active.is_(True),
                )
            )
        ).scalar_one()
    )
    present = int(
        (
            await db.execute(
                select(func.count(func.distinct(AttendanceEntry.employee_id)))
                .select_from(AttendanceEntry)
                .join(Employee, Employee.id == AttendanceEntry.employee_id)
                .where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.attendance_date == on,
                    AttendanceEntry.status.in_(ON_FLOOR_STATUSES),
                    Employee.tenant_id == tenant_id,
                    Employee.is_active.is_(True),
                )
            )
        ).scalar_one()
    )
    return {
        "date": on.isoformat(),
        "standing_active": standing,
        "present_today": present,
        "absent_or_unmarked": max(0, standing - present),
        "on_floor_statuses": list(ON_FLOOR_STATUSES),
    }
