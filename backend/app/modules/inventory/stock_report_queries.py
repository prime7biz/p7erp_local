"""SQL helpers for inventory stock reports (stock ledger, dashboard, valuation, grouped summaries).

All aggregation runs in PostgreSQL; Python only formats the (small) result set.

Balances come from live ``stock_movements`` or — when ``tenants.feature_flags.stock_snapshot_reads`` is on
and the snapshot table has rows for the tenant — from ``inventory_stock_balance_snapshots``. This mirrors
``_stock_summary_rows`` in ``router.py`` so both paths return the same numbers.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, cast, func, literal, select, tuple_
from sqlalchemy import Date as SQLDate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Subquery
from sqlalchemy.types import Numeric

from app.common.tenant_feature_keys import is_stock_snapshot_reads_enabled
from app.models.costing import Item
from app.models.inventory import InventoryCostLayer, StockBalanceSnapshot, StockMovement, Warehouse
from app.modules.inventory import stock_snapshot_service

# Python sorts strings by code point; the "C" collation makes PostgreSQL sort the same way.
_CODEPOINT_COLLATION = "C"


@dataclass
class StockBalanceLine:
    """One (item, warehouse) balance with the labels the reports need."""

    item_id: int
    item_code: str
    item_name: str
    default_cost: Decimal | None
    stock_group_id: int | None
    warehouse_id: int | None
    warehouse_code: str | None
    warehouse_name: str | None
    in_qty: float
    out_qty: float
    on_hand_qty: float


async def use_snapshot_balances(db: AsyncSession, tenant_id: int, feature_flags: dict | None) -> bool:
    if not feature_flags or not is_stock_snapshot_reads_enabled(feature_flags):
        return False
    return await stock_snapshot_service.snapshot_row_count(db, tenant_id) > 0


def _movement_effective_date():
    """A movement's date for "as of" reports: movement_date, else the day it was created (same as the ledger)."""
    return func.coalesce(StockMovement.movement_date, cast(StockMovement.created_at, SQLDate))


def _balance_subquery(tenant_id: int, from_snapshot: bool, as_of_date: date | None = None) -> Subquery:
    """Columns: item_id, warehouse_id, in_qty, out_qty, on_hand (all Numeric).

    With ``as_of_date`` only movements on or before that date count (always from live movements).
    """
    if from_snapshot and as_of_date is None:
        snap = StockBalanceSnapshot
        return (
            select(
                snap.item_id.label("item_id"),
                func.nullif(snap.warehouse_dim_id, 0).label("warehouse_id"),
                snap.in_qty.label("in_qty"),
                snap.out_qty.label("out_qty"),
                snap.on_hand_qty.label("on_hand"),
            )
            .where(snap.tenant_id == tenant_id)
            .subquery("stock_balance")
        )
    qty = cast(StockMovement.quantity, Numeric)
    in_qty = func.coalesce(func.sum(case((StockMovement.movement_type == "IN", qty), else_=0)), 0)
    out_qty = func.coalesce(func.sum(case((StockMovement.movement_type != "IN", qty), else_=0)), 0)
    stmt = select(
        StockMovement.item_id.label("item_id"),
        StockMovement.warehouse_id.label("warehouse_id"),
        in_qty.label("in_qty"),
        out_qty.label("out_qty"),
        (in_qty - out_qty).label("on_hand"),
    ).where(StockMovement.tenant_id == tenant_id)
    if as_of_date is not None:
        stmt = stmt.where(_movement_effective_date() <= as_of_date)
    return stmt.group_by(StockMovement.item_id, StockMovement.warehouse_id).subquery("stock_balance")


def fifo_subquery(tenant_id: int, as_of_date: date | None) -> Subquery:
    """FIFO quantity and value per (item, warehouse). Columns: item_id, wh_key (warehouse_id or -1),
    fifo_qty, fifo_value.

    Today (no date): what is left in the cost layers (``qty_remaining``).
    As of a date: FIFO issues the oldest layers first, so the stock held on that date is the newest
    layers received up to that date. Walk those layers newest-first and take quantity until the
    as-of on-hand quantity is covered.
    """
    layer = InventoryCostLayer
    wh_key = func.coalesce(layer.warehouse_id, -1)
    if as_of_date is None:
        return (
            select(
                layer.item_id.label("item_id"),
                wh_key.label("wh_key"),
                func.sum(layer.qty_remaining).label("fifo_qty"),
                func.sum(layer.qty_remaining * layer.unit_cost).label("fifo_value"),
            )
            .where(layer.tenant_id == tenant_id, layer.qty_remaining > 0)
            .group_by(layer.item_id, wh_key)
            .subquery("fifo")
        )
    layer_date = func.coalesce(layer.layer_date, cast(layer.created_at, SQLDate))
    newer_or_same = func.sum(layer.qty_original).over(partition_by=(layer.item_id, wh_key), order_by=layer.id.desc())
    ranked = (
        select(
            layer.item_id.label("item_id"),
            wh_key.label("wh_key"),
            layer.qty_original.label("qty"),
            layer.unit_cost.label("unit_cost"),
            newer_or_same.label("cum_qty"),
        )
        .where(layer.tenant_id == tenant_id, layer.qty_original > 0, layer_date <= as_of_date)
        .subquery("ranked_layers")
    )
    bal = _balance_subquery(tenant_id, False, as_of_date)
    newer_qty = ranked.c.cum_qty - ranked.c.qty
    take = func.greatest(func.least(ranked.c.qty, bal.c.on_hand - newer_qty), 0)
    return (
        select(
            ranked.c.item_id,
            ranked.c.wh_key,
            func.sum(take).label("fifo_qty"),
            func.sum(take * ranked.c.unit_cost).label("fifo_value"),
        )
        .select_from(
            ranked.join(
                bal,
                and_(bal.c.item_id == ranked.c.item_id, func.coalesce(bal.c.warehouse_id, -1) == ranked.c.wh_key),
            )
        )
        .where(bal.c.on_hand > 0, newer_qty < bal.c.on_hand)
        .group_by(ranked.c.item_id, ranked.c.wh_key)
        .subquery("fifo")
    )


async def fifo_qty_value_map_as_of(
    db: AsyncSession,
    tenant_id: int,
    as_of_date: date,
    pairs: list[tuple[int, int | None]] | None = None,
) -> dict[tuple[int, int | None], tuple[float, float]]:
    """``{(item_id, warehouse_id): (fifo_qty, fifo_value)}`` held on ``as_of_date`` (see ``fifo_subquery``)."""
    fifo = fifo_subquery(tenant_id, as_of_date)
    stmt = select(fifo.c.item_id, fifo.c.wh_key, fifo.c.fifo_qty, fifo.c.fifo_value)
    if pairs is not None:
        wanted = sorted({(int(i), int(w) if w is not None else -1) for i, w in pairs})
        if not wanted:
            return {}
        stmt = stmt.where(tuple_(fifo.c.item_id, fifo.c.wh_key).in_(wanted))
    out: dict[tuple[int, int | None], tuple[float, float]] = {}
    for item_id, wh_key, qty, value in (await db.execute(stmt)).all():
        if float(qty or 0) <= 0:
            continue
        key = (int(item_id), None if int(wh_key) == -1 else int(wh_key))
        out[key] = (float(qty), round(float(value or 0), 4))
    return out


async def stock_valuation_totals(
    db: AsyncSession,
    tenant_id: int,
    feature_flags: dict | None,
    *,
    as_of_date: date | None = None,
) -> tuple[float, int]:
    """(total value, number of lines) for the whole stock valuation report, across all pages.

    Same rule per line as the report rows: FIFO value when there are FIFO layers with value,
    otherwise on-hand qty x item default cost.
    """
    from_snapshot = as_of_date is None and await use_snapshot_balances(db, tenant_id, feature_flags)
    bal = _balance_subquery(tenant_id, from_snapshot, as_of_date)
    fifo = fifo_subquery(tenant_id, as_of_date)
    on_hand = func.round(cast(bal.c.on_hand, Numeric), 3)
    line_value = case(
        (and_(fifo.c.fifo_qty > Decimal("0.000000001"), fifo.c.fifo_value > 0), func.round(fifo.c.fifo_value, 2)),
        else_=func.round(on_hand * func.coalesce(Item.default_cost, 0), 2),
    )
    stmt = (
        select(func.coalesce(func.sum(line_value), 0), func.count())
        .select_from(
            bal.join(Item, Item.id == bal.c.item_id).outerjoin(
                fifo,
                and_(fifo.c.item_id == bal.c.item_id, fifo.c.wh_key == func.coalesce(bal.c.warehouse_id, -1)),
            )
        )
        .where(Item.tenant_id == tenant_id)
    )
    total, count = (await db.execute(stmt)).one()
    return round(float(total or 0), 2), int(count or 0)


def _rounded_qtys(in_raw, out_raw, on_hand_raw, from_snapshot: bool) -> tuple[float, float, float]:
    """Same float rounding as ``_stock_summary_rows`` (live) / ``snapshot_summary_payloads`` (snapshot)."""
    if from_snapshot:
        return (
            round(float(in_raw or 0), 3),
            round(float(out_raw or 0), 3),
            round(float(on_hand_raw or 0), 3),
        )
    in_qty = float(in_raw or 0)
    out_qty = float(out_raw or 0)
    return round(in_qty, 3), round(out_qty, 3), round(in_qty - out_qty, 3)


async def load_stock_balance_lines(
    db: AsyncSession,
    tenant_id: int,
    feature_flags: dict | None,
    *,
    positive_only: bool = False,
    limit: int | None = None,
    offset: int = 0,
    as_of_date: date | None = None,
) -> list[StockBalanceLine]:
    """Balances joined to item / warehouse labels, sorted by (item_code, warehouse_name) like the old reports.

    ``positive_only`` keeps rows whose rounded on-hand qty is > 0 (same test the reports used in Python).
    ``as_of_date`` gives the quantities on that date (movements up to and including it).
    """
    from_snapshot = as_of_date is None and await use_snapshot_balances(db, tenant_id, feature_flags)
    bal = _balance_subquery(tenant_id, from_snapshot, as_of_date)
    stmt = (
        select(
            bal.c.item_id,
            Item.item_code,
            Item.name,
            Item.default_cost,
            Item.stock_group_id,
            bal.c.warehouse_id,
            Warehouse.warehouse_code,
            Warehouse.name.label("warehouse_name"),
            bal.c.in_qty,
            bal.c.out_qty,
            bal.c.on_hand,
        )
        .select_from(
            bal.join(Item, Item.id == bal.c.item_id).outerjoin(
                Warehouse,
                and_(Warehouse.id == bal.c.warehouse_id, Warehouse.tenant_id == tenant_id),
            )
        )
        .where(Item.tenant_id == tenant_id)
        .order_by(
            Item.item_code.collate(_CODEPOINT_COLLATION),
            func.coalesce(Warehouse.name, "").collate(_CODEPOINT_COLLATION),
            bal.c.item_id,
            bal.c.warehouse_id,
        )
    )
    if positive_only:
        # Cheap superset in SQL; the exact rounded test is re-applied below.
        stmt = stmt.where(bal.c.on_hand > 0)
    if limit is not None:
        stmt = stmt.limit(limit).offset(offset)
    elif offset:
        stmt = stmt.offset(offset)

    lines: list[StockBalanceLine] = []
    for row in (await db.execute(stmt)).mappings():
        in_q, out_q, on_hand = _rounded_qtys(row["in_qty"], row["out_qty"], row["on_hand"], from_snapshot)
        if positive_only and on_hand <= 0:
            continue
        wh_name = row["warehouse_name"]
        lines.append(
            StockBalanceLine(
                item_id=int(row["item_id"]),
                item_code=str(row["item_code"]) if from_snapshot else row["item_code"],
                item_name=str(row["name"] or "") if from_snapshot else row["name"],
                default_cost=row["default_cost"],
                stock_group_id=row["stock_group_id"],
                warehouse_id=int(row["warehouse_id"]) if row["warehouse_id"] is not None else None,
                warehouse_code=row["warehouse_code"],
                warehouse_name=(str(wh_name) if wh_name else None) if from_snapshot else wh_name,
                in_qty=in_q,
                out_qty=out_q,
                on_hand_qty=on_hand,
            )
        )
    return lines


async def count_positive_stock_lines(
    db: AsyncSession,
    tenant_id: int,
    feature_flags: dict | None,
    *,
    low_stock_threshold: float | None = None,
) -> tuple[int, int]:
    """Return (lines with on-hand > 0, lines with 0 < on-hand < threshold) using one COUNT ... FILTER query.

    On-hand is rounded to 3 decimals in SQL, matching the rounded value the old Python loop compared.
    """
    from_snapshot = await use_snapshot_balances(db, tenant_id, feature_flags)
    bal = _balance_subquery(tenant_id, from_snapshot)
    on_hand = func.round(cast(bal.c.on_hand, Numeric), 3)
    positive = func.count().filter(on_hand > 0)
    if low_stock_threshold is None:
        low = literal(0)
    else:
        threshold = cast(Decimal(str(low_stock_threshold)), Numeric)
        low = func.count().filter(and_(on_hand > 0, on_hand < threshold))
    stmt = (
        select(positive, low)
        .select_from(bal.join(Item, Item.id == bal.c.item_id))
        .where(Item.tenant_id == tenant_id)
    )
    positive_n, low_n = (await db.execute(stmt)).one()
    return int(positive_n or 0), int(low_n or 0)


async def stock_ledger_running_balances(
    db: AsyncSession,
    tenant_id: int,
    page_rows: list[dict],
    *,
    date_from: date | None,
) -> dict[int, Decimal]:
    """Running balance (signed IN − OUT, ordered by effective date then id) for each movement on one page.

    Only the page's (item, warehouse) pairs are scanned: the balance before ``date_from`` is summed once
    per pair (opening balance) and the window runs only over movements from ``date_from`` up to the
    latest date on the page. Rows after that cannot change earlier running totals.
    """
    if not page_rows:
        return {}
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    qty = cast(sm.quantity, Numeric)
    signed_qty = case((sm.movement_type == "IN", qty), else_=-qty)
    wh_key = func.coalesce(sm.warehouse_id, -1)

    def pair_of(row: dict) -> tuple[int, int]:
        return int(row["item_id"]), int(row["warehouse_id"]) if row["warehouse_id"] is not None else -1

    pairs = sorted({pair_of(r) for r in page_rows})
    pair_filter = tuple_(sm.item_id, wh_key).in_(pairs)

    window_filters = [sm.tenant_id == tenant_id, pair_filter]
    if date_from is not None:
        window_filters.append(eff >= date_from)
    page_dates = [r["eff_date"] for r in page_rows]
    if all(d is not None for d in page_dates):
        window_filters.append(eff <= max(page_dates))
    running = func.sum(signed_qty).over(partition_by=(sm.item_id, wh_key), order_by=(eff.asc(), sm.id.asc()))
    window_sq = select(sm.id.label("id"), running.label("running_balance")).where(*window_filters).subquery()
    page_ids = [int(r["id"]) for r in page_rows]
    window_rows = await db.execute(
        select(window_sq.c.id, window_sq.c.running_balance).where(window_sq.c.id.in_(page_ids))
    )
    in_range_balance = {int(mid): Decimal(rb or 0) for mid, rb in window_rows.all()}

    opening: dict[tuple[int, int], Decimal] = {}
    if date_from is not None:
        opening_rows = await db.execute(
            select(sm.item_id, wh_key, func.sum(signed_qty))
            .where(sm.tenant_id == tenant_id, pair_filter, eff < date_from)
            .group_by(sm.item_id, wh_key)
        )
        opening = {(int(i), int(w)): Decimal(total or 0) for i, w, total in opening_rows.all()}

    return {
        int(r["id"]): opening.get(pair_of(r), Decimal("0")) + in_range_balance.get(int(r["id"]), Decimal("0"))
        for r in page_rows
    }


async def label_maps(
    db: AsyncSession, tenant_id: int, item_ids: set[int], warehouse_ids: set[int]
) -> tuple[dict[int, tuple[str, str]], dict[int, str]]:
    """``{item_id: (item_code, name)}`` and ``{warehouse_id: name}`` for just the given ids."""
    items: dict[int, tuple[str, str]] = {}
    if item_ids:
        rows = await db.execute(
            select(Item.id, Item.item_code, Item.name).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids))
        )
        items = {int(i): (code, name) for i, code, name in rows.all()}
    warehouses: dict[int, str] = {}
    if warehouse_ids:
        rows = await db.execute(
            select(Warehouse.id, Warehouse.name).where(
                Warehouse.tenant_id == tenant_id, Warehouse.id.in_(warehouse_ids)
            )
        )
        warehouses = {int(i): name for i, name in rows.all()}
    return items, warehouses
