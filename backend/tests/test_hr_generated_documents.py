"""Signed, versioned appointment letters / job descriptions and their public QR verification.

Run: docker compose exec backend pytest tests/test_hr_generated_documents.py -q
"""

from __future__ import annotations

import json
import re

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

import app.modules.document_verify.public_router as public_router
from app.common.tenant_feature_keys import (
    AUTO_DOCUMENT_GENERATION_ENABLED,
    HR_ONBOARDING_WORKSPACE_V2,
    PUBLIC_DOCUMENT_VERIFICATION_ENABLED,
)
from app.models.hr_onboarding import HrGeneratedEmployeeDocument
from tests.bd_hr_fixtures import api_client
from tests.test_hr_bd_enforcement import _rate, _setup, _structure
from tests.test_public_document_verify import public_client

HR = "/api/v1/hr"
PUBLIC = "/api/v1/public/verify/document"
VFY = re.compile(r"^VFY-[0-9A-F]{16}$")
PUBLIC_KEYS = {
    "is_valid", "document_type", "document_label", "document_number", "document_date", "status", "company_name",
    "amount", "currency", "quantity", "line_count", "signed_at", "employee_code", "employee_initials",
}


@pytest.fixture(autouse=True)
def _no_public_rate_limit(monkeypatch):
    monkeypatch.setattr(public_router, "PUBLIC_VERIFY_LIMIT_PER_MINUTE", 0)


async def _seeded(db, *, public=True, salary=True, nid="1234567890", workspace=True):
    tenant, user, role = await _setup(db)
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        AUTO_DOCUMENT_GENERATION_ENABLED: True,
        PUBLIC_DOCUMENT_VERIFICATION_ENABLED: public,
        HR_ONBOARDING_WORKSPACE_V2: workspace,
    }
    await db.commit()
    rate = await _rate(db, tenant, "W-G4")
    st = await _structure(db, tenant, "BD-W-G4")
    rate_id, st_id = rate.id, st.id
    async with api_client(db, tenant, user) as c:
        desig = (await c.post(f"{HR}/designations", json={
            "title": "Sewing Operator", "description": "Operate a single-needle machine.\nMeet the hourly target.",
        })).json()
        emp = (await c.post(f"{HR}/employees", json={
            "first_name": "Momena", "last_name": "Khatun", "phone": "01712340000", "national_id": nid,
            "joining_date": "2026-11-15", "designation_id": desig["id"], "employment_type": "permanent",
            "probation_months": 6, "facilities": ["Lunch", "Transport"], "father_name": "Abul Hossain",
            "present_address_line": "Road 5", "present_district": "Gazipur",
            "bank_account_number": "0099887766", "salary_payment_method": "bank",
        })).json()
        if salary:
            r = await c.put(f"{HR}/employees/{emp['id']}/compensation", json={
                "structure_id": st_id, "bd_wage_rate_id": rate_id, "effective_from": "2026-11-15",
            })
            assert r.status_code == 200, r.text
    return {"tenant": tenant, "user": user, "role": role, "tid": tenant.id, "emp": emp["id"]}


async def _issue(c, emp_id, kind="appointment-letter", **params):
    r = await c.post(f"{HR}/employees/{emp_id}/documents/{kind}", params=params)
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"
    return r


async def _doc(db, verification_id: str) -> HrGeneratedEmployeeDocument:
    return (
        await db.execute(
            select(HrGeneratedEmployeeDocument)
            .where(HrGeneratedEmployeeDocument.verification_id == verification_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


@pytest.mark.asyncio
async def test_appointment_snapshot_is_immutable_and_versioned(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        first = await _issue(c, s["emp"])
        vid1 = first.headers["x-verification-id"]
        assert VFY.match(vid1) and first.headers["x-document-version"] == "1"
        again = await _issue(c, s["emp"])
        assert again.headers["x-verification-id"] == vid1 and again.headers["x-document-outdated"] == "false"

        assert (await c.patch(f"{HR}/employees/{s['emp']}", json={"probation_months": 3})).status_code == 200
        stale = await _issue(c, s["emp"])
        assert stale.headers["x-verification-id"] == vid1 and stale.headers["x-document-outdated"] == "true"
        reissued = await _issue(c, s["emp"], reissue="true")
        vid2 = reissued.headers["x-verification-id"]
        assert vid2 != vid1 and reissued.headers["x-document-version"] == "2"

        listed = (await c.get(f"{HR}/employees/{s['emp']}/generated-documents")).json()
        assert [(d["document_version"], d["verification_id"]) for d in listed] == [(2, vid2), (1, vid1)]
        assert listed[0]["verify_url"].endswith(f"/verify/document/{vid2}")
        old_pdf = await c.get(f"{HR}/generated-documents/{listed[1]['id']}/pdf")
        assert old_pdf.status_code == 200 and old_pdf.headers["x-document-version"] == "1"

    v1, v2 = await _doc(db, vid1), await _doc(db, vid2)
    assert v1.snapshot["terms"]["probation_months"] == 6 and v2.snapshot["terms"]["probation_months"] == 3
    assert v1.snapshot["designation"] == "Sewing Operator"
    assert v1.snapshot["facilities"] == ["Lunch", "Transport"]
    assert v1.snapshot["salary"]["wage_grade"] == "W-G4" and v1.snapshot["salary"]["components"]
    assert v1.snapshot["employee"]["father_name"] == "Abul Hossain"
    assert v1.signed_at is not None and v1.signature_hash
    with pytest.raises(DBAPIError, match="immutable"):
        async with db.begin_nested():
            await db.execute(text("UPDATE hr_generated_employee_documents SET snapshot = '{}'::jsonb WHERE id = :i"), {"i": v1.id})
    with pytest.raises(DBAPIError, match="immutable"):
        async with db.begin_nested():
            await db.execute(text("DELETE FROM hr_generated_employee_documents WHERE id = :i"), {"i": v1.id})


@pytest.mark.asyncio
async def test_document_generation_request_replay_returns_same_version(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        a = await _issue(c, s["emp"], reissue="true", request_id="letter-req-0001")
        b = await _issue(c, s["emp"], reissue="true", request_id="letter-req-0001")
        assert a.headers["x-verification-id"] == b.headers["x-verification-id"]
        assert a.headers["x-document-version"] == b.headers["x-document-version"] == "1"
        other_kind = await c.post(
            f"{HR}/employees/{s['emp']}/documents/job-description", params={"request_id": "letter-req-0001"}
        )
        assert other_kind.status_code == 409
        jd = await _issue(c, s["emp"], kind="job-description", request_id="jd-request-0001")
        assert jd.headers["x-document-version"] == "1"
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter", params={"request_id": "bad id!"})).status_code == 422
    rows = (
        await db.execute(select(HrGeneratedEmployeeDocument).where(HrGeneratedEmployeeDocument.tenant_id == s["tid"]))
    ).scalars().all()
    assert sorted((r.document_type, r.document_version) for r in rows) == [("APPOINTMENT_LETTER", 1), ("JOB_DESCRIPTION", 1)]
    jd_row = next(r for r in rows if r.document_type == "JOB_DESCRIPTION")
    assert "single-needle" in jd_row.snapshot["job_description"] and "salary" not in jd_row.snapshot


@pytest.mark.asyncio
async def test_verification_id_is_unique(db_session_integration):
    db = db_session_integration
    a = await _seeded(db, nid="1111111111")
    b = await _seeded(db, nid="2222222222")
    ids: list[str] = []
    for s in (a, b):
        async with api_client(db, s["tenant"], s["user"]) as c:
            for _ in range(3):
                ids.append((await _issue(c, s["emp"], reissue="true")).headers["x-verification-id"])
            ids.append((await _issue(c, s["emp"], kind="job-description")).headers["x-verification-id"])
    assert len(ids) == len(set(ids)) == 8 and all(VFY.match(v) for v in ids)
    clash = await _doc(db, ids[0])
    with pytest.raises(DBAPIError):
        async with db.begin_nested():
            await db.execute(
                text(
                    "INSERT INTO hr_generated_employee_documents (tenant_id, employee_id, document_type, document_version, "
                    "snapshot_schema_version, snapshot, generation_request_id, verification_id, created_at) "
                    "VALUES (:t, :e, 'JOB_DESCRIPTION', 99, 1, '{}'::jsonb, 'dup-req', :v, now())"
                ),
                {"t": b["tid"], "e": b["emp"], "v": clash.verification_id},
            )


@pytest.mark.asyncio
async def test_public_verify_round_trip_and_tamper_detection(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        vid = (await _issue(c, s["emp"])).headers["x-verification-id"]
        jd_vid = (await _issue(c, s["emp"], kind="job-description")).headers["x-verification-id"]
    async with public_client(db) as p:
        ok = (await p.get(f"{PUBLIC}/{vid}")).json()
        assert ok["is_valid"] is True and ok["document_type"] == "APPOINTMENT_LETTER"
        assert ok["document_label"] == "Appointment letter" and ok["employee_initials"] == "M.K."
        assert ok["employee_code"] and ok["document_number"].startswith("AL-") and ok["document_number"].endswith("-V1")
        assert ok["company_name"] == s["tenant"].name
        assert (await p.get(f"{PUBLIC}/{jd_vid.lower()}")).json()["document_type"] == "JOB_DESCRIPTION"

    row = await _doc(db, vid)
    await db.execute(text("ALTER TABLE hr_generated_employee_documents DISABLE TRIGGER trg_hr_generated_employee_documents_signed_immutable"))
    await db.execute(
        text("UPDATE hr_generated_employee_documents SET snapshot = jsonb_set(snapshot, '{terms,probation_months}', '1') WHERE id = :i"),
        {"i": row.id},
    )
    await db.execute(text("ALTER TABLE hr_generated_employee_documents ENABLE TRIGGER trg_hr_generated_employee_documents_signed_immutable"))
    db.expire_all()  # the shared test session cached the row before the raw UPDATE
    async with public_client(db) as p:
        tampered = (await p.get(f"{PUBLIC}/{vid}")).json()
        assert tampered["is_valid"] is False


@pytest.mark.asyncio
async def test_public_verify_cross_tenant_and_feature_gate(db_session_integration):
    db = db_session_integration
    s = await _seeded(db, public=False, nid="3333333333")
    other = await _seeded(db, nid="4444444444")
    async with api_client(db, s["tenant"], s["user"]) as c:
        vid = (await _issue(c, s["emp"])).headers["x-verification-id"]
        doc_id = (await c.get(f"{HR}/employees/{s['emp']}/generated-documents")).json()[0]["id"]
    async with public_client(db) as p:
        assert (await p.get(f"{PUBLIC}/{vid}")).status_code == 404  # company has not switched public checks on
        assert (await p.get(f"{PUBLIC}/VFY-0000000000000000")).status_code == 404
        assert (await p.get(f"{PUBLIC}/not-a-code")).status_code == 404
    async with api_client(db, other["tenant"], other["user"]) as c:
        assert (await c.get(f"{HR}/generated-documents/{doc_id}/pdf")).status_code == 404
        assert (await c.get(f"{HR}/employees/{s['emp']}/generated-documents")).status_code == 404
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter")).status_code == 404
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/job-description")).status_code == 404
    s["tenant"].feature_flags = {**s["tenant"].feature_flags, AUTO_DOCUMENT_GENERATION_ENABLED: False}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter")).status_code == 403


@pytest.mark.asyncio
async def test_public_verify_response_excludes_sensitive_snapshot_keys(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        vid = (await _issue(c, s["emp"])).headers["x-verification-id"]
    row = await _doc(db, vid)
    async with public_client(db) as p:
        r = await p.get(f"{PUBLIC}/{vid}")
    body = r.json()
    assert set(body) <= PUBLIC_KEYS
    raw = r.text
    for secret in (
        "Momena", "Khatun", "Abul Hossain", "Road 5", "Gazipur", "0099887766", "1234567890",
        row.snapshot["salary"]["basic"], row.snapshot["salary"]["gross"], row.signature_hash, "Lunch",
    ):
        assert secret not in raw, secret
    assert body["amount"] is None and body["quantity"] is None
    assert json.dumps(row.snapshot).count("Abul Hossain") == 1  # the snapshot itself keeps it


@pytest.mark.asyncio
async def test_salary_letter_generation_requires_payroll_permission(db_session_integration):
    db = db_session_integration
    s = await _seeded(db)
    async with api_client(db, s["tenant"], s["user"]) as c:
        vid = (await _issue(c, s["emp"])).headers["x-verification-id"]
        no_salary_emp = (await c.post(f"{HR}/employees", json={
            "first_name": "Ruma", "phone": "01712349999", "national_id": "5555555555",
        })).json()["id"]
    salary_doc_id = (await _doc(db, vid)).id
    role = s["role"]
    role.name, role.permissions = "clerk", {"hr.access": True, "hr.documents.generate": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        denied = await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter", params={"reissue": "true"})
        assert denied.status_code == 403 and "hr.payroll.manage" in denied.text
        assert (await c.get(f"{HR}/generated-documents/{salary_doc_id}/pdf")).status_code == 403
        await _issue(c, s["emp"], kind="job-description")
        letter = await _issue(c, no_salary_emp)
        doc = await _doc(db, letter.headers["x-verification-id"])
        assert doc.snapshot["salary"] is None and doc.snapshot["salary_payment_method"] is None
        # The stored latest version still shows salary: re-download without reissue is refused too.
        stored = await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter")
        assert stored.status_code == 403 and "hr.payroll.manage" in stored.text
    role.permissions = {"hr.access": True, "hr.documents.generate": False}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.post(f"{HR}/employees/{no_salary_emp}/documents/job-description")).status_code == 403


@pytest.mark.asyncio
async def test_stored_letter_personal_details_need_sensitive_access(db_session_integration):
    db = db_session_integration
    s = await _seeded(db, salary=False, nid="6666666666")
    async with api_client(db, s["tenant"], s["user"]) as c:
        vid = (await _issue(c, s["emp"])).headers["x-verification-id"]
    doc_id = (await _doc(db, vid)).id
    role = s["role"]
    role.name, role.permissions = "viewer", {"hr.documents.view": True, "hr.documents.generate": True}
    await db.commit()
    async with api_client(db, s["tenant"], s["user"]) as c:
        assert (await c.get(f"{HR}/generated-documents/{doc_id}/pdf")).status_code == 403  # shows father's name / address
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter")).status_code == 403
        assert (await c.post(f"{HR}/employees/{s['emp']}/documents/job-description")).status_code == 200  # no personal data


@pytest.mark.asyncio
async def test_flag_off_keeps_the_original_unsigned_letter(db_session_integration):
    db = db_session_integration
    s = await _seeded(db, workspace=False, salary=False, nid="7777777777")
    async with api_client(db, s["tenant"], s["user"]) as c:
        r = await c.post(f"{HR}/employees/{s['emp']}/documents/appointment-letter")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert "x-verification-id" not in r.headers
    rows = (
        await db.execute(select(HrGeneratedEmployeeDocument).where(HrGeneratedEmployeeDocument.tenant_id == s["tid"]))
    ).scalars().all()
    assert rows == []
