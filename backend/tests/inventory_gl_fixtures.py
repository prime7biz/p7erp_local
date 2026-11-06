"""Shared helpers for inventory → GL tests: accounts, open period, stock group, HTTP client.

Items placed in the returned stock group post to these accounts
(see ``resolve_inventory_accounts``: the stock group mapping wins).
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import InventoryCostLayer, StockGroup, StockMovement
from app.models.finance import AccountGroup, AccountingPeriod, ChartOfAccount, VoucherLine
from app.services.fifo_inventory import finalize_movement_fifo


@dataclass
class InventoryGlAccounts:
    inventory: ChartOfAccount
    wip: ChartOfAccount
    cogs: ChartOfAccount
    adjustment: ChartOfAccount
    grni: ChartOfAccount
    stock_group: StockGroup


async def _account(db, tenant_id: int, name: str, *, normal: str = "debit") -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{name}-{slug}",
        code=f"G{slug}"[:12],
        nature="Asset" if normal == "debit" else "Liability",
        default_normal_balance=normal,
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"T-{slug}",
        name=f"{name} {slug}",
        group_id=grp.id,
        normal_balance=normal,
        balance=Decimal("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def setup_inventory_gl(db, tenant_id: int, items) -> InventoryGlAccounts:
    """Open accounting period around today + one stock group mapped to fresh accounts."""
    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant_id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=False,
        )
    )
    inventory = await _account(db, tenant_id, "Inventory")
    wip = await _account(db, tenant_id, "WIP")
    cogs = await _account(db, tenant_id, "COGS")
    adjustment = await _account(db, tenant_id, "Stock adjustment")
    grni = await _account(db, tenant_id, "GRNI", normal="credit")
    group = StockGroup(
        tenant_id=tenant_id,
        group_code=f"SG{uuid.uuid4().hex[:6]}",
        name="GL test group",
        inventory_account_id=inventory.id,
        wip_account_id=wip.id,
        cogs_account_id=cogs.id,
        adjustment_account_id=adjustment.id,
        grni_account_id=grni.id,
    )
    db.add(group)
    await db.flush()
    for item in items:
        item.stock_group_id = group.id
    await db.flush()
    return InventoryGlAccounts(inventory, wip, cogs, adjustment, grni, group)


async def add_stock(db, tenant_id: int, item_id: int, warehouse_id: int, qty: str, unit_cost: float) -> StockMovement:
    """Stock IN movement with a FIFO cost layer at ``unit_cost``."""
    mv = StockMovement(
        tenant_id=tenant_id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        movement_type="IN",
        quantity=qty,
        movement_date=date.today(),
        notes="test receipt",
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant_id, mv, in_unit_cost=unit_cost)
    return mv


async def account_line_total(db, account_id: int, entry_type: str) -> Decimal:
    """Sum of voucher line amounts on one account for DEBIT or CREDIT."""
    rows = (
        await db.execute(
            select(VoucherLine.amount).where(
                VoucherLine.account_id == account_id,
                VoucherLine.entry_type == entry_type,
            )
        )
    ).scalars().all()
    return sum((Decimal(str(a)) for a in rows), Decimal("0"))


async def layer_value(db, tenant_id: int, item_id: int, warehouse_id: int | None = None) -> Decimal:
    """Open FIFO layer value (qty_remaining × unit_cost) for an item, optionally one godown."""
    stmt = select(InventoryCostLayer).where(
        InventoryCostLayer.tenant_id == tenant_id,
        InventoryCostLayer.item_id == item_id,
    )
    if warehouse_id is not None:
        stmt = stmt.where(InventoryCostLayer.warehouse_id == warehouse_id)
    layers = (await db.execute(stmt)).scalars().all()
    total = sum((Decimal(str(lr.qty_remaining)) * Decimal(str(lr.unit_cost)) for lr in layers), Decimal("0"))
    return total.quantize(Decimal("0.0001"))


@asynccontextmanager
async def api_client(db, user, tenant):
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
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
