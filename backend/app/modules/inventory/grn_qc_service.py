"""GRN quality inspection + quarantine stock (Sprint I2)."""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.tenant_feature_keys import is_grn_quality_inspection_enabled
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    GrnQualityInspection,
    StockMovement,
    Vendor,
    Warehouse,
)
from app.modules.inventory.stock_batch_service import create_batch_on_grn
from app.modules.inventory.stock_valuation_service import refresh_item_stock_caches
from app.services.fifo_inventory import finalize_movement_fifo

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")

DEFAULT_PARAM_KEYS = ("color", "shade", "weight", "width", "defects")


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


async def ensure_qc_warehouses(
    db: AsyncSession,
    tenant_id: int,
) -> dict[str, Warehouse]:
    """Ensure Quarantine, Rejected, Raw Material Store, Finished Goods exist."""
    rows = list(
        (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars().all()
    )
    quarantine = next((w for w in rows if w.is_quarantine and w.is_active), None)
    rejected = next((w for w in rows if w.is_rejected and w.is_active), None)
    store = next((w for w in rows if w.is_store and not w.is_quarantine and not w.is_rejected and w.is_active), None)
    fg = next(
        (
            w
            for w in rows
            if w.is_active
            and not w.is_quarantine
            and not w.is_rejected
            and ("finish" in (w.name or "").lower() or (w.warehouse_code or "").upper().startswith("FG"))
        ),
        None,
    )

    if store is None:
        code = await next_tenant_code(db, model=Warehouse, tenant_id=tenant_id, prefix="RM-", width=3)
        store = Warehouse(
            tenant_id=tenant_id,
            warehouse_code=code if code.startswith("RM") else f"RM-{tenant_id}"[:32],
            name="Raw Material Store",
            is_store=True,
            is_quarantine=False,
            is_rejected=False,
            is_production_floor=False,
        )
        db.add(store)
        await db.flush()
        rows.append(store)

    if fg is None:
        code = await next_tenant_code(db, model=Warehouse, tenant_id=tenant_id, prefix="FG-", width=3)
        fg = Warehouse(
            tenant_id=tenant_id,
            warehouse_code=code if code.startswith("FG") else f"FG-{tenant_id}"[:32],
            name="Finished Goods",
            is_store=True,
            is_quarantine=False,
            is_rejected=False,
            is_production_floor=False,
        )
        db.add(fg)
        await db.flush()

    if quarantine is None:
        code = await next_tenant_code(db, model=Warehouse, tenant_id=tenant_id, prefix="QC-", width=3)
        quarantine = Warehouse(
            tenant_id=tenant_id,
            warehouse_code=code if code.startswith("QC") else f"QUAR-{tenant_id}"[:32],
            name="Quarantine",
            is_store=False,
            is_quarantine=True,
            is_rejected=False,
            is_production_floor=False,
        )
        db.add(quarantine)
        await db.flush()

    if rejected is None:
        code = await next_tenant_code(db, model=Warehouse, tenant_id=tenant_id, prefix="REJ-", width=3)
        rejected = Warehouse(
            tenant_id=tenant_id,
            warehouse_code=code if "REJ" in code.upper() else f"REJ-{tenant_id}"[:32],
            name="Rejected",
            is_store=False,
            is_quarantine=False,
            is_rejected=True,
            is_production_floor=False,
        )
        db.add(rejected)
        await db.flush()

    return {"quarantine": quarantine, "rejected": rejected, "store": store, "finished_goods": fg}


def calculate_result(
    received_qty: Decimal,
    accepted_qty: Decimal,
    rejected_qty: Decimal,
    hold_qty: Decimal,
    *,
    parameters: dict | None = None,
) -> str:
    """Derive PASS / FAIL / PARTIAL / HOLD from quantities (+ optional param fail flag)."""
    recv = _q(_d(received_qty))
    acc = _q(_d(accepted_qty))
    rej = _q(_d(rejected_qty))
    hold = _q(_d(hold_qty))
    if recv <= ZERO:
        return "FAIL"
    params = parameters or {}
    param_fail = bool(params.get("fail")) or bool(params.get("force_fail"))
    if hold > ZERO and acc <= ZERO and rej <= ZERO:
        return "HOLD"
    if hold > ZERO and (acc > ZERO or rej > ZERO):
        return "PARTIAL"
    if rej >= recv - Q4 or (param_fail and acc <= ZERO):
        return "FAIL"
    if acc >= recv - Q4 and rej <= ZERO and hold <= ZERO and not param_fail:
        return "PASS"
    if acc > ZERO and rej > ZERO:
        return "PARTIAL"
    if hold > ZERO:
        return "HOLD"
    if rej > ZERO and acc <= ZERO:
        return "FAIL"
    if acc > ZERO:
        return "PASS"
    return "HOLD"


async def create_pending_inspections_for_grn(
    db: AsyncSession,
    tenant: Tenant,
    grn: GoodsReceiving,
    items: list[GoodsReceivingItem],
    *,
    quarantine_id: int,
    rejected_id: int,
) -> list[GrnQualityInspection]:
    """Create PENDING QC rows after GRN receive into quarantine."""
    created: list[GrnQualityInspection] = []
    for line in items:
        recv = _q(_d(getattr(line, "received_qty", None) or line.quantity))
        if recv <= ZERO:
            continue
        existing = (
            await db.execute(
                select(GrnQualityInspection).where(
                    GrnQualityInspection.tenant_id == tenant.id,
                    GrnQualityInspection.grn_item_id == line.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            continue
        insp = GrnQualityInspection(
            tenant_id=tenant.id,
            grn_id=grn.id,
            grn_item_id=line.id,
            received_qty=recv,
            accepted_qty=ZERO,
            rejected_qty=ZERO,
            hold_qty=recv,
            status="PENDING",
            result=None,
            target_warehouse_id=line.warehouse_id,
            quarantine_warehouse_id=quarantine_id,
            rejected_warehouse_id=rejected_id,
            parameters={"defaults": list(DEFAULT_PARAM_KEYS)},
        )
        db.add(insp)
        created.append(insp)
    await db.flush()
    if created:
        logger.info(
            "grn_qc pending_created tenant_id=%s grn_id=%s count=%s",
            tenant.id,
            grn.id,
            len(created),
        )
    return created


async def create_inspection(
    db: AsyncSession,
    tenant: Tenant,
    *,
    grn_id: int,
    grn_item_id: int,
    accepted_qty: Decimal,
    rejected_qty: Decimal,
    hold_qty: Decimal,
    parameters: dict | None = None,
    notes: str | None = None,
    photos: list | None = None,
    inspected_by: int | None = None,
    inspection_date: date | None = None,
) -> GrnQualityInspection:
    """Complete a pending inspection and move stock."""
    if not is_grn_quality_inspection_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="GRN quality inspection is disabled")

    insp = (
        await db.execute(
            select(GrnQualityInspection).where(
                GrnQualityInspection.tenant_id == tenant.id,
                GrnQualityInspection.grn_id == grn_id,
                GrnQualityInspection.grn_item_id == grn_item_id,
            )
        )
    ).scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="QC inspection not found for GRN item")
    if insp.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Inspection already completed")

    line = await db.get(GoodsReceivingItem, grn_item_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN item not found")

    recv = _q(_d(insp.received_qty))
    acc = _q(_d(accepted_qty))
    rej = _q(_d(rejected_qty))
    hold = _q(_d(hold_qty))
    if abs((acc + rej + hold) - recv) > Decimal("0.01"):
        raise HTTPException(
            status_code=400,
            detail=f"accepted+rejected+hold must equal received ({recv})",
        )

    result = calculate_result(recv, acc, rej, hold, parameters=parameters)
    insp.accepted_qty = acc
    insp.rejected_qty = rej
    insp.hold_qty = hold
    insp.parameters = parameters or insp.parameters
    insp.notes = notes
    insp.photos = photos
    insp.result = result
    insp.status = "COMPLETED"
    insp.inspected_by = inspected_by
    insp.inspection_date = inspection_date or date.today()
    insp.updated_at = datetime.utcnow()
    insp.debit_note_suggested = rej > ZERO

    # Sync GRN line accepted/rejected for scorecard
    line.accepted_qty = str(acc)
    line.rejected_qty = str(rej)
    if rej > ZERO and not line.rejection_reason:
        line.rejection_reason = notes or f"QC {result}"

    await move_stock_after_qc(db, tenant, insp)
    await db.flush()
    return insp


async def move_stock_after_qc(
    db: AsyncSession,
    tenant: Tenant,
    insp: GrnQualityInspection,
) -> None:
    """
    PASS → quarantine OUT + regular IN (+ batch)
    FAIL → quarantine OUT + rejected IN
    HOLD → no move
    PARTIAL → split accepted to regular, rejected to rejected; hold stays
    """
    line = await db.get(GoodsReceivingItem, insp.grn_item_id)
    grn = await db.get(GoodsReceiving, insp.grn_id)
    if not line or not grn:
        return

    q_wh = insp.quarantine_warehouse_id
    t_wh = insp.target_warehouse_id or line.warehouse_id
    r_wh = insp.rejected_warehouse_id
    if not q_wh:
        return

    if not t_wh or t_wh == q_wh:
        whs = await ensure_qc_warehouses(db, tenant.id)
        store = whs.get("store")
        if store and store.id != q_wh:
            t_wh = store.id
            insp.target_warehouse_id = t_wh

    if not r_wh:
        whs = await ensure_qc_warehouses(db, tenant.id)
        r_wh = whs["rejected"].id
        insp.rejected_warehouse_id = r_wh

    item = await db.get(Item, line.item_id)
    uc = _d(getattr(line, "unit_price", None)) or (
        _d(item.avg_cost) if item else ZERO
    ) or (_d(item.default_cost) if item else ZERO)

    async def _transfer(qty: Decimal, to_wh: int, kind: str, notes: str) -> StockMovement | None:
        qty = _q(qty)
        if qty <= ZERO or not to_wh or to_wh == q_wh:
            return None
        out_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=q_wh,
            movement_type="OUT",
            quantity=qty,
            reference_type="GRN_QC",
            reference_id=insp.id,
            movement_date=insp.inspection_date or date.today(),
            notes=notes,
            created_by_user_id=insp.inspected_by,
            movement_kind=kind + "_OUT",
            goods_receiving_id=grn.id,
            goods_receiving_item_id=line.id,
            lot_number=line.lot_number,
            vendor_id=grn.vendor_id,
        )
        db.add(out_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, out_mv)

        in_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=to_wh,
            movement_type="IN",
            quantity=qty,
            reference_type="GRN_QC",
            reference_id=insp.id,
            movement_date=insp.inspection_date or date.today(),
            notes=notes,
            created_by_user_id=insp.inspected_by,
            movement_kind=kind + "_IN",
            goods_receiving_id=grn.id,
            goods_receiving_item_id=line.id,
            lot_number=line.lot_number,
            vendor_id=grn.vendor_id,
        )
        db.add(in_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, in_mv, in_unit_cost=float(uc) if uc > ZERO else None)
        return in_mv

    result = (insp.result or "").upper()
    if result == "HOLD":
        return

    if result == "PASS" and t_wh:
        in_mv = await _transfer(insp.accepted_qty, t_wh, "QC_PASS", f"QC PASS {grn.grn_code}")
        if in_mv and item:
            try:
                await create_batch_on_grn(
                    db,
                    tenant.id,
                    item=item,
                    grn_item=line,
                    movement=in_mv,
                    qty=_d(insp.accepted_qty),
                    unit_cost=uc,
                    feature_flags=tenant.feature_flags,
                    batch_number=line.lot_number,
                )
            except Exception:
                logger.exception("QC batch create failed insp=%s", insp.id)
        # Update line warehouse to target so future reads match available stock location
        line.warehouse_id = t_wh

    elif result == "FAIL" and r_wh:
        await _transfer(insp.rejected_qty or insp.received_qty, r_wh, "QC_FAIL", f"QC FAIL {grn.grn_code}")

    elif result == "PARTIAL":
        if insp.accepted_qty > ZERO and t_wh:
            in_mv = await _transfer(insp.accepted_qty, t_wh, "QC_PASS", f"QC PARTIAL accept {grn.grn_code}")
            if in_mv and item:
                try:
                    await create_batch_on_grn(
                        db,
                        tenant.id,
                        item=item,
                        grn_item=line,
                        movement=in_mv,
                        qty=_d(insp.accepted_qty),
                        unit_cost=uc,
                        feature_flags=tenant.feature_flags,
                        batch_number=line.lot_number,
                    )
                except Exception:
                    logger.exception("QC partial batch create failed insp=%s", insp.id)
        if insp.rejected_qty > ZERO and r_wh:
            await _transfer(insp.rejected_qty, r_wh, "QC_FAIL", f"QC PARTIAL reject {grn.grn_code}")

    await refresh_item_stock_caches(db, tenant.id, line.item_id)


async def list_pending_for_grn(
    db: AsyncSession,
    tenant_id: int,
    grn_id: int,
) -> list[GrnQualityInspection]:
    q = await db.execute(
        select(GrnQualityInspection).where(
            GrnQualityInspection.tenant_id == tenant_id,
            GrnQualityInspection.grn_id == grn_id,
            GrnQualityInspection.status == "PENDING",
        )
    )
    return list(q.scalars().all())


async def list_inspections(
    db: AsyncSession,
    tenant_id: int,
    *,
    status: str | None = None,
    result: str | None = None,
    vendor_id: int | None = None,
    limit: int = 100,
) -> list[GrnQualityInspection]:
    q = select(GrnQualityInspection).where(GrnQualityInspection.tenant_id == tenant_id)
    if status:
        q = q.where(GrnQualityInspection.status == status)
    if result:
        q = q.where(GrnQualityInspection.result == result)
    if vendor_id is not None:
        q = q.join(GoodsReceiving, GoodsReceiving.id == GrnQualityInspection.grn_id).where(
            GoodsReceiving.vendor_id == vendor_id
        )
    q = q.order_by(GrnQualityInspection.id.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def vendor_scorecard(
    db: AsyncSession,
    tenant_id: int,
    *,
    days: int = 90,
) -> list[dict[str, Any]]:
    """Per-vendor GRN QC metrics."""
    from datetime import timedelta

    cutoff = date.today() - timedelta(days=days)
    stmt = (
        select(
            GoodsReceiving.vendor_id,
            func.count(GrnQualityInspection.id),
            func.coalesce(func.sum(GrnQualityInspection.received_qty), 0),
            func.coalesce(func.sum(GrnQualityInspection.rejected_qty), 0),
            func.coalesce(func.sum(GrnQualityInspection.accepted_qty), 0),
        )
        .join(GoodsReceiving, GoodsReceiving.id == GrnQualityInspection.grn_id)
        .where(
            GrnQualityInspection.tenant_id == tenant_id,
            GrnQualityInspection.status == "COMPLETED",
            GrnQualityInspection.inspection_date >= cutoff,
            GoodsReceiving.vendor_id.is_not(None),
        )
        .group_by(GoodsReceiving.vendor_id)
    )
    rows = (await db.execute(stmt)).all()
    out: list[dict[str, Any]] = []
    for vendor_id, insp_count, recv, rej, acc in rows:
        recv_d = _d(recv)
        rej_d = _d(rej)
        rate = float((rej_d / recv_d) * 100) if recv_d > ZERO else 0.0
        vendor = await db.get(Vendor, vendor_id) if vendor_id else None
        out.append(
            {
                "vendor_id": vendor_id,
                "vendor_name": vendor.name if vendor else None,
                "inspection_count": int(insp_count or 0),
                "received_qty": str(_q(recv_d)),
                "rejected_qty": str(_q(rej_d)),
                "accepted_qty": str(_q(_d(acc))),
                "rejection_rate_pct": round(rate, 2),
                "alert": rate > 5.0,
            }
        )
    out.sort(key=lambda r: r["rejection_rate_pct"], reverse=True)
    return out


async def vendor_rejection_rate(
    db: AsyncSession,
    tenant_id: int,
    vendor_id: int,
    *,
    days: int = 90,
) -> float | None:
    card = await vendor_scorecard(db, tenant_id, days=days)
    for row in card:
        if row["vendor_id"] == vendor_id:
            return float(row["rejection_rate_pct"])
    return None


async def item_has_pending_quarantine_qc(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
) -> bool:
    """True if item has PENDING QC (stock still held for inspection)."""
    row = (
        await db.execute(
            select(GrnQualityInspection.id)
            .join(GoodsReceivingItem, GoodsReceivingItem.id == GrnQualityInspection.grn_item_id)
            .where(
                GrnQualityInspection.tenant_id == tenant_id,
                GrnQualityInspection.status == "PENDING",
                GoodsReceivingItem.item_id == item_id,
            )
            .limit(1)
        )
    ).first()
    return row is not None


async def get_non_available_warehouse_ids(
    db: AsyncSession,
    tenant_id: int,
) -> set[int]:
    """Warehouses whose stock must not count as available (quarantine + rejected)."""
    rows = (
        await db.execute(
            select(Warehouse.id).where(
                Warehouse.tenant_id == tenant_id,
                Warehouse.is_active.is_(True),
                (Warehouse.is_quarantine.is_(True) | Warehouse.is_rejected.is_(True)),
            )
        )
    ).all()
    return {int(r[0]) for r in rows}
