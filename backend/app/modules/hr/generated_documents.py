"""Signed, versioned appointment letters and job descriptions (``hr_generated_employee_documents``).

The PDF is always rendered from the stored snapshot, never from live data, so a printed letter
keeps meaning what it said. The snapshot is signed on insert (``apply_document_signature``) and the
database trigger from migration 289 refuses any later UPDATE / DELETE.

* Generating again without ``reissue`` returns the latest version (``outdated`` tells the caller the
  employee data has changed since).
* ``reissue`` creates the next version with a new ``VFY-...`` id; older versions stay verifiable.
* A ``request_id`` makes generation idempotent (replay returns the same row).

Public verification shows only document type / number / date, employee initials + code, company and
valid / invalid - never salary, bank, address, NID or any other snapshot field.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.document_signature import apply_document_signature, compute_signature_hash, new_verification_id
from app.common.orm_numeric import api_money_to_decimal
from app.config import get_settings
from app.models import HrSection, Tenant
from app.models.hr import Department, Designation, Employee
from app.models.hr_onboarding import HrGeneratedEmployeeDocument
from app.models.hr_payroll import PayrollComponent, PayrollStructureLine
from app.modules.document_verify.schemas import PublicDocumentVerification
from app.modules.hr.employee_service import EmployeeFieldAccess
from app.modules.hr_payroll import compensation_service as comp

SNAPSHOT_SCHEMA = "hr-document-v1"
SNAPSHOT_SCHEMA_VERSION = 1
DOCUMENT_LABELS = {"APPOINTMENT_LETTER": "Appointment letter", "JOB_DESCRIPTION": "Job description"}
NUMBER_PREFIX = {"APPOINTMENT_LETTER": "AL", "JOB_DESCRIPTION": "JD"}


def verify_url(verification_id: str) -> str:
    return f"{get_settings().frontend_url.rstrip('/')}/verify/document/{verification_id}"


def document_number(row: HrGeneratedEmployeeDocument, employee_code: str) -> str:
    return f"{NUMBER_PREFIX[row.document_type]}-{employee_code}-V{row.document_version}"


def _money(value: Decimal) -> str:
    return f"{Decimal(value).quantize(Decimal('0.01')):.2f}"


def _name(emp: Employee | None) -> str | None:
    return " ".join(p for p in (emp.first_name, emp.last_name) if p) if emp else None


def _address(emp: Employee, prefix: str) -> str | None:
    parts = [getattr(emp, f"{prefix}_{f}") for f in ("address_line", "city", "district", "postal_code", "country")]
    text = ", ".join(p for p in parts if p)
    return text or None


def initials(display_name: str) -> str:
    return "".join(f"{w[0].upper()}." for w in display_name.split() if w)[:12]


async def _labels(db: AsyncSession, tenant_id: int, emp: Employee) -> dict:
    async def owned(model, row_id):
        if row_id is None:
            return None
        row = await db.get(model, row_id)
        return row if row is not None and row.tenant_id == tenant_id else None

    dept = await owned(Department, emp.department_id)
    desig = await owned(Designation, emp.designation_id)
    section = await owned(HrSection, emp.section_id)
    manager = await owned(Employee, emp.reporting_manager_id)
    return {"dept": dept, "desig": desig, "section": section, "manager": manager}


async def _salary(db: AsyncSession, tenant: Tenant, emp: Employee) -> dict | None:
    """Itemised monthly earnings with the payroll semantics of ``structure_gross``."""
    from app.modules.hr_payroll.payroll_calculation_service import resolve_assignment

    as_of = max(today_local(tenant), emp.joining_date) if emp.joining_date else today_local(tenant)
    asgn = await resolve_assignment(db, tenant_id=tenant.id, employee_id=emp.id, as_of=as_of)
    if asgn is None:
        return None
    basic = api_money_to_decimal(asgn.base_salary) if asgn.base_salary is not None else Decimal("0")
    lines = (
        await db.execute(
            select(PayrollStructureLine, PayrollComponent)
            .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
            .where(PayrollStructureLine.tenant_id == tenant.id, PayrollStructureLine.structure_id == asgn.structure_id)
            .order_by(PayrollStructureLine.id)
        )
    ).all()
    components, gross = [], Decimal("0")
    for line, component in lines:
        if (component.component_type or "").upper() == "DEDUCTION":
            continue
        amount = api_money_to_decimal(line.amount)
        calc = (component.calculation_type or "FIXED").upper()
        if calc == "PERCENT_OF_BASE":
            value = basic * amount / Decimal("100")
        elif calc == "FIXED":
            value = amount
        else:
            continue
        gross += value
        components.append({"name": component.name, "amount": _money(value)})
    _wage_row, rate = await comp.wage_rate_in_force(db, tenant.id, emp.id, as_of)
    return {
        "basic": _money(basic),
        "gross": _money(gross),
        "components": components,
        "wage_grade": rate.rate_code if rate else None,
        "effective_from": asgn.effective_from.isoformat(),
    }


async def build_snapshot(
    db: AsyncSession, *, tenant: Tenant, emp: Employee, document_type: str, access: EmployeeFieldAccess
) -> dict:
    labels = await _labels(db, tenant.id, emp)
    display = _name(emp) or emp.employee_code
    base = {
        "schema": SNAPSHOT_SCHEMA,
        "document_type": document_type,
        "company_name": tenant.name or "Company",
        "issued_on": today_local(tenant).isoformat(),
        "employee": {"employee_id": emp.id, "employee_code": emp.employee_code, "display_name": display},
        "designation": labels["desig"].title if labels["desig"] else None,
        "department": labels["dept"].name if labels["dept"] else None,
        "reporting_manager": _name(labels["manager"]),
    }
    if document_type == "JOB_DESCRIPTION":
        return {
            **base,
            "employment_type": emp.employment_type,
            "job_description": (labels["desig"].description or "").strip()[:10000] if labels["desig"] else "",
        }
    if access.can_view_sensitive:
        base["employee"].update(
            father_name=emp.father_name,
            present_address=_address(emp, "present") or emp.address_line,
            permanent_address=_address(emp, "permanent"),
        )
    salary = await _salary(db, tenant, emp)
    if salary is not None and not access.can_manage_payroll:
        raise HTTPException(
            status_code=403,
            detail="Requires manager/admin role or permission 'hr.payroll.manage' to issue a letter that shows salary",
        )
    return {
        **base,
        "section": labels["section"].name if labels["section"] else None,
        "terms": {
            "employment_type": emp.employment_type,
            "employee_category": emp.employee_category,
            "joining_date": emp.joining_date.isoformat() if emp.joining_date else None,
            "probation_months": emp.probation_months,
            "confirmation_date": emp.confirmation_date.isoformat() if emp.confirmation_date else None,
        },
        "salary": salary,
        "salary_payment_method": emp.salary_payment_method if access.can_manage_payroll else None,
        "facilities": list(emp.facilities) if isinstance(emp.facilities, list) else [],
    }


def assert_can_read_snapshot(snapshot: dict | None, access: EmployeeFieldAccess) -> None:
    """A signed snapshot cannot be redacted, so a caller who may not see a field in it gets 403."""
    data = snapshot if isinstance(snapshot, dict) else {}
    if (data.get("salary") or data.get("salary_payment_method")) and not access.can_manage_payroll:
        raise HTTPException(
            status_code=403,
            detail="Requires manager/admin role or permission 'hr.payroll.manage' to open a letter that shows salary",
        )
    emp = data.get("employee") if isinstance(data.get("employee"), dict) else {}
    if any(emp.get(k) for k in ("father_name", "present_address", "permanent_address")) and not access.can_view_sensitive:
        raise HTTPException(status_code=403, detail="This letter shows personal details your role cannot see")


def signature_payload(row: HrGeneratedEmployeeDocument) -> dict:
    return {
        "verification_id": row.verification_id,
        "tenant_id": row.tenant_id,
        "employee_id": row.employee_id,
        "document_type": row.document_type,
        "document_version": row.document_version,
        "snapshot_schema_version": row.snapshot_schema_version,
        "snapshot": row.snapshot,
    }


async def issue_document(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    employee_id: int,
    document_type: str,
    access: EmployeeFieldAccess,
    reissue: bool = False,
    request_id: str | None = None,
) -> tuple[HrGeneratedEmployeeDocument, bool, bool]:
    """Return (document, created, outdated). Nothing here commits."""
    emp = await comp.lock_employee(db, tenant.id, employee_id)
    if request_id:
        replay = (
            await db.execute(
                select(HrGeneratedEmployeeDocument).where(
                    HrGeneratedEmployeeDocument.tenant_id == tenant.id,
                    HrGeneratedEmployeeDocument.generation_request_id == request_id,
                )
            )
        ).scalar_one_or_none()
        if replay is not None:
            if replay.employee_id != employee_id or replay.document_type != document_type:
                raise HTTPException(status_code=409, detail="This request id was already used for another document")
            assert_can_read_snapshot(replay.snapshot, access)
            return replay, False, False
    latest = (
        await db.execute(
            select(HrGeneratedEmployeeDocument)
            .where(
                HrGeneratedEmployeeDocument.tenant_id == tenant.id,
                HrGeneratedEmployeeDocument.employee_id == employee_id,
                HrGeneratedEmployeeDocument.document_type == document_type,
            )
            .order_by(HrGeneratedEmployeeDocument.document_version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    snapshot = await build_snapshot(db, tenant=tenant, emp=emp, document_type=document_type, access=access)
    if latest is not None and not reissue:
        assert_can_read_snapshot(latest.snapshot, access)
        current = {k: v for k, v in snapshot.items() if k != "issued_on"}
        stored = {k: v for k, v in (latest.snapshot or {}).items() if k != "issued_on"}
        return latest, False, current != stored
    row = HrGeneratedEmployeeDocument(
        tenant_id=tenant.id,
        employee_id=employee_id,
        document_type=document_type,
        document_version=(latest.document_version + 1) if latest else 1,
        snapshot_schema_version=SNAPSHOT_SCHEMA_VERSION,
        snapshot=snapshot,
        generation_request_id=request_id or uuid.uuid4().hex,
        verification_id=new_verification_id(),
        generated_by=user_id,
        created_at=datetime.utcnow(),
    )
    apply_document_signature(row, signature_payload(row))
    db.add(row)
    await db.flush()
    return row, True, False


def render_pdf(row: HrGeneratedEmployeeDocument) -> bytes:
    from app.modules.hr import hr_document_generator_service as hr_pdf

    render = hr_pdf.render_appointment_letter_pdf if row.document_type == "APPOINTMENT_LETTER" else hr_pdf.render_job_description_pdf
    return render(
        row.snapshot, verification_id=row.verification_id, verify_url=verify_url(row.verification_id), version=row.document_version
    )


def document_out(row: HrGeneratedEmployeeDocument) -> dict:
    emp = (row.snapshot or {}).get("employee") or {}
    return {
        "id": row.id,
        "employee_id": row.employee_id,
        "document_type": row.document_type,
        "document_label": DOCUMENT_LABELS.get(row.document_type, row.document_type),
        "document_number": document_number(row, emp.get("employee_code", "")),
        "document_version": row.document_version,
        "verification_id": row.verification_id,
        "verify_url": verify_url(row.verification_id),
        "signed_at": row.signed_at.isoformat() if row.signed_at else None,
        "created_at": row.created_at.isoformat(),
    }


def public_verification(row: HrGeneratedEmployeeDocument, company_name: str) -> PublicDocumentVerification:
    """Fixed allowlist; nothing from the snapshot besides code / name initials / issue date."""
    snapshot = row.snapshot if isinstance(row.snapshot, dict) else {}
    emp = snapshot.get("employee") if isinstance(snapshot.get("employee"), dict) else {}
    is_valid = bool(row.signature_hash) and row.signature_hash == compute_signature_hash(signature_payload(row))
    code = str(emp.get("employee_code") or "")
    return PublicDocumentVerification(
        is_valid=is_valid,
        document_type=row.document_type,
        document_label=DOCUMENT_LABELS.get(row.document_type, row.document_type),
        document_number=document_number(row, code),
        document_date=row.created_at.date().isoformat() if row.created_at else None,
        status="ISSUED",
        company_name=company_name,
        signed_at=row.signed_at.isoformat() if row.signed_at else None,
        employee_code=code or None,
        employee_initials=initials(str(emp.get("display_name") or "")) or None,
    )
