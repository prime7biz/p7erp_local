"""Phase 6 HR: module grants + manager-equivalent gates (user_authority_classes_v1).

Run: docker compose exec backend pytest tests/test_authority_hr.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_4
from app.common.permissions import is_hr_manager_equivalent, require_hr_manager_or_admin
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"HrAuth {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"HA{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, modules: list[str], admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=admin_role.id if admin else user_role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
        )
        db.add(u)
        await db.flush()
        for code in modules:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code=code))
        await db.flush()
        return u

    users = {
        "c1_hr": await _user("c1h", AUTHORITY_CLASS_1, modules=["hr"]),
        "c4_hr": await _user("c4h", AUTHORITY_CLASS_4, modules=["hr"]),
        "c4_fin": await _user("c4f", AUTHORITY_CLASS_4, modules=["finance"]),
        "c1_merch": await _user("c1m", AUTHORITY_CLASS_1, modules=["merch"]),
        "admin_legacy": await _user("adm", AUTHORITY_CLASS_4, modules=[], admin=True),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_module_grant_blocks_hr_without_hr(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get("/api/v1/hr/departments", headers=_headers(users["c4_fin"], tenant))
            assert denied.status_code == 403, denied.text
            allowed = await client.get("/api/v1/hr/departments", headers=_headers(users["c4_hr"], tenant))
            assert allowed.status_code == 200, allowed.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_hr_can_use_manager_department_impact(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Missing department still requires manager gate first → 403 for Class 4, Class 1 proceeds to 404.
            denied = await client.get(
                "/api/v1/hr/departments/999999/delete-impact",
                headers=_headers(users["c4_hr"], tenant),
            )
            assert denied.status_code == 403, denied.text

            missing = await client.get(
                "/api/v1/hr/departments/999999/delete-impact",
                headers=_headers(users["c1_hr"], tenant),
            )
            assert missing.status_code == 404, missing.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_class1_hr_not_manager_equivalent(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    assert await is_hr_manager_equivalent(db, users["admin_legacy"], tenant.id) is True
    assert await is_hr_manager_equivalent(db, users["c1_hr"], tenant.id) is False

    with pytest.raises(HTTPException) as exc:
        await require_hr_manager_or_admin(db, users["c1_hr"], tenant.id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_is_hr_manager_equivalent_class1_hr_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    assert await is_hr_manager_equivalent(db, users["c1_hr"], tenant.id) is True
    assert await is_hr_manager_equivalent(db, users["c4_hr"], tenant.id) is False
    assert await is_hr_manager_equivalent(db, users["c1_merch"], tenant.id) is False
    await require_hr_manager_or_admin(db, users["c1_hr"], tenant.id)

    with pytest.raises(HTTPException):
        await require_hr_manager_or_admin(db, users["c4_hr"], tenant.id)


@pytest.mark.asyncio
async def test_class1_hr_viewer_rights_and_cancel_change_request(db_session_integration):
    """Reuse hr_change_requests: Class1+hr sees pay and can cancel another user's open request."""
    from datetime import datetime

    from app.models import Employee
    from app.models.hr_change_request import HrEmployeeChangeRequest
    from app.modules.hr_change_requests import service as cr_service

    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "hr_employee_change_approval": True}
    await db.flush()

    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{uuid.uuid4().hex[:6]}",
        first_name="Karim",
        is_active=True,
    )
    db.add(emp)
    await db.flush()

    maker = users["c4_hr"]
    req = HrEmployeeChangeRequest(
        tenant_id=tenant.id,
        employee_id=emp.id,
        kind="INFO",
        payload={"first_name": "Rahim"},
        before={"first_name": "Karim"},
        reason="Spelling",
        status="PENDING_TIER1",
        request_id=f"req-{uuid.uuid4().hex[:12]}",
        requested_by=maker.id,
        requested_at=datetime.utcnow(),
    )
    db.add(req)
    await db.flush()

    rights_c1 = await cr_service.viewer_rights(db, users["c1_hr"], tenant.id)
    assert rights_c1["can_view_pay"] is True
    # Tier keys stay fail-closed — Class1+hr does not invent tier1/tier2.
    assert rights_c1["can_tier1"] is False
    assert rights_c1["can_tier2"] is False

    rights_c4 = await cr_service.viewer_rights(db, users["c4_hr"], tenant.id)
    assert rights_c4["can_view_pay"] is False

    # Fixed-class authority is ON: HR changes (cancel included) must go through an HR Request, so the
    # legacy Tier cancel is refused with HR_REQUEST_REQUIRED (fail closed, never loosened).
    with pytest.raises(HTTPException) as blocked:
        await cr_service.cancel(db, tenant=tenant, user=users["c1_hr"], request_pk=req.id)
    assert blocked.value.status_code == 409
    assert "HR_REQUEST_REQUIRED" in str(blocked.value.detail)

    # The legacy maker / manager cancel rules are exercised with fixed-class authority OFF.
    tenant.feature_flags = {**(tenant.feature_flags or {}), USER_AUTHORITY_CLASSES_V1: False}
    await db.flush()
    # The requester (maker, Class 4 HR here) may cancel their own open request under the legacy rules.
    cancelled = await cr_service.cancel(
        db, tenant=tenant, user=users["c4_hr"], request_pk=req.id
    )
    assert cancelled.status == "CANCELLED"

    # Request owned by Class1; Class4+hr is neither the maker nor manager-equivalent → 403.
    other = HrEmployeeChangeRequest(
        tenant_id=tenant.id,
        employee_id=emp.id,
        kind="INFO",
        payload={"first_name": "Salim"},
        before={"first_name": "Karim"},
        reason="Retry",
        status="PENDING_TIER1",
        request_id=f"req-{uuid.uuid4().hex[:12]}",
        requested_by=users["c1_hr"].id,
        requested_at=datetime.utcnow(),
    )
    db.add(other)
    await db.flush()

    with pytest.raises(HTTPException) as exc:
        await cr_service.cancel(db, tenant=tenant, user=users["c4_hr"], request_pk=other.id)
    assert exc.value.status_code == 403

