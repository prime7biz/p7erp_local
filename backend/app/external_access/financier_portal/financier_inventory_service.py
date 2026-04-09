"""Read-only inventory / ledger views for the external financier portal."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import case, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Date as SQLDate, Numeric

from app.external_access.financier_portal import facility_selectors as fsel
from app.models import Item, StockGroup
from app.models.finance import Voucher
from app.models.finance import ChartOfAccount, CoAConfig
from app.models.inventory import (
    InventoryGlPosting,
    ProcessOrder,
    PurchaseOrderItem,
    StockMovement,
    Warehouse,
)
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.modules.inventory.router import (
    _fifo_layer_qty_value_map,
    _inventory_line_from_summary,
    _stock_summary_rows,
    _to_float,
)
from app.services.fifo_inventory import fifo_on_hand_value


async def _wip_total_value(db: AsyncSession, tenant_id: int) -> float:
    pos = (
        await db.execute(select(ProcessOrder).where(ProcessOrder.tenant_id == tenant_id, ProcessOrder.status == "ISSUED"))
    ).scalars().all()
    total = 0.0
    for po in pos:
        mvs = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "PROCESS_ORDER",
                    StockMovement.reference_id == po.id,
                    StockMovement.movement_type == "OUT",
                    StockMovement.item_id == po.input_item_id,
                )
            )
        ).scalars().all()
        total += sum(_to_float(m.movement_value or "0") for m in mvs)
    return round(total, 2)


async def build_financier_inventory_overview(
    db: AsyncSession, *, tenant_id: int, as_of_date: date | None = None
) -> dict[str, Any]:
    stock_v = await fifo_on_hand_value(db, tenant_id, as_of_date=as_of_date)
    wip = await _wip_total_value(db, tenant_id)
    summary = await _stock_summary_rows(db, tenant_id)
    pos_count = sum(1 for r in summary if r.on_hand_qty > 0)
    items_r = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    item_map = {r.id: r for r in items_r.scalars().all()}
    gids: set[int | None] = set()
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        it = item_map.get(s.item_id)
        gids.add(it.stock_group_id if it else None)
    return {
        "as_of_date": as_of_date.isoformat() if as_of_date else None,
        "total_inventory_value": round(stock_v, 2),
        "total_wip_value": wip,
        "grand_total": round(stock_v + wip, 2),
        "item_position_count": pos_count,
        "item_count": pos_count,
        "category_count": len(gids),
    }


async def _party_btb_item_ids(db: AsyncSession, tenant_id: int, party_id: int) -> set[int]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    if not btb_ids:
        return set()
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    po_ids = [p.id for p in pos]
    if not po_ids:
        return set()
    r = await db.execute(select(PurchaseOrderItem.item_id).where(PurchaseOrderItem.purchase_order_id.in_(po_ids)))
    return {int(x) for x in r.scalars().all()}


async def build_financier_inventory_by_group(
    db: AsyncSession,
    *,
    tenant_id: int,
    party_id: int | None,
    as_of_date: date | None = None,
    btb_scope: bool = False,
) -> dict[str, Any]:
    fifo_map = await _fifo_layer_qty_value_map(db, tenant_id, as_of_date)
    summary = await _stock_summary_rows(db, tenant_id)
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    sg_result = await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant_id))
    sg_map = {r.id: r for r in sg_result.scalars().all()}

    allowed: set[int] | None = None
    if btb_scope:
        if not party_id:
            return {"as_of_date": as_of_date.isoformat() if as_of_date else None, "groups": [], "note": "No party link."}
        allowed = await _party_btb_item_ids(db, tenant_id, party_id)
        if not allowed:
            return {
                "as_of_date": as_of_date.isoformat() if as_of_date else None,
                "groups": [],
                "note": "No PO lines under linked BTB LCs.",
            }

    by_gid: dict[int | None, list[Any]] = defaultdict(list)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        if allowed is not None and s.item_id not in allowed:
            continue
        it = item_map.get(s.item_id)
        gid = it.stock_group_id if it else None
        by_gid[gid].append(_inventory_line_from_summary(s, item_map, fifo_map))

    blocks: list[dict[str, Any]] = []
    for gid, lines in sorted(by_gid.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        lines.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
        tq = sum(r.on_hand_qty for r in lines)
        tv = sum(r.line_value for r in lines)
        sg = sg_map.get(gid) if gid is not None else None
        blocks.append(
            {
                "stock_group_id": gid,
                "stock_group_code": sg.group_code if sg else None,
                "stock_group_name": sg.name if sg else "Uncategorized",
                "total_qty": round(tq, 4),
                "total_value": round(tv, 2),
                "lines": [
                    {
                        "item_id": r.item_id,
                        "item_code": r.item_code,
                        "item_name": r.item_name,
                        "warehouse_id": r.warehouse_id,
                        "warehouse_name": r.warehouse_name,
                        "on_hand_qty": r.on_hand_qty,
                        "unit_cost": r.unit_cost,
                        "line_value": r.line_value,
                    }
                    for r in lines
                ],
            }
        )
    return {"as_of_date": as_of_date.isoformat() if as_of_date else None, "groups": blocks}


def _gl_lookup_keys(m: StockMovement) -> list[tuple[str, str, int]]:
    rt = (m.reference_type or "").upper()
    rid = m.reference_id
    if rid is None:
        return []
    mt = (m.movement_type or "").upper()
    if rt == "GRN":
        return [("GRN", "RECEIPT", int(rid))]
    if rt == "DELIVERY_CHALLAN":
        return [("DELIVERY_CHALLAN", "POSTED", int(rid))]
    if rt == "PROCESS_ORDER":
        if mt == "OUT":
            return [("PROCESS_ORDER", "ISSUE", int(rid))]
        if mt == "IN":
            return [("PROCESS_ORDER", "RECEIVE", int(rid))]
    if rt == "STOCK_ADJUSTMENT":
        return [("STOCK_ADJUSTMENT", "POST", int(rid))]
    if rt == "PHYSICAL_COUNT":
        return [("PHYSICAL_COUNT", "POST", int(rid))]
    return []


async def _sum_chart_balances(db: AsyncSession, tenant_id: int, account_ids: list[int]) -> float:
    if not account_ids:
        return 0.0
    accs = (
        await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.id.in_(account_ids),
            )
        )
    ).scalars().all()
    return round(sum(_to_float(a.balance) for a in accs), 4)


async def _maybe_resolve_system_ledger_id(db: AsyncSession, tenant_id: int, mapping_key: str) -> int | None:
    try:
        return await resolve_system_ledger(db, tenant_id, mapping_key)
    except ValueError:
        return None


async def build_financier_inventory_ledger(
    db: AsyncSession,
    *,
    tenant_id: int,
    item_id: int | None,
    warehouse_id: int | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    offset: int,
    include_gl: bool = True,
) -> dict[str, Any]:
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    qty_n = cast(sm.quantity, Numeric)
    signed_qty = case((sm.movement_type == "IN", qty_n), else_=-qty_n)
    wh_key = func.coalesce(sm.warehouse_id, -1)
    running_bal = func.sum(signed_qty).over(
        partition_by=(sm.item_id, wh_key),
        order_by=(eff.asc(), sm.id.asc()),
    )
    inner = select(
        sm.id,
        sm.movement_date,
        sm.movement_type,
        sm.item_id,
        sm.warehouse_id,
        sm.quantity,
        sm.reference_type,
        sm.reference_id,
        sm.notes,
        sm.created_by_user_id,
        sm.created_at,
        eff.label("eff_date"),
        running_bal.label("running_balance"),
    ).where(sm.tenant_id == tenant_id)
    if item_id is not None:
        inner = inner.where(sm.item_id == item_id)
    if warehouse_id is not None:
        inner = inner.where(sm.warehouse_id == warehouse_id)
    sq = inner.subquery()
    count_stmt = select(func.count()).select_from(sq)
    if date_from is not None:
        count_stmt = count_stmt.where(sq.c.eff_date >= date_from)
    if date_to is not None:
        count_stmt = count_stmt.where(sq.c.eff_date <= date_to)
    total = int((await db.execute(count_stmt)).scalar() or 0)

    page_stmt = select(sq)
    if date_from is not None:
        page_stmt = page_stmt.where(sq.c.eff_date >= date_from)
    if date_to is not None:
        page_stmt = page_stmt.where(sq.c.eff_date <= date_to)
    page_stmt = page_stmt.order_by(desc(sq.c.eff_date).nulls_last(), desc(sq.c.id)).limit(limit).offset(offset)
    result = await db.execute(page_stmt)
    raw_rows = list(result.mappings())

    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}

    gl_keys: list[tuple[str, str, int]] = []
    by_mid: dict[int, StockMovement] = {}
    if include_gl and raw_rows:
        mids = [int(r["id"]) for r in raw_rows]
        mrows = (await db.execute(select(StockMovement).where(StockMovement.id.in_(mids)))).scalars().all()
        by_mid = {m.id: m for m in mrows}
        for m in mrows:
            gl_keys.extend(_gl_lookup_keys(m))

    posting_map: dict[tuple[str, str, int], InventoryGlPosting] = {}
    if include_gl and gl_keys:
        uniq = list({k for k in gl_keys})
        conds = [
            (InventoryGlPosting.source_system == s)
            & (InventoryGlPosting.action == a)
            & (InventoryGlPosting.source_id == sid)
            for s, a, sid in uniq
        ]
        if conds:
            pr = await db.execute(
                select(InventoryGlPosting).where(
                    InventoryGlPosting.tenant_id == tenant_id,
                    or_(*conds),
                )
            )
            for p in pr.scalars().all():
                posting_map[(p.source_system, p.action, int(p.source_id))] = p

    voucher_ids = {p.voucher_id for p in posting_map.values()}
    vch_map: dict[int, Voucher] = {}
    if voucher_ids:
        vr = await db.execute(select(Voucher).where(Voucher.tenant_id == tenant_id, Voucher.id.in_(voucher_ids)))
        vch_map = {v.id: v for v in vr.scalars().all()}

    current_stock = 0.0
    current_value = 0.0
    if item_id is not None:
        fifo_map = await _fifo_layer_qty_value_map(db, tenant_id, None)
        summary = await _stock_summary_rows(db, tenant_id)
        for s in summary:
            if s.item_id != item_id:
                continue
            if warehouse_id is not None and s.warehouse_id != warehouse_id:
                continue
            current_stock += s.on_hand_qty
            line = _inventory_line_from_summary(s, item_map, fifo_map)
            current_value += line.line_value

    out_items: list[dict[str, Any]] = []
    for row in raw_rows:
        iid = row["item_id"]
        wid = row["warehouse_id"]
        rb = row["running_balance"]
        gl_posted = False
        voucher_id = None
        voucher_code = None
        m = by_mid.get(int(row["id"]))
        if m and include_gl:
            for key in _gl_lookup_keys(m):
                pst = posting_map.get(key)
                if pst:
                    gl_posted = True
                    voucher_id = pst.voucher_id
                    v = vch_map.get(pst.voucher_id)
                    if v:
                        voucher_code = getattr(v, "voucher_number", None) or getattr(v, "reference", None) or str(v.id)
                    break
        out_items.append(
            {
                "id": row["id"],
                "movement_date": str(row["movement_date"]) if row["movement_date"] else None,
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
                "running_balance": float(rb) if rb is not None else 0.0,
                "gl_posted": gl_posted,
                "voucher_id": voucher_id,
                "voucher_code": voucher_code,
            }
        )

    return {
        "items": out_items,
        "total": total,
        "current_stock": round(current_stock, 4),
        "current_value": round(current_value, 2),
    }


async def build_financier_inventory_reconciliation(
    db: AsyncSession, *, tenant_id: int
) -> dict[str, Any]:
    fifo_total = await fifo_on_hand_value(db, tenant_id, as_of_date=None)
    cfg = (await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))).scalars().first()
    global_ids: set[int] = set()
    if cfg and cfg.inventory_stock_account_id:
        global_ids.add(cfg.inventory_stock_account_id)
    sgs = (
        await db.execute(
            select(StockGroup).where(
                StockGroup.tenant_id == tenant_id,
                StockGroup.inventory_account_id.is_not(None),
            )
        )
    ).scalars().all()
    for sg in sgs:
        if sg.inventory_account_id:
            global_ids.add(sg.inventory_account_id)
    for key in ("RAW_MATERIAL_INVENTORY", "FINISHED_GOODS", "PACKING_MATERIAL_INVENTORY"):
        lid = await _maybe_resolve_system_ledger_id(db, tenant_id, key)
        if lid:
            global_ids.add(lid)
    gl_bal_total = await _sum_chart_balances(db, tenant_id, list(global_ids))

    fifo_map = await _fifo_layer_qty_value_map(db, tenant_id, None)
    summary = await _stock_summary_rows(db, tenant_id)
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    item_map = {r.id: r for r in items_result.scalars().all()}

    by_gid: dict[int | None, float] = defaultdict(float)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        line = _inventory_line_from_summary(s, item_map, fifo_map)
        it = item_map.get(s.item_id)
        gid = it.stock_group_id if it else None
        by_gid[gid] += line.line_value

    sg_map = {r.id: r for r in sgs}
    group_rows: list[dict[str, Any]] = []
    for gid, fifo_val in sorted(by_gid.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        sg = sg_map.get(gid) if gid is not None else None
        acc_id = sg.inventory_account_id if sg else None
        gl_part = await _sum_chart_balances(db, tenant_id, [acc_id] if acc_id else [])
        group_rows.append(
            {
                "stock_group_id": gid,
                "stock_group_code": sg.group_code if sg else None,
                "stock_group_name": sg.name if sg else "Uncategorized",
                "fifo_value": round(fifo_val, 2),
                "gl_balance": gl_part if acc_id else None,
                "variance": round(fifo_val - gl_part, 4) if acc_id else None,
            }
        )

    grni_ids: set[int] = set()
    for sg in sgs:
        if sg.grni_account_id:
            grni_ids.add(sg.grni_account_id)
    grni_bal = await _sum_chart_balances(db, tenant_id, list(grni_ids))

    return {
        "fifo_stock_value_total": round(fifo_total, 2),
        "gl_inventory_balance_total": gl_bal_total,
        "variance_total": round(fifo_total - gl_bal_total, 4),
        "groups": group_rows,
        "grni_liability_balance": grni_bal,
    }


async def build_financier_balance_sheet_inventory(
    db: AsyncSession, *, tenant_id: int
) -> dict[str, Any]:
    ov = await build_financier_inventory_overview(db, tenant_id=tenant_id, as_of_date=None)
    rec = await build_financier_inventory_reconciliation(db, tenant_id=tenant_id)
    inv_asset = float(ov["total_inventory_value"])
    wip = float(ov["total_wip_value"])
    grni = float(rec.get("grni_liability_balance") or 0)
    net = round(inv_asset + wip - grni, 2)
    return {
        "inventory_asset_value": inv_asset,
        "wip_value": wip,
        "grni_liability": grni,
        "net_inventory_position": net,
        "fifo_vs_gl_variance": rec.get("variance_total"),
    }


async def cogs_outbound_90d(db: AsyncSession, tenant_id: int) -> float:
    cut = date.today() - timedelta(days=90)
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    r = await db.execute(
        select(func.coalesce(func.sum(cast(sm.movement_value, Numeric)), 0))
        .select_from(sm)
        .where(
            sm.tenant_id == tenant_id,
            sm.movement_type == "OUT",
            eff >= cut,
        )
    )
    val = r.scalar()
    return float(val or 0)
