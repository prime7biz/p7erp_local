"""Phase 4: authority change requests + inbox (user_authority_classes_v1).

Run: docker compose exec backend pytest tests/test_authority_inbox.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_3,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
)
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.finance import AccountGroup, ChartOfAccount
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"ACR {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"AC{slug}"[:18].upper(),
        feature_flags={USER_AUTHORITY_CLASSES_V1: True} if flag_on else {},
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, super_admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=admin_role.id if cls in {AUTHORITY_SUPER, AUTHORITY_CLASS_1} else user_role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
            is_tenant_super_admin=super_admin,
        )
        db.add(u)
        await db.flush()
        if not super_admin:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code="finance"))
            await db.flush()
        return u

    users = {
        "super": await _user("super", AUTHORITY_SUPER, super_admin=True),
        "c1": await _user("c1", AUTHORITY_CLASS_1),
        "c1b": await _user("c1b", AUTHORITY_CLASS_1),
        "c2": await _user("c2", AUTHORITY_CLASS_2),
        "c3": await _user("c3", AUTHORITY_CLASS_3),
        "c4": await _user("c4", AUTHORITY_CLASS_4),
    }
    group = AccountGroup(tenant_id=tenant.id, name="Assets", code=f"A{slug[:6]}", nature="Asset")
    db.add(group)
    await db.flush()
    return tenant, users, group


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_inbox_flag_off_empty(db_session_integration):
    db = db_session_integration
    tenant, users, group = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.get("/api/v1/authority/inbox", headers=_headers(users["c1"], tenant))
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["authority_classes_enabled"] is False
            assert body["counts"]["change_requests"] == 0

            create = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "resource_type": "chart_of_account",
                    "action": "CREATE",
                    "proposed_snapshot": {"account_number": "X1", "name": "X", "group_id": 1},
                    "reason": "need ledger",
                },
            )
            assert create.status_code == 404

            # AC1c: flag OFF — direct COA mutate still allowed (guard is a no-op)
            coa = await client.post(
                "/api/v1/finance/chart-of-accounts",
                headers=_headers(users["c1"], tenant),
                json={
                    "account_number": f"OF{uuid.uuid4().hex[:6]}",
                    "name": "Flag-off ledger",
                    "group_id": group.id,
                    "normal_balance": "debit",
                    "opening_balance": "0",
                },
            )
            assert coa.status_code == 200, coa.text
            assert "AUTHORITY_CHANGE_REQUIRED" not in coa.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_master_direct_mutate_blocked_when_flag_on(db_session_integration):
    """AC2: flag ON → COA/group create/update/delete all return 409 AUTHORITY_CHANGE_REQUIRED."""
    db = db_session_integration
    tenant, users, group = await _seed(db)
    ledger = ChartOfAccount(
        tenant_id=tenant.id,
        account_number=f"D{uuid.uuid4().hex[:6]}",
        name="Direct seed",
        group_id=group.id,
        normal_balance="debit",
    )
    db.add(ledger)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            h = _headers(users["c1"], tenant)
            cases = [
                (
                    "POST",
                    "/api/v1/finance/chart-of-accounts",
                    {
                        "account_number": f"L{uuid.uuid4().hex[:6]}",
                        "name": "Blocked ledger",
                        "group_id": group.id,
                        "normal_balance": "debit",
                        "opening_balance": "0",
                    },
                ),
                (
                    "PATCH",
                    f"/api/v1/finance/chart-of-accounts/{ledger.id}",
                    {
                        "name": "Renamed",
                        "group_id": group.id,
                        "normal_balance": "debit",
                        "opening_balance": "0",
                    },
                ),
                ("DELETE", f"/api/v1/finance/chart-of-accounts/{ledger.id}", None),
                (
                    "POST",
                    "/api/v1/finance/account-groups",
                    {"name": "Blocked group", "code": f"BG{uuid.uuid4().hex[:5]}", "nature": "Asset"},
                ),
                (
                    "PATCH",
                    f"/api/v1/finance/account-groups/{group.id}",
                    {"name": "Assets Renamed", "nature": "Asset"},
                ),
                ("DELETE", f"/api/v1/finance/account-groups/{group.id}", None),
            ]
            for method, url, payload in cases:
                if method == "POST":
                    res = await client.post(url, headers=h, json=payload)
                elif method == "PATCH":
                    res = await client.patch(url, headers=h, json=payload)
                else:
                    res = await client.delete(url, headers=h)
                assert res.status_code == 409, f"{method} {url}: {res.status_code} {res.text}"
                assert "AUTHORITY_CHANGE_REQUIRED" in res.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_change_request_happy_path_and_sod(db_session_integration):
    """Acceptance #11 / #9 / #17: create via CR, SoD, idempotent request_id."""
    db = db_session_integration
    tenant, users, group = await _seed(db)
    rid = f"acr-{uuid.uuid4().hex[:12]}"

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            body = {
                "request_id": rid,
                "module_code": "finance",
                "resource_type": "chart_of_account",
                "action": "CREATE",
                "proposed_snapshot": {
                    "account_number": f"N{uuid.uuid4().hex[:6]}",
                    "name": "New ledger",
                    "group_id": group.id,
                    "normal_balance": "debit",
                },
                "reason": "Need a new expense ledger",
            }
            created = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json=body,
            )
            assert created.status_code == 201, created.text
            pk = created.json()["id"]
            assert created.json()["status"] == "SUBMITTED"

            replay = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json=body,
            )
            assert replay.status_code == 201
            assert replay.json()["id"] == pk

            # Creator cannot verify (SoD)
            bad = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c4"], tenant),
                json={"decision": "VERIFY"},
            )
            assert bad.status_code == 403

            v = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c3"], tenant),
                json={"decision": "VERIFY"},
            )
            assert v.status_code == 200, v.text
            assert v.json()["status"] == "VERIFIED"

            # Same verifier cannot recommend
            sod = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c3"], tenant),
                json={"decision": "RECOMMEND"},
            )
            assert sod.status_code == 403

            r = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c2"], tenant),
                json={"decision": "RECOMMEND"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "RECOMMENDED"

            a = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c1"], tenant),
                json={"decision": "APPROVE"},
            )
            assert a.status_code == 200, a.text
            assert a.json()["status"] == "APPLIED"
            assert a.json()["resource_id"] is not None

            inbox = await client.get("/api/v1/authority/inbox", headers=_headers(users["c1"], tenant))
            assert inbox.status_code == 200
            assert inbox.json()["authority_classes_enabled"] is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_takeover_and_cross_tenant_404(db_session_integration):
    """Acceptance #14 / #15: takeover advances stuck step; other tenant looks like not found."""
    db = db_session_integration
    tenant, users, group = await _seed(db)
    other, other_users, _ = await _seed(db)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "module_code": "finance",
                    "resource_type": "account_group",
                    "action": "UPDATE",
                    "resource_id": group.id,
                    "proposed_snapshot": {"name": "Assets Renamed", "nature": "Asset"},
                    "reason": "Rename group for reporting",
                },
            )
            assert created.status_code == 201, created.text
            pk = created.json()["id"]

            # Class 1 takeover at VERIFY
            take = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c1"], tenant),
                json={"decision": "TAKEOVER", "note": "Stuck verify"},
            )
            assert take.status_code == 200, take.text
            assert take.json()["status"] == "VERIFIED"
            assert take.json()["takeover_by"] == users["c1"].id

            # Same Class 1 cannot approve after takeover-verify (SoD)
            deny = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c2"], tenant),
                json={"decision": "RECOMMEND"},
            )
            assert deny.status_code == 200, deny.text

            same = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c1"], tenant),
                json={"decision": "APPROVE"},
            )
            assert same.status_code == 403

            ok = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c1b"], tenant),
                json={"decision": "APPROVE"},
            )
            assert ok.status_code == 200, ok.text
            assert ok.json()["status"] == "APPLIED"

            cross = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(other_users["c1"], other),
                json={"decision": "APPROVE"},
            )
            assert cross.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_module_gate_and_reject_reason(db_session_integration):
    db = db_session_integration
    tenant, users, group = await _seed(db)
    # Class 2 without finance module
    bare = User(
        tenant_id=tenant.id,
        role_id=users["c2"].role_id,
        email=f"nofin_{uuid.uuid4().hex[:8]}@example.com",
        username=f"nofin_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_2,
    )
    db.add(bare)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "resource_type": "account_group",
                    "action": "UPDATE",
                    "resource_id": group.id,
                    "proposed_snapshot": {"name": "Assets 2", "nature": "Asset"},
                    "reason": "rename again",
                },
            )
            pk = created.json()["id"]
            await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c3"], tenant),
                json={"decision": "VERIFY"},
            )
            denied = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(bare, tenant),
                json={"decision": "RECOMMEND"},
            )
            assert denied.status_code == 403

            no_reason = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c2"], tenant),
                json={"decision": "REJECT"},
            )
            assert no_reason.status_code == 400

            rejected = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c2"], tenant),
                json={"decision": "REJECT", "note": "Wrong nature"},
            )
            assert rejected.status_code == 200
            assert rejected.json()["status"] == "REJECTED"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_protected_master_fields_refused_on_submit_and_apply(db_session_integration):
    """Security F1: CR path must not reparent/rewrite protected system masters."""
    db = db_session_integration
    tenant, users, group = await _seed(db)
    group.is_protected = True
    protected_ledger = ChartOfAccount(
        tenant_id=tenant.id,
        account_number=f"P{uuid.uuid4().hex[:6]}",
        name="System Cash",
        group_id=group.id,
        normal_balance="debit",
        is_protected=True,
    )
    db.add(protected_ledger)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Reparent / nature change refused at submit
            bad_group = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "resource_type": "account_group",
                    "action": "UPDATE",
                    "resource_id": group.id,
                    "proposed_snapshot": {"parent_group_id": None, "nature": "Liability"},
                    "reason": "try to reparent system group",
                },
            )
            assert bad_group.status_code == 403, bad_group.text
            assert "protected" in bad_group.text.lower()

            bad_ledger = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "resource_type": "chart_of_account",
                    "action": "UPDATE",
                    "resource_id": protected_ledger.id,
                    "proposed_snapshot": {"group_id": group.id, "normal_balance": "credit"},
                    "reason": "try to move system ledger",
                },
            )
            assert bad_ledger.status_code == 403, bad_ledger.text

            # Narrow rename (allowed on protected) can submit and apply
            ok = await client.post(
                "/api/v1/authority/change-requests",
                headers=_headers(users["c4"], tenant),
                json={
                    "resource_type": "chart_of_account",
                    "action": "UPDATE",
                    "resource_id": protected_ledger.id,
                    "proposed_snapshot": {"name": "System Cash Renamed"},
                    "reason": "rename display label only",
                },
            )
            assert ok.status_code == 201, ok.text
            pk = ok.json()["id"]
            await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c3"], tenant),
                json={"decision": "VERIFY"},
            )
            await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c2"], tenant),
                json={"decision": "RECOMMEND"},
            )
            applied = await client.post(
                f"/api/v1/authority/change-requests/{pk}/decision",
                headers=_headers(users["c1"], tenant),
                json={"decision": "APPROVE"},
            )
            assert applied.status_code == 200, applied.text
            assert applied.json()["status"] == "APPLIED"
            await db.refresh(protected_ledger)
            assert protected_ledger.name == "System Cash Renamed"
            assert protected_ledger.is_protected is True
            assert protected_ledger.group_id == group.id
    finally:
        app.dependency_overrides.pop(get_db, None)
