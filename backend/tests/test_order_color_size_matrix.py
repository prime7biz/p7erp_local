"""Order colour × size grid: feature flag, validation, quantity sync, commercial lock, tenant isolation."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import ORDER_COLOR_SIZE_MATRIX_ENABLED
from app.database import get_db
from app.main import app
from app.models.merch import StyleColorway, StyleSizeScale

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


def _grid(total_split: dict[tuple[str, str], int], sync: bool = False) -> dict:
    colors = sorted({c for c, _ in total_split})
    sizes = ["S", "M", "L"]
    return {
        "colors": [{"name": c} for c in colors],
        "sizes": sizes,
        "cells": [{"color": c, "size": s, "quantity": q} for (c, s), q in total_split.items()],
        "sync_order_quantity": sync,
    }


@pytest.mark.asyncio
async def test_color_size_matrix_flow(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    db.add_all(
        [
            StyleColorway(tenant_id=tenant.id, style_id=style.id, color_name="Navy"),
            StyleSizeScale(tenant_id=tenant.id, style_id=style.id, scale_name="Adult", sizes_csv="S, M, L, XL"),
        ]
    )
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    url = f"/api/v1/orders/{order.id}/color-size-matrix"

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            tenant.feature_flags = {**(tenant.feature_flags or {}), ORDER_COLOR_SIZE_MATRIX_ENABLED: False}
            _as(db, user, tenant)
            r = await ac.get(url)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["enabled"] is False and body["cells"] == []
            assert body["suggested_colors"][0]["name"] == "Navy"
            assert body["suggested_sizes"] == ["S", "M", "L", "XL"]

            # Flag off: writes are refused.
            assert (await ac.put(url, json=_grid({("Navy", "S"): 10}))).status_code == 403

            tenant.feature_flags = {**(tenant.feature_flags or {}), ORDER_COLOR_SIZE_MATRIX_ENABLED: True}
            await db.commit()

            split = {("Navy", "S"): 30, ("Navy", "M"): 40, ("Black", "L"): 50}
            r = await ac.put(url, json=_grid(split, sync=True))
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["total"] == 120 and body["order_quantity"] == 120 and body["matches_order_quantity"] is True
            # Every colour × size cell is stored, including zeros.
            assert len(body["cells"]) == 6
            assert [c["name"] for c in body["colors"]] == ["Black", "Navy"]

            bad = _grid(split)
            bad["cells"].append({"color": "Navy", "size": "S", "quantity": 1})
            assert (await ac.put(url, json=bad)).status_code == 400
            unknown = _grid(split)
            unknown["cells"].append({"color": "Red", "size": "S", "quantity": 1})
            assert (await ac.put(url, json=unknown)).status_code == 400
            negative = _grid({("Navy", "S"): -1})
            assert (await ac.put(url, json=negative)).status_code == 422

            # Confirmed orders: redistribution is fine, changing the total needs a change request.
            order.status = "CONFIRMED"
            await db.commit()
            moved = {("Navy", "S"): 20, ("Navy", "M"): 50, ("Black", "L"): 50}
            assert (await ac.put(url, json=_grid(moved))).status_code == 200
            more = {("Navy", "S"): 20, ("Navy", "M"): 50, ("Black", "L"): 60}
            r = await ac.put(url, json=_grid(more, sync=True))
            assert r.status_code == 409
            assert r.json()["detail"]["code"] == "COMMERCIAL_CHANGE_REQUIRED"

            _as(db, outsider, other_tenant)
            assert (await ac.get(url)).status_code == 404
    finally:
        app.dependency_overrides.clear()
