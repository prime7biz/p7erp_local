"""Plan enforcer tests for subscription limits."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.common.plan_enforcer import assert_can_add_user
from app.models import PlatformPlan, TenantSubscription, User
from tests.go_live_fixtures import create_admin_tenant_with_user


@pytest.mark.asyncio
async def test_assert_can_add_user_blocks_when_enforced(db_session_integration):
    tenant, _user, role = await create_admin_tenant_with_user(db_session_integration)
    db = db_session_integration
    plan = PlatformPlan(name="Platform Basic", code="platform-basic-test", max_users=1, price_monthly_usd=0)
    db.add(plan)
    await db.flush()
    db.add(TenantSubscription(tenant_id=tenant.id, plan_id=plan.id, status="active"))
    db.add(
        User(
            tenant_id=tenant.id,
            role_id=role.id,
            email="existing@example.com",
            username="existing",
            password_hash="x",
            is_active=True,
        )
    )
    await db.commit()

    with patch("app.common.plan_enforcer.get_settings") as mock_settings:
        mock_settings.return_value.plan_enforcement_enabled = True
        with pytest.raises(HTTPException) as exc:
            await assert_can_add_user(db, tenant.id)
        assert exc.value.status_code == 403
