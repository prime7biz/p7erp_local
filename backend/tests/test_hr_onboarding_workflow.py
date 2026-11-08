"""Employee onboarding saga (POST /hr/onboarding) and the truthful onboarding checklist.

Run: docker compose exec backend pytest tests/test_hr_onboarding_workflow.py -q
"""

from __future__ import annotations

import asyncio
import hashlib
import io

import pytest
from fastapi import HTTPException
from PIL import Image
from sqlalchemy import func, select

from app.config import get_settings
from app.models import AuditLog, Tenant, User
from app.models.hr import Employee
from app.models.hr_lifecycle import HrEmployeeGatePass
from app.models.hr_onboarding import HrEmployeeOnboardingRun, HrEmployeeOnboardingTask
from app.models.hr_payroll import PayrollEmployeeStructureAssignment
from app.modules.hr import onboarding_service as svc
from app.modules.hr_gate import service as gate_service
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_hr_bd_enforcement import _rate, _setup, _structure

HR = "/api/v1/hr"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture
def _tmp_media(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    yield tmp_path


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), (30, 120, 30)).save(buf, format="PNG")
    return buf.getvalue()


async def _seeded(db, *, medical=False):
    tenant, user, role = await _setup(db)
    if medical:
        tenant.feature_flags = {**(tenant.feature_flags or {}), "medical_certificate_tracking_enabled": True}
        await db.commit()
    rate = await _rate(db, tenant, "W-G4")
    st = await _structure(db, tenant, "BD-W-G4")
    return {"tenant": tenant, "user": user, "role": role, "tid": tenant.id, "g4": rate.id, "st4": st.id}


def _nid(request_id: str, tenant_id: int) -> str:
    return str(int(hashlib.sha256(f"{tenant_id}:{request_id}".encode()).hexdigest(), 16))[:10].rjust(10, "1")


def _body(request_id: str, s: dict, *, salary=True, gate=True, base_salary=None, **employee) -> dict:
    out = {
        "request_id": request_id,
        "employee": {
            "first_name": "Nasrin", "phone": "01711111111", "joining_date": "2026-11-15",
            "national_id": _nid(request_id, s["tid"]), **employee,
        },
        "issue_temp_gate_pass": gate,
    }
    if salary:
        out["compensation"] = {"structure_id": s["st4"], "bd_wage_rate_id": s["g4"], "base_salary": base_salary}
    return out


async def _count(db, model, *where) -> int:
    return (await db.execute(select(func.count()).select_from(model).where(*where))).scalar_one()


@pytest.mark.asyncio
async def test_onboarding_same_request_concurrent_creates_one_employee(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as session:
        s = await _seeded(session)
        register(s["tid"])
    tid, user_id = s["tid"], s["user"].id
    body = svc.OnboardingRequest.model_validate(_body("concurrent-req-0001", s))

    async def attempt():
        async with factory() as session:
            tenant, user = await session.get(Tenant, tid), await session.get(User, user_id)
            run = await svc.start_onboarding(session, tenant=tenant, user=user, body=body)
            return run.employee_id, run.status

    results = await asyncio.gather(attempt(), attempt(), attempt())
    assert len({r[0] for r in results}) == 1, results
    async with factory() as session:
        assert await _count(session, Employee, Employee.tenant_id == tid) == 1
        assert await _count(session, HrEmployeeOnboardingRun, HrEmployeeOnboardingRun.tenant_id == tid) == 1
        assert await _count(
            session, PayrollEmployeeStructureAssignment, PayrollEmployeeStructureAssignment.tenant_id == tid
        ) == 1
        assert await _count(session, HrEmployeeGatePass, HrEmployeeGatePass.tenant_id == tid) == 1
        run = (await session.execute(select(HrEmployeeOnboardingRun).where(HrEmployeeOnboardingRun.tenant_id == tid))).scalar_one()
        assert run.status == "COMPLETED"


@pytest.mark.asyncio
async def test_onboarding_first_step_employee_and_run_link_are_atomic(real_db, monkeypatch):  # noqa: F811
    factory, register = real_db
    async with factory() as session:
        s = await _seeded(session)
        register(s["tid"])
    tid, user_id = s["tid"], s["user"].id
    body = svc.OnboardingRequest.model_validate(_body("atomic-req-00001", s, salary=False, gate=False))
    real_log = svc.log_action

    async def crash_after_insert(db, **kw):
        if kw.get("action") == "HR_EMPLOYEE_CREATED":
            raise RuntimeError("simulated crash before commit")
        return await real_log(db, **kw)

    monkeypatch.setattr(svc, "log_action", crash_after_insert)
    async with factory() as session:
        tenant, user = await session.get(Tenant, tid), await session.get(User, user_id)
        with pytest.raises(RuntimeError):
            await svc.start_onboarding(session, tenant=tenant, user=user, body=body)
    async with factory() as session:
        assert await _count(session, Employee, Employee.tenant_id == tid) == 0
        assert await _count(session, HrEmployeeOnboardingRun, HrEmployeeOnboardingRun.tenant_id == tid) == 0

    monkeypatch.setattr(svc, "log_action", real_log)
    async with factory() as session:
        tenant, user = await session.get(Tenant, tid), await session.get(User, user_id)
        run = await svc.start_onboarding(session, tenant=tenant, user=user, body=body)
        assert run.status == "COMPLETED" and run.employee_id is not None
    async with factory() as session:
        assert await _count(session, Employee, Employee.tenant_id == tid) == 1


@pytest.mark.asyncio
async def test_onboarding_resumes_after_each_saga_boundary(db_session_integration, monkeypatch):
    db = db_session_integration
    s = await _seeded(db)
    tid = s["tid"]
    async with api_client(db, s["tenant"], s["user"]) as c:
        # Payroll fails (below the grade); later steps still run; the employee exists exactly once.
        r = (await c.post(f"{HR}/onboarding", json=_body("resume-req-00001", s, base_salary="1"))).json()
        assert r["steps"] == {"employee": "COMPLETED", "payroll": "FAILED", "gate_pass": "COMPLETED", "checklist": "COMPLETED"}
        assert r["status"] == "FAILED" and r["error"]["step"] == "payroll" and "minimum" in r["error"]["message"]
        emp_id = r["employee"]["id"]
        fixed = (await c.post(f"{HR}/onboarding/resume-req-00001/resume", json={
            "compensation": {"structure_id": s["st4"], "bd_wage_rate_id": s["g4"]}, "issue_temp_gate_pass": True,
        })).json()
        assert fixed["status"] == "COMPLETED" and fixed["steps"]["payroll"] == "COMPLETED" and fixed["error"] is None
        assert fixed["employee"]["id"] == emp_id and fixed["gate_pass"]["status"] == "ACTIVE"
        replay = (await c.post(f"{HR}/onboarding", json=_body("resume-req-00001", s, base_salary="1"))).json()
        assert replay["run_id"] == r["run_id"] and replay["employee"]["id"] == emp_id and replay["status"] == "COMPLETED"

        # Gate pass fails once, then resumes.
        real_create = gate_service.create_draft_pass

        async def gate_down(*a, **kw):
            raise HTTPException(status_code=503, detail="Gate service unavailable")

        monkeypatch.setattr(gate_service, "create_draft_pass", gate_down)
        g = (await c.post(f"{HR}/onboarding", json=_body("resume-req-00002", s, first_name="Gate"))).json()
        assert g["steps"]["gate_pass"] == "FAILED" and g["steps"]["payroll"] == "COMPLETED" and g["error"]["code"] == "http_503"
        monkeypatch.setattr(gate_service, "create_draft_pass", real_create)
        g2 = (await c.post(f"{HR}/onboarding/resume-req-00002/resume", json={
            "compensation": {"structure_id": s["st4"], "bd_wage_rate_id": s["g4"]}, "issue_temp_gate_pass": True,
        })).json()
        assert g2["status"] == "COMPLETED" and g2["steps"]["gate_pass"] == "COMPLETED"

        # Checklist fails once, then resumes; leaving a failed optional step out of a resume skips it.
        real_tasks = svc.create_onboarding_tasks

        async def tasks_down(*a, **kw):
            raise HTTPException(status_code=500, detail="Checklist unavailable")

        monkeypatch.setattr(svc, "create_onboarding_tasks", tasks_down)
        k = (await c.post(f"{HR}/onboarding", json=_body("resume-req-00003", s, first_name="Check", gate=False))).json()
        assert k["steps"]["checklist"] == "FAILED" and k["steps"]["gate_pass"] == "SKIPPED"
        monkeypatch.setattr(svc, "create_onboarding_tasks", real_tasks)
        k2 = (await c.post(f"{HR}/onboarding/resume-req-00003/resume", json={})).json()
        assert k2["status"] == "COMPLETED" and k2["steps"]["checklist"] == "COMPLETED"
        assert (await c.get(f"{HR}/onboarding/resume-req-00003")).json()["status"] == "COMPLETED"

    assert await _count(db, Employee, Employee.tenant_id == tid) == 3
    assert await _count(db, PayrollEmployeeStructureAssignment, PayrollEmployeeStructureAssignment.tenant_id == tid) == 3
    assert await _count(db, HrEmployeeGatePass, HrEmployeeGatePass.tenant_id == tid) == 2


@pytest.mark.asyncio
async def test_onboarding_permissions_block_salary_and_gate_steps(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    role = s["role"]
    role.name, role.permissions = "clerk", {"hr.access": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        salary = await c.post(f"{HR}/onboarding", json=_body("perm-req-000001", s, gate=False))
        assert salary.status_code == 403 and "hr.payroll.manage" in salary.text
        gate = await c.post(f"{HR}/onboarding", json=_body("perm-req-000002", s, salary=False))
        assert gate.status_code == 403 and "hr.gate_pass.manage" in gate.text
        family = await c.post(f"{HR}/onboarding", json=_body("perm-req-000003", s, salary=False, gate=False, father_name="X"))
        assert family.status_code == 403
        assert await _count(db, Employee, Employee.tenant_id == s["tid"]) == 0
        assert await _count(db, HrEmployeeOnboardingRun, HrEmployeeOnboardingRun.tenant_id == s["tid"]) == 0
        plain = (await c.post(f"{HR}/onboarding", json=_body("perm-req-000004", s, salary=False, gate=False))).json()
        assert plain["status"] == "COMPLETED" and plain["steps"]["payroll"] == "SKIPPED" and plain["steps"]["gate_pass"] == "SKIPPED"

    role.name, role.permissions = "manager", {"hr.access": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        failed = (await c.post(f"{HR}/onboarding", json=_body("perm-req-000005", s, base_salary="1", gate=False))).json()
        assert failed["steps"]["payroll"] == "FAILED"
    role.name = "clerk"
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        resume = await c.post(f"{HR}/onboarding/perm-req-000005/resume", json={
            "compensation": {"structure_id": s["st4"], "bd_wage_rate_id": s["g4"]},
        })
        assert resume.status_code == 403


@pytest.mark.asyncio
async def test_onboarding_run_is_private_to_its_creator_and_hides_salary_errors(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        failed = (await c.post(f"{HR}/onboarding", json=_body("private-req-001", s, base_salary="1", gate=False))).json()
        assert failed["steps"]["payroll"] == "FAILED" and "minimum" in failed["error"]["message"]
    other = User(
        tenant_id=s["tid"], role_id=s["role"].id, username="clerk-two", email="clerk-two@example.com",
        password_hash="unused", is_active=True,
    )
    db.add(other)
    role = s["role"]
    role.name, role.permissions = "clerk", {"hr.access": True}
    await db.commit()
    async with api_client(db, s["tenant"], other) as c:
        assert (await c.get(f"{HR}/onboarding/private-req-001")).status_code == 404
        assert (await c.post(f"{HR}/onboarding/private-req-001/resume", json={})).status_code == 404
        reuse = await c.post(f"{HR}/onboarding", json=_body("private-req-001", s, salary=False, gate=False))
        assert reuse.status_code == 404
    async with api_client(db, s["tenant"], s["user"]) as c:
        mine = (await c.get(f"{HR}/onboarding/private-req-001")).json()
        assert mine["error"]["step"] == "payroll" and "minimum" not in mine["error"]["message"]
    run = (
        await db.execute(select(HrEmployeeOnboardingRun).where(HrEmployeeOnboardingRun.request_id == "private-req-001"))
    ).scalar_one()
    assert run.payroll_step_status == "FAILED"  # the other user's empty resume did not skip it


@pytest.mark.asyncio
async def test_onboarding_skipping_a_failed_step_is_audited(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        failed = (await c.post(f"{HR}/onboarding", json=_body("skip-req-00001", s, base_salary="1", gate=False))).json()
        assert failed["steps"]["payroll"] == "FAILED"
        skipped = (await c.post(f"{HR}/onboarding/skip-req-00001/resume", json={})).json()
        assert skipped["steps"]["payroll"] == "SKIPPED" and skipped["status"] == "COMPLETED"
    audit = (
        await db.execute(select(AuditLog).where(AuditLog.tenant_id == s["tid"], AuditLog.action == "HR_ONBOARDING_STEP_SKIPPED"))
    ).scalars().all()
    assert len(audit) == 1 and "payroll (was FAILED)" in audit[0].details


@pytest.mark.asyncio
async def test_onboarding_related_ids_are_tenant_scoped(db_session_integration):
    db = db_session_integration
    a = await _seeded(db)
    b = await _seeded(db)
    async with api_client(db, a["tenant"], a["user"]) as c:
        done = (await c.post(f"{HR}/onboarding", json=_body("tenant-req-00001", a))).json()
        a_emp = done["employee"]["id"]
        a_task = (await c.get(f"{HR}/employees/{a_emp}/onboarding-tasks")).json()[0]["id"]
        a_dept = (await c.post(f"{HR}/departments", json={"name": "Sewing"})).json()["id"]
    async with api_client(db, b["tenant"], b["user"]) as c:
        dept = await c.post(f"{HR}/onboarding", json=_body("tenant-req-00002", b, department_id=a_dept))
        assert dept.status_code == 404
        structure = await c.post(f"{HR}/onboarding", json={
            **_body("tenant-req-00003", b, gate=False), "compensation": {"structure_id": a["st4"]},
        })
        assert structure.status_code == 404
        rate = await c.post(f"{HR}/onboarding", json={
            **_body("tenant-req-00004", b, gate=False), "compensation": {"structure_id": b["st4"], "bd_wage_rate_id": a["g4"]},
        })
        assert rate.status_code == 404
        assert await _count(db, Employee, Employee.tenant_id == b["tid"]) == 0
        assert (await c.get(f"{HR}/onboarding/tenant-req-00001")).status_code == 404
        assert (await c.post(f"{HR}/onboarding/tenant-req-00001/resume", json={})).status_code == 404
        assert (await c.get(f"{HR}/employees/{a_emp}/onboarding-tasks")).status_code == 404
        assert (await c.post(f"{HR}/onboarding-tasks/{a_task}/waive", json={"reason": "Not needed"})).status_code == 404
        # The same request id in another tenant is a separate onboarding.
        own = (await c.post(f"{HR}/onboarding", json=_body("tenant-req-00001", b))).json()
        assert own["employee"]["id"] != a_emp


@pytest.mark.asyncio
async def test_onboarding_checklist_requires_real_source_evidence(db_session_integration, _tmp_media):
    db = db_session_integration
    s = await _seeded(db, medical=True)
    async with api_client(db, s["tenant"], s["user"]) as c:
        emp_id = (await c.post(f"{HR}/onboarding", json=_body("check-req-00001", s, gate=False))).json()["employee"]["id"]
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert set(tasks) == {"EMPLOYEE_PHOTO", "PHOTO_CONSENT", "REQUIRED_DOCUMENTS", "MEDICAL_EXAM"}
        assert all(t["status"] == "DUE" and t["source_id"] is None for t in tasks.values())
        assert (await c.post(f"{HR}/onboarding-tasks/{tasks['MEDICAL_EXAM']['id']}/complete")).status_code in (404, 405)

        photo = await c.post(
            f"{HR}/employees/{emp_id}/photo", files={"file": ("me.png", _png(), "image/png")},
            data={"privacy_notice_acknowledged": "true"},
        )
        assert photo.status_code == 200, photo.text
        cv = await c.post(f"{HR}/employees/{emp_id}/documents/upload", files={"file": ("cv.pdf", PDF, "application/pdf")}, data={"document_type": "CV"})
        assert cv.status_code == 201
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert tasks["EMPLOYEE_PHOTO"]["status"] == "COMPLETED" and tasks["EMPLOYEE_PHOTO"]["source_table"] == "hr_employees"
        assert tasks["PHOTO_CONSENT"]["status"] == "COMPLETED" and tasks["PHOTO_CONSENT"]["source_table"] == "hr_employee_privacy_consents"
        assert tasks["REQUIRED_DOCUMENTS"]["status"] == "DUE"  # a CV is not an identity document

        nid = await c.post(f"{HR}/employees/{emp_id}/documents/upload", files={"file": ("nid.pdf", PDF, "application/pdf")}, data={"document_type": "NID_SCAN"})
        assert nid.status_code == 201
        medical = await c.post(f"{HR}/compliance/employees/{emp_id}/medical-records", json={"examination_date": "2026-11-10", "fitness_status": "PENDING"})
        assert medical.status_code == 201, medical.text
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert tasks["MEDICAL_EXAM"]["status"] == "DUE"  # no exam result yet: still pending
        fit = await c.patch(f"{HR}/compliance/employees/{emp_id}/medical-records/{medical.json()['id']}", json={"fitness_status": "FIT"})
        assert fit.status_code == 200, fit.text
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert tasks["REQUIRED_DOCUMENTS"]["status"] == "COMPLETED" and tasks["REQUIRED_DOCUMENTS"]["source_id"] == nid.json()["id"]
        assert tasks["MEDICAL_EXAM"]["status"] == "COMPLETED" and tasks["MEDICAL_EXAM"]["source_id"] == medical.json()["id"]

        # Withdrawn evidence reopens the task.
        assert (await c.delete(f"{HR}/employees/{emp_id}/photo")).status_code == 204
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert tasks["EMPLOYEE_PHOTO"]["status"] == "DUE" and tasks["PHOTO_CONSENT"]["status"] == "DUE"
        assert tasks["PHOTO_CONSENT"]["source_id"] is None


@pytest.mark.asyncio
async def test_onboarding_checklist_waiver_requires_permission_reason_and_audit(db_session_integration, _tmp_media):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        emp_id = (await c.post(f"{HR}/onboarding", json=_body("waive-req-00001", s, gate=False))).json()["employee"]["id"]
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
    photo_task, docs_task = tasks["EMPLOYEE_PHOTO"]["id"], tasks["REQUIRED_DOCUMENTS"]["id"]

    role = s["role"]
    role.name, role.permissions = "clerk", {"hr.access": True, "hr.compliance.view": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).status_code == 200
        assert (await c.post(f"{HR}/onboarding-tasks/{docs_task}/waive", json={"reason": "Worker has no NID yet"})).status_code == 403
    role.permissions = {"hr.access": True, "hr.compliance.view": False}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).status_code == 403

    role.name, role.permissions = "clerk", {"hr.access": True, "hr.compliance.manage": True, "hr.identity.manage": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.post(f"{HR}/onboarding-tasks/{docs_task}/waive", json={"reason": "  "})).status_code == 422
        assert (await c.post(f"{HR}/onboarding-tasks/{docs_task}/waive", json={})).status_code == 422
        ok = await c.post(f"{HR}/onboarding-tasks/{docs_task}/waive", json={"reason": "Birth registration pending at union office"})
        assert ok.status_code == 200 and ok.json()["status"] == "WAIVED"
        assert (await c.post(f"{HR}/onboarding-tasks/{docs_task}/waive", json={"reason": "Again please"})).status_code == 409
        # Real evidence arriving later leaves the waiver as recorded.
        await c.post(f"{HR}/employees/{emp_id}/documents/upload", files={"file": ("nid.pdf", PDF, "application/pdf")}, data={"document_type": "NID_SCAN"})
        await c.post(f"{HR}/employees/{emp_id}/photo", files={"file": ("me.png", _png(), "image/png")}, data={"privacy_notice_acknowledged": "true"})
        tasks = {t["task_type"]: t for t in (await c.get(f"{HR}/employees/{emp_id}/onboarding-tasks")).json()}
        assert tasks["REQUIRED_DOCUMENTS"]["status"] == "WAIVED"
        assert tasks["EMPLOYEE_PHOTO"]["status"] == "COMPLETED"
        assert (await c.post(f"{HR}/onboarding-tasks/{photo_task}/waive", json={"reason": "Already done"})).status_code == 409
    audit = (
        await db.execute(select(AuditLog).where(AuditLog.tenant_id == s["tid"], AuditLog.action == "HR_ONBOARDING_TASK_WAIVED"))
    ).scalars().all()
    assert len(audit) == 1 and "Birth registration pending" in audit[0].details
    task = await db.get(HrEmployeeOnboardingTask, docs_task)
    assert task.waived_by == s["user"].id and task.waive_reason.startswith("Birth registration")
