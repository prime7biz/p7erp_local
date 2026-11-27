"""HR Class voucher-style requests (Phases 1–4 backend).

Run: docker compose exec backend pytest tests/test_hr_class_requests_engine.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_3, AUTHORITY_CLASS_4
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Employee, LeaveType, Role, Tenant, User
from app.models.hr_class_request import HrClassRequest
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant
from app.modules.hr_class_requests.state_machine import assert_transition
from fastapi import HTTPException

API = "/api/v1/hr/class-requests"


def _not_friday(start: date) -> date:
    """The default HR weekend is Friday. Leave on that day is rejected before the class check."""
    day = start
    while day.weekday() == 4:
        day += timedelta(days=1)
    return day


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"HrClass {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"HC{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={"hr.access": True, "hr.payroll.manage": True})
    db.add(role)
    await db.flush()

    async def _user(prefix: str, cls: str, *, modules: list[str] | None = None, super_admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
            is_tenant_super_admin=super_admin,
        )
        db.add(u)
        await db.flush()
        for code in modules or ["hr"]:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code=code))
        await db.flush()
        return u

    users = {
        "c4": await _user("c4", AUTHORITY_CLASS_4),
        "c3": await _user("c3", AUTHORITY_CLASS_3),
        "c2": await _user("c2", AUTHORITY_CLASS_2),
        "c1a": await _user("c1a", AUTHORITY_CLASS_1),
        "c1b": await _user("c1b", AUTHORITY_CLASS_1),
        "super": await _user("sup", AUTHORITY_CLASS_1, super_admin=True),
    }
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{slug[:6]}",
        first_name="Karim",
        last_name="Ali",
        is_active=True,
        joining_date=date.today() - timedelta(days=400),
    )
    db.add(emp)
    await db.commit()
    return tenant, users, emp


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    # Snapshot scalars up front — a later safe_async_session_rollback can expire ORM attrs.
    uid = int(user.id)
    tid = int(tenant.id)
    sv = int(user.auth_session_version or 0)
    token = create_access_token(uid, tenant_id=tid, session_version=sv)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tid)}


@pytest.mark.asyncio
async def test_flag_off_returns_409(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                API,
                headers=_headers(users["c4"], tenant),
                json={
                    "kind": "CORRECTION",
                    "request_id": f"req-{uuid.uuid4().hex[:12]}",
                    "employee_id": emp.id,
                    "payload": {"info": {"phone": "01700000000"}},
                    "reason": "fix phone",
                },
            )
            assert r.status_code == 409, r.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class2_auto_recommend_and_class1_maker_needs_class2(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)
    emp_id = int(emp.id)
    h_c2 = _headers(users["c2"], tenant)
    h_c1a = _headers(users["c1a"], tenant)
    h_c1b = _headers(users["c1b"], tenant)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Class 2 entry auto-recommends
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=h_c2,
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp_id,
                    "payload": {"info": {"phone": "01711111111"}},
                    "reason": "phone update",
                },
            )
            assert created.status_code == 201, created.text
            pk = created.json()["id"]
            submitted = await client.post(f"{API}/{pk}/submit", headers=h_c2)
            assert submitted.status_code == 200, submitted.text
            assert submitted.json()["status"] == "RECOMMENDED"
            assert submitted.json()["recommend_is_auto"] is True

            # Same Class 2 cannot approve (SoD / class gate)
            denied = await client.post(f"{API}/{pk}/approve", headers=h_c2)
            assert denied.status_code == 403, denied.text

            # Class 1 can approve; CORRECTION info apply must succeed
            ok = await client.post(f"{API}/{pk}/approve", headers=h_c1a)
            assert ok.status_code == 200, ok.text
            assert ok.json()["status"] == "APPLIED", ok.text

            # Class 1 maker still needs Class 2 recommendation
            rid2 = f"req-{uuid.uuid4().hex[:12]}"
            c1_draft = await client.post(
                API,
                headers=h_c1a,
                json={
                    "kind": "CORRECTION",
                    "request_id": rid2,
                    "employee_id": emp_id,
                    "payload": {"info": {"phone": "01722222222"}},
                    "reason": "another fix",
                },
            )
            assert c1_draft.status_code == 201, c1_draft.text
            pk2 = c1_draft.json()["id"]
            sub2 = await client.post(f"{API}/{pk2}/submit", headers=h_c1a)
            assert sub2.status_code == 200, sub2.text
            assert sub2.json()["status"] == "SUBMITTED"
            # Class 1 cannot skip recommend
            skip = await client.post(f"{API}/{pk2}/approve", headers=h_c1b)
            assert skip.status_code == 409, skip.text
            rec = await client.post(f"{API}/{pk2}/recommend", headers=h_c2)
            assert rec.status_code == 200, rec.text
            # Enterer cannot approve own request (maker SoD)
            own = await client.post(f"{API}/{pk2}/approve", headers=h_c1a)
            assert own.status_code == 403, own.text
            # Different Class 1 approves
            appr = await client.post(f"{API}/{pk2}/approve", headers=h_c1b)
            assert appr.status_code == 200, appr.text
            assert appr.json()["status"] == "APPLIED", appr.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_self_target_blocked(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)
    emp.user_id = users["c2"].id
    await db.commit()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users["c4"], tenant),
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp.id,
                    "payload": {"info": {"phone": "01733333333"}},
                    "reason": "self target",
                },
            )
            pk = created.json()["id"]
            await client.post(f"{API}/{pk}/submit", headers=_headers(users["c4"], tenant))
            denied = await client.post(f"{API}/{pk}/recommend", headers=_headers(users["c2"], tenant))
            assert denied.status_code == 403, denied.text
            assert "own employee" in denied.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_locked_direct_write_409(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.patch(
                f"/api/v1/hr/employees/{emp.id}",
                headers=_headers(users["c1a"], tenant),
                json={"first_name": "Blocked"},
            )
            assert r.status_code == 409, r.text
            assert "HR_REQUEST_REQUIRED" in r.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_request_id_replay(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)
    rid = f"req-{uuid.uuid4().hex[:12]}"

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            body = {
                "kind": "CORRECTION",
                "request_id": rid,
                "employee_id": emp.id,
                "payload": {"info": {"phone": "01744444444"}},
                "reason": "replay",
            }
            a = await client.post(API, headers=_headers(users["c4"], tenant), json=body)
            b = await client.post(API, headers=_headers(users["c4"], tenant), json=body)
            assert a.status_code == 201, a.text
            assert b.status_code == 200, b.text
            assert a.json()["id"] == b.json()["id"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    tenant_a, users_a, emp_a = await _seed(db, flag_on=True)
    tenant_b, users_b, _emp_b = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Create on A
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users_a["c4"], tenant_a),
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp_a.id,
                    "payload": {"info": {"phone": "01755555555"}},
                    "reason": "x-tenant",
                },
            )
            pk = created.json()["id"]
            # Tenant B cannot see it
            missing = await client.get(f"{API}/{pk}", headers=_headers(users_b["c1a"], tenant_b))
            assert missing.status_code == 404, missing.text
            # Tenant B cannot use tenant A employee id
            bad = await client.post(
                API,
                headers=_headers(users_b["c4"], tenant_b),
                json={
                    "kind": "CORRECTION",
                    "request_id": f"req-{uuid.uuid4().hex[:12]}",
                    "employee_id": emp_a.id,
                    "payload": {"info": {"phone": "01766666666"}},
                    "reason": "steal",
                },
            )
            assert bad.status_code in {400, 404}, bad.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_leave_create_locked_and_class_request_path(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)
    lt = LeaveType(tenant_id=tenant.id, code="CL", name="Casual", is_paid=True, requires_approval=True, is_active=True)
    db.add(lt)
    await db.commit()
    await db.refresh(lt)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    direct_day = _not_friday(date.today())
    class_day = _not_friday(direct_day + timedelta(days=1))
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            locked = await client.post(
                "/api/v1/hr/leave/requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "employee_id": emp.id,
                    "leave_type_id": lt.id,
                    "from_date": direct_day.isoformat(),
                    "to_date": direct_day.isoformat(),
                    "days_requested": "1",
                    "reason": "direct",
                },
            )
            assert locked.status_code == 409, locked.text

            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users["c2"], tenant),
                json={
                    "kind": "LEAVE",
                    "request_id": rid,
                    "employee_id": emp.id,
                    "payload": {
                        "leave_type_id": lt.id,
                        "from_date": class_day.isoformat(),
                        "to_date": class_day.isoformat(),
                        "days_requested": "1",
                        "reason": "class leave",
                    },
                    "reason": "class leave",
                },
            )
            assert created.status_code == 201, created.text
            pk = created.json()["id"]
            sub = await client.post(f"{API}/{pk}/submit", headers=_headers(users["c2"], tenant))
            assert sub.status_code == 200, sub.text
            assert sub.json()["status"] == "RECOMMENDED"
            assert sub.json()["leave_request_id"] is not None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_return_re_auto_recommend(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users["c2"], tenant),
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp.id,
                    "payload": {"info": {"phone": "01777777777"}},
                    "reason": "return cycle",
                },
            )
            pk = created.json()["id"]
            await client.post(f"{API}/{pk}/submit", headers=_headers(users["c2"], tenant))
            returned = await client.post(
                f"{API}/{pk}/return",
                headers=_headers(users["c1a"], tenant),
                json={"note": "please fix"},
            )
            assert returned.status_code == 200, returned.text
            assert returned.json()["status"] == "RETURNED"
            # Class 2 resubmit auto-recommends again
            again = await client.post(f"{API}/{pk}/resubmit", headers=_headers(users["c2"], tenant))
            assert again.status_code == 200, again.text
            assert again.json()["status"] == "RECOMMENDED"
            assert again.json()["recommend_is_auto"] is True
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_state_machine_transitions():
    assert assert_transition("DRAFT", "SUBMIT") == "SUBMITTED"
    assert assert_transition("RETURNED", "RESUBMIT") == "SUBMITTED"
    assert assert_transition("SUBMITTED", "RECOMMEND") == "RECOMMENDED"
    with pytest.raises(HTTPException):
        assert_transition("DRAFT", "APPROVE")


@pytest.mark.asyncio
async def test_class3_cannot_recommend(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users["c4"], tenant),
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp.id,
                    "payload": {"info": {"phone": "01788888888"}},
                    "reason": "deny recommend",
                },
            )
            pk = created.json()["id"]
            await client.post(f"{API}/{pk}/submit", headers=_headers(users["c4"], tenant))
            denied = await client.post(f"{API}/{pk}/recommend", headers=_headers(users["c3"], tenant))
            assert denied.status_code == 403, denied.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_staff_cannot_spoof_ess_source(db_session_integration):
    """POST /hr/class-requests forces HR_ENTRY even if the client sends source=ESS."""
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            rid = f"req-{uuid.uuid4().hex[:12]}"
            created = await client.post(
                API,
                headers=_headers(users["c4"], tenant),
                json={
                    "kind": "CORRECTION",
                    "request_id": rid,
                    "employee_id": emp.id,
                    "source": "ESS",
                    "payload": {"info": {"phone": "01700001111"}},
                    "reason": "spoof ess",
                },
            )
            assert created.status_code == 201, created.text
            assert created.json()["source"] == "HR_ENTRY"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_legacy_change_request_locked_when_classes_on(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)
    # Dual flag: legacy Tier1/Tier2 also enabled must still be blocked by class authority.
    flags = dict(tenant.feature_flags or {})
    flags["hr_employee_change_approval"] = True
    tenant.feature_flags = flags
    await db.commit()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                f"/api/v1/hr/employees/{emp.id}/change-requests",
                headers=_headers(users["c1a"], tenant),
                json={
                    "kind": "INFO",
                    "request_id": f"chg-{uuid.uuid4().hex[:12]}",
                    "payload": {"phone": "01799999999"},
                    "reason": "legacy path",
                },
            )
            assert r.status_code == 409, r.text
            assert "HR_REQUEST_REQUIRED" in r.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_super_admin_direct_write_allowed(db_session_integration):
    db = db_session_integration
    tenant, users, emp = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.patch(
                f"/api/v1/hr/employees/{emp.id}",
                headers=_headers(users["super"], tenant),
                json={"first_name": "SuperOk"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["first_name"] == "SuperOk"
    finally:
        app.dependency_overrides.pop(get_db, None)
