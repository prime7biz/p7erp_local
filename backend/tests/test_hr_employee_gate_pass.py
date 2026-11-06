"""Temporary gate passes: QR validity, expiry, revocation, zones, duplicate scans, employee ID cards,
permissions and tenant isolation.

Run: docker compose exec backend pytest tests/test_hr_employee_gate_pass.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.common.business_date import now_local
from app.common.permissions import PERMISSION_HR_GATE_PASS_SCAN
from app.models.hr import Employee
from app.models.hr_lifecycle import HrEmployeeGateEvent, HrEmployeeGatePass
from app.modules.hr.hr_document_generator_service import employee_card_qr_payload
from app.modules.hr_gate.router import qr_token
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/gate-passes"


async def _tenant(db, role_name="manager", perms=None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=perms or {"hr.access": True})
    role.name = role_name
    await db.commit()
    return tenant, user


def _window(tenant, start_h=-1, end_h=8):
    now = now_local(tenant).replace(tzinfo=None)
    return (now + timedelta(hours=start_h)).isoformat(), (now + timedelta(hours=end_h)).isoformat()


async def _pass(c, tenant, **extra):
    vf, vt = _window(tenant)
    body = {"person_name": "Karim (temp)", "mobile": "01712345678", "purpose": "Machine repair", "valid_from": vf, "valid_to": vt, **extra}
    r = await c.post(URL, json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _key() -> str:
    return uuid.uuid4().hex


@pytest.mark.asyncio
async def test_lifecycle_scan_duplicate_and_revoke(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        gp = await _pass(c, tenant, permitted_zones=["production"])
        assert gp["status"] == "DRAFT" and gp["pass_code"].startswith("GP-")
        row = await db.get(HrEmployeeGatePass, gp["id"])
        token = qr_token(row)
        assert row.qr_token_hash != token and len(row.qr_token_hash) == 64  # only the hash is stored
        draft = await c.post(f"{URL}/scan", json={"qr": token, "zone": "PRODUCTION", "idempotency_key": _key()})
        assert draft.json()["result"] == "DENIED" and "DRAFT" in draft.json()["reason"]
        assert (await c.post(f"{URL}/{gp['id']}/activate")).status_code == 200
        pdf = await c.get(f"{URL}/{gp['id']}/print")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
        key = _key()
        ok = await c.post(f"{URL}/scan", json={"qr": token, "zone": "production", "direction": "IN", "idempotency_key": key})
        assert ok.json()["result"] == "ALLOWED" and ok.json()["holder"]["pass_code"] == gp["pass_code"]
        again = await c.post(f"{URL}/scan", json={"qr": token, "zone": "production", "idempotency_key": key})
        assert again.json()["duplicate"] is True and again.json()["event_id"] == ok.json()["event_id"]
        zone = await c.post(f"{URL}/verify", json={"qr": token, "zone": "STORE"})
        assert zone.json()["result"] == "DENIED"
        forged = await c.post(f"{URL}/scan", json={"qr": token[:-2] + "00", "idempotency_key": _key()})
        assert forged.json()["result"] == "DENIED"
        assert (await c.post(f"{URL}/{gp['id']}/revoke", json={"reason": "Job finished"})).json()["status"] == "REVOKED"
        revoked = await c.post(f"{URL}/scan", json={"qr": token, "zone": "production", "idempotency_key": _key()})
        assert revoked.json()["result"] == "DENIED"
        assert (await c.get(f"{URL}/{gp['id']}/print")).status_code == 409
    events = (await db.execute(select(HrEmployeeGateEvent).where(HrEmployeeGateEvent.tenant_id == tenant.id))).scalars().all()
    assert len(events) == 4  # duplicate scan did not add a row
    assert {e.result for e in events} == {"ALLOWED", "DENIED"}


@pytest.mark.asyncio
async def test_expiry_and_window_validation(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        vf, vt = _window(tenant, -5, -1)
        r = await c.post(URL, json={"person_name": "Old", "mobile": "01712345678", "purpose": "Visit", "valid_from": vf, "valid_to": vt})
        gp = r.json()
        assert (await c.post(f"{URL}/{gp['id']}/activate")).status_code == 409
        row = await db.get(HrEmployeeGatePass, gp["id"])
        row.status = "ACTIVE"
        await db.commit()
        res = await c.post(f"{URL}/scan", json={"qr": qr_token(row), "idempotency_key": _key()})
        assert res.json()["result"] == "DENIED" and "expired" in res.json()["reason"]
        await db.refresh(row)
        assert row.status == "EXPIRED"
        vf, vt = _window(tenant, 0, 24 * 40)
        too_long = await c.post(URL, json={"person_name": "X", "mobile": "01712345678", "purpose": "Long", "valid_from": vf, "valid_to": vt})
        assert too_long.status_code == 422


@pytest.mark.asyncio
async def test_employee_id_card_scan(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000009", first_name="Nasima", is_active=True)
    db.add(emp)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        ok = await c.post(f"{URL}/scan", json={"qr": employee_card_qr_payload(tenant.id, emp.employee_code), "idempotency_key": _key()})
        assert ok.json()["result"] == "ALLOWED" and ok.json()["holder"]["employee_code"] == "EMP-0000009"
        emp.is_active = False
        await db.commit()
        left = await c.post(f"{URL}/scan", json={"qr": employee_card_qr_payload(tenant.id, emp.employee_code), "idempotency_key": _key()})
        assert left.json()["result"] == "DENIED"


@pytest.mark.asyncio
async def test_tenant_isolation_and_permissions(db_session_integration):
    db = db_session_integration
    tenant_a, user_a = await _tenant(db)
    async with api_client(db, tenant_a, user_a) as c:
        gp = await _pass(c, tenant_a)
        await c.post(f"{URL}/{gp['id']}/activate")
    token = qr_token(await db.get(HrEmployeeGatePass, gp["id"]))
    card = employee_card_qr_payload(tenant_a.id, "EMP-0000001")
    tenant_b, user_b = await _tenant(db)
    async with api_client(db, tenant_b, user_b) as c:
        r = await c.post(f"{URL}/scan", json={"qr": token, "idempotency_key": _key()})
        assert r.json()["result"] == "DENIED" and r.json()["reason"] == "Unknown pass"
        assert (await c.post(f"{URL}/scan", json={"qr": card, "idempotency_key": _key()})).json()["result"] == "DENIED"
        assert (await c.post(f"{URL}/{gp['id']}/revoke", json={"reason": "hack"})).status_code == 404
        assert (await c.get(f"{URL}/{gp['id']}/print")).status_code == 404
    tenant_g, guard = await _tenant(db, role_name="guard", perms={"hr.access": True, PERMISSION_HR_GATE_PASS_SCAN: True})
    async with api_client(db, tenant_g, guard) as c:
        assert (await c.post(f"{URL}/verify", json={"qr": "P7GP:abc"})).status_code == 200
        assert (await c.get(URL)).status_code == 403
        vf, vt = _window(tenant_g)
        assert (await c.post(URL, json={"person_name": "X", "mobile": "01712345678", "purpose": "Repair", "valid_from": vf, "valid_to": vt})).status_code == 403
    tenant_c, clerk = await _tenant(db, role_name="clerk")
    async with api_client(db, tenant_c, clerk) as c:
        assert (await c.post(f"{URL}/scan", json={"qr": "P7GP:abc", "idempotency_key": _key()})).status_code == 403
