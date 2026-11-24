"""Phase 4/7: watchlist flag gate + Gate/Challan class-chain release block.

Run: docker compose exec -T backend pytest tests/test_material_watchlist_and_class_chain.py -q
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.authority.challan_gate_class_chain import (
    STATUS_APPROVED,
    STATUS_ENTERED,
    STATUS_RECOMMENDED,
    assert_release_allowed,
    approve,
    mark_entered,
    recommend,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.inventory import DeliveryChallan

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain

API = "/api/v1/material-control"


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_watchlist_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_budget_plan_v1", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get(f"{API}/watchlist")
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_watchlist_ok_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get(f"{API}/watchlist")
            assert res.status_code == 200, res.text
            body = res.json()
            assert "aging_remnants" in body
            assert "unbilled_grni" in body
    finally:
        _clear()


@pytest.mark.asyncio
async def test_class_chain_blocks_release_until_approved(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = {
        **dict(tenant.feature_flags or {}),
        "user_authority_classes_v1": True,
        "material_conversion_v1": True,
    }
    tenant.feature_flags = flags
    await db.flush()

    creator = SimpleNamespace(
        id=user.id,
        tenant_id=tenant.id,
        authority_class="CLASS_3",
        is_tenant_super_admin=False,
    )
    row = DeliveryChallan(
        tenant_id=tenant.id,
        challan_code="DC-MC-TEST-1",
        customer_name="Test",
        delivery_date=datetime.utcnow().date(),
        status="DRAFT",
        created_by_user_id=creator.id,
    )
    mark_entered(row, user=creator, feature_flags=flags)  # type: ignore[arg-type]
    assert row.class_approval_status == STATUS_ENTERED
    db.add(row)
    await db.flush()

    with pytest.raises(HTTPException) as blocked:
        assert_release_allowed(row, feature_flags=flags)
    assert blocked.value.status_code == 409

    rec = SimpleNamespace(
        id=user.id + 1,
        tenant_id=tenant.id,
        authority_class="CLASS_2",
        is_tenant_super_admin=True,
    )
    apr = SimpleNamespace(
        id=user.id + 2,
        tenant_id=tenant.id,
        authority_class="CLASS_1",
        is_tenant_super_admin=True,
    )
    when = datetime.utcnow()
    await recommend(db, user=rec, row=row, feature_flags=flags, when=when)  # type: ignore[arg-type]
    assert row.class_approval_status == STATUS_RECOMMENDED
    await approve(db, user=apr, row=row, feature_flags=flags, when=when)  # type: ignore[arg-type]
    assert row.class_approval_status == STATUS_APPROVED
    assert_release_allowed(row, feature_flags=flags)
