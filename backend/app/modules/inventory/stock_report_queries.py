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
from app.models.inventory import StockBalanceSnapshot, StockMovement, Warehouse
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


def _balance_subquery(tenant_id: int, from_snapshot: bool) -> Subquery:
    """Columns: item_id, warehouse_id, in_qty, out_qty, on_hand (all Numeric)."""
    if from_snapshot:
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
    return (
        select(
            StockMovement.item_id.label("item_id"),
            StockMovement.warehouse_id.label("warehouse_id"),
            in_qty.label("in_qty"),
            out_qty.label("out_qty"),
            (in_qty - out_qty).label("on_hand"),
        )
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(StockMovement.item_id, StockMovement.warehouse_id)
        .subquery("stock_balance")
    )


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
) -> list[StockBalanceLine]:
    """Balances joined to item / warehouse labels, sorted by (item_code, warehouse_name) like the old reports.

    ``positive_only`` keeps rows whose rounded on-hand qty is > 0 (same test the reports used in Python).
    """
    from_snapshot = await use_snapshot_balances(db, tenant_id, feature_flags)
    bal = _balance_subquery(tenant_id, from_snapshot)
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
