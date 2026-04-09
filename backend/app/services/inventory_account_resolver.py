"""Resolve inventory GL accounts: StockGroup → CoAConfig (inventory/grni) → system COA mapping."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CoAConfig, Item, StockGroup
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger

logger = logging.getLogger(__name__)


async def _resolve_cached(
    db: AsyncSession,
    tenant_id: int,
    mapping_key: str,
    cache: dict[str, int | None],
) -> int | None:
    if mapping_key in cache:
        return cache[mapping_key]
    try:
        lid = await resolve_system_ledger(db, tenant_id, mapping_key)
    except ValueError as exc:
        logger.warning("resolve_inventory_accounts: %s", exc)
        lid = None
    cache[mapping_key] = lid
    return lid


async def resolve_inventory_accounts(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
) -> dict[str, int | None]:
    """Resolution priority per role:

    1. StockGroup FK (per-group override)
    2. CoAConfig FK for ``inventory`` / ``grni`` only
    3. System COA mapping (seeded defaults)

    Keys: ``inventory``, ``grni``, ``cogs``, ``wip``, ``adjustment``.
    """
    cfg = (await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))).scalars().first()
    item = await db.get(Item, item_id)
    sg: StockGroup | None = None
    if item and item.stock_group_id:
        sg = await db.get(StockGroup, item.stock_group_id)
        if sg and sg.tenant_id != tenant_id:
            sg = None

    cache: dict[str, int | None] = {}

    inventory = (sg.inventory_account_id if sg else None) or (cfg.inventory_stock_account_id if cfg else None)
    grni = (sg.grni_account_id if sg else None) or (cfg.inventory_clearing_account_id if cfg else None)
    cogs = sg.cogs_account_id if sg else None
    wip = sg.wip_account_id if sg else None
    adjustment = sg.adjustment_account_id if sg else None

    if inventory is None:
        inventory = await _resolve_cached(db, tenant_id, "RAW_MATERIAL_INVENTORY", cache)
    if grni is None:
        grni = await _resolve_cached(db, tenant_id, "GOODS_RECEIVED_NOT_BILLED_IMPORT", cache)
    if cogs is None:
        cogs = await _resolve_cached(db, tenant_id, "COGS_EXPENSE", cache)
    if wip is None:
        wip = await _resolve_cached(db, tenant_id, "WORK_IN_PROGRESS", cache)
    if adjustment is None:
        adjustment = await _resolve_cached(db, tenant_id, "STOCK_ADJUSTMENT_EXPENSE", cache)

    return {
        "inventory": inventory,
        "grni": grni,
        "cogs": cogs,
        "wip": wip,
        "adjustment": adjustment,
    }
