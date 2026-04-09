"""Inventory GL account resolver: StockGroup > CoAConfig > system COA (Docker DB)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import ChartOfAccount, CoAConfig, Item, ItemCategory, ItemUnit, StockGroup, Tenant
from app.modules.finance.system_coa_seeding_service import (
    resolve_system_ledger,
    seed_tenant_system_coa,
)
from app.services.inventory_account_resolver import resolve_inventory_accounts


@pytest.mark.asyncio
async def test_new_inventory_codes_resolve_after_seed(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    cogs_id = await resolve_system_ledger(db, tenant.id, "COGS_EXPENSE")
    adj_id = await resolve_system_ledger(db, tenant.id, "STOCK_ADJUSTMENT_EXPENSE")
    assert isinstance(cogs_id, int) and cogs_id > 0
    assert isinstance(adj_id, int) and adj_id > 0


async def _ensure_item_with_stock_group(
    db,
    tenant_id: int,
    *,
    sg_inventory_id: int | None = None,
    sg_grni_id: int | None = None,
    sg_cogs_id: int | None = None,
    sg_wip_id: int | None = None,
    sg_adj_id: int | None = None,
) -> tuple[Item, StockGroup]:
    suffix = uuid.uuid4().hex[:8]
    cat = ItemCategory(
        tenant_id=tenant_id,
        category_code=f"T{suffix}",
        name="Test category",
    )
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant_id, unit_code=f"U{suffix}", name="U")
    db.add(unit)
    await db.flush()
    sg = StockGroup(
        tenant_id=tenant_id,
        group_code=f"SG{suffix}",
        name="Test SG",
        inventory_account_id=sg_inventory_id,
        grni_account_id=sg_grni_id,
        cogs_account_id=sg_cogs_id,
        wip_account_id=sg_wip_id,
        adjustment_account_id=sg_adj_id,
    )
    db.add(sg)
    await db.flush()
    item = Item(
        tenant_id=tenant_id,
        item_code=f"I{suffix}",
        name="Test item",
        category_id=cat.id,
        unit_id=unit.id,
        stock_group_id=sg.id,
    )
    db.add(item)
    await db.flush()
    return item, sg


@pytest.mark.asyncio
async def test_resolve_uses_system_defaults_without_overrides(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    cfg = (
        await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))
    ).scalars().first()
    if cfg is None:
        pytest.skip("No CoAConfig for tenant")
    prev_inv = cfg.inventory_stock_account_id
    prev_clear = cfg.inventory_clearing_account_id
    cfg.inventory_stock_account_id = None
    cfg.inventory_clearing_account_id = None
    await db.flush()

    try:
        item, _sg = await _ensure_item_with_stock_group(db, tenant.id)
        acc = await resolve_inventory_accounts(db, tenant.id, item.id)

        assert acc["inventory"] == await resolve_system_ledger(db, tenant.id, "RAW_MATERIAL_INVENTORY")
        assert acc["grni"] == await resolve_system_ledger(db, tenant.id, "GOODS_RECEIVED_NOT_BILLED_IMPORT")
        assert acc["cogs"] == await resolve_system_ledger(db, tenant.id, "COGS_EXPENSE")
        assert acc["wip"] == await resolve_system_ledger(db, tenant.id, "WORK_IN_PROGRESS")
        assert acc["adjustment"] == await resolve_system_ledger(db, tenant.id, "STOCK_ADJUSTMENT_EXPENSE")
    finally:
        cfg.inventory_stock_account_id = prev_inv
        cfg.inventory_clearing_account_id = prev_clear
        await db.flush()


@pytest.mark.asyncio
async def test_stock_group_overrides_system_for_inventory(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    sys_inv = await resolve_system_ledger(db, tenant.id, "RAW_MATERIAL_INVENTORY")
    alt_r = await db.execute(
        select(ChartOfAccount.id).where(
            ChartOfAccount.tenant_id == tenant.id,
            ChartOfAccount.id != sys_inv,
        ).limit(1)
    )
    other_id = alt_r.scalar_one_or_none()
    if other_id is None:
        pytest.skip("Need a second chart account for tenant")

    cfg = (
        await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))
    ).scalars().first()
    if cfg is None:
        pytest.skip("No CoAConfig for tenant")
    prev_inv = cfg.inventory_stock_account_id
    cfg.inventory_stock_account_id = None
    await db.flush()

    try:
        item, _sg = await _ensure_item_with_stock_group(db, tenant.id, sg_inventory_id=other_id)
        acc = await resolve_inventory_accounts(db, tenant.id, item.id)
        assert acc["inventory"] == other_id
    finally:
        cfg.inventory_stock_account_id = prev_inv
        await db.flush()


@pytest.mark.asyncio
async def test_coa_config_overrides_system_for_inventory_and_grni(db_session_integration):
    db = db_session_integration
    r = await db.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(db, tenant.id)
    await db.flush()

    sys_inv = await resolve_system_ledger(db, tenant.id, "RAW_MATERIAL_INVENTORY")
    sys_grni = await resolve_system_ledger(db, tenant.id, "GOODS_RECEIVED_NOT_BILLED_IMPORT")
    inv_alt = (
        await db.execute(
            select(ChartOfAccount.id).where(
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.id.notin_([sys_inv, sys_grni]),
            ).limit(1)
        )
    ).scalar_one_or_none()
    grni_alt = (
        await db.execute(
            select(ChartOfAccount.id).where(
                ChartOfAccount.tenant_id == tenant.id,
                ChartOfAccount.id.notin_([sys_inv, sys_grni, inv_alt] if inv_alt else [sys_inv, sys_grni]),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if inv_alt is None or grni_alt is None:
        pytest.skip("Need extra chart accounts for tenant")

    cfg = (
        await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))
    ).scalars().first()
    if cfg is None:
        pytest.skip("No CoAConfig for tenant")
    prev_inv = cfg.inventory_stock_account_id
    prev_clear = cfg.inventory_clearing_account_id
    cfg.inventory_stock_account_id = inv_alt
    cfg.inventory_clearing_account_id = grni_alt
    await db.flush()

    try:
        item, _sg = await _ensure_item_with_stock_group(db, tenant.id)
        acc = await resolve_inventory_accounts(db, tenant.id, item.id)
        assert acc["inventory"] == inv_alt
        assert acc["grni"] == grni_alt
        assert acc["cogs"] == await resolve_system_ledger(db, tenant.id, "COGS_EXPENSE")
    finally:
        cfg.inventory_stock_account_id = prev_inv
        cfg.inventory_clearing_account_id = prev_clear
        await db.flush()
