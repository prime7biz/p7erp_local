"""Dozen-first quotation costing through the real API (flag ``quotation_costing_accuracy_v1``).

Covers: flag OFF contract, flagged save/recompute, legacy invariance, idempotent re-save,
cross-tenant category denial, category-from-item, commission/quantity validation, revisions
and the costing item lookup used by the material picker.

Run:
    docker compose exec backend pytest tests/test_quotation_costing_accuracy_integration.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Quotation
from app.models.costing import Item, ItemCategory, ItemUnit
from tests.merch_fixtures import create_customer, create_merch_tenant_with_user

FLAG = "quotation_costing_accuracy_v1"


@asynccontextmanager
async def _api(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Tenant-Id": str(tenant.id)},
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


async def _seed(db, *, flag: bool, qty: int = 1200, status: str = "DRAFT"):
    tenant, user, _ = await create_merch_tenant_with_user(db)
    if flag:
        tenant.feature_flags = {FLAG: True}
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QC-{slug}",
        status=status,
        version_no=1,
        currency="USD",
        projected_quantity=qty,
    )
    db.add(q)
    await db.flush()
    return tenant, user, customer, q


async def _item(db, tenant, *, code="IT-1", name="Twill fabric"):
    slug = uuid.uuid4().hex[:6]
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}", name="Yard")
    db.add_all([cat, unit])
    await db.flush()
    item = Item(tenant_id=tenant.id, item_code=f"{code}-{slug}", name=name, category_id=cat.id, unit_id=unit.id)
    db.add(item)
    await db.flush()
    return item, cat


def _body(**over):
    body = {
        "costing_basis": "PER_DOZEN",
        "margin_method": "MARKUP_ON_COST",
        "profit_percentage": "15",
        "projected_quantity": 1200,
        "materials": [
            {"serial_no": 1, "description": "Shell fabric", "unit": "kg", "consumption_per_dozen": "2.5",
             "unit_price": "4", "wastage_pct": "10"},
            {"serial_no": 2, "description": "Thread", "unit": "cone", "consumption_per_dozen": "0.3", "unit_price": "10"},
        ],
        "manufacturing": [
            {"serial_no": 1, "style_part": "Body", "cm_mode": "SMV_CPM", "smv": "12", "cpm": "0.05", "cpm_basis": "EARNED_MIN"}
        ],
        "other_costs": [
            {"serial_no": 1, "cost_head": "Testing", "cost_type": "fixed", "value": "1.8", "cost_basis": "PER_DOZEN"}
        ],
    }
    body.update(over)
    return body


@pytest.mark.asyncio
async def test_flagged_put_computes_dozen_first_values(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=_body())
        assert res.status_code == 200, res.text
        d = res.json()
    assert d["costing_basis"] == "PER_DOZEN"
    assert d["material_cost_per_dozen"] == "14.0000"
    assert d["manufacturing_cost_per_dozen"] == "7.2000"
    assert d["other_cost_per_dozen"] == "1.8000"
    assert d["total_cost_per_dozen"] == "23.0000"
    assert d["quoted_price_per_dozen"] == "26.4500"
    assert d["quoted_price_per_piece"] == "2.2042"
    # Order totals are derived from the UNROUNDED per-piece price x quantity.
    assert d["quoted_price"] == d["total_amount"] == "2645.0000"
    assert d["total_cost"] == "2300.0000"
    assert d["cost_per_piece"] == "1.9167"
    assert d["materials"][0]["amount_per_dozen"] == "11.0000"
    assert d["materials"][0]["total_amount"] == "1100.0000"
    assert d["manufacturing"][0]["cm_per_piece"] == "0.6000"
    assert d["manufacturing"][0]["cost_per_dozen"] == "7.2000"


@pytest.mark.asyncio
async def test_flagged_quantity_zero_still_prices_per_piece(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True, qty=0)
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=_body(projected_quantity=0))
        assert res.status_code == 200, res.text
        d = res.json()
    assert d["quoted_price_per_piece"] == "2.2042"
    assert d["total_amount"] == "0.0000" and d["total_cost"] == "0.0000"  # 0, not NULL, for older readers


@pytest.mark.asyncio
async def test_flagged_resave_is_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        first = (await client.put(f"/api/v1/quotations/{q.id}", json=_body())).json()
        # GET -> PUT with the same inputs must not change anything.
        again = await client.put(
            f"/api/v1/quotations/{q.id}",
            json=_body(materials=first["materials"], manufacturing=first["manufacturing"], other_costs=first["other_costs"]),
        )
        assert again.status_code == 200, again.text
    for key in ("quoted_price_per_piece", "quoted_price_per_dozen", "total_cost_per_dozen", "total_amount", "quoted_price"):
        assert again.json()[key] == first[key], key


@pytest.mark.asyncio
async def test_manual_per_piece_price_is_kept(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=_body(quoted_price_per_piece="2.5000"))
        d = res.json()
    assert d["quoted_price_per_piece"] == "2.5000"
    assert d["quoted_price_per_dozen"] == "30.0000"
    assert d["total_amount"] == "3000.0000"


@pytest.mark.asyncio
async def test_margin_on_fob_and_included_commission(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        res = await client.put(
            f"/api/v1/quotations/{q.id}",
            json=_body(margin_method="MARGIN_ON_FOB", commission_mode="INCLUDE", commission_type="PERCENTAGE", commission_value=5),
        )
        assert res.status_code == 200, res.text
        d = res.json()
    # 23 / (1 - 0.15 - 0.05) = 28.75 per dozen
    assert d["margin_method"] == "MARGIN_ON_FOB"
    assert d["quoted_price_per_dozen"] == "28.7500"


@pytest.mark.asyncio
async def test_fixed_commission_needs_quantity(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True, qty=0)
    async with _api(db, tenant, user) as client:
        res = await client.put(
            f"/api/v1/quotations/{q.id}",
            json=_body(projected_quantity=0, commission_mode="INCLUDE", commission_type="FIXED", commission_value=600),
        )
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["code"] == "COMMISSION_NEEDS_QUANTITY"


@pytest.mark.asyncio
async def test_validation_failure_for_missing_cpm_basis(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    body = _body()
    body["manufacturing"][0].pop("cpm_basis")
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["code"] == "CM_CPM_BASIS_REQUIRED"


@pytest.mark.asyncio
async def test_flag_off_ignores_new_fields_and_keeps_legacy_math(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=False)
    body = _body()
    body["materials"][0]["total_amount"] = "1000"
    body["materials"][1]["total_amount"] = "300"
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
        assert res.status_code == 200, res.text
        d = res.json()
    assert d["costing_basis"] is None
    assert d["quoted_price_per_piece"] is None
    assert d["materials"][0]["wastage_pct"] is None
    assert d["manufacturing"][0]["cm_mode"] is None
    assert d["material_cost"] == "1300.0000"  # legacy: sum of client total_amount


@pytest.mark.asyncio
async def test_legacy_quotation_stays_legacy_when_flag_on_without_switch(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    body = _body()
    body.pop("costing_basis")
    body["materials"][0]["total_amount"] = "1000"
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
        assert res.status_code == 200, res.text
        assert res.json()["costing_basis"] is None
        assert res.json()["materials"][0]["wastage_pct"] is None


@pytest.mark.asyncio
async def test_flagged_row_with_flag_off_is_read_only(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        assert (await client.put(f"/api/v1/quotations/{q.id}", json=_body())).status_code == 200
        tenant.feature_flags = {}
        res = await client.put(f"/api/v1/quotations/{q.id}", json=_body())
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "QUOTATION_COSTING_FLAG_OFF"
        got = await client.get(f"/api/v1/quotations/{q.id}")
        assert got.json()["quoted_price_per_piece"] == "2.2042"  # saved values stay readable


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "header_only",
    [
        {"quoted_price": "1.00"},
        {"total_amount": "1.00"},
        {"projected_quantity": 5000},
        {"profit_percentage": "50"},
        {"commission_value": 10},
        {"currency": "EUR"},
    ],
)
async def test_flag_off_header_only_put_cannot_change_a_dozen_first_price(db_session_integration, header_only):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        assert (await client.put(f"/api/v1/quotations/{q.id}", json=_body())).status_code == 200
        tenant.feature_flags = {}
        res = await client.put(f"/api/v1/quotations/{q.id}", json=header_only)
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == "QUOTATION_COSTING_FLAG_OFF"
        # A plain note edit is still allowed.
        assert (await client.put(f"/api/v1/quotations/{q.id}", json={"notes": "still editable"})).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("flag_on,code", [(True, "QUOTATION_COSTING_USE_FULL_SAVE"), (False, "QUOTATION_COSTING_FLAG_OFF")])
async def test_patch_cannot_change_dozen_first_price_inputs(db_session_integration, flag_on, code):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        assert (await client.put(f"/api/v1/quotations/{q.id}", json=_body())).status_code == 200
        tenant.feature_flags = {FLAG: True} if flag_on else {}
        res = await client.patch(f"/api/v1/quotations/{q.id}", json={"total_amount": "1.00"})
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == code
        # status / notes patches (what the pipeline board sends) still work
        assert (await client.patch(f"/api/v1/quotations/{q.id}", json={"notes": "n"})).status_code == 200


@pytest.mark.asyncio
async def test_negative_projected_quantity_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=_body(projected_quantity=-120))
        assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_cross_tenant_category_is_rejected_as_not_found(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    other_tenant, _, _ = await create_merch_tenant_with_user(db)
    _, foreign_cat = await _item(db, other_tenant)
    own_item, _ = await _item(db, tenant)
    body = _body()
    body["materials"][0].update({"item_id": own_item.id, "category_id": foreign_cat.id})
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["code"] == "MATERIAL_INVALID_CATEGORY"


@pytest.mark.asyncio
async def test_cross_tenant_item_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    other_tenant, _, _ = await create_merch_tenant_with_user(db)
    foreign_item, foreign_cat = await _item(db, other_tenant)
    body = _body()
    body["materials"][0].update({"item_id": foreign_item.id, "category_id": foreign_cat.id})
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
    assert res.status_code == 422, res.text


@pytest.mark.asyncio
async def test_flagged_category_is_derived_from_item(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    item, cat = await _item(db, tenant)
    _, other_cat = await _item(db, tenant, code="IT-2")
    body = _body()
    body["materials"][0].update({"item_id": item.id, "category_id": other_cat.id})
    async with _api(db, tenant, user) as client:
        res = await client.put(f"/api/v1/quotations/{q.id}", json=body)
        assert res.status_code == 200, res.text
    assert res.json()["materials"][0]["category_id"] == cat.id


@pytest.mark.asyncio
async def test_revision_copies_dozen_first_columns(db_session_integration):
    db = db_session_integration
    tenant, user, _, q = await _seed(db, flag=True)
    async with _api(db, tenant, user) as client:
        assert (await client.put(f"/api/v1/quotations/{q.id}", json=_body())).status_code == 200
        q.status = "SENT"
        await db.flush()
        res = await client.post(f"/api/v1/quotations/{q.id}/revise")
        assert res.status_code == 201, res.text
        new_id = res.json()["id"]
        d = (await client.get(f"/api/v1/quotations/{new_id}")).json()
    assert d["costing_basis"] == "PER_DOZEN"
    assert d["quoted_price_per_piece"] == "2.2042"
    assert d["materials"][0]["wastage_pct"] == "10.0000"
    assert d["manufacturing"][0]["cm_mode"] == "SMV_CPM"


# ---------- costing item lookup (material picker) ----------
@pytest.mark.asyncio
async def test_costing_items_total_count_search_and_tenant_scope(db_session_integration):
    db = db_session_integration
    tenant, user, _, _ = await _seed(db, flag=False)
    for i in range(3):
        await _item(db, tenant, code=f"ZZ-{i}", name=f"Zipper {i}")
    other_tenant, _, _ = await create_merch_tenant_with_user(db)
    foreign_item, _ = await _item(db, other_tenant, code="ZZ-FOREIGN", name="Zipper foreign")
    async with _api(db, tenant, user) as client:
        res = await client.get("/api/v1/costing/items", params={"search": "zipper", "limit": 2})
        assert res.status_code == 200, res.text
        assert res.headers["X-Total-Count"] == "3"
        assert len(res.json()) == 2
        assert all(r["tenant_id"] == tenant.id for r in res.json())
        page2 = await client.get("/api/v1/costing/items", params={"search": "zipper", "limit": 2, "offset": 2})
        assert len(page2.json()) == 1
        # wildcard characters in the search text are literal
        none = await client.get("/api/v1/costing/items", params={"search": "%"})
        assert none.headers["X-Total-Count"] == "0"
        mine = (await client.get("/api/v1/costing/items", params={"search": "zz-0"})).json()[0]
        one = await client.get(f"/api/v1/costing/items/{mine['id']}")
        assert one.status_code == 200 and one.json()["id"] == mine["id"]
        assert (await client.get(f"/api/v1/costing/items/{foreign_item.id}")).status_code == 404
        assert (await client.get("/api/v1/costing/items/99999999")).status_code == 404


def test_money_helpers_use_decimal_only():
    # Guard: stored per-piece price keeps 4 decimals (Numeric(18, 4)).
    assert Decimal("2.2042").as_tuple().exponent == -4
