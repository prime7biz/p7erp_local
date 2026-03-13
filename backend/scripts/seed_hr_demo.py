"""
HR core seed (idempotent) for P7 ERP.

Run from backend dir:
  python scripts/seed_hr_demo.py
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import Department, Designation, Employee, Tenant


async def _get_tenant(db: AsyncSession) -> Tenant:
    by_code = (
        await db.execute(
            select(Tenant).where(Tenant.company_code.is_not(None)).order_by(Tenant.id.asc())
        )
    ).scalars().all()
    for tenant in by_code:
        code = (tenant.company_code or "").upper()
        if "LAKHSMA" in code:
            return tenant
    first = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalars().first()
    if not first:
        raise RuntimeError("No tenant found. Seed tenant first.")
    return first


async def _upsert_department(
    db: AsyncSession,
    tenant_id: int,
    code: str,
    name: str,
    description: str | None = None,
    is_active: bool = True,
) -> Department:
    row = (
        await db.execute(
            select(Department).where(
                Department.tenant_id == tenant_id,
                Department.code == code,
            )
        )
    ).scalars().first()
    if row:
        row.name = name
        row.description = description
        row.is_active = is_active
        return row
    row = Department(
        tenant_id=tenant_id,
        code=code,
        name=name,
        description=description,
        is_active=is_active,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_designation(
    db: AsyncSession,
    tenant_id: int,
    code: str,
    title: str,
    department_id: int | None = None,
    description: str | None = None,
    is_active: bool = True,
) -> Designation:
    row = (
        await db.execute(
            select(Designation).where(
                Designation.tenant_id == tenant_id,
                Designation.code == code,
            )
        )
    ).scalars().first()
    if row:
        row.title = title
        row.department_id = department_id
        row.description = description
        row.is_active = is_active
        return row
    row = Designation(
        tenant_id=tenant_id,
        code=code,
        title=title,
        department_id=department_id,
        description=description,
        is_active=is_active,
    )
    db.add(row)
    await db.flush()
    return row


async def _upsert_employee(
    db: AsyncSession,
    tenant_id: int,
    employee_code: str,
    first_name: str,
    last_name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    joining_date: date | None = None,
    department_id: int | None = None,
    designation_id: int | None = None,
    reporting_manager_id: int | None = None,
    is_active: bool = True,
) -> Employee:
    row = (
        await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant_id,
                Employee.employee_code == employee_code,
            )
        )
    ).scalars().first()
    if row:
        row.first_name = first_name
        row.last_name = last_name
        row.email = email
        row.phone = phone
        row.joining_date = joining_date
        row.department_id = department_id
        row.designation_id = designation_id
        row.reporting_manager_id = reporting_manager_id
        row.is_active = is_active
        return row
    row = Employee(
        tenant_id=tenant_id,
        employee_code=employee_code,
        first_name=first_name,
        last_name=last_name,
        email=email,
        phone=phone,
        joining_date=joining_date,
        department_id=department_id,
        designation_id=designation_id,
        reporting_manager_id=reporting_manager_id,
        is_active=is_active,
    )
    db.add(row)
    await db.flush()
    return row


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _get_tenant(db)

        # Departments
        merch = await _upsert_department(
            db,
            tenant.id,
            code="D-MERCH",
            name="Merchandising",
            description="Merchandising and order coordination",
        )
        prod = await _upsert_department(
            db,
            tenant.id,
            code="D-PROD",
            name="Production",
            description="Production planning and operations",
        )
        hr_dept = await _upsert_department(
            db,
            tenant.id,
            code="D-HR",
            name="Human Resources",
            description="HR operations and administration",
        )

        # Designations
        hr_mgr = await _upsert_designation(
            db,
            tenant.id,
            code="DS-HRM",
            title="HR Manager",
            department_id=hr_dept.id,
        )
        merch_exec = await _upsert_designation(
            db,
            tenant.id,
            code="DS-MEX",
            title="Merchandiser",
            department_id=merch.id,
        )
        prod_sup = await _upsert_designation(
            db,
            tenant.id,
            code="DS-PSU",
            title="Production Supervisor",
            department_id=prod.id,
        )

        # Employees (insert manager first, then team members)
        manager = await _upsert_employee(
            db,
            tenant.id,
            employee_code="EMP-0001",
            first_name="Nusrat",
            last_name="Jahan",
            email="nusrat.hr@p7.local",
            phone="+8801700000001",
            joining_date=date(2024, 1, 5),
            department_id=hr_dept.id,
            designation_id=hr_mgr.id,
            reporting_manager_id=None,
            is_active=True,
        )
        await _upsert_employee(
            db,
            tenant.id,
            employee_code="EMP-0002",
            first_name="Arif",
            last_name="Hossain",
            email="arif.merch@p7.local",
            phone="+8801700000002",
            joining_date=date(2024, 2, 10),
            department_id=merch.id,
            designation_id=merch_exec.id,
            reporting_manager_id=manager.id,
            is_active=True,
        )
        await _upsert_employee(
            db,
            tenant.id,
            employee_code="EMP-0003",
            first_name="Sadia",
            last_name="Rahman",
            email="sadia.prod@p7.local",
            phone="+8801700000003",
            joining_date=date(2024, 3, 12),
            department_id=prod.id,
            designation_id=prod_sup.id,
            reporting_manager_id=manager.id,
            is_active=True,
        )

        await db.commit()

        company_code = tenant.company_code or f"TENANT-{tenant.id}"
        print("HR seed complete.")
        print(f"Tenant: {tenant.name} ({company_code})")
        print("Seeded entities:")
        print("- hr_departments")
        print("- hr_designations")
        print("- hr_employees")


if __name__ == "__main__":
    asyncio.run(main())

