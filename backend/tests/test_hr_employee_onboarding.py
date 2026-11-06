"""Employee onboarding: permanent numbering, Bangladesh identity rules, private photo / CV storage,
ID-card QR + issue register, biometric enrollment references and IN/OUT punch pairing.

Run: docker compose exec backend pytest tests/test_hr_employee_onboarding.py -q
"""

from __future__ import annotations

import io
from datetime import date, datetime

import pytest
from PIL import Image
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select

from app.config import get_settings
from app.models import AuditLog
from app.models.hr import Employee, EmployeeDocument
from app.models.hr_lifecycle import HrEmployeeBiometricEnrollment, HrEmployeePrivacyConsent
from app.modules.hr.hr_document_generator_service import employee_card_qr_payload, verify_employee_card_qr
from app.modules.hr_attendance.device_service import build_entry_values
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

HR = "/api/v1/hr"


@pytest.fixture(autouse=True)
def _tmp_media(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    yield tmp_path


async def _tenant(db, *, flags=None, role_name="manager", perms=None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=perms or {"hr.access": True})
    role.name = role_name
    tenant.feature_flags = flags
    await db.commit()
    return tenant, user, role


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), (120, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_numbers_are_sequential_permanent_and_never_reused(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        a = (await c.post(f"{HR}/employees", json={"first_name": "A"})).json()
        b = (await c.post(f"{HR}/employees", json={"first_name": "B"})).json()
        assert a["employee_code"] == "EMP-0000001" and b["employee_code"] == "EMP-0000002"
        assert (await c.post(f"{HR}/employees/{a['id']}/deactivate")).status_code == 200
        c3 = (await c.post(f"{HR}/employees", json={"first_name": "C"})).json()
        assert c3["employee_code"] == "EMP-0000003"
        # Same value is accepted (old forms resubmit it); a different value is refused.
        assert (await c.patch(f"{HR}/employees/{a['id']}", json={"employee_code": "EMP-0000001", "first_name": "A2"})).status_code == 200
        r = await c.patch(f"{HR}/employees/{a['id']}", json={"employee_code": "EMP-0000099"})
        assert r.status_code == 400 and "permanent" in r.text
        fmt = await c.put(f"{HR}/employee-number-format", json={"prefix": "FAC-", "width": 6})
        assert fmt.status_code == 200 and fmt.json()["next_code"] == "FAC-000004"
        d = (await c.post(f"{HR}/employees", json={"first_name": "D"})).json()
        assert d["employee_code"] == "FAC-000004"
        assert (await c.put(f"{HR}/employee-number-format", json={"prefix": "bad prefix!", "width": 6})).status_code in (400, 422)
    tenant2, user2, _ = await _tenant(db, role_name="clerk")
    async with api_client(db, tenant2, user2) as c:
        assert (await c.put(f"{HR}/employee-number-format", json={"prefix": "X-", "width": 5})).status_code == 403


@pytest.mark.asyncio
async def test_bangladesh_identity_rules(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db, flags={"hr_bd_identity_required": True})
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{HR}/employees", json={"first_name": "NoId", "phone": "01712345678"})
        assert r.status_code == 422 and "NID or birth registration" in r.text
        r = await c.post(f"{HR}/employees", json={"first_name": "NoPhone", "national_id": "1234567890"})
        assert r.status_code == 422 and "mobile" in r.text
        assert (await c.post(f"{HR}/employees", json={"first_name": "X", "national_id": "12345", "phone": "01712345678"})).status_code == 400
        assert (await c.post(f"{HR}/employees", json={"first_name": "X", "birth_registration_no": "123", "phone": "01712345678"})).status_code == 400
        assert (await c.post(f"{HR}/employees", json={"first_name": "X", "national_id": "1234567890", "phone": "12345"})).status_code == 400
        ok = await c.post(f"{HR}/employees", json={"first_name": "Rina", "national_id": "123 456 7890", "phone": "+8801712345678"})
        assert ok.status_code == 201, ok.text
        assert ok.json()["national_id"] == "1234567890" and ok.json()["phone"] == "01712345678"
        brn = await c.post(f"{HR}/employees", json={"first_name": "Mita", "birth_registration_no": "20051234567890123", "phone": "01812345678"})
        assert brn.status_code == 201
        dup = await c.post(f"{HR}/employees", json={"first_name": "Copy", "national_id": "1234567890", "phone": "01912345678"})
        assert dup.status_code == 409 and ok.json()["employee_code"] in dup.text
        # Removing the only identity on update is refused.
        r = await c.patch(f"{HR}/employees/{ok.json()['id']}", json={"national_id": None})
        assert r.status_code == 422
    other, other_user, _ = await _tenant(db, flags={"hr_bd_identity_required": True})
    async with api_client(db, other, other_user) as c:
        r = await c.post(f"{HR}/employees", json={"first_name": "Same", "national_id": "1234567890", "phone": "01712345678"})
        assert r.status_code == 201  # another company's employee is not visible
    plain, plain_user, _ = await _tenant(db)
    async with api_client(db, plain, plain_user) as c:
        assert (await c.post(f"{HR}/employees", json={"first_name": "Legacy"})).status_code == 201


@pytest.mark.asyncio
async def test_photo_is_private_encrypted_and_needs_privacy_notice(db_session_integration, _tmp_media):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    emp = Employee(tenant_id=tenant.id, employee_code="P-1", first_name="Photo")
    db.add(emp)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        files = {"file": ("me.png", _png(), "image/png")}
        assert (await c.post(f"{HR}/employees/{emp.id}/photo", files=files)).status_code == 400  # no acknowledgement
        fake = {"file": ("x.png", b"<script>alert(1)</script>", "image/png")}
        assert (await c.post(f"{HR}/employees/{emp.id}/photo", files=fake, data={"privacy_notice_acknowledged": "true"})).status_code == 400
        r = await c.post(f"{HR}/employees/{emp.id}/photo", files=files, data={"privacy_notice_acknowledged": "true"})
        assert r.status_code == 200, r.text
        got = await c.get(f"{HR}/employees/{emp.id}/photo")
        assert got.status_code == 200 and got.content.startswith(b"\x89PNG") and "no-store" in got.headers["cache-control"]
        assert (await c.get(f"{HR}/employees/{emp.id}")).json()["has_photo"] is True
    stored = list((_tmp_media / str(tenant.id) / "hr_secure" / "photo").iterdir())
    assert len(stored) == 1 and b"PNG" not in stored[0].read_bytes()  # encrypted at rest
    consent = (await db.execute(select(HrEmployeePrivacyConsent).where(HrEmployeePrivacyConsent.employee_id == emp.id))).scalar_one()
    assert consent.purpose == "PHOTO" and consent.notice_version and consent.withdrawn_at is None
    viewed = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "HR_EMPLOYEE_PHOTO_VIEWED"))).scalars().all()
    assert len(viewed) == 1
    other, other_user, _ = await _tenant(db)
    async with api_client(db, other, other_user) as c:
        assert (await c.get(f"{HR}/employees/{emp.id}/photo")).status_code == 404
    denied, denied_user, _ = await _tenant(db, role_name="clerk", perms={"hr.access": True, "hr.documents.view": False})
    async with api_client(db, denied, denied_user) as c:
        assert (await c.get(f"{HR}/employees/{emp.id}/photo")).status_code == 403  # checked before any lookup
    async with api_client(db, tenant, user) as c:
        assert (await c.delete(f"{HR}/employees/{emp.id}/photo")).status_code == 204
    await db.refresh(consent)
    assert consent.withdrawn_at is not None
    assert not list((_tmp_media / str(tenant.id) / "hr_secure" / "photo").iterdir())


@pytest.mark.asyncio
async def test_cv_upload_download_and_client_paths_ignored(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    emp = Employee(tenant_id=tenant.id, employee_code="CV-1", first_name="Cv")
    db.add(emp)
    await db.commit()
    pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{HR}/employees/{emp.id}/documents/upload", files={"file": ("cv.pdf", pdf, "application/pdf")}, data={"document_type": "CV"})
        assert r.status_code == 201, r.text
        doc_id = r.json()["id"]
        dl = await c.get(f"{HR}/employees/{emp.id}/documents/{doc_id}/download")
        assert dl.status_code == 200 and dl.content == pdf
        exe = await c.post(f"{HR}/employees/{emp.id}/documents/upload", files={"file": ("cv.pdf", b"MZ\x90\x00", "application/pdf")})
        assert exe.status_code == 400
        meta = await c.post(f"{HR}/employees/{emp.id}/documents", json={"document_type": "NID", "file_path": "/etc/passwd"})
        assert meta.status_code in (200, 201) and meta.json()["file_path"] is None
    actions = set((await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars())
    assert {"HR_EMPLOYEE_DOCUMENT_UPLOADED", "HR_EMPLOYEE_DOCUMENT_DOWNLOADED"} <= actions
    clerk_tenant, clerk, _ = await _tenant(db, role_name="clerk")
    e2 = Employee(tenant_id=clerk_tenant.id, employee_code="C-2", first_name="Two")
    db.add(e2)
    await db.commit()
    async with api_client(db, clerk_tenant, clerk) as c:
        r = await c.post(f"{HR}/employees/{e2.id}/documents/upload", files={"file": ("cv.pdf", pdf, "application/pdf")})
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_id_card_qr_and_issue_register(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db, flags={"auto_document_generation_enabled": True})
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000007", first_name="Card", is_active=True)
    db.add(emp)
    await db.commit()
    payload = employee_card_qr_payload(tenant.id, emp.employee_code)
    assert verify_employee_card_qr(payload) == (tenant.id, "EMP-0000007")
    assert verify_employee_card_qr(payload.replace("0000007", "0000008")) is None
    async with api_client(db, tenant, user) as c:
        r1 = await c.post(f"{HR}/employees/{emp.id}/documents/id-card")
        assert r1.status_code == 200 and r1.content.startswith(b"%PDF")
        assert (await c.post(f"{HR}/employees/{emp.id}/documents/id-card")).status_code == 200
    issues = (
        await db.execute(
            select(EmployeeDocument).where(EmployeeDocument.employee_id == emp.id, EmployeeDocument.document_type == "ID_CARD_ISSUE").order_by(EmployeeDocument.id)
        )
    ).scalars().all()
    assert [i.notes for i in issues] == ["First issue", "Reprint #1"]
    assert {i.document_number for i in issues} == {"EMP-0000007"}


@pytest.mark.asyncio
async def test_biometric_reference_only_consent_and_deletion(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    emp = Employee(tenant_id=tenant.id, employee_code="B-1", first_name="Bio", attendance_device_pin="77")
    db.add(emp)
    await db.commit()
    cols = {c.name for c in HrEmployeeBiometricEnrollment.__table__.columns}
    assert not {c for c in cols if any(w in c for w in ("template", "image", "embedding", "blob", "minutiae"))}
    async with api_client(db, tenant, user) as c:
        url = f"{HR}/employees/{emp.id}/biometric-enrollments"
        assert (await c.post(url, json={"modality": "FINGERPRINT", "privacy_notice_acknowledged": False})).status_code == 400
        r = await c.post(url, json={"modality": "FINGERPRINT", "privacy_notice_acknowledged": True})
        assert r.status_code == 201 and r.json()["device_user_ref"] == "77" and r.json()["status"] == "PENDING"
        assert (await c.post(url, json={"modality": "FINGERPRINT", "privacy_notice_acknowledged": True})).status_code == 409
        eid = r.json()["id"]
        assert (await c.post(f"{HR}/biometric-enrollments/{eid}/confirm-deletion")).status_code == 409
        assert (await c.post(f"{HR}/biometric-enrollments/{eid}/enrolled", json={"test_punch_confirmed": True})).json()["status"] == "ENROLLED"
        w = await c.post(f"{HR}/biometric-enrollments/{eid}/withdraw")
        assert w.json()["status"] == "DELETION_PENDING" and w.json()["consent_withdrawn_at"]
        tasks = (await c.get(f"{HR}/biometric-enrollments/deletion-tasks")).json()
        assert [t["id"] for t in tasks] == [eid]
        assert (await c.post(f"{HR}/biometric-enrollments/{eid}/confirm-deletion")).json()["status"] == "DELETED"
        again = await c.post(url, json={"modality": "FINGERPRINT", "privacy_notice_acknowledged": True})
        assert again.status_code == 201 and again.json()["id"] == eid  # re-enrolment reuses the reference row
    clerk_tenant, clerk, _ = await _tenant(db, role_name="clerk")
    async with api_client(db, clerk_tenant, clerk) as c:
        assert (await c.post(f"{HR}/employees/{emp.id}/biometric-enrollments", json={"modality": "FACE", "privacy_notice_acknowledged": True})).status_code == 403


@pytest.mark.asyncio
async def test_hire_candidate_creates_one_employee(db_session_integration):
    from app.models import Candidate

    db = db_session_integration
    tenant, user, _ = await _tenant(db, flags={"hr_bd_identity_required": True})
    cand = Candidate(tenant_id=tenant.id, full_name="Shirin Akter", phone="01712345678", stage="offer", status="active")
    db.add(cand)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        url = f"{HR}/recruitment/candidates/{cand.id}/hire"
        bad = await c.post(url, json={"joining_date": "2026-11-10"})
        assert bad.status_code == 422  # NID / birth registration required
        r = await c.post(url, json={"joining_date": "2026-11-10", "national_id": "1234567890"})
        assert r.status_code == 201, r.text
        assert r.json()["employee_code"].startswith("EMP-")
        assert (await c.post(url, json={"joining_date": "2026-11-10", "national_id": "1234567891"})).status_code == 409
    await db.refresh(cand)
    assert cand.stage == "hired" and r.json()["employee_code"] in cand.notes


def test_single_out_punch_is_recorded_as_out():
    day = date(2026, 11, 5)
    t = datetime(2026, 11, 5, 17, 2)
    out_only = build_entry_values(day, [t], None, {t: "OUT"})
    assert out_only["in_time"] is None and out_only["out_time"] == t.time()
    in_only = build_entry_values(day, [t], None, {t: "IN"})
    assert in_only["in_time"] == t.time() and in_only["out_time"] is None
    legacy = build_entry_values(day, [datetime(2026, 11, 5, 8), t], None)
    assert legacy["in_time"].hour == 8 and legacy["out_time"] == t.time()
