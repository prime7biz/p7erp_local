"""HR domain services: org sections, employee documents, import/export."""

from __future__ import annotations

import asyncio
import io
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import safe_async_session_rollback

from app.common.codegen import next_tenant_code
from app.models import Department, Designation, Employee, EmployeeDocument, EmployeeStatusHistory, HrSection, Tenant, User


async def next_section_code(db: AsyncSession, tenant_id: int) -> str:
    return await next_tenant_code(db, model=HrSection, tenant_id=tenant_id, prefix="SEC-", width=4)


async def get_section_or_404(db: AsyncSession, tenant_id: int, section_id: int) -> HrSection:
    row = await db.get(HrSection, section_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
    return row


def section_to_dict(row: HrSection) -> dict[str, Any]:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "code": row.code,
        "name": row.name,
        "section_type": row.section_type,
        "parent_section_id": row.parent_section_id,
        "department_id": row.department_id,
        "head_employee_id": row.head_employee_id,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


EMPLOYEE_IMPORT_MAX_BYTES = 5 * 1024 * 1024

EMPLOYEE_EXCEL_HEADERS = [
    "employee_code",
    "first_name",
    "last_name",
    "email",
    "phone",
    "department_id",
    "designation_id",
    "section_id",
    "employee_category",
    "joining_date",
    "employment_type",
    "is_active",
    "date_of_birth",
]


async def export_employees_excel(db: AsyncSession, tenant_id: int) -> bytes:
    result = await db.execute(
        select(
            Employee.employee_code,
            Employee.first_name,
            Employee.last_name,
            Employee.email,
            Employee.phone,
            Employee.department_id,
            Employee.designation_id,
            Employee.section_id,
            Employee.employee_category,
            Employee.joining_date,
            Employee.employment_type,
            Employee.is_active,
            Employee.date_of_birth,
        )
        .where(Employee.tenant_id == tenant_id)
        .order_by(Employee.employee_code)
    )
    rows = [
        [
            emp.employee_code,
            emp.first_name,
            emp.last_name or "",
            emp.email or "",
            emp.phone or "",
            emp.department_id or "",
            emp.designation_id or "",
            emp.section_id or "",
            emp.employee_category or "",
            emp.joining_date.isoformat() if emp.joining_date else "",
            emp.employment_type or "",
            "Y" if emp.is_active else "N",
            emp.date_of_birth.isoformat() if emp.date_of_birth else "",
        ]
        for emp in result.all()
    ]
    return await asyncio.to_thread(_build_employees_xlsx, rows)


def _build_employees_xlsx(rows: list[list[Any]]) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Employees"
    ws.append(EMPLOYEE_EXCEL_HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _read_employee_rows(raw: bytes) -> list[tuple]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    ws = wb.active
    return list(ws.iter_rows(min_row=2, values_only=True))


def _id_cell(row: tuple, index: int) -> int | None:
    """Best-effort int from an id column, used only to preload lookups (bad cells give None)."""
    try:
        value = row[index]
        if value in (None, ""):
            return None
        number = int(value)
    except (IndexError, TypeError, ValueError):
        return None
    return number if 0 < number < 2**31 else None


async def _valid_ids(db: AsyncSession, model: Any, tenant_id: int, rows: list[tuple], index: int) -> set[int]:
    """Ids in one spreadsheet column that exist for this tenant (one query for the whole file)."""
    ids = {_id_cell(row, index) for row in rows if row} - {None}
    if not ids:
        return set()
    result = await db.execute(select(model.id).where(model.tenant_id == tenant_id, model.id.in_(ids)))
    return set(result.scalars().all())


def _parse_excel_date(raw: Any) -> date | None:
    if raw in (None, ""):
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    from datetime import datetime as dtmod

    try:
        return dtmod.fromisoformat(str(raw)[:10]).date()
    except ValueError:
        return None


async def import_employees_excel(db: AsyncSession, tenant: Tenant, user: User, file: UploadFile) -> dict[str, Any]:
    from app.common.tenant_feature_keys import is_age_verification_required
    from app.modules.hr_compliance.service import assert_dob_allowed

    age_required = is_age_verification_required(tenant.feature_flags)
    raw = await file.read(EMPLOYEE_IMPORT_MAX_BYTES + 1)
    if len(raw) > EMPLOYEE_IMPORT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large (max {EMPLOYEE_IMPORT_MAX_BYTES // (1024 * 1024)} MB). Split it into smaller files.",
        )
    rows = await asyncio.to_thread(_read_employee_rows, raw)

    # Load every lookup once instead of once per row.
    codes = {str(row[0] or "").strip() for row in rows if row and any(row)} - {""}
    existing_by_code: dict[str, Employee] = {}
    code_list = sorted(codes)
    for start in range(0, len(code_list), 5000):
        result = await db.execute(
            select(Employee).where(
                Employee.tenant_id == tenant.id,
                Employee.employee_code.in_(code_list[start : start + 5000]),
            )
        )
        existing_by_code.update({e.employee_code: e for e in result.scalars().all()})
    valid_dept_ids = await _valid_ids(db, Department, tenant.id, rows, 5)
    valid_desig_ids = await _valid_ids(db, Designation, tenant.id, rows, 6)
    valid_sec_ids = await _valid_ids(db, HrSection, tenant.id, rows, 7)

    created = 0
    updated = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=2):
        if not row or not any(row):
            continue
        try:
            code = str(row[0] or "").strip()
            if not code:
                errors.append(f"Row {idx}: missing employee_code")
                continue
            first_name = str(row[1] or "").strip()
            if not first_name:
                errors.append(f"Row {idx}: missing first_name")
                continue
            existing = existing_by_code.get(code)
            dept_id = int(row[5]) if row[5] not in (None, "") else None
            desig_id = int(row[6]) if row[6] not in (None, "") else None
            sec_id = int(row[7]) if row[7] not in (None, "") else None
            if dept_id not in valid_dept_ids:
                dept_id = None
            if desig_id not in valid_desig_ids:
                desig_id = None
            if sec_id not in valid_sec_ids:
                sec_id = None
            cat = str(row[8] or "").strip() or None
            join_date = _parse_excel_date(row[9] if len(row) > 9 else None)
            emp_type = str(row[10] or "").strip() or None if len(row) > 10 else None
            active = str(row[11] or "Y").upper() in {"Y", "YES", "TRUE", "1"} if len(row) > 11 else True
            dob_raw = row[12] if len(row) > 12 else None
            dob = _parse_excel_date(dob_raw)

            if existing:
                dob_for_gate = dob if dob is not None else existing.date_of_birth
                try:
                    assert_dob_allowed(dob_for_gate, required=age_required)
                except HTTPException as he:
                    errors.append(f"Row {idx}: {he.detail}")
                    continue
                existing.first_name = first_name
                existing.last_name = str(row[2] or "").strip() or None
                existing.email = str(row[3] or "").strip() or None
                existing.phone = str(row[4] or "").strip() or None
                existing.department_id = dept_id
                existing.designation_id = desig_id
                existing.section_id = sec_id
                existing.employee_category = cat
                existing.joining_date = join_date
                existing.employment_type = emp_type
                existing.is_active = active
                if dob is not None:
                    existing.date_of_birth = dob
                updated += 1
            else:
                try:
                    assert_dob_allowed(dob, required=age_required)
                except HTTPException as he:
                    errors.append(f"Row {idx}: {he.detail}")
                    continue
                db.add(
                    Employee(
                        tenant_id=tenant.id,
                        employee_code=code,
                        first_name=first_name,
                        last_name=str(row[2] or "").strip() or None,
                        email=str(row[3] or "").strip() or None,
                        phone=str(row[4] or "").strip() or None,
                        department_id=dept_id,
                        designation_id=desig_id,
                        section_id=sec_id,
                        employee_category=cat,
                        joining_date=join_date,
                        employment_type=emp_type,
                        is_active=active,
                        date_of_birth=dob,
                    )
                )
                created += 1
        except Exception as e:  # noqa: BLE001
            errors.append(f"Row {idx}: {e!s}")
    try:
        await db.commit()
    except IntegrityError as e:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail=f"Import failed: {e!s}") from e
    return {"created": created, "updated": updated, "errors": errors[:50]}
