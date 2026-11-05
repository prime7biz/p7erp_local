"""Inter-department transfer issue / receive (Sprint I1)."""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.inventory_policy import tenant_allows_negative_stock
from app.common.tenant_feature_keys import (
    is_batch_tracking_enabled,
    is_grn_quality_inspection_enabled,
    is_job_work_costing_enabled,
)
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import (
    InterDepartmentTransfer,
    InterDepartmentTransferLine,
    StockBatch,
    StockMovement,
    Warehouse,
)
from app.modules.inventory.job_work_costing_service import (
    _d,
    _q,
    calculate_job_work_cost_from_idt,
)
from app.modules.inventory.process_loss_service import get_standard_for_process
from app.modules.inventory.stock_batch_service import issue_batch_fifo
from app.modules.inventory.stock_locks import lock_stock_items, on_hand_qty_decimal
from app.modules.inventory.stock_valuation_service import refresh_item_stock_caches
from app.services.fifo_inventory import finalize_movement_fifo
from app.services.wip_gl_service import maybe_post_idt_issue_wip, maybe_post_idt_receive_wip

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


async def _avg_unit_cost(db: AsyncSession, tenant_id: int, item_id: int) -> Decimal:
    item = await db.get(Item, item_id)
    if not item:
        return ZERO
    cost = _d(item.avg_cost) or _d(item.default_cost) or _d(item.standard_price)
    return _q(cost)


async def create_idt_issue(
    db: AsyncSession,
    tenant: Tenant,
    *,
    from_warehouse_id: int,
    to_warehouse_id: int,
    process_name: str,
    source_item_id: int,
    source_qty: Decimal,
    source_qty_unit: str,
    target_item_id: int,
    target_qty_expected: Decimal,
    target_qty_unit: str,
    user_id: int | None = None,
    idt_date: date | None = None,
    source_batch_id: int | None = None,
    is_job_work: bool = False,
    job_work_vendor_id: int | None = None,
    job_work_cost_per_unit: Decimal | None = None,
    transport_cost: Decimal | None = None,
    other_charges: Decimal | None = None,
    linked_order_id: int | None = None,
    narration: str | None = None,
    lines: list[dict[str, Any]] | None = None,
) -> InterDepartmentTransfer:
    tenant_id = tenant.id
    if from_warehouse_id == to_warehouse_id:
        raise HTTPException(status_code=400, detail="From and to warehouses must differ")

    for wid in (from_warehouse_id, to_warehouse_id):
        wh = await db.get(Warehouse, wid)
        if not wh or wh.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail=f"Warehouse {wid} not found")

    source = await db.get(Item, source_item_id)
    target = await db.get(Item, target_item_id)
    if not source or source.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Source item not found")
    if not target or target.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Target item not found")
    from app.common.ownership import ensure_all_owned, ensure_owned
    from app.models import Order, StockBatch, Vendor

    await ensure_owned(db, Vendor, job_work_vendor_id if is_job_work else None, tenant_id, "Vendor")
    await ensure_owned(db, Order, linked_order_id, tenant_id, "Order")
    await ensure_all_owned(
        db, StockBatch, [source_batch_id, *[s.get("source_batch_id") for s in (lines or [])]], tenant_id, "Batch"
    )
    await ensure_all_owned(db, Item, [int(s["source_item_id"]) for s in (lines or [])], tenant_id, "Item")

    # Sprint I2: block issue while GRN QC is still pending for this item
    if is_grn_quality_inspection_enabled(tenant.feature_flags):
        from app.modules.inventory.grn_qc_service import item_has_pending_quarantine_qc

        if await item_has_pending_quarantine_qc(db, tenant_id, source_item_id):
            raise HTTPException(
                status_code=400,
                detail="Cannot issue to department: item has pending GRN quality inspection in quarantine",
            )
        from_wh = await db.get(Warehouse, from_warehouse_id)
        if from_wh and getattr(from_wh, "is_quarantine", False):
            raise HTTPException(
                status_code=400,
                detail="Cannot issue from quarantine warehouse until QC is completed",
            )

    qty = _q(_d(source_qty))
    if qty <= ZERO:
        raise HTTPException(status_code=400, detail="Source qty must be positive")

    await lock_stock_items(db, tenant_id, [source_item_id])
    if not await tenant_allows_negative_stock(db, tenant_id):
        available = await on_hand_qty_decimal(db, tenant_id, source_item_id, from_warehouse_id)
        if available + Decimal("0.0001") < qty:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock for {source.item_code} at source. "
                    f"Available={_q(available)}, required={qty}"
                ),
            )

    unit_cost = await _avg_unit_cost(db, tenant_id, source_item_id)
    primary_batch_id = source_batch_id

    # FIFO batch allocation when enabled
    if is_batch_tracking_enabled(tenant.feature_flags) and getattr(source, "batch_tracking", False):
        try:
            allocs = await issue_batch_fifo(
                db,
                tenant_id,
                source_item_id,
                from_warehouse_id,
                qty,
                method="FIFO",
                feature_flags=tenant.feature_flags,
            )
            if allocs:
                # Weighted average cost from allocations
                total_val = ZERO
                total_q = ZERO
                for a in allocs:
                    aq = _d(a["qty"])
                    ac = _d(a["cost_per_unit"])
                    total_val += aq * ac
                    total_q += aq
                    if primary_batch_id is None:
                        primary_batch_id = a["batch_id"]
                if total_q > ZERO:
                    unit_cost = _q(total_val / total_q)
        except (HTTPException, DBAPIError):
            # A DB error aborts the transaction; let it surface instead of failing later.
            raise
        except Exception as exc:
            logger.warning("IDT FIFO allocate failed: %s", exc)

    std = await get_standard_for_process(
        db, tenant_id, process_name, getattr(source, "category_id", None)
    )
    std_pct = _d(std.standard_loss_percent) if std else None

    number = await next_tenant_code(
        db, model=InterDepartmentTransfer, tenant_id=tenant_id, prefix="IDT-", width=4
    )
    idt = InterDepartmentTransfer(
        tenant_id=tenant_id,
        idt_number=number,
        idt_date=idt_date or date.today(),
        from_warehouse_id=from_warehouse_id,
        to_warehouse_id=to_warehouse_id,
        process_name=process_name,
        source_item_id=source_item_id,
        source_qty_issued=qty,
        source_qty_unit=source_qty_unit or "kg",
        source_batch_id=primary_batch_id,
        target_item_id=target_item_id,
        target_qty_expected=_q(_d(target_qty_expected)),
        target_qty_unit=target_qty_unit or "kg",
        standard_process_loss_percent=std_pct,
        is_job_work=bool(is_job_work),
        job_work_vendor_id=job_work_vendor_id if is_job_work else None,
        job_work_cost_per_unit=_q(_d(job_work_cost_per_unit)) if job_work_cost_per_unit is not None else None,
        transport_cost=_q(_d(transport_cost)),
        other_charges=_q(_d(other_charges)),
        status="ISSUED",
        source_item_cost=unit_cost,
        linked_order_id=linked_order_id,
        narration=narration,
        created_by=user_id,
    )
    if is_job_work and job_work_cost_per_unit is not None and not is_job_work_costing_enabled(tenant.feature_flags):
        # Still store costs on the IDT; flag only gates GL/extra paths
        pass

    db.add(idt)
    await db.flush()

    # Lines
    line_specs = lines or [
        {
            "source_item_id": source_item_id,
            "source_qty": qty,
            "source_batch_id": primary_batch_id,
            "source_unit_cost": unit_cost,
        }
    ]
    for spec in line_specs:
        db.add(
            InterDepartmentTransferLine(
                idt_id=idt.id,
                source_item_id=int(spec["source_item_id"]),
                source_qty=_q(_d(spec["source_qty"])),
                source_batch_id=spec.get("source_batch_id"),
                source_unit_cost=_q(_d(spec.get("source_unit_cost"))) if spec.get("source_unit_cost") is not None else unit_cost,
            )
        )

    # Stock OUT movement
    mv = StockMovement(
        tenant_id=tenant_id,
        item_id=source_item_id,
        warehouse_id=from_warehouse_id,
        movement_type="OUT",
        quantity=qty,
        reference_type="IDT",
        reference_id=idt.id,
        notes=f"IDT issue {idt.idt_number}: {process_name}",
        created_by_user_id=user_id,
        movement_kind="IDT_ISSUE",
        order_id=linked_order_id,
        batch_id=primary_batch_id,
        movement_date=idt.idt_date,
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant_id, mv)
    await refresh_item_stock_caches(db, tenant_id, source_item_id)

    voucher_id = await maybe_post_idt_issue_wip(
        db,
        tenant,
        user_id,
        idt,
        notes=f"IDT {idt.idt_number}: issued to {process_name}",
    )
    if voucher_id:
        idt.source_voucher_id = voucher_id

    await db.flush()
    return idt


async def receive_idt(
    db: AsyncSession,
    tenant: Tenant,
    idt_id: int,
    target_qty_received: Decimal,
    *,
    user_id: int | None = None,
    target_batch_number: str | None = None,
    notes: str | None = None,
) -> InterDepartmentTransfer:
    tenant_id = tenant.id
    # Row lock: concurrent receipts for the same IDT run one after another.
    idt = (
        await db.execute(
            select(InterDepartmentTransfer)
            .where(InterDepartmentTransfer.id == idt_id, InterDepartmentTransfer.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not idt:
        raise HTTPException(status_code=404, detail="IDT not found")
    if idt.status not in ("ISSUED", "RECEIVED_PARTIALLY"):
        raise HTTPException(status_code=400, detail="IDT is not open for receive")

    received = _q(_d(target_qty_received))
    if received <= ZERO:
        raise HTTPException(status_code=400, detail="Received qty must be positive")

    issued = _d(idt.source_qty_issued)
    loss_qty = _q(issued - received)
    loss_pct = _q((loss_qty / issued) * 100) if issued > ZERO else ZERO

    idt.target_qty_received = received
    idt.process_loss_qty = loss_qty
    idt.process_loss_percent = loss_pct

    std_pct = _d(idt.standard_process_loss_percent)
    warn = Decimal("5.00")
    std_row = await get_standard_for_process(db, tenant_id, idt.process_name)
    if std_row:
        warn = _d(std_row.warning_threshold_percent) or warn
        if idt.standard_process_loss_percent is None:
            idt.standard_process_loss_percent = std_row.standard_loss_percent
            std_pct = _d(std_row.standard_loss_percent)

    idt.loss_exception = bool(std_pct is not None and loss_pct > (std_pct + ZERO) and loss_pct > std_pct)

    # Job work total
    if idt.is_job_work and idt.job_work_cost_per_unit is not None:
        idt.job_work_total_cost = _q(_d(idt.job_work_cost_per_unit) * received)

    br = calculate_job_work_cost_from_idt(idt)
    idt.target_item_value = br.unit_cost

    expected = _d(idt.target_qty_expected)
    if received + Decimal("0.0001") >= expected:
        idt.status = "RECEIVED_FULLY"
    else:
        idt.status = "RECEIVED_PARTIALLY"

    if notes:
        idt.narration = ((idt.narration or "") + "\n" + notes).strip()
    idt.updated_at = datetime.utcnow()

    # Create / top-up target batch + IN movement
    target = await db.get(Item, idt.target_item_id)
    batch_number = (target_batch_number or "").strip() or f"IDT-{idt.idt_number}-{uuid.uuid4().hex[:4].upper()}"

    mv_in = StockMovement(
        tenant_id=tenant_id,
        item_id=idt.target_item_id,
        warehouse_id=idt.to_warehouse_id,
        movement_type="IN",
        quantity=received,
        reference_type="IDT",
        reference_id=idt.id,
        notes=f"IDT receive {idt.idt_number}: {idt.process_name} (loss {loss_pct}%)",
        created_by_user_id=user_id,
        movement_kind="IDT_RECEIVE",
        order_id=idt.linked_order_id,
        lot_number=batch_number,
        movement_date=date.today(),
    )
    db.add(mv_in)
    await db.flush()
    await finalize_movement_fifo(db, tenant_id, mv_in, in_unit_cost=float(br.unit_cost))

    if target and (
        is_batch_tracking_enabled(tenant.feature_flags) or getattr(target, "batch_tracking", False)
    ):
        filters = [
            StockBatch.tenant_id == tenant_id,
            StockBatch.stock_item_id == idt.target_item_id,
            StockBatch.batch_number == batch_number,
            StockBatch.godown_id == idt.to_warehouse_id,
        ]
        existing = (await db.execute(select(StockBatch).where(*filters))).scalar_one_or_none()
        if existing:
            existing.received_qty = _q(_d(existing.received_qty) + received)
            existing.current_qty = _q(_d(existing.current_qty) + received)
            existing.cost_per_unit = br.unit_cost
            existing.status = "ACTIVE"
            existing.updated_at = datetime.utcnow()
            mv_in.batch_id = existing.id
        else:
            batch = StockBatch(
                tenant_id=tenant_id,
                stock_item_id=idt.target_item_id,
                batch_number=batch_number,
                opening_qty=ZERO,
                received_qty=received,
                issued_qty=ZERO,
                current_qty=received,
                cost_per_unit=br.unit_cost,
                godown_id=idt.to_warehouse_id,
                status="ACTIVE",
                source_movement_id=mv_in.id,
            )
            db.add(batch)
            await db.flush()
            mv_in.batch_id = batch.id

    await refresh_item_stock_caches(db, tenant_id, idt.target_item_id)

    voucher_id = await maybe_post_idt_receive_wip(
        db,
        tenant,
        user_id,
        idt,
        notes=f"IDT {idt.idt_number}: received from {idt.process_name}",
    )
    if voucher_id:
        idt.target_voucher_id = voucher_id

    await db.flush()
    return idt
