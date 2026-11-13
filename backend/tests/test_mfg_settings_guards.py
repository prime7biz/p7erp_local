"""Settings guards for the Manufacturing Intelligence Phase 2 switches (plan section 15 #17, run R4).

Through the generic PUT /settings/config (the Configuration page uses it):
- mfg_material_allocation_v1 / mfg_integrated_planning_v1 can be switched on only while manufacturing_intelligence_v1
  is on (also when both arrive in the same request); switching off is always allowed
- mfg_plan_four_eyes can be switched on only with >= 2 active users who can approve plans (admin / manager role, or
  production.planning.approve granted)
- every change of these switches is audited; other flags behave as before

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_settings_guards.py -q -p no:warnings"
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditLog
from tests.bd_hr_fixtures import api_client
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.merch_fixtures import create_merch_tenant_with_user

pytestmark = pytest.mark.asyncio

URL = "/api/v1/settings/config"
MI = "manufacturing_intelligence_v1"
ALLOC = "mfg_material_allocation_v1"
PLAN = "mfg_integrated_planning_v1"
FOUR = "mfg_plan_four_eyes"


def _body(flags: dict) -> dict:
    return {"company_name": "Guard Co", "tenant_type": "manufacturer", "feature_flags": flags}


async def _admin_tenant(db, flags: dict | None = None):
    tenant, admin, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "admin"
    tenant.feature_flags = dict(flags or {})
    await db.commit()
    return tenant, admin


async def _audit(db, tenant) -> list[str]:
    return list(
        (
            await db.execute(
                select(AuditLog.details).where(
                    AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.mfg_planning_flags"
                )
            )
        ).scalars().all()
    )


@pytest.mark.parametrize("key", [ALLOC, PLAN])
async def test_sub_flags_need_manufacturing_intelligence(db_session_integration, key):
    db = db_session_integration
    tenant, admin = await _admin_tenant(db)
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({key: True}))
        assert r.status_code == 400 and MI in r.json()["detail"]
        r = await c.put(URL, json=_body({MI: False, key: True}))
        assert r.status_code == 400
        # both in one request is fine
        r = await c.put(URL, json=_body({MI: True, key: True}))
        assert r.status_code == 200, r.text
        assert r.json()["feature_flags"][key] is True
        # switching off is always allowed (also turning MI off while the sub flag stays stored)
        assert (await c.put(URL, json=_body({MI: False, key: True}))).status_code == 200
        assert (await c.put(URL, json=_body({MI: False, key: False}))).status_code == 200
    await db.refresh(tenant)
    assert tenant.feature_flags[key] is False
    logs = await _audit(db, tenant)
    assert any(f"{key} enabled" in d for d in logs) and any(f"{key} disabled" in d for d in logs)


async def test_sub_flag_already_on_is_not_blocked_by_other_edits(db_session_integration):
    db = db_session_integration
    tenant, admin = await _admin_tenant(db, {PLAN: True})  # legacy state: stored before the guard existed
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({PLAN: True, "trade_enabled": False}))
        assert r.status_code == 200, r.text
    assert await _audit(db, tenant) == []


async def test_four_eyes_needs_two_plan_approvers(db_session_integration):
    db = db_session_integration
    tenant, admin = await _admin_tenant(db, {MI: True, PLAN: True})
    # a planner without the approve key and an inactive manager do not count
    await add_user_with_role(db, tenant, "planner", {"production.planning.read": True, "production.planning.write": True})
    inactive = await add_user_with_role(db, tenant, "manager", {})
    inactive.is_active = False
    denied = await add_user_with_role(db, tenant, "clerk", {"production.planning.approve": False})
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({MI: True, PLAN: True, FOUR: True}))
        assert r.status_code == 400 and "at least 2" in r.json()["detail"]
    await db.refresh(tenant)
    assert tenant.feature_flags.get(FOUR) is not True
    assert denied.is_active

    # a user whose role grants production.planning.approve counts as the second approver
    await add_user_with_role(db, tenant, "lead", {"production.planning.approve": True})
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({MI: True, PLAN: True, FOUR: True}))
        assert r.status_code == 200, r.text
        assert r.json()["feature_flags"][FOUR] is True
        assert (await c.put(URL, json=_body({MI: True, PLAN: True, FOUR: False}))).status_code == 200
    logs = await _audit(db, tenant)
    assert any(f"{FOUR} enabled" in d for d in logs) and any(f"{FOUR} disabled" in d for d in logs)


async def test_four_eyes_counts_manager_role(db_session_integration):
    db = db_session_integration
    tenant, admin = await _admin_tenant(db)
    await add_user_with_role(db, tenant, "manager", {})
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({FOUR: True}))
        assert r.status_code == 200, r.text


async def test_four_eyes_under_rbac_enforce_counts_only_users_the_endpoint_lets_approve(db_session_integration):
    """Enforce mode gives managers no bypass on the approve endpoint, so a keyless manager must not count."""
    db = db_session_integration
    enforce = {"rbac_enforcement": "enforce"}
    tenant, admin = await _admin_tenant(db, enforce)
    await add_user_with_role(db, tenant, "manager", {})
    await add_user_with_role(db, tenant, "lead", {"production.planning.approve": True, "production.planning.read": False})
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({**enforce, FOUR: True}))
        assert r.status_code == 400, r.text
    await add_user_with_role(
        db, tenant, "planner", {"production.planning.approve": True, "production.planning.read": True}
    )
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({**enforce, FOUR: True}))
        assert r.status_code == 200, r.text


async def test_other_flags_are_unchanged_by_the_guard(db_session_integration):
    db = db_session_integration
    tenant, admin = await _admin_tenant(db)
    async with api_client(db, tenant, admin) as c:
        r = await c.put(URL, json=_body({"planning_math_v2": True, "trade_enabled": False}))
        assert r.status_code == 200, r.text
        assert r.json()["feature_flags"]["planning_math_v2"] is True
    assert await _audit(db, tenant) == []
