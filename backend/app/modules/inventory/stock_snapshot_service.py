"""Optional precomputed stock balances (tenant-scoped) for fast reads.

Rebuild via ``rebuild_stock_balance_snapshot`` (script or job). Reads are used only when
``tenants.feature_flags.stock_snapshot_reads`` is true — see ``tenant_feature_keys``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import case, cast, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Numeric

from app.models.costing import Item
from app.models.inventory import StockBalanceSnapshot, StockMovement, Warehouse


async def snapshot_row_count(db: AsyncSession, tenant_id: int) -> int:
    q = select(func.count()).select_from(StockBalanceSnapshot).where(StockBalanceSnapshot.tenant_id == tenant_id)
    return int((await db.scalar(q)) or 0)


async def _movement_balance_rows(
    db: AsyncSession, tenant_id: int
) -> list[tuple[int, int | None, float, float]]:
    """Aggregate movements to (item_id, warehouse_id|None, in_qty, out_qty)."""
    qty_col = cast(StockMovement.quantity, Numeric)
    in_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type == "IN", qty_col), else_=0)),
        0,
    )
    out_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type != "IN", qty_col), else_=0)),
        0,
    )
    agg_stmt = (
        select(
            StockMovement.item_id,
            StockMovement.warehouse_id,
            in_agg.label("in_qty"),
            out_agg.label("out_qty"),
        )
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(StockMovement.item_id, StockMovement.warehouse_id)
    )
    agg_result = await db.execute(agg_stmt)
    out: list[tuple[int, int | None, float, float]] = []
    for item_id, warehouse_id, in_qty_raw, out_qty_raw in agg_result.all():
        out.append(
            (
                int(item_id),
                int(warehouse_id) if warehouse_id is not None else None,
                float(in_qty_raw or 0),
                float(out_qty_raw or 0),
            )
        )
    return out


def _wh_dim(warehouse_id: int | None) -> int:
    return 0 if warehouse_id is None else int(warehouse_id)


async def rebuild_stock_balance_snapshot(db: AsyncSession, tenant_id: int) -> int:
    """Replace snapshot rows for tenant from live movements. Caller should commit."""
    balances = await _movement_balance_rows(db, tenant_id)
    await db.execute(delete(StockBalanceSnapshot).where(StockBalanceSnapshot.tenant_id == tenant_id))
    now = datetime.now(UTC).replace(tzinfo=None)
    rows: list[StockBalanceSnapshot] = []
    for item_id, wh_id, in_q, out_q in balances:
        dim = _wh_dim(wh_id)
        rows.append(
            StockBalanceSnapshot(
                tenant_id=tenant_id,
                item_id=item_id,
                warehouse_dim_id=dim,
                in_qty=in_q,
                out_qty=out_q,
                on_hand_qty=round(in_q - out_q, 6),
                computed_at=now,
            )
        )
    # Chunk to avoid huge INSERT statements on very large tenants.
    chunk = 800
    for i in range(0, len(rows), chunk):
        db.add_all(rows[i : i + chunk])
        await db.flush()
    return len(rows)


async def snapshot_summary_payloads(db: AsyncSession, tenant_id: int) -> list[dict[str, object]]:
    """Rows compatible with ``StockSummaryRow`` field names (for router mapping)."""
    wh_join = func.nullif(StockBalanceSnapshot.warehouse_dim_id, 0)
    stmt = (
        select(
            StockBalanceSnapshot.item_id,
            Item.item_code,
            Item.name,
            StockBalanceSnapshot.warehouse_dim_id,
            Warehouse.name,
            StockBalanceSnapshot.in_qty,
            StockBalanceSnapshot.out_qty,
            StockBalanceSnapshot.on_hand_qty,
        )
        .join(Item, Item.id == StockBalanceSnapshot.item_id)
        .outerjoin(Warehouse, Warehouse.id == wh_join)
        .where(StockBalanceSnapshot.tenant_id == tenant_id, Item.tenant_id == tenant_id)
    )
    r = await db.execute(stmt)
    payloads: list[dict[str, object]] = []
    for item_id, code, name, dim, wh_name, in_q, out_q, on_hand in r.all():
        wh_id = None if int(dim or 0) == 0 else int(dim)
        payloads.append(
            {
                "item_id": int(item_id),
                "item_code": str(code),
                "item_name": str(name or ""),
                "warehouse_id": wh_id,
                "warehouse_name": str(wh_name) if wh_name else None,
                "in_qty": round(float(in_q or 0), 3),
                "out_qty": round(float(out_q or 0), 3),
                "on_hand_qty": round(float(on_hand or 0), 3),
            }
        )
    payloads.sort(key=lambda d: (str(d["item_code"]), str(d["warehouse_name"] or "")))
    return payloads


async def compare_snapshot_to_movements(db: AsyncSession, tenant_id: int) -> list[dict[str, object]]:
    """Shadow diff: snapshot vs live aggregate (same keys). For ops logging only."""
    snap = {(r["item_id"], r["warehouse_id"]): float(r["on_hand_qty"]) for r in await snapshot_summary_payloads(db, tenant_id)}
    live_rows = await _movement_balance_rows(db, tenant_id)
    live: dict[tuple[int, int | None], float] = {}
    for item_id, wh_id, in_q, out_q in live_rows:
        live[(item_id, wh_id)] = round(in_q - out_q, 3)
    diffs: list[dict[str, object]] = []
    keys = set(snap) | set(live)
    for k in keys:
        a = snap.get(k)
        b = live.get(k)
        if a is None:
            a = 0.0
        if b is None:
            b = 0.0
        if abs(float(a) - float(b)) > 0.001:
            diffs.append({"item_id": k[0], "warehouse_id": k[1], "snapshot_on_hand": a, "movement_on_hand": b})
    return diffs
