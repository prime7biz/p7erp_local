"""Generate HR PDF documents with reportlab (Sprint H1)."""

from __future__ import annotations

import io
import zipfile
from datetime import date, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Department, Designation, Employee
from app.models.hr_compliance_framework import EmployeeAgeVerification
from app.models.hr_payroll import PayrollPayslip, PayrollRun, PayrollRunLine
from app.modules.hr_compliance.age_utils import calculate_age


def _emp_name(emp: Employee) -> str:
    return f"{emp.first_name} {emp.last_name or ''}".strip()


def generate_id_card_pdf(
    emp: Employee,
    *,
    dept_name: str | None = None,
    desig_title: str | None = None,
    company_name: str = "Company",
) -> bytes:
    # Credit-card-ish landscape page
    w, h = 85.6 * mm, 54 * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(8 * mm, h - 8 * mm, company_name[:40])
    c.setFont("Helvetica", 8)
    c.drawString(8 * mm, h - 14 * mm, "EMPLOYEE ID CARD")
    c.setFont("Helvetica-Bold", 11)
    c.drawString(8 * mm, h - 24 * mm, _emp_name(emp)[:36])
    c.setFont("Helvetica", 8)
    c.drawString(8 * mm, h - 30 * mm, f"Code: {emp.employee_code}")
    c.drawString(8 * mm, h - 35 * mm, f"Designation: {(desig_title or '-')[:28]}")
    c.drawString(8 * mm, h - 40 * mm, f"Department: {(dept_name or '-')[:28]}")
    c.drawString(8 * mm, h - 45 * mm, f"Blood: {emp.blood_group or '-'}")
    c.rect(w - 28 * mm, h - 36 * mm, 20 * mm, 24 * mm)
    c.setFont("Helvetica", 6)
    c.drawCentredString(w - 18 * mm, h - 24 * mm, "PHOTO")
    # Back page
    c.showPage()
    c.setFont("Helvetica", 7)
    c.drawString(8 * mm, h - 10 * mm, f"Emergency: {emp.emergency_contact_name or '-'}")
    c.drawString(8 * mm, h - 15 * mm, f"Phone: {emp.emergency_contact_phone or '-'}")
    c.drawString(8 * mm, h - 20 * mm, f"Address: {(emp.address_line or '-')[:40]}")
    c.drawString(8 * mm, h - 25 * mm, f"Issue: {date.today().isoformat()}")
    c.drawString(8 * mm, h - 30 * mm, f"NID: {emp.national_id or '-'}")
    c.setFont("Helvetica", 6)
    c.drawString(8 * mm, 6 * mm, f"*{emp.employee_code}*")
    c.save()
    return buf.getvalue()


def generate_appointment_letter_pdf(
    emp: Employee,
    *,
    dept_name: str | None = None,
    desig_title: str | None = None,
    manager_name: str | None = None,
    company_name: str = "Company",
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    y = height - 40
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, company_name)
    y -= 30
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "APPOINTMENT LETTER")
    y -= 24
    c.setFont("Helvetica", 10)
    c.drawString(50, y, f"Date: {date.today().isoformat()}")
    y -= 20
    c.drawString(50, y, f"To: {_emp_name(emp)}")
    y -= 16
    c.drawString(50, y, emp.address_line or "")
    y -= 28
    for line in [
        f"We are pleased to appoint you as {(desig_title or 'Employee')} in {(dept_name or 'our organization')}.",
        f"Employee Code: {emp.employee_code}",
        f"Joining Date: {emp.joining_date.isoformat() if emp.joining_date else 'To be confirmed'}",
        f"Reporting Manager: {manager_name or '-'}",
        "Probation period: 6 months from joining.",
        "Working hours and weekly off as per company policy / Bangladesh Labor Law.",
        "Benefits: festival bonus, PF (as applicable), and other statutory benefits.",
        "",
        "Please sign and return a copy as acceptance of these terms.",
    ]:
        c.drawString(50, y, line[:95])
        y -= 16
    y -= 20
    c.drawString(50, y, "_________________________          _________________________")
    y -= 14
    c.drawString(50, y, "Authorized Signatory                         Employee Acceptance")
    c.save()
    return buf.getvalue()


def generate_age_verification_cert_pdf(
    emp: Employee,
    verification: EmployeeAgeVerification | None,
    *,
    company_name: str = "Company",
    verifier_label: str = "HR",
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = A4[1] - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, company_name)
    y -= 28
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "AGE VERIFICATION CERTIFICATE")
    y -= 24
    c.setFont("Helvetica", 10)
    dob = verification.date_of_birth if verification else emp.date_of_birth
    age = verification.age_at_verification if verification else (calculate_age(dob) if dob else None)
    method = verification.verification_method if verification else "DOCUMENT_REVIEW"
    lines = [
        f"Employee: {_emp_name(emp)} ({emp.employee_code})",
        f"Date of Birth: {dob.isoformat() if dob else '-'}",
        f"Age at verification: {age if age is not None else '-'}",
        f"Verification method: {method}",
        f"Status: {verification.status if verification else 'PENDING'}",
        f"BSCI compliant: {verification.is_bsci_compliant if verification else False}",
        f"Verified at: {verification.verified_at.isoformat() if verification and verification.verified_at else '-'}",
        f"Verifier: {verifier_label}",
        "",
        "This certificate is issued for buyer audit (BSCI/WRAP/SEDEX) purposes.",
    ]
    for line in lines:
        c.drawString(50, y, line[:100])
        y -= 16
    c.save()
    return buf.getvalue()


def generate_payslip_pdf(
    emp: Employee,
    *,
    run: PayrollRun | None,
    line: PayrollRunLine | None,
    payslip: PayrollPayslip | None = None,
    company_name: str = "Company",
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = A4[1] - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, company_name)
    y -= 24
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "PAYSLIP")
    y -= 22
    c.setFont("Helvetica", 10)
    c.drawString(50, y, f"Employee: {_emp_name(emp)} ({emp.employee_code})")
    y -= 16
    c.drawString(50, y, f"Run ID: {run.id if run else '-'}  Status: {run.status if run else '-'}")
    y -= 20
    gross = float(line.gross_pay) if line and line.gross_pay is not None else 0.0
    ded = float(line.deductions) if line and line.deductions is not None else 0.0
    net = float(line.net_pay) if line and line.net_pay is not None else gross - ded
    ot = float(line.overtime_amount) if line and getattr(line, "overtime_amount", None) is not None else 0.0
    for label, val in [
        ("Gross pay", gross),
        ("Overtime", ot),
        ("Deductions", ded),
        ("Net pay", net),
    ]:
        c.drawString(50, y, f"{label}: {val:,.2f}")
        y -= 16
    if payslip:
        y -= 8
        c.drawString(50, y, f"Payslip ID: {payslip.id}")
    y -= 24
    c.drawString(50, y, f"Generated: {datetime.utcnow().isoformat()}Z")
    c.save()
    return buf.getvalue()


def generate_joining_letter_pdf(emp: Employee, *, company_name: str = "Company") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = A4[1] - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, company_name)
    y -= 28
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "JOINING LETTER")
    y -= 24
    c.setFont("Helvetica", 10)
    for line in [
        f"Dear {_emp_name(emp)},",
        "",
        "Welcome to the team. Please report on your first day with the following documents:",
        "- National ID / Birth certificate",
        "- Medical fitness certificate",
        "- Passport-size photographs",
        "- Bank account details",
        "",
        f"Employee code: {emp.employee_code}",
        "Contact HR for orientation schedule.",
    ]:
        c.drawString(50, y, line[:95])
        y -= 16
    c.save()
    return buf.getvalue()


async def build_id_card_for_employee(db: AsyncSession, tenant_id: int, employee_id: int, company_name: str) -> bytes:
    emp = (
        await db.execute(select(Employee).where(Employee.id == employee_id, Employee.tenant_id == tenant_id))
    ).scalar_one()
    dept = None
    desig = None
    if emp.department_id:
        dept = (
            await db.execute(select(Department).where(Department.id == emp.department_id))
        ).scalar_one_or_none()
    if emp.designation_id:
        desig = (
            await db.execute(select(Designation).where(Designation.id == emp.designation_id))
        ).scalar_one_or_none()
    return generate_id_card_pdf(
        emp,
        dept_name=dept.name if dept else None,
        desig_title=desig.title if desig else None,
        company_name=company_name,
    )


async def build_bulk_id_cards_zip(db: AsyncSession, tenant_id: int, company_name: str) -> bytes:
    employees = list(
        (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True)).limit(500)
            )
        )
        .scalars()
        .all()
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for emp in employees:
            pdf = await build_id_card_for_employee(db, tenant_id, emp.id, company_name)
            zf.writestr(f"id-card-{emp.employee_code}.pdf", pdf)
    return buf.getvalue()
