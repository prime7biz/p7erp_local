"""Phase 5: P&L / Balance Sheet Class 1 gates under user_authority_classes_v1.

Run: docker compose exec backend pytest tests/test_authority_financial_reports.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import (
    AUTHORITY_CLASS_1,
    AUTHORITY_CLASS_2,
    AUTHORITY_CLASS_4,
    AUTHORITY_SUPER,
)
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True, statements_v2: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags: dict = {}
    if flag_on:
        flags[USER_AUTHORITY_CLASSES_V1] = True
    if statements_v2:
        flags["finance_statements_v2"] = True
        flags["mis_reports_enabled"] = True
        flags["mgmt_performance_v1"] = True
        flags["finance_ai_insights_v2"] = True
    tenant = Tenant(
        name=f"FR {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"FR{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, finance: bool = True, super_admin: bool = False) -> User:
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
        if finance and not super_admin:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code="finance"))
            await db.flush()
        return u

    users = {
        "c1": await _user("c1", AUTHORITY_CLASS_1),
        "c2": await _user("c2", AUTHORITY_CLASS_2),
        "c4": await _user("c4", AUTHORITY_CLASS_4),
        "c1_nofin": await _user("c1nf", AUTHORITY_CLASS_1, finance=False),
        "super": await _user("super", AUTHORITY_SUPER, super_admin=True),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_flag_off_pnl_still_allowed_for_class2(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            me = await client.get("/api/v1/auth/me", headers=_headers(users["c2"], tenant))
            assert me.status_code == 200
            assert me.json().get("can_view_pnl_balance_sheet") is True

            # Legacy financial statements (no statements_v2 required)
            res = await client.get(
                "/api/v1/finance/reports/financial-statements",
                headers=_headers(users["c2"], tenant),
            )
            assert res.status_code == 200, res.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class2_denied_pnl_bs_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            me = await client.get("/api/v1/auth/me", headers=_headers(users["c2"], tenant))
            assert me.json().get("can_view_pnl_balance_sheet") is False

            year = 2026
            for path in (
                "/api/v1/finance/statements/profit-loss",
                "/api/v1/finance/statements/balance-sheet",
                "/api/v1/finance/reports/financial-statements",
                "/api/v1/finance/statements/profit-loss/export?format=pdf",
                "/api/v1/finance/statements/balance-sheet/export?format=xlsx",
                f"/api/v1/finance/reports/comparative-balance-sheet?year1={year - 1}&year2={year}",
                f"/api/v1/finance/reports/comparative-pl?year1={year - 1}&year2={year}",
            ):
                res = await client.get(path, headers=_headers(users["c2"], tenant))
                assert res.status_code == 403, f"{path}: {res.status_code} {res.text}"

            # Trial balance remains open to Class 2 (not confidential)
            tb = await client.get(
                "/api/v1/finance/statements/trial-balance",
                headers=_headers(users["c2"], tenant),
            )
            assert tb.status_code == 200, tb.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_and_super_allowed(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for key in ("c1", "super"):
                me = await client.get("/api/v1/auth/me", headers=_headers(users[key], tenant))
                assert me.json().get("can_view_pnl_balance_sheet") is True, key
                res = await client.get(
                    "/api/v1/finance/statements/profit-loss",
                    headers=_headers(users[key], tenant),
                )
                assert res.status_code == 200, f"{key}: {res.text}"
                legacy = await client.get(
                    "/api/v1/finance/reports/financial-statements",
                    headers=_headers(users[key], tenant),
                )
                assert legacy.status_code == 200, f"{key} legacy: {legacy.text}"

            # Class 1 without finance module denied
            denied = await client.get(
                "/api/v1/finance/statements/balance-sheet",
                headers=_headers(users["c1_nofin"], tenant),
            )
            assert denied.status_code == 403
            me_nofin = await client.get("/api/v1/auth/me", headers=_headers(users["c1_nofin"], tenant))
            assert me_nofin.json().get("can_view_pnl_balance_sheet") is False
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_mgmt_summary_and_ai_commentary_gated(db_session_integration):
    """AC6/AC7: Management Performance summary and AI P&L commentary use the Class 1 gate."""
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c2 = _headers(users["c2"], tenant)
            c1 = _headers(users["c1"], tenant)

            mp = await client.get("/api/v1/finance/mgmt-performance/summary", headers=c2)
            assert mp.status_code == 403, mp.text

            # Class 1 may pass the authority gate (200 or later business/access 403 — never open to Class 2).
            mp_c1 = await client.get("/api/v1/finance/mgmt-performance/summary", headers=c1)
            assert mp_c1.status_code != 403 or "Class 1" not in (mp_c1.json().get("detail") or ""), mp_c1.text
            # Soft permission / company-view may still 403; authority gate must not block Class 1 with finance.
            if mp_c1.status_code == 403:
                detail = str(mp_c1.json().get("detail") or "")
                assert "Profit & Loss" not in detail and "Balance Sheet" not in detail, detail

            body = {"report": "profit_loss", "use_ai": False}
            ai_c2 = await client.post("/api/v1/finance/statements/commentary", headers=c2, json=body)
            assert ai_c2.status_code == 403, ai_c2.text

            ai_tb = await client.post(
                "/api/v1/finance/statements/commentary",
                headers=c2,
                json={"report": "trial_balance", "use_ai": False},
            )
            # Trial balance commentary is not Class-1 confidential (404 if AI off, else not the P&L deny).
            if ai_tb.status_code == 403:
                detail = str(ai_tb.json().get("detail") or "")
                assert "Profit & Loss" not in detail and "Balance Sheet" not in detail, detail

            ai_c1 = await client.post("/api/v1/finance/statements/commentary", headers=c1, json=body)
            if ai_c1.status_code == 403:
                detail = str(ai_c1.json().get("detail") or "")
                assert "Profit & Loss" not in detail and "Balance Sheet" not in detail, detail
    finally:
        app.dependency_overrides.pop(get_db, None)
