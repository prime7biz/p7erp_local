"""Inventory report endpoints: SQL-aggregated output must equal the previous Python algorithms.

Each ``_old_*`` function below is a frozen copy of the pre-optimisation endpoint logic. Tests seed a
small but awkward data set (mixed-case codes, NULL warehouses, same-day movements, exhausted FIFO
layers, a second tenant) and compare the HTTP response with the reference output.

Run in Docker: docker compose exec backend pytest tests/test_perf_inventory_reports_equivalence.py -q
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import case, cast, desc, event, func, select, text
from sqlalchemy import Date as SQLDate
from sqlalchemy.types import Numeric

from app.models.costing import Item
from app.models.inventory import (
    GoodsReceiving,
    InventoryCostLayer,
    PurchaseOrder,
    StockGroup,
    StockMovement,
    Warehouse,
)
from app.modules.inventory import stock_snapshot_service
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin


# ---------------------------------------------------------------------------
# Query counter
# ---------------------------------------------------------------------------


class QueryCounter:
    """Counts SQL statements sent through the test session's connection."""

    def __init__(self, db):
        self._conn = db.bind.sync_connection if hasattr(db.bind, "sync_connection") else db.bind
        self.count = 0

    def _on_execute(self, *_args, **_kwargs):
        self.count += 1

    def __enter__(self):
        event.listen(self._conn, "before_cursor_execute", self._on_execute)
        return self

    def __exit__(self, *_exc):
        event.remove(self._conn, "before_cursor_execute", self._on_execute)


# ---------------------------------------------------------------------------
# Seed
# ---------------------------------------------------------------------------


async def _seed_inventory(db, tenant_id: int) -> dict:
    """Items in two stock groups + one ungrouped, two warehouses + NULL warehouse, FIFO layers."""
    g1 = StockGroup(tenant_id=tenant_id, group_code="G-FAB", name="Fabric")
    g2 = StockGroup(tenant_id=tenant_id, group_code="G-ACC", name="Accessories")
    db.add_all([g1, g2])
    await db.flush()

    i1, w1, _ = await seed_item(db, tenant_id, code="A-100", name="Twill")
    i1.stock_group_id = g1.id
    i1.default_cost = Decimal("2.5000")
    i2, w2, _ = await seed_item(db, tenant_id, code="a-050", name="button")
    i2.stock_group_id = g2.id
    i2.default_cost = Decimal("0")
    i3, _w3, _ = await seed_item(db, tenant_id, code="B_200", name="Zipper")
    i3.default_cost = Decimal("1.2500")
    i4, _w4, _ = await seed_item(db, tenant_id, code="C-300", name="No movement")
    w1.name = "Main store"
    w2.name = "annex"
    await db.flush()

    base = date(2026, 1, 1)
    plan = [
        # (item, warehouse, type, qty, day offset or None for NULL movement_date)
        (i1, w1, "IN", "100", 0),
        (i1, w1, "OUT", "30.5", 2),
        (i1, w1, "IN", "10", 2),
        (i1, w1, "ADJUST", "1.25", 5),
        (i1, w2, "IN", "40", 1),
        (i1, w2, "OUT", "40", 3),
        (i1, None, "IN", "7", 4),
        (i2, w1, "IN", "5", 0),
        (i2, w1, "OUT", "2", 6),
        (i2, w2, "IN", "3.3333", 6),
        (i2, w2, "IN", "0.0004", 7),
        (i3, w2, "IN", "12", 3),
        (i3, w2, "OUT", "4", 8),
        (i3, w1, "IN", "8", None),
        (i3, w1, "OUT", "8", 9),
    ]
    moves: list[StockMovement] = []
    for item, wh, mtype, qty, day in plan:
        mv = StockMovement(
            tenant_id=tenant_id,
            item_id=item.id,
            warehouse_id=wh.id if wh is not None else None,
            movement_type=mtype,
            quantity=Decimal(qty),
            movement_date=(base + timedelta(days=day)) if day is not None else None,
            created_at=datetime(2026, 1, 4, 12, 0, 0),
            reference_type="TEST",
            notes=f"{mtype} {qty}",
        )
        db.add(mv)
        moves.append(mv)
    await db.flush()

    # FIFO layers: one exhausted layer, mixed unit costs, one NULL warehouse, one undated.
    layers = [
        (moves[0], "69.5", "3.1000", base),
        (moves[2], "10", "3.3000", base + timedelta(days=2)),
        (moves[4], "0", "2.0000", base + timedelta(days=1)),
        (moves[6], "7", "1.1000", None),
        (moves[7], "3", "0.4000", base),
        (moves[11], "8", "5.0000", base + timedelta(days=3)),
    ]
    for mv, qty_rem, uc, layer_date in layers:
        db.add(
            InventoryCostLayer(
                tenant_id=tenant_id,
                item_id=mv.item_id,
                warehouse_id=mv.warehouse_id,
                source_movement_id=mv.id,
                qty_original=Decimal(qty_rem) + Decimal("1"),
                qty_remaining=Decimal(qty_rem),
                unit_cost=Decimal(uc),
                layer_date=layer_date,
            )
        )

    db.add_all(
        [
            PurchaseOrder(tenant_id=tenant_id, po_code=f"PO-{tenant_id}-1", supplier_name="S", status="OPEN"),
            PurchaseOrder(tenant_id=tenant_id, po_code=f"PO-{tenant_id}-2", supplier_name="S", status="CLOSED"),
        ]
    )
    await db.flush()
    return {"items": [i1, i2, i3, i4], "warehouses": [w1, w2], "groups": [g1, g2]}


async def _seed_two_tenants(db):
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    seed = await _seed_inventory(db, tenant.id)
    await _seed_inventory(db, other.id)
    await db.flush()
    return tenant, user, seed


# ---------------------------------------------------------------------------
# Reference implementations (frozen copies of the old endpoint logic)
# ---------------------------------------------------------------------------


def _to_float(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


async def _old_stock_summary_rows(db, tenant_id: int, tenant_feature_flags=None) -> list[dict]:
    from app.common.tenant_feature_keys import is_stock_snapshot_reads_enabled

    if tenant_feature_flags and is_stock_snapshot_reads_enabled(tenant_feature_flags):
        if await stock_snapshot_service.snapshot_row_count(db, tenant_id) > 0:
            return await stock_snapshot_service.snapshot_summary_payloads(db, tenant_id)
    qty_col = cast(StockMovement.quantity, Numeric)
    in_agg = func.coalesce(func.sum(case((StockMovement.movement_type == "IN", qty_col), else_=0)), 0)
    out_agg = func.coalesce(func.sum(case((StockMovement.movement_type != "IN", qty_col), else_=0)), 0)
    agg_rows = (
        await db.execute(
            select(StockMovement.item_id, StockMovement.warehouse_id, in_agg, out_agg)
            .where(StockMovement.tenant_id == tenant_id)
            .group_by(StockMovement.item_id, StockMovement.warehouse_id)
        )
    ).all()
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars()}
    rows = []
    for item_id, warehouse_id, in_raw, out_raw in agg_rows:
        item = item_map.get(item_id)
        if not item:
            continue
        in_qty = float(in_raw or 0)
        out_qty = float(out_raw or 0)
        wh = wh_map.get(warehouse_id) if warehouse_id is not None else None
        rows.append(
            {
                "item_id": item_id,
                "item_code": item.item_code,
                "item_name": item.name,
                "warehouse_id": warehouse_id,
                "warehouse_name": wh.name if wh else None,
                "in_qty": round(in_qty, 3),
                "out_qty": round(out_qty, 3),
                "on_hand_qty": round(in_qty - out_qty, 3),
            }
        )
    rows.sort(key=lambda r: (r["item_code"], r["warehouse_name"] or ""))
    return rows


async def _old_fifo_map(db, tenant_id: int, as_of_date=None):
    stmt = select(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id)
    if as_of_date is not None:
        stmt = stmt.where(InventoryCostLayer.layer_date.is_not(None), InventoryCostLayer.layer_date <= as_of_date)
    acc: dict = defaultdict(lambda: [0.0, 0.0])
    for layer in (await db.execute(stmt)).scalars().all():
        qr = _to_float(layer.qty_remaining)
        if qr <= 0:
            continue
        key = (layer.item_id, layer.warehouse_id)
        acc[key][0] += qr
        acc[key][1] += qr * _to_float(layer.unit_cost)
    return {k: (v[0], round(v[1], 4)) for k, v in acc.items()}


def _old_line(s: dict, item_map: dict, fifo_map: dict) -> dict:
    item = item_map.get(s["item_id"])
    fq, fv = fifo_map.get((s["item_id"], s["warehouse_id"]), (0.0, 0.0))
    if fq > 1e-9 and fv > 0:
        uc = fv / fq
        lv = round(fv, 2)
    else:
        uc = _to_float(item.default_cost if item else "0")
        lv = round(s["on_hand_qty"] * uc, 2)
    return {
        "item_id": s["item_id"],
        "item_code": s["item_code"],
        "item_name": s["item_name"],
        "warehouse_id": s["warehouse_id"],
        "warehouse_name": s["warehouse_name"],
        "on_hand_qty": s["on_hand_qty"],
        "unit_cost": round(uc, 4),
        "line_value": lv,
    }


def _effective_day(movement_date, created_at):
    return movement_date if movement_date is not None else created_at.date()


async def _ref_summary_rows_as_of(db, tenant_id: int, as_of_date) -> list[dict]:
    """Quantities on ``as_of_date``: movements whose (movement_date or created day) <= that date."""
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars()}
    acc: dict = defaultdict(lambda: [0.0, 0.0])
    for mv in (await db.execute(select(StockMovement).where(StockMovement.tenant_id == tenant_id))).scalars():
        if _effective_day(mv.movement_date, mv.created_at) > as_of_date:
            continue
        acc[(mv.item_id, mv.warehouse_id)][0 if mv.movement_type == "IN" else 1] += float(mv.quantity)
    rows = []
    for (item_id, warehouse_id), (in_qty, out_qty) in acc.items():
        item = item_map.get(item_id)
        wh = wh_map.get(warehouse_id) if warehouse_id is not None else None
        rows.append(
            {
                "item_id": item_id,
                "item_code": item.item_code,
                "item_name": item.name,
                "warehouse_id": warehouse_id,
                "warehouse_name": wh.name if wh else None,
                "in_qty": round(in_qty, 3),
                "out_qty": round(out_qty, 3),
                "on_hand_qty": round(in_qty - out_qty, 3),
                "_on_hand_raw": in_qty - out_qty,
            }
        )
    rows.sort(key=lambda r: (r["item_code"], r["warehouse_name"] or ""))
    return rows


async def _ref_fifo_map_as_of(db, tenant_id: int, as_of_date) -> dict:
    """FIFO stock held on ``as_of_date``: newest layers received up to that date cover the on-hand qty."""
    on_hand = {(r["item_id"], r["warehouse_id"]): r["_on_hand_raw"] for r in await _ref_summary_rows_as_of(db, tenant_id, as_of_date)}
    layers = (
        await db.execute(
            select(InventoryCostLayer)
            .where(InventoryCostLayer.tenant_id == tenant_id)
            .order_by(InventoryCostLayer.id.desc())
        )
    ).scalars().all()
    need = {k: v for k, v in on_hand.items() if v > 0}
    acc: dict = defaultdict(lambda: [0.0, 0.0])
    for layer in layers:
        if _effective_day(layer.layer_date, layer.created_at) > as_of_date or float(layer.qty_original) <= 0:
            continue
        key = (layer.item_id, layer.warehouse_id)
        left = need.get(key, 0.0)
        if left <= 0:
            continue
        take = min(float(layer.qty_original), left)
        need[key] = left - take
        acc[key][0] += take
        acc[key][1] += take * float(layer.unit_cost)
    return {k: (v[0], round(v[1], 4)) for k, v in acc.items() if v[0] > 0}


async def _old_stock_valuation(db, tenant, limit, offset, as_of_date=None) -> dict:
    """Old rows for today; for an as-of date the reference uses as-of qty + as-of FIFO (old code used today's)."""
    if as_of_date is None:
        fifo_map = await _old_fifo_map(db, tenant.id, None)
        all_rows = await _old_stock_summary_rows(db, tenant.id, tenant.feature_flags)
    else:
        fifo_map = await _ref_fifo_map_as_of(db, tenant.id, as_of_date)
        all_rows = await _ref_summary_rows_as_of(db, tenant.id, as_of_date)
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant.id))).scalars()}
    rows = [_old_line(s, item_map, fifo_map) for s in all_rows[offset : offset + limit]]
    total = sum(r["line_value"] for r in rows)
    grand_total = sum(_old_line(s, item_map, fifo_map)["line_value"] for s in all_rows)
    rows.sort(key=lambda r: (r["item_code"], r["warehouse_name"] or ""))
    return {
        "method": "fifo",
        "total_value": round(grand_total, 2),
        "rows": rows,
        "page_total_value": round(total, 2),
        "total_count": len(all_rows),
        "as_of_date": as_of_date.isoformat() if as_of_date else None,
    }


async def _old_grouped(db, tenant, key: str, as_of_date=None) -> list[dict]:
    """key = 'group' (stock-summary/by-group) or 'warehouse' (stock-summary/by-warehouse)."""
    if as_of_date is None:
        fifo_map = await _old_fifo_map(db, tenant.id, None)
        summary = await _old_stock_summary_rows(db, tenant.id, tenant.feature_flags)
    else:
        fifo_map = await _ref_fifo_map_as_of(db, tenant.id, as_of_date)
        summary = await _ref_summary_rows_as_of(db, tenant.id, as_of_date)
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant.id))).scalars()}
    sg_map = {r.id: r for r in (await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant.id))).scalars()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))).scalars()}
    buckets: dict = defaultdict(list)
    for s in summary:
        if s["on_hand_qty"] <= 0:
            continue
        if key == "group":
            it = item_map.get(s["item_id"])
            gid = it.stock_group_id if it else None
        else:
            gid = s["warehouse_id"]
        buckets[gid].append(_old_line(s, item_map, fifo_map))
    blocks = []
    for gid, lines in sorted(buckets.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        lines.sort(key=lambda r: (r["item_code"], r["warehouse_name"] or ""))
        tq = sum(r["on_hand_qty"] for r in lines)
        tv = sum(r["line_value"] for r in lines)
        if key == "group":
            sg = sg_map.get(gid) if gid is not None else None
            blocks.append(
                {
                    "stock_group_id": gid,
                    "stock_group_code": sg.group_code if sg else None,
                    "stock_group_name": sg.name if sg else None,
                    "total_qty": round(tq, 4),
                    "total_value": round(tv, 2),
                    "lines": lines,
                }
            )
        else:
            wh = wh_map.get(gid) if gid is not None else None
            blocks.append(
                {
                    "warehouse_id": gid,
                    "warehouse_code": wh.warehouse_code if wh else None,
                    "warehouse_name": wh.name if wh else None,
                    "total_qty": round(tq, 4),
                    "total_value": round(tv, 2),
                    "lines": lines,
                }
            )
    return blocks


async def _old_stock_ledger(db, tenant_id, *, item_id=None, warehouse_id=None, date_from=None, date_to=None, limit=100, offset=0):
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    qty_n = cast(sm.quantity, Numeric)
    signed_qty = case((sm.movement_type == "IN", qty_n), else_=-qty_n)
    running_bal = func.sum(signed_qty).over(
        partition_by=(sm.item_id, func.coalesce(sm.warehouse_id, -1)),
        order_by=(eff.asc(), sm.id.asc()),
    )
    inner = select(
        sm.id, sm.movement_date, sm.movement_type, sm.item_id, sm.warehouse_id, sm.quantity,
        sm.reference_type, sm.reference_id, sm.notes, sm.created_by_user_id,
        eff.label("eff_date"), running_bal.label("running_balance"),
    ).where(sm.tenant_id == tenant_id)
    if item_id is not None:
        inner = inner.where(sm.item_id == item_id)
    if warehouse_id is not None:
        inner = inner.where(sm.warehouse_id == warehouse_id)
    sq = inner.subquery()
    count_stmt = select(func.count()).select_from(sq)
    page_stmt = select(sq)
    if date_from is not None:
        count_stmt = count_stmt.where(sq.c.eff_date >= date_from)
        page_stmt = page_stmt.where(sq.c.eff_date >= date_from)
    if date_to is not None:
        count_stmt = count_stmt.where(sq.c.eff_date <= date_to)
        page_stmt = page_stmt.where(sq.c.eff_date <= date_to)
    total = int((await db.execute(count_stmt)).scalar() or 0)
    page_stmt = page_stmt.order_by(desc(sq.c.eff_date).nulls_last(), desc(sq.c.id)).limit(limit).offset(offset)
    raw = list((await db.execute(page_stmt)).mappings())
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars()}
    items = []
    for row in raw:
        iid, wid, rb = row["item_id"], row["warehouse_id"], row["running_balance"]
        items.append(
            {
                "id": row["id"],
                "movement_date": row["movement_date"].isoformat() if row["movement_date"] else None,
                "movement_type": row["movement_type"],
                "item_id": iid,
                "item_code": item_map[iid].item_code if iid in item_map else f"#{iid}",
                "item_name": item_map[iid].name if iid in item_map else "Unknown",
                "warehouse_id": wid,
                "warehouse_name": wh_map[wid].name if wid is not None and wid in wh_map else None,
                "quantity": str(row["quantity"]),
                "reference_type": row["reference_type"],
                "reference_id": row["reference_id"],
                "notes": row["notes"],
                "created_by_user_id": row.get("created_by_user_id"),
                "running_balance": float(rb) if rb is not None else 0.0,
            }
        )
    return {"items": items, "total": total}


async def _old_dashboard_recent(db, tenant_id: int) -> list[dict]:
    """Old dashboard 'recent movements' (ordered by movement_date, not the ledger's effective date)."""
    rows = (
        await db.execute(
            select(StockMovement)
            .where(StockMovement.tenant_id == tenant_id)
            .order_by(desc(StockMovement.movement_date).nulls_last(), desc(StockMovement.id))
            .limit(12)
        )
    ).scalars().all()
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars()}
    return [
        {
            "id": row.id,
            "movement_date": row.movement_date.isoformat() if row.movement_date else None,
            "movement_type": row.movement_type,
            "item_id": row.item_id,
            "item_code": item_map[row.item_id].item_code if row.item_id in item_map else f"#{row.item_id}",
            "item_name": item_map[row.item_id].name if row.item_id in item_map else "Unknown",
            "warehouse_id": row.warehouse_id,
            "warehouse_name": wh_map[row.warehouse_id].name if row.warehouse_id in wh_map else None,
            "quantity": str(row.quantity),
            "reference_type": row.reference_type,
            "reference_id": row.reference_id,
            "notes": row.notes,
            "created_by_user_id": row.created_by_user_id,
            "running_balance": 0.0,
        }
        for row in rows
    ]


async def _old_dashboard_counts(db, tenant, threshold: float) -> tuple[int, int]:
    summary = await _old_stock_summary_rows(db, tenant.id, tenant.feature_flags)
    skus = sum(1 for r in summary if r["on_hand_qty"] > 0)
    low = sum(1 for r in summary if 0 < r["on_hand_qty"] < threshold)
    return skus, low


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def _ledger_subset(row: dict) -> dict:
    keys = (
        "id", "movement_date", "movement_type", "item_id", "item_code", "item_name", "warehouse_id",
        "warehouse_name", "quantity", "reference_type", "reference_id", "notes", "created_by_user_id",
        "running_balance",
    )
    return {k: row.get(k) for k in keys}


@pytest.mark.asyncio
async def test_stock_ledger_matches_old_window_query(db_session_integration):
    db = db_session_integration
    tenant, user, seed = await _seed_two_tenants(db)
    i1, i2, i3, _ = seed["items"]
    w1, w2 = seed["warehouses"]
    d = date(2026, 1, 1)
    cases = [
        {},
        {"limit": 4},
        {"limit": 3, "offset": 5},
        {"date_from": d + timedelta(days=2)},
        {"date_to": d + timedelta(days=3)},
        {"date_from": d + timedelta(days=2), "date_to": d + timedelta(days=6)},
        {"date_from": d + timedelta(days=3), "date_to": d + timedelta(days=3)},
        {"item_id": i1.id},
        {"item_id": i1.id, "date_from": d + timedelta(days=3)},
        {"warehouse_id": w2.id, "date_from": d + timedelta(days=2), "limit": 2, "offset": 1},
        {"item_id": i3.id, "warehouse_id": w1.id},
        {"date_from": d + timedelta(days=50)},
        {"offset": 500},
    ]
    async with api_client(db, tenant, user) as ac:
        for params in cases:
            expected = await _old_stock_ledger(db, tenant.id, **params)
            q = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in params.items()}
            r = await ac.get("/api/v1/inventory/stock-ledger", params=q)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["total"] == expected["total"], params
            assert [_ledger_subset(x) for x in body["items"]] == expected["items"], params


@pytest.mark.asyncio
async def test_stock_dashboard_matches_old_counts(db_session_integration):
    db = db_session_integration
    tenant, user, _seed = await _seed_two_tenants(db)
    db.add(GoodsReceiving(tenant_id=tenant.id, grn_code=f"GRN-{tenant.id}", status="DRAFT"))
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        for threshold in (10.0, 0.0, 70.0, 1000.0):
            skus, low = await _old_dashboard_counts(db, tenant, threshold)
            # Old code crashed (500) serialising Decimal quantity; the reference uses str(quantity).
            old_recent = await _old_dashboard_recent(db, tenant.id)
            r = await ac.get("/api/v1/inventory/stock-dashboard", params={"low_stock_threshold": threshold})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["open_purchase_orders"] == 1
            assert body["grns_pending_receive"] == 1
            assert body["skus_with_positive_stock"] == skus
            assert body["low_stock_lines"] == low
            assert body["low_stock_threshold"] == threshold
            assert [_ledger_subset(x) for x in body["recent_movements"]] == old_recent


async def _enable_snapshot(db, tenant) -> None:
    await stock_snapshot_service.rebuild_stock_balance_snapshot(db, tenant.id)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "stock_snapshot_reads": True}
    await db.flush()


@pytest.mark.asyncio
@pytest.mark.parametrize("use_snapshot", [False, True])
async def test_stock_valuation_and_grouped_match_old(db_session_integration, use_snapshot):
    db = db_session_integration
    tenant, user, _seed = await _seed_two_tenants(db)
    if use_snapshot:
        await _enable_snapshot(db, tenant)
    async with api_client(db, tenant, user) as ac:
        for limit, offset in ((100, 0), (2, 0), (3, 2), (5, 50)):
            for as_of in (None, date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 5)):
                expected = await _old_stock_valuation(db, tenant, limit, offset, as_of)
                params = {"limit": limit, "offset": offset}
                if as_of:
                    params["as_of_date"] = as_of.isoformat()
                r = await ac.get("/api/v1/inventory/stock-valuation", params=params)
                assert r.status_code == 200, r.text
                body = r.json()
                # SQL sums NUMERIC exactly; the reference sums floats (can differ in the last cent).
                assert body.pop("total_value") == pytest.approx(expected.pop("total_value"), abs=0.011)
                assert body == expected, (limit, offset, as_of)

        for as_of in (None, date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 5)):
            params = {"as_of_date": as_of.isoformat()} if as_of else {}
            r = await ac.get("/api/v1/inventory/stock-summary/by-group", params=params)
            assert r.status_code == 200, r.text
            assert r.json()["groups"] == await _old_grouped(db, tenant, "group", as_of)
            r = await ac.get("/api/v1/inventory/stock-summary/by-warehouse", params=params)
            assert r.status_code == 200, r.text
            assert r.json()["warehouses"] == await _old_grouped(db, tenant, "warehouse", as_of)


@pytest.mark.asyncio
async def test_grouped_summary_optional_pagination(db_session_integration):
    db = db_session_integration
    tenant, user, _seed = await _seed_two_tenants(db)
    full_groups = await _old_grouped(db, tenant, "group")
    full_whs = await _old_grouped(db, tenant, "warehouse")
    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/inventory/stock-summary/by-group", params={"limit": 1, "offset": 1})
        assert r.status_code == 200, r.text
        assert r.json()["groups"] == full_groups[1:2]
        r = await ac.get("/api/v1/inventory/stock-summary/by-warehouse", params={"limit": 2})
        assert r.status_code == 200, r.text
        assert r.json()["warehouses"] == full_whs[:2]


@pytest.mark.asyncio
@pytest.mark.parametrize("use_snapshot", [False, True])
async def test_reconciliation_overview_and_stock_summary_total(db_session_integration, use_snapshot):
    db = db_session_integration
    tenant, user, _seed = await _seed_two_tenants(db)
    if use_snapshot:
        await _enable_snapshot(db, tenant)
    summary = await _old_stock_summary_rows(db, tenant.id, tenant.feature_flags)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/inventory/reconciliation/overview")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["stock_items_on_hand"] == len([s for s in summary if s["on_hand_qty"] > 0])
        assert body["purchase_orders_total"] == 2
        assert body["purchase_orders_open"] == 1
        assert body["stock_movements_total"] == 15

        live = await _old_stock_summary_rows(db, tenant.id)
        for params, want_total in (
            ({}, len(live)),
            ({"hide_zero": True}, len([s for s in live if s["on_hand_qty"] != 0])),
            ({"search": "a-", "limit": 1}, len([s for s in live if "a-" in s["item_code"].lower()])),
            ({"offset": 999}, len(live)),
        ):
            r = await ac.get("/api/v1/inventory/stock-summary", params=params)
            assert r.status_code == 200, r.text
            assert r.headers["X-Total-Count"] == str(want_total), params


@pytest.mark.asyncio
async def test_stock_ledger_large_tenant_equal_and_timed(db_session_integration):
    """30,000 movements over 60 (item, warehouse) pairs: same page as the old query; prints timings (-s)."""
    import time

    from sqlalchemy import insert

    from app.modules.inventory.router import stock_ledger

    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    pairs = []
    for n in range(20):
        item, wh, _ = await seed_item(db, tenant.id, code=f"L-{n:03d}", name=f"Item {n}")
        wh2 = Warehouse(tenant_id=tenant.id, warehouse_code=f"W2-{n}-{tenant.id}", name=f"Second {n}")
        db.add(wh2)
        await db.flush()
        pairs += [(item.id, wh.id), (item.id, wh2.id), (item.id, None)]
    base = date(2025, 1, 1)
    rows = []
    for k in range(30000):
        item_id, wh_id = pairs[k % len(pairs)]
        rows.append(
            {
                "tenant_id": tenant.id,
                "item_id": item_id,
                "warehouse_id": wh_id,
                "movement_type": "IN" if k % 3 else "OUT",
                "quantity": Decimal(k % 17 + 1),
                "movement_date": base + timedelta(days=k % 400),
                "created_at": datetime(2025, 1, 1),
            }
        )
    for start in range(0, len(rows), 5000):
        await db.execute(insert(StockMovement), rows[start : start + 5000])
    await db.flush()
    await db.execute(text("ANALYZE stock_movements"))

    async def run_new(params):
        out = await stock_ledger(
            item_id=params.get("item_id"),
            warehouse_id=params.get("warehouse_id"),
            date_from=params.get("date_from"),
            date_to=params.get("date_to"),
            limit=params.get("limit", 100),
            offset=params.get("offset", 0),
            tenant=tenant,
            user=user,
            db=db,
        )
        return {"items": [_ledger_subset(r.model_dump(mode="json")) for r in out.items], "total": out.total}

    async def best_ms(fn, params) -> tuple[float, dict]:
        result, times = None, []
        for _ in range(4):
            t0 = time.perf_counter()
            result = await fn(params)
            times.append((time.perf_counter() - t0) * 1000)
        return min(times[1:]), result

    for label, params in (
        ("first page, no filter", {"limit": 50}),
        ("date range", {"date_from": base + timedelta(days=300), "date_to": base + timedelta(days=330), "limit": 50}),
        ("one item", {"item_id": pairs[0][0], "limit": 50}),
    ):
        old_ms, expected = await best_ms(lambda p: _old_stock_ledger(db, tenant.id, **p), params)
        new_ms, got = await best_ms(run_new, params)
        assert got == expected, label
        print(f"TIMING stock-ledger [{label}] old={old_ms:.1f}ms new={new_ms:.1f}ms (30000 movements)")


@pytest.mark.asyncio
async def test_report_query_counts(db_session_integration):
    """Print statement counts for the key endpoints (use -s to see them)."""
    db = db_session_integration
    tenant, user, _seed = await _seed_two_tenants(db)
    statuses = {}
    async with api_client(db, tenant, user) as ac:
        for path in (
            "/api/v1/inventory/stock-ledger",
            "/api/v1/inventory/stock-dashboard",
            "/api/v1/inventory/stock-valuation",
            "/api/v1/inventory/stock-summary/by-group",
            "/api/v1/inventory/reconciliation/overview",
        ):
            with QueryCounter(db) as qc:
                try:
                    r = await ac.get(path)
                    statuses[path] = r.status_code
                except Exception:  # noqa: BLE001 - old dashboard code raised inside the app
                    statuses[path] = 500
            print(f"QUERY_COUNT {path} {qc.count} status={statuses[path]}")
    assert all(code == 200 for code in statuses.values()), statuses
