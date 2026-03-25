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
        # Production crew role filters (must match crew_router seed titles exactly)
        des_line_incharge = await _upsert_designation(
            db, tenant.id, code="DS-LIC", title="Line Incharge", department_id=prod.id
        )
        des_sew_op = await _upsert_designation(
            db, tenant.id, code="DS-SOP", title="Sewing Operator", department_id=prod.id
        )
        des_sew_hp = await _upsert_designation(
            db, tenant.id, code="DS-SHP", title="Sewing Helper", department_id=prod.id
        )
        des_qc = await _upsert_designation(
            db, tenant.id, code="DS-QCI", title="Quality Inspector", department_id=prod.id
        )
        des_iron = await _upsert_designation(
            db, tenant.id, code="DS-IRM", title="Iron Man", department_id=prod.id
        )
        des_fqc = await _upsert_designation(
            db, tenant.id, code="DS-FQC", title="Final QC", department_id=prod.id
        )
        des_fold = await _upsert_designation(
            db, tenant.id, code="DS-FLD", title="Folding Man", department_id=prod.id
        )
        des_pack = await _upsert_designation(
            db, tenant.id, code="DS-PCK", title="Packing Man", department_id=prod.id
        )
        des_supervisor = await _upsert_designation(
            db, tenant.id, code="DS-SUP", title="Supervisor", department_id=prod.id
        )
        des_mach_op = await _upsert_designation(
            db, tenant.id, code="DS-MOP", title="Machine Operator", department_id=prod.id
        )
        des_helper = await _upsert_designation(
            db, tenant.id, code="DS-HLP", title="Helper", department_id=prod.id
        )
        des_operator = await _upsert_designation(
            db, tenant.id, code="DS-OPR", title="Operator", department_id=prod.id
        )
        des_lab = await _upsert_designation(
            db, tenant.id, code="DS-LAB", title="Lab Technician", department_id=prod.id
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
        # Sample production floor staff (for crew pickers / demos)
        await _upsert_employee(
            db, tenant.id, "EMP-0004", "Kamal", "Hossain", "kamal.line1@p7.local", "+8801700000004",
            date(2024, 4, 1), prod.id, des_line_incharge.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0005", "Rashida", "Begum", "rashida.line2@p7.local", "+8801700000005",
            date(2024, 4, 1), prod.id, des_line_incharge.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0006", "Jamal", "Uddin", "jamal.op@p7.local", "+8801700000006",
            date(2024, 4, 5), prod.id, des_sew_op.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0007", "Fatema", "Akter", "fatema.op@p7.local", "+8801700000007",
            date(2024, 4, 5), prod.id, des_sew_op.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0008", "Abdul", "Karim", "abdul.help@p7.local", "+8801700000008",
            date(2024, 4, 10), prod.id, des_sew_hp.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0009", "Nasrin", "Sultana", "nasrin.qc@p7.local", "+8801700000009",
            date(2024, 4, 10), prod.id, des_qc.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0010", "Shahid", "Alam", "shahid.iron@p7.local", "+8801700000010",
            date(2024, 5, 1), prod.id, des_iron.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0011", "Mina", "Khatun", "mina.fold@p7.local", "+8801700000011",
            date(2024, 5, 1), prod.id, des_fold.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0012", "Rafiq", "Islam", "rafiq.pack@p7.local", "+8801700000012",
            date(2024, 5, 1), prod.id, des_pack.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0013", "Unit", "Supervisor", "unit.sup@p7.local", "+8801700000013",
            date(2024, 5, 15), prod.id, des_supervisor.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0014", "Machine", "Op One", "mach.op@p7.local", "+8801700000014",
            date(2024, 5, 15), prod.id, des_mach_op.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0015", "Helper", "One", "helper.one@p7.local", "+8801700000015",
            date(2024, 5, 15), prod.id, des_helper.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0016", "Lab", "Tech", "lab.tech@p7.local", "+8801700000016",
            date(2024, 5, 20), prod.id, des_lab.id, None, True,
        )
        await _upsert_employee(
            db, tenant.id, "EMP-0017", "Dye", "Operator", "dye.op@p7.local", "+8801700000017",
            date(2024, 5, 20), prod.id, des_operator.id, None, True,
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

