"""Packing list cartons: range maths, assorted cartons, overlap rules, order balance, lock, flag, isolation."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import PACKING_LIST_CARTONS_ENABLED
from app.database import get_db
from app.main import app
from app.models.logistics_packing import PackingList
from app.models.order_matrix import OrderColorSizeLine
from app.modules.logistics.carton_service import CartonError, CartonLineIn, summarize

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def test_summarize_solid_assorted_and_errors():
    s = summarize(
        [
            # Cartons 1–10: solid Navy M, 24 pcs, 10.5 / 11.2 kg, 60×40×30 cm.
            CartonLineIn(1, 10, "Navy", "M", 24, Decimal("10.5"), Decimal("11.2"), Decimal("60"), Decimal("40"), Decimal("30")),
            # Cartons 11–15: assorted S 6 + L 6 per carton (weights on the first line of the range).
            CartonLineIn(11, 15, "Navy", "S", 6, Decimal("5"), Decimal("5.5")),
            CartonLineIn(11, 15, "Navy", "L", 6),
        ]
    )
    assert s.total_cartons == 15
    assert s.total_pcs == 240 + 30 + 30
    assert s.net_kg == Decimal("130.0") and s.gross_kg == Decimal("139.5")
    assert s.cbm == Decimal("0.720")
    assert s.by_color_size == {("Navy", "M"): 240, ("Navy", "S"): 30, ("Navy", "L"): 30}

    with pytest.raises(CartonError, match="overlap"):
        summarize([CartonLineIn(1, 10, "Navy", "M", 24), CartonLineIn(5, 12, "Navy", "L", 24)])
    with pytest.raises(CartonError, match="twice"):
        summarize([CartonLineIn(1, 2, "Navy", "M", 24), CartonLineIn(1, 2, "navy", "m", 12)])
    with pytest.raises(CartonError):
        summarize([CartonLineIn(3, 2, "Navy", "M", 24)])


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


@pytest.mark.asyncio
async def test_packing_cartons_flow(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    db.add_all(
        [
            OrderColorSizeLine(tenant_id=tenant.id, order_id=order.id, color_name="Navy", size="S", quantity=300, color_sort=0, size_sort=0),
            OrderColorSizeLine(tenant_id=tenant.id, order_id=order.id, color_name="Navy", size="M", quantity=500, color_sort=0, size_sort=1),
        ]
    )
    slug = uuid.uuid4().hex[:6]
    pl1 = PackingList(tenant_id=tenant.id, packing_list_number=f"PL-{slug}-1", order_id=order.id, status="DRAFT")
    pl2 = PackingList(tenant_id=tenant.id, packing_list_number=f"PL-{slug}-2", order_id=order.id, status="DRAFT")
    db.add_all([pl1, pl2])
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    ids = {"pl1": pl1.id, "pl2": pl2.id}

    first = {
        "lines": [
            {"carton_from": 1, "carton_to": 10, "color_name": "Navy", "size": "M", "pcs_per_carton": 24, "net_kg_per_carton": "10", "gross_kg_per_carton": "11"},
            {"carton_from": 11, "carton_to": 15, "color_name": "Navy", "size": "S", "pcs_per_carton": 20},
        ]
    }
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            tenant.feature_flags = {**(tenant.feature_flags or {}), PACKING_LIST_CARTONS_ENABLED: False}
            _as(db, user, tenant)
            url1 = f"/api/v1/logistics/packing-lists/{ids['pl1']}/cartons"
            assert (await ac.put(url1, json=first)).status_code == 403  # flag off
            tenant.feature_flags = {**(tenant.feature_flags or {}), PACKING_LIST_CARTONS_ENABLED: True}
            await db.commit()

            r = await ac.put(url1, json=first)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["summary"]["total_cartons"] == 15 and body["summary"]["total_pcs"] == 340
            await db.refresh(pl1)
            assert pl1.total_cartons == 15 and pl1.gross_weight == Decimal("110")
            rows = {(b["color_name"], b["size"]): b for b in body["breakdown"]}
            assert rows[("Navy", "M")]["balance_to_pack"] == 500 - 240
            assert rows[("Navy", "S")]["balance_to_pack"] == 300 - 100

            overlap = {"lines": [{"carton_from": 1, "carton_to": 5, "color_name": "Navy", "size": "M", "pcs_per_carton": 24}, {"carton_from": 4, "carton_to": 6, "color_name": "Navy", "size": "S", "pcs_per_carton": 24}]}
            assert (await ac.put(url1, json=overlap)).status_code == 400

            # A second packing list for the same order counts toward the order balance.
            url2 = f"/api/v1/logistics/packing-lists/{ids['pl2']}/cartons"
            r = await ac.put(url2, json={"lines": [{"carton_from": 16, "carton_to": 20, "color_name": "navy", "size": "m", "pcs_per_carton": 24}]})
            assert r.status_code == 200, r.text
            rows = {(b["color_name"].lower(), b["size"].lower()): b for b in r.json()["breakdown"]}
            assert rows[("navy", "m")]["packed_this_list"] == 120
            assert rows[("navy", "m")]["packed_all_lists"] == 360 and rows[("navy", "m")]["balance_to_pack"] == 140

            pl2.status = "FINALIZED"
            await db.commit()
            assert (await ac.put(url2, json={"lines": []})).status_code == 409
            assert (await ac.get(url2)).json()["locked"] is True

            _as(db, outsider, other_tenant)
            other_tenant.feature_flags = {PACKING_LIST_CARTONS_ENABLED: True}
            await db.commit()
            assert (await ac.get(url1)).status_code == 404
            assert (await ac.put(url1, json=first)).status_code == 404
    finally:
        app.dependency_overrides.clear()
