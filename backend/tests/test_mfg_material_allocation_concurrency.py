"""F-T3: material allocation is safe against concurrent requests (real parallel sessions, real commits).

* two orders race the same stock: exactly the stock is split, never more than on hand is held
* the same confirm sent twice at once creates one set of holds
* an allocation racing a cancel of the same order ends with no ACTIVE hold on the cancelled order and no deadlock

These tests commit for real, so they clean their own data afterwards (see `_purge`).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_material_allocation_concurrency.py -q -p no:warnings"
"""

from __future__ import annotations

import asyncio
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text

from app.models import MfgMaterialSupplyPegging, Order, StockReservation
from app.modules.inventory import allocation_reconcile_service as reconcile
from app.modules.inventory.material_allocation_service import confirm_order_allocation
from tests.bd_hr_fixtures import real_db  # noqa: F401  (pytest fixture)
from tests.mfg_alloc_fixtures import add_competing_order, seed_alloc

pytestmark = pytest.mark.asyncio

TIMEOUT = 90


async def _purge(factory, tenant_id: int) -> None:
    """Delete everything of the test tenant (all tables with a tenant_id column), then the tenant itself."""
    async with factory() as s:
        tables = [
            r[0]
            for r in (
                await s.execute(
                    text(
                        "SELECT table_name FROM information_schema.columns "
                        "WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name <> 'tenants'"
                    )
                )
            ).all()
        ]
        try:
            await s.execute(text("SET LOCAL session_replication_role = replica"))
            for t in tables:
                await s.execute(text(f'DELETE FROM "{t}" WHERE tenant_id = :t'), {"t": tenant_id})
            await s.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})
            await s.commit()
            return
        except Exception:
            await s.rollback()
    async with factory() as s:  # fallback without superuser rights: repeat until the foreign keys allow it
        for _ in range(12):
            left = 0
            for t in tables:
                try:
                    async with s.begin_nested():
                        await s.execute(text(f'DELETE FROM "{t}" WHERE tenant_id = :t'), {"t": tenant_id})
                except Exception:
                    left += 1
            if not left:
                break
        await s.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})
        await s.commit()


async def _seed_two_orders(factory, *, stock="100", qty_a=100, qty_b=100):
    async with factory() as db:
        ns = await seed_alloc(db, stock=stock, qty=qty_a)
        other, _bom, _bi = await add_competing_order(db, ns, qty=qty_b)
        await db.commit()
        return {"tenant_id": ns.tenant.id, "user_id": ns.user.id, "a": ns.order.id, "b": other.id, "item": ns.fab.id}


async def _confirm(factory, s, order_id, *, token=None):
    async with factory() as db:
        try:
            res = await confirm_order_allocation(
                db, s["tenant_id"], order_id, kind="HARD_ATP", expires_at=None, state_token=token, user_id=s["user_id"]
            )
            await db.commit()
            return res
        except HTTPException as exc:
            await db.rollback()
            return exc


async def _held_total(factory, s) -> Decimal:
    async with factory() as db:
        total = (
            await db.execute(
                select(func.coalesce(func.sum(StockReservation.reserved_qty), 0)).where(
                    StockReservation.tenant_id == s["tenant_id"], StockReservation.status == "ACTIVE"
                )
            )
        ).scalar_one()
    return Decimal(total)


async def test_two_orders_racing_the_same_stock_never_hold_more_than_stock(real_db):
    factory, _register = real_db
    s = await _seed_two_orders(factory)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(_confirm(factory, s, s["a"]), _confirm(factory, s, s["b"])), TIMEOUT
        )
        assert all(not isinstance(r, Exception) for r in results), results
        assert await _held_total(factory, s) <= Decimal("100")
        async with factory() as db:
            rows = (
                await db.execute(select(StockReservation).where(StockReservation.tenant_id == s["tenant_id"]))
            ).scalars().all()
        assert sum(1 for r in rows if r.status == "ACTIVE") >= 1
        assert len({(r.order_id, r.bom_item_id) for r in rows if r.status == "ACTIVE"}) == len(
            [r for r in rows if r.status == "ACTIVE"]
        )  # at most one active hold per order line
    finally:
        await _purge(factory, s["tenant_id"])


async def test_double_submit_of_the_same_confirm_creates_one_set(real_db):
    factory, _register = real_db
    s = await _seed_two_orders(factory, stock="100", qty_a=60, qty_b=10)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(_confirm(factory, s, s["a"]), _confirm(factory, s, s["a"])), TIMEOUT
        )
        assert all(not isinstance(r, Exception) for r in results), results
        statuses = sorted(r.status for r in results)
        assert statuses == ["ALLOCATED", "NOOP"]
        async with factory() as db:
            rows = (
                await db.execute(
                    select(StockReservation).where(
                        StockReservation.tenant_id == s["tenant_id"],
                        StockReservation.order_id == s["a"],
                        StockReservation.status == "ACTIVE",
                    )
                )
            ).scalars().all()
        assert len(rows) == 1 and Decimal(rows[0].reserved_qty) == Decimal("60")
    finally:
        await _purge(factory, s["tenant_id"])


async def _cancel_in_own_session(factory, s, order_id):
    async with factory() as db:
        order = (
            await db.execute(select(Order).where(Order.id == order_id, Order.tenant_id == s["tenant_id"]).with_for_update())
        ).scalar_one()
        order.status = "CANCELLED"
        await db.flush()
        out = await reconcile.release_for_order(db, s["tenant_id"], order_id, reason="cancelled", user_id=s["user_id"])
        await db.commit()
        return out


async def test_allocation_racing_a_cancel_ends_clean_without_deadlock(real_db):
    factory, _register = real_db
    s = await _seed_two_orders(factory, stock="100", qty_a=100, qty_b=10)
    try:
        results = await asyncio.wait_for(
            asyncio.gather(_confirm(factory, s, s["a"]), _cancel_in_own_session(factory, s, s["a"]), return_exceptions=True),
            TIMEOUT,
        )
        for r in results:  # an allocation that lost the race is a clean 409; nothing else may fail
            assert not isinstance(r, Exception) or isinstance(r, HTTPException), results
        async with factory() as db:
            order = await db.get(Order, s["a"])
            active_holds = (
                await db.execute(
                    select(func.count()).select_from(StockReservation).where(
                        StockReservation.tenant_id == s["tenant_id"],
                        StockReservation.order_id == s["a"],
                        StockReservation.status == "ACTIVE",
                    )
                )
            ).scalar_one()
            active_pegs = (
                await db.execute(
                    select(func.count()).select_from(MfgMaterialSupplyPegging).where(
                        MfgMaterialSupplyPegging.tenant_id == s["tenant_id"],
                        MfgMaterialSupplyPegging.order_id == s["a"],
                        MfgMaterialSupplyPegging.status == "ACTIVE",
                    )
                )
            ).scalar_one()
        assert order.status == "CANCELLED"
        assert active_holds == 0 and active_pegs == 0
    finally:
        await _purge(factory, s["tenant_id"])
