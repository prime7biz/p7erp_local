"""Cross-plan BE↔FE wiring regression (Customer portal quotations, MC chain_health,
machine-match Control Center guard, feeding readiness RM bridge).

Run: docker compose exec backend pytest tests/test_cross_plan_wiring.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AuditLog, SewingLineStyleConfig
from app.models.inventory import InventoryCostLayer, StockMovement
from app.models.material_control_alloc import MaterialLayerAllocation, MaterialRoll
from app.models.merch import Order
from app.modules.mfg_intelligence.feeding_readiness_service import feeding_readiness_for_config

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style
from tests.mfg_intel_fixtures import add_line, add_order, seed_basic_factory


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


async def _client(db, tenant, user) -> AsyncClient:
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


async def _seed_layer(db, tenant, wh, item, qty: str = "100"):
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal(qty),
        movement_date=date.today(),
        reference_type="TEST",
        movement_kind="TEST_IN",
    )
    db.add(mv)
    await db.flush()
    layer = InventoryCostLayer(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        source_movement_id=mv.id,
        qty_original=Decimal(qty),
        qty_remaining=Decimal(qty),
        unit_cost=Decimal("10"),
        layer_date=date.today(),
    )
    db.add(layer)
    await db.flush()
    return layer


# --------------------------------------------------------------------------- portal quotations admin toggle


@pytest.mark.asyncio
async def test_customer_portal_quotations_overview_and_patch_audit(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    flags = dict(tenant.feature_flags or {})
    flags["customer_portal_enabled"] = True
    flags.pop("customer_portal_quotations_enabled", None)
    tenant.feature_flags = flags
    await db.commit()

    try:
        async with await _client(db, tenant, user) as ac:
            ov = await ac.get("/api/v1/settings/external-access/overview")
            assert ov.status_code == 200, ov.text
            body = ov.json()
            assert body["customer_portal_quotations_enabled"] is False

            patched = await ac.patch(
                "/api/v1/settings/external-access/feature-flags",
                json={"customer_portal_quotations_enabled": True},
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["customer_portal_quotations_enabled"] is True

            await db.refresh(tenant)
            assert (tenant.feature_flags or {}).get("customer_portal_quotations_enabled") is True

            audits = list(
                (
                    await db.execute(
                        select(AuditLog).where(
                            AuditLog.tenant_id == tenant.id,
                            AuditLog.action == "EXTERNAL_ACCESS_FLAGS_UPDATE",
                            AuditLog.user_id == user.id,
                        )
                    )
                )
                .scalars()
                .all()
            )
            assert audits, "expected EXTERNAL_ACCESS_FLAGS_UPDATE audit row"
            assert "customer_portal_quotations_enabled" in (audits[-1].details or "")
    finally:
        _clear()


# --------------------------------------------------------------------------- style control sheet chain_health


@pytest.mark.asyncio
async def test_style_control_sheet_chain_health_and_cross_tenant_404(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    other, _, _ = await create_admin_tenant_with_user(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_control_hub_v1"] = True
    tenant.feature_flags = flags
    other_flags = dict(other.feature_flags or {})
    other_flags["material_control_hub_v1"] = True
    other.feature_flags = other_flags

    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    foreign_customer = await create_customer(db, other)
    foreign_style = await create_garment_style(db, other, foreign_customer)
    await db.commit()

    try:
        async with await _client(db, tenant, user) as ac:
            ok = await ac.get(f"/api/v1/material-control/styles/{style.id}/control-sheet")
            assert ok.status_code == 200, ok.text
            sheet = ok.json()
            assert "chain_health" in sheet
            ch = sheet["chain_health"]
            for key in (
                "inquiries",
                "quotations",
                "orders",
                "boms",
                "proforma_invoices",
                "master_contracts",
                "btb_lcs",
            ):
                assert key in ch
                assert "count" in ch[key]

            denied = await ac.get(f"/api/v1/material-control/styles/{foreign_style.id}/control-sheet")
            assert denied.status_code == 404, denied.text
    finally:
        _clear()


# --------------------------------------------------------------------------- machine-match Control Center guard


@pytest.mark.asyncio
async def test_machine_match_prod_control_center_guard_and_rbac(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await create_admin_tenant_with_user(db)
    denied_tenant, denied_user, _ = await create_admin_tenant_with_user(
        db,
        permissions={"production.planning.read": False, "inventory.access": True},
    )
    # Align denied_user onto same tenant with fail-closed planning read
    denied_user.tenant_id = tenant.id
    await db.flush()

    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, style=fx.style, qty=100)
    await db.commit()

    api = "/api/v1/mfg-intelligence/machine-match/lines"

    try:
        # Flags OFF → 404
        flags = dict(tenant.feature_flags or {})
        for k in (
            "mfg_machine_match_v1",
            "prod_control_center_v1",
            "manufacturing_intelligence_v1",
            "mfg_integrated_planning_v1",
        ):
            flags.pop(k, None)
        tenant.feature_flags = flags
        await db.commit()

        async with await _client(db, tenant, admin) as ac:
            off = await ac.get(api, params={"order_id": order.id})
            assert off.status_code == 404, off.text

        # Control Center + machine-match ON (integrated OFF) → 200
        flags = dict(tenant.feature_flags or {})
        flags["mfg_machine_match_v1"] = True
        flags["prod_control_center_v1"] = True
        flags.pop("mfg_integrated_planning_v1", None)
        flags.pop("manufacturing_intelligence_v1", None)
        tenant.feature_flags = flags
        await db.commit()

        async with await _client(db, tenant, admin) as ac:
            on = await ac.get(api, params={"order_id": order.id})
            assert on.status_code == 200, on.text
            assert on.json()["order_id"] == order.id
            assert "items" in on.json()

        # RBAC: explicit production.planning.read false → 403
        flags_deny = dict(tenant.feature_flags or {})
        flags_deny["rbac_enforcement"] = "enforce"
        tenant.feature_flags = flags_deny
        await db.commit()
        async with await _client(db, tenant, denied_user) as ac:
            forbid = await ac.get(api, params={"order_id": order.id})
            assert forbid.status_code == 403, forbid.text
    finally:
        _clear()


# --------------------------------------------------------------------------- feeding readiness RM bridge


@pytest.mark.asyncio
async def test_feeding_readiness_rm_alloc_and_shade_bridge(db_session_integration):
    db = db_session_integration
    tenant, _user, wh, _v, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"FEED-{uuid.uuid4().hex[:6]}",
        style_id=style.id,
        status="CONFIRMED",
        quantity=50,
    )
    db.add(order)
    await db.flush()
    line = await add_line(db, tenant, "FEED-L1")
    start = date.today() + timedelta(days=10)
    config = SewingLineStyleConfig(
        tenant_id=tenant.id,
        line_id=line.id,
        order_id=order.id,
        style_id=style.id,
        start_date=start,
        planned_end_date=start + timedelta(days=5),
        planned_qty=Decimal("100"),
        status="PLANNED",
    )
    db.add(config)
    await db.flush()

    # Flag OFF: no rm_allocated_qty / shade stays legacy None without mfg allocation
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_alloc_ud_v1", None)
    flags.pop("material_budget_plan_v1", None)
    flags.pop("mfg_material_allocation_v1", None)
    tenant.feature_flags = flags
    await db.commit()

    off = await feeding_readiness_for_config(db, tenant=tenant, config=config)
    assert "rm_allocated_qty" not in off
    assert off["shade_approved"] is None

    # RM alloc ON with ACTIVE layer allocation
    layer = await _seed_layer(db, tenant, wh, item, "80")
    db.add(
        MaterialLayerAllocation(
            tenant_id=tenant.id,
            cost_layer_id=layer.id,
            item_id=item.id,
            warehouse_id=wh.id,
            style_id=style.id,
            order_id=order.id,
            qty_allocated=Decimal("25"),
            qty_consumed=Decimal("0"),
            qty_released=Decimal("0"),
            status="ACTIVE",
        )
    )
    # Foreign-tenant noise must not leak
    other, _, owh, _, oitem = await seed_inventory_chain(db)
    olayer = await _seed_layer(db, other, owh, oitem, "99")
    db.add(
        MaterialLayerAllocation(
            tenant_id=other.id,
            cost_layer_id=olayer.id,
            item_id=oitem.id,
            warehouse_id=owh.id,
            order_id=order.id,  # wrong tenant + wrong order ownership pattern
            qty_allocated=Decimal("999"),
            status="ACTIVE",
        )
    )

    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags

    slug = uuid.uuid4().hex[:6]
    db.add(
        MaterialRoll(
            tenant_id=tenant.id,
            roll_code=f"R-{slug}",
            item_id=item.id,
            warehouse_id=wh.id,
            style_id=style.id,
            shade_band="A1",
            qty=Decimal("10"),
            qty_remaining=Decimal("10"),
            status="AVAILABLE",
        )
    )
    # Foreign style rolls must not affect this order's shade
    other_customer = await create_customer(db, other)
    other_style = await create_garment_style(db, other, other_customer)
    db.add(
        MaterialRoll(
            tenant_id=other.id,
            roll_code=f"RX-{slug}",
            item_id=oitem.id,
            warehouse_id=owh.id,
            style_id=other_style.id,
            shade_band=None,
            qty=Decimal("10"),
            qty_remaining=Decimal("10"),
            status="AVAILABLE",
        )
    )
    await db.commit()

    on = await feeding_readiness_for_config(db, tenant=tenant, config=config)
    assert on.get("rm_allocation_source") == "material_layer_allocations"
    assert Decimal(on["rm_allocated_qty"]) == Decimal("25.0000")
    assert on["shade_approved"] is True
    assert Decimal(on["fabric_in_house_pct"]) >= Decimal("85")

    # Unshaded available rolls → shade False
    bare = MaterialRoll(
        tenant_id=tenant.id,
        roll_code=f"R2-{slug}",
        item_id=item.id,
        warehouse_id=wh.id,
        style_id=style.id,
        shade_band=None,
        qty=Decimal("5"),
        qty_remaining=Decimal("5"),
        status="AVAILABLE",
    )
    db.add(bare)
    await db.commit()
    shaded = await feeding_readiness_for_config(db, tenant=tenant, config=config)
    assert shaded["shade_approved"] is False
