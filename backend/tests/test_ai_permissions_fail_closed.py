"""AI finance / HR / payroll permissions are fail-closed for non-manager roles.

Run:
docker compose exec backend pytest -q tests/test_ai_permissions_fail_closed.py
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_AI_FINANCE_FORECAST,
    PERMISSION_AI_TOOLS_FINANCE_READ,
    PERMISSION_AI_TOOLS_HR_READ,
    PERMISSION_HR_AI_INSIGHTS_VIEW,
    PERMISSION_HR_PAYROLL_MANAGE,
)
from app.models import User
from app.modules.ai_tool import router as ai_router
from app.modules.ai_tool.authz import has_tool_permission
from tests.merch_fixtures import _create_role_for_tenant, create_merch_tenant_with_user

HR_AI_FLAGS = {
    "ai_attendance_analysis_enabled": True,
    "ai_turnover_prediction_enabled": True,
    "ai_payroll_anomaly_detection_enabled": True,
    "ai_compliance_risk_prediction_enabled": True,
}


class _Reached(Exception):
    """Raised by a patched service to prove the permission check let the call through."""


async def _user_with_role(db, tenant, *, role_name: str, permissions: dict) -> User:
    slug = uuid.uuid4().hex[:8]
    role = await _create_role_for_tenant(
        db, tenant_id=tenant.id, name=role_name, display_name=role_name.title(), permissions=permissions
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"aip{slug}",
        email=f"aip{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


# --- has_tool_permission -------------------------------------------------------------


@pytest.mark.asyncio
async def test_ai_read_alone_does_not_unlock_finance_hr_or_payroll_tools(db_session_integration):
    db = db_session_integration
    _tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"ai.read": True, "ai.chat": True})

    assert await has_tool_permission(db, user, "ai.tools.finance.read") is False
    assert await has_tool_permission(db, user, "ai.tools.hr.read") is False
    assert await has_tool_permission(db, user, "ai.tools.payroll.read") is False
    # Other tool keys keep the old ai.read fallback.
    assert await has_tool_permission(db, user, "ai.tools.inventory.read") is True
    assert await has_tool_permission(db, user, "ai.tools.orders.read") is True


@pytest.mark.asyncio
async def test_nested_ai_read_scope_does_not_unlock_finance(db_session_integration):
    db = db_session_integration
    _tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"ai": {"read": True}})

    assert await has_tool_permission(db, user, "ai.tools.finance.read") is False
    assert await has_tool_permission(db, user, "ai.tools.inventory.read") is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("permissions", "finance", "hr"),
    [
        ({"ai.tools.finance.read": True}, True, False),
        ({"ai.tools.hr.read": True}, False, True),
        ({"ai.tools.finance.*": True}, True, False),
        ({"ai.*": True}, True, True),
        ({"*": True}, True, True),
        ({"ai.tools.finance.read": False, "ai.read": True}, False, False),
    ],
)
async def test_explicit_grants_unlock_fail_closed_tools(db_session_integration, permissions, finance, hr):
    db = db_session_integration
    _tenant, user, _role = await create_merch_tenant_with_user(db, permissions=permissions)

    assert await has_tool_permission(db, user, "ai.tools.finance.read") is finance
    assert await has_tool_permission(db, user, "ai.tools.hr.read") is hr


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["admin", "manager", "owner"])
async def test_manager_type_roles_bypass_fail_closed_tools(db_session_integration, role_name):
    db = db_session_integration
    tenant, _user, _role = await create_merch_tenant_with_user(db, permissions={})
    boss = await _user_with_role(db, tenant, role_name=role_name, permissions={})

    assert await has_tool_permission(db, boss, "ai.tools.finance.read") is True
    assert await has_tool_permission(db, boss, "ai.tools.hr.read") is True
    assert await has_tool_permission(db, boss, "ai.tools.payroll.read") is True


# --- HR / finance AI endpoints -------------------------------------------------------


async def _hr_tenant_user(db, permissions: dict):
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions=permissions)
    tenant.feature_flags = dict(HR_AI_FLAGS)
    await db.flush()
    return tenant, user


@pytest.mark.asyncio
async def test_hr_insight_endpoints_deny_without_explicit_grant(db_session_integration):
    db = db_session_integration
    tenant, user = await _hr_tenant_user(db, {"ai.read": True})

    calls = [
        ai_router.hr_attendance_analysis(tenant=tenant, user=user, db=db, _=None),
        ai_router.hr_turnover_risk(tenant=tenant, user=user, db=db, _=None),
        ai_router.hr_compliance_risk(framework_id=1, tenant=tenant, user=user, db=db, _=None),
    ]
    for call in calls:
        with pytest.raises(HTTPException) as exc:
            await call
        assert exc.value.status_code == 403
        assert PERMISSION_HR_AI_INSIGHTS_VIEW in str(exc.value.detail)


@pytest.mark.asyncio
async def test_hr_insight_endpoint_allows_explicit_grant(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user = await _hr_tenant_user(db, {"ai.read": True, PERMISSION_HR_AI_INSIGHTS_VIEW: True})

    from app.modules.ai_tool import ai_turnover_prediction_service

    async def _fake(*_args, **_kwargs):
        raise _Reached()

    monkeypatch.setattr(ai_turnover_prediction_service, "predict_turnover_risk", _fake)
    with pytest.raises(_Reached):
        await ai_router.hr_turnover_risk(tenant=tenant, user=user, db=db, _=None)


@pytest.mark.asyncio
async def test_payroll_anomalies_require_payroll_manage(db_session_integration, monkeypatch):
    db = db_session_integration
    from app.modules.ai_tool import ai_payroll_anomaly_service

    async def _fake(*_args, **_kwargs):
        raise _Reached()

    monkeypatch.setattr(ai_payroll_anomaly_service, "detect_payroll_anomalies", _fake)

    tenant, user = await _hr_tenant_user(db, {"ai.read": True, PERMISSION_HR_AI_INSIGHTS_VIEW: True})
    with pytest.raises(HTTPException) as exc:
        await ai_router.hr_payroll_anomalies(run_id=1, tenant=tenant, user=user, db=db, _=None)
    assert exc.value.status_code == 403
    assert PERMISSION_HR_PAYROLL_MANAGE in str(exc.value.detail)

    tenant2, user2 = await _hr_tenant_user(db, {"ai.read": True, PERMISSION_HR_PAYROLL_MANAGE: True})
    with pytest.raises(_Reached):
        await ai_router.hr_payroll_anomalies(run_id=1, tenant=tenant2, user=user2, db=db, _=None)


@pytest.mark.asyncio
async def test_payroll_anomalies_manager_bypass(db_session_integration, monkeypatch):
    db = db_session_integration
    from app.modules.ai_tool import ai_payroll_anomaly_service

    async def _fake(*_args, **_kwargs):
        raise _Reached()

    monkeypatch.setattr(ai_payroll_anomaly_service, "detect_payroll_anomalies", _fake)
    tenant, _user = await _hr_tenant_user(db, {"ai.read": True})
    boss = await _user_with_role(db, tenant, role_name="manager", permissions={})
    with pytest.raises(_Reached):
        await ai_router.hr_payroll_anomalies(run_id=1, tenant=tenant, user=boss, db=db, _=None)


@pytest.mark.asyncio
async def test_finance_forecast_requires_explicit_grant(db_session_integration, monkeypatch):
    db = db_session_integration
    from app.modules.ai_tool import finance_forecast_service

    async def _fake(*_args, **_kwargs):
        raise _Reached()

    monkeypatch.setattr(finance_forecast_service, "build_finance_forecast", _fake)

    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})
    with pytest.raises(HTTPException) as exc:
        await ai_router.finance_forecast(body=None, tenant=tenant, user=user, db=db, _=None, __=None)
    assert exc.value.status_code == 403
    assert PERMISSION_AI_FINANCE_FORECAST in str(exc.value.detail)

    tenant2, user2, _role2 = await create_merch_tenant_with_user(
        db, permissions={"ai.read": True, PERMISSION_AI_FINANCE_FORECAST: True}
    )
    with pytest.raises(_Reached):
        await ai_router.finance_forecast(body=None, tenant=tenant2, user=user2, db=db, _=None, __=None)


# --- Settings → Roles toggles --------------------------------------------------------


def test_fail_closed_ai_keys_are_registered_as_role_toggles():
    keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
    for key in (
        PERMISSION_AI_TOOLS_FINANCE_READ,
        PERMISSION_AI_TOOLS_HR_READ,
        PERMISSION_HR_AI_INSIGHTS_VIEW,
        PERMISSION_AI_FINANCE_FORECAST,
        PERMISSION_HR_PAYROLL_MANAGE,
    ):
        assert key in keys
