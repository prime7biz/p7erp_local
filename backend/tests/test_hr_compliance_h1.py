"""Sprint H1: compliance framework, age gate, OCR stub, PDF, AI heuristics."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_compliance_framework import ComplianceFramework, ComplianceRequirement
from app.models.hr_payroll import PayrollRun, PayrollRunLine
from app.models.tenant import Tenant, TenantType
from app.models.user import Role, User
from app.modules.ai_extract.providers.stub_provider import StubExtractionProvider
from app.modules.ai_extract.service import (
    extract_hr_birth_certificate_form,
    extract_hr_cv_form,
    extract_hr_medical_form,
    extract_hr_national_id_form,
)
from app.modules.hr.hr_document_generator_service import (
    generate_age_verification_cert_pdf,
    generate_appointment_letter_pdf,
    generate_id_card_pdf,
    generate_payslip_pdf,
)
from app.modules.hr_compliance.age_utils import calculate_age, classify_worker_age
from app.modules.hr_compliance.schemas import (
    AgeVerificationCreate,
    EmployeeComplianceRecordCreate,
)
from app.modules.hr_compliance import service as compliance_svc
from app.modules.hr_compliance.compliance_scoring_service import calculate_compliance_score
from app.modules.hr_compliance.service import assert_dob_allowed
from app.modules.ai_tool.ai_payroll_anomaly_service import detect_payroll_anomalies
from app.modules.ai_tool.ai_turnover_prediction_service import predict_turnover_risk


async def _seed_hr_tenant(db: AsyncSession, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"H1 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"h1{slug}"[:18],
        feature_flags={
            "compliance_tracking_enabled": True,
            "age_verification_required": True,
            "medical_certificate_tracking_enabled": True,
            **(flags or {}),
        },
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"h1{slug}",
        email=f"h1{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{slug}"[:12],
        first_name="Adult",
        last_name="Worker",
        date_of_birth=date(1995, 1, 1),
        is_active=True,
        employee_category="WORKER",
    )
    db.add(emp)
    await db.flush()
    return tenant, user, emp


@pytest.mark.asyncio
async def test_age_classify_and_hire_gate():
    assert calculate_age(date(2015, 1, 1), as_of=date(2026, 1, 1)) == 11
    status, ok, reason = classify_worker_age(14)
    assert status == "REJECTED" and not ok and reason
    status, ok, _ = classify_worker_age(16)
    assert status == "YOUNG_WORKER" and not ok
    status, ok, _ = classify_worker_age(22)
    assert status == "ADULT" and ok

    with pytest.raises(HTTPException) as ei:
        assert_dob_allowed(date(2014, 6, 1), required=True)
    assert ei.value.status_code == 400

    assert_dob_allowed(date(1990, 1, 1), required=True)


@pytest.mark.asyncio
async def test_compliance_activate_score_and_age_verify(db_session_integration: AsyncSession):
    db = db_session_integration
    tenant, user, emp = await _seed_hr_tenant(db)

    # Ensure system framework exists (migration may have seeded; else create)
    sys_fw = ComplianceFramework(
        tenant_id=None,
        framework_name="BSCI",
        version="TEST",
        is_system=True,
        is_active=True,
    )
    db.add(sys_fw)
    await db.flush()
    db.add(
        ComplianceRequirement(
            tenant_id=None,
            framework_id=sys_fw.id,
            requirement_code="1.1",
            title="No Child Labor",
            category="LABOR",
            required_documents=["age_verification"],
            is_active=True,
        )
    )
    await db.commit()

    activated = await compliance_svc.activate_system_framework(db, tenant.id, sys_fw.id)
    assert activated.tenant_id == tenant.id
    reqs = await compliance_svc.list_requirements(db, tenant.id, activated.id)
    assert len(reqs) >= 1

    rec = await compliance_svc.create_record(
        db,
        tenant.id,
        user.id,
        EmployeeComplianceRecordCreate(
            employee_id=emp.id,
            requirement_id=reqs[0].id,
            status="COMPLIANT",
            notes="Verified",
        ),
    )
    assert rec.status == "COMPLIANT"

    score = await calculate_compliance_score(db, tenant.id, activated.id)
    assert score.score_percent >= 0
    assert score.framework_name == "BSCI"

    ver = await compliance_svc.create_age_verification(
        db,
        tenant.id,
        emp.id,
        user.id,
        AgeVerificationCreate(
            verification_method="NATIONAL_ID",
            date_of_birth=date(1995, 1, 1),
            notes="OK",
        ),
    )
    assert ver.status == "ADULT"
    assert ver.is_bsci_compliant is True

    # Child reject
    child = Employee(
        tenant_id=tenant.id,
        employee_code=f"C{uuid.uuid4().hex[:6]}",
        first_name="Child",
        last_name="X",
        is_active=True,
    )
    db.add(child)
    await db.flush()
    with pytest.raises(HTTPException):
        await compliance_svc.create_age_verification(
            db,
            tenant.id,
            child.id,
            user.id,
            AgeVerificationCreate(
                verification_method="BIRTH_CERTIFICATE",
                date_of_birth=date.today() - timedelta(days=365 * 12),
            ),
        )


@pytest.mark.asyncio
async def test_hr_ocr_stub_extract(monkeypatch):
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")
    stub = StubExtractionProvider()
    cv = await stub.extract_hr_cv_fields(b"%PDF", "application/pdf")
    assert cv.get("full_name")
    nid = await stub.extract_hr_national_id_fields(b"x", "image/jpeg")
    assert nid.get("national_id")
    med = await stub.extract_hr_medical_fields(b"x", "image/png")
    assert med.get("fitness_status") == "FIT"
    birth = await stub.extract_hr_birth_certificate_fields(b"x", "image/png")
    assert birth.get("date_of_birth")

    out = await extract_hr_cv_form(None, 1, b"%PDF-1.4", "application/pdf")  # type: ignore[arg-type]
    assert out.success
    assert "first_name" in out.fields or "full_name" in out.fields

    out2 = await extract_hr_national_id_form(None, 1, b"x", "image/jpeg")  # type: ignore[arg-type]
    assert out2.document_type == "hr_national_id"
    out3 = await extract_hr_medical_form(None, 1, b"x", "image/png")  # type: ignore[arg-type]
    assert out3.document_type == "hr_medical_certificate"
    out4 = await extract_hr_birth_certificate_form(None, 1, b"x", "image/png")  # type: ignore[arg-type]
    assert out4.document_type == "hr_birth_certificate"


def test_hr_pdf_bytes_nonempty():
    emp = Employee(
        id=1,
        tenant_id=1,
        employee_code="E001",
        first_name="Demo",
        last_name="Worker",
        blood_group="B+",
        national_id="123",
        date_of_birth=date(1990, 5, 15),
        is_active=True,
    )
    id_pdf = generate_id_card_pdf(emp, dept_name="Cutting", desig_title="Operator", company_name="Demo Co")
    assert id_pdf[:4] == b"%PDF"
    appt = generate_appointment_letter_pdf(emp, company_name="Demo Co")
    assert appt[:4] == b"%PDF"
    age = generate_age_verification_cert_pdf(emp, None, company_name="Demo Co")
    assert age[:4] == b"%PDF"
    run = PayrollRun(id=1, tenant_id=1, period_id=1, status="DRAFT")
    line = PayrollRunLine(
        id=1,
        tenant_id=1,
        run_id=1,
        employee_id=1,
        gross_pay=Decimal("10000"),
        deductions=Decimal("500"),
        net_pay=Decimal("9500"),
        overtime_amount=Decimal("0"),
    )
    slip = generate_payslip_pdf(emp, run=run, line=line, company_name="Demo Co")
    assert slip[:4] == b"%PDF"


def test_signed_letter_renderers_produce_pdf_from_snapshot(monkeypatch):
    from reportlab import rl_config

    from app.modules.hr.hr_document_generator_service import render_appointment_letter_pdf, render_job_description_pdf

    monkeypatch.setattr(rl_config, "pageCompression", 0)  # readable content streams for the assertions below

    snapshot = {
        "company_name": "Demo Co & Sons <Ltd>",
        "issued_on": "2026-11-08",
        "employee": {"employee_code": "EMP-0001", "display_name": "Demo Worker", "father_name": "Father"},
        "designation": "Operator",
        "terms": {"employment_type": "permanent", "probation_months": 6, "joining_date": "2026-11-15"},
        "salary": {"basic": "8390.00", "gross": "15035.00", "components": [{"name": "House rent", "amount": "4195.00"}]},
        "facilities": ["Lunch", "Transport"],
        "job_description": "Line one\nLine two with <tags> & symbols " + "long " * 3000,
    }
    kw = {"verification_id": "VFY-0123456789ABCDEF", "verify_url": "https://example.test/verify/document/VFY-0123456789ABCDEF", "version": 2}
    letter = render_appointment_letter_pdf(snapshot, **kw)
    assert letter[:4] == b"%PDF"
    for text in (b"APPOINTMENT LETTER", b"Gross monthly salary", b"15035.00", b"House rent", b"Lunch", b"6 month",
                 b"VFY-0123456789ABCDEF", b"version 2", b"Father"):
        assert text in letter, text
    # The company name is drawn; unescaped "<Ltd>" would have made reportlab's paragraph parser raise.
    assert b"Demo Co" in letter and b"Sons" in letter
    jd = render_job_description_pdf(snapshot, **kw)
    import re

    assert jd[:4] == b"%PDF" and len(re.findall(rb"/Type /Page(?!s)", jd)) >= 2  # long text wraps onto more pages


@pytest.mark.asyncio
async def test_payroll_anomaly_and_turnover(db_session_integration: AsyncSession):
    db = db_session_integration
    tenant, user, emp = await _seed_hr_tenant(db)
    # Minimal payroll run — period_id may be required
    from app.models.hr_payroll import PayrollPeriod

    period = PayrollPeriod(
        tenant_id=tenant.id,
        period_code=f"P{uuid.uuid4().hex[:6]}"[:16],
        start_date=date.today().replace(day=1),
        end_date=date.today(),
        payment_date=date.today(),
        status="OPEN",
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        run_code=f"R{uuid.uuid4().hex[:6]}"[:24],
        run_date=date.today(),
        status="DRAFT",
    )
    db.add(run)
    await db.flush()
    db.add(
        PayrollRunLine(
            tenant_id=tenant.id,
            run_id=run.id,
            employee_id=emp.id,
            gross_pay=Decimal("10000"),
            deductions=Decimal("0"),
            net_pay=Decimal("-10"),
            overtime_amount=Decimal("0"),
        )
    )
    await db.commit()

    anomalies = await detect_payroll_anomalies(db, tenant.id, run.id)
    assert anomalies["count"] >= 1
    assert any(a["code"] == "NEGATIVE_NET" for a in anomalies["anomalies"])

    turnover = await predict_turnover_risk(db, tenant.id)
    assert "predictions" in turnover


@pytest.mark.asyncio
async def test_activate_enrichment_and_reject_system_requirement(db_session_integration: AsyncSession):
    db = db_session_integration
    tenant, user, emp = await _seed_hr_tenant(db)

    sys_fw = ComplianceFramework(
        tenant_id=None,
        framework_name=f"WRAP{uuid.uuid4().hex[:4]}".upper()[:8],
        version="H1",
        is_system=True,
        is_active=True,
    )
    db.add(sys_fw)
    await db.flush()
    sys_req = ComplianceRequirement(
        tenant_id=None,
        framework_id=sys_fw.id,
        requirement_code="W.1",
        title="System only",
        category="LABOR",
        is_active=True,
    )
    db.add(sys_req)
    await db.commit()

    enriched = await compliance_svc.list_frameworks_enriched(db, tenant.id)
    sys_entry = next((r, aid) for r, aid in enriched if r.id == sys_fw.id)
    assert sys_entry[0].is_system is True
    assert sys_entry[1] is None

    with pytest.raises(HTTPException) as ei:
        await compliance_svc.create_record(
            db,
            tenant.id,
            user.id,
            EmployeeComplianceRecordCreate(
                employee_id=emp.id,
                requirement_id=sys_req.id,
                status="COMPLIANT",
            ),
        )
    assert ei.value.status_code == 400
    assert "Activate" in str(ei.value.detail)

    activated = await compliance_svc.activate_system_framework(db, tenant.id, sys_fw.id)
    enriched2 = await compliance_svc.list_frameworks_enriched(db, tenant.id)
    sys_entry2 = next((r, aid) for r, aid in enriched2 if r.id == sys_fw.id)
    assert sys_entry2[1] == activated.id

    reqs = await compliance_svc.list_requirements(db, tenant.id, activated.id)
    assert len(reqs) >= 1
    assert reqs[0].tenant_id == tenant.id


@pytest.mark.asyncio
async def test_excel_import_age_gate(db_session_integration: AsyncSession):
    from io import BytesIO

    from openpyxl import Workbook
    from starlette.datastructures import UploadFile

    from app.modules.hr.service import import_employees_excel

    db = db_session_integration
    tenant, user, _emp = await _seed_hr_tenant(db, flags={"age_verification_required": True})

    wb = Workbook()
    ws = wb.active
    ws.append(
        [
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
    )
    code_child = f"CH{uuid.uuid4().hex[:6]}"
    code_adult = f"AD{uuid.uuid4().hex[:6]}"
    ws.append(
        [
            code_child,
            "TooYoung",
            "Kid",
            "",
            "",
            "",
            "",
            "",
            "WORKER",
            "",
            "",
            "Y",
            (date.today() - timedelta(days=365 * 12)).isoformat(),
        ]
    )
    ws.append(
        [
            code_adult,
            "Adult",
            "Ok",
            "",
            "",
            "",
            "",
            "",
            "WORKER",
            "",
            "",
            "Y",
            date(1995, 1, 1).isoformat(),
        ]
    )
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    upload = UploadFile(filename="emps.xlsx", file=buf)

    result = await import_employees_excel(db, tenant, user, upload)
    assert result["created"] == 1
    assert any("Row 2" in e for e in result["errors"])

    adult = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.employee_code == code_adult)
        )
    ).scalar_one_or_none()
    assert adult is not None
    assert adult.date_of_birth == date(1995, 1, 1)

    child = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.employee_code == code_child)
        )
    ).scalar_one_or_none()
    assert child is None
