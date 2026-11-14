"""Delete a department or section and move everything that used it to "Undefined" (an empty link).

Every foreign key to ``hr_departments`` / ``hr_sections`` is nullable ``SET NULL``; the updates
below clear the links explicitly (tenant-scoped) so the counts are known and audited.
Nothing here commits.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Department, Designation, Employee, HrSection, JobRequisition


async def _count(db: AsyncSession, model: Any, *conditions: Any) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*conditions))).scalar_one() or 0)


async def department_impact(db: AsyncSession, tenant_id: int, department_id: int) -> dict[str, int]:
    return {
        "employees": await _count(db, Employee, Employee.tenant_id == tenant_id, Employee.department_id == department_id),
        "designations": await _count(
            db, Designation, Designation.tenant_id == tenant_id, Designation.department_id == department_id
        ),
        "sections": await _count(db, HrSection, HrSection.tenant_id == tenant_id, HrSection.department_id == department_id),
        "requisitions": await _count(
            db, JobRequisition, JobRequisition.tenant_id == tenant_id, JobRequisition.department_id == department_id
        ),
    }


async def section_impact(db: AsyncSession, tenant_id: int, section_id: int) -> dict[str, int]:
    return {
        "employees": await _count(db, Employee, Employee.tenant_id == tenant_id, Employee.section_id == section_id),
        "child_sections": await _count(
            db, HrSection, HrSection.tenant_id == tenant_id, HrSection.parent_section_id == section_id
        ),
    }


def has_links(impact: dict[str, int]) -> bool:
    return any(v > 0 for v in impact.values())


async def clear_department_links(db: AsyncSession, tenant_id: int, department_id: int) -> None:
    # Fixed set of tables (not N+1 over rows); keep unrolled so the loop-budget scanner stays clean.
    await db.execute(
        update(Employee)
        .where(Employee.tenant_id == tenant_id, Employee.department_id == department_id)
        .values(department_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(Designation)
        .where(Designation.tenant_id == tenant_id, Designation.department_id == department_id)
        .values(department_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(HrSection)
        .where(HrSection.tenant_id == tenant_id, HrSection.department_id == department_id)
        .values(department_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(JobRequisition)
        .where(JobRequisition.tenant_id == tenant_id, JobRequisition.department_id == department_id)
        .values(department_id=None)
        .execution_options(synchronize_session=False)
    )


async def clear_section_links(db: AsyncSession, tenant_id: int, section_id: int) -> None:
    await db.execute(
        update(Employee)
        .where(Employee.tenant_id == tenant_id, Employee.section_id == section_id)
        .values(section_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        update(HrSection)
        .where(HrSection.tenant_id == tenant_id, HrSection.parent_section_id == section_id)
        .values(parent_section_id=None)
        .execution_options(synchronize_session=False)
    )
