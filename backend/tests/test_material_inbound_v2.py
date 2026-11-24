"""Phase 2A: style tagging ownership + buy-preview warn + colourway belongs to style.

Run: docker compose exec backend pytest tests/test_material_inbound_v2.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.merch import StyleColorway
from app.modules.material_control.style_tagging import resolve_style_colorway
from fastapi import HTTPException

from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style


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
async def test_colourway_must_belong_to_style(db_session_integration):
    db = db_session_integration
    tenant, _user, _wh, _vendor, _item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style_a = await create_garment_style(db, tenant, customer)
    style_b = await create_garment_style(db, tenant, customer)
    cw = StyleColorway(tenant_id=tenant.id, style_id=style_a.id, color_name="Navy")
    db.add(cw)
    await db.flush()

    with pytest.raises(HTTPException) as ei:
        await resolve_style_colorway(db, tenant_id=tenant.id, style_id=style_b.id, colorway_id=cw.id)
    assert ei.value.status_code == 400

    ok_s, ok_c = await resolve_style_colorway(
        db, tenant_id=tenant.id, style_id=style_a.id, colorway_id=cw.id
    )
    assert ok_s == style_a.id and ok_c == cw.id


@pytest.mark.asyncio
async def test_buy_preview_404_without_inbound_flag(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_inbound_v2", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                "/api/v1/material-control/buy-preview",
                json={"item_ids": [item.id], "btb_lc_id": None},
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_buy_preview_warns_when_btb_missing(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                "/api/v1/material-control/buy-preview",
                json={"item_ids": [item.id], "btb_lc_id": None},
            )
            assert res.status_code == 200, res.text
            body = res.json()
            codes = {w["code"] for w in body.get("warnings", [])}
            assert "BTB_MISSING" in codes
    finally:
        _clear()
