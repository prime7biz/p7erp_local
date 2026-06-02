"""Order lifecycle pipeline: milestones, RM %, auto-advance pipeline_status, TNA warnings."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.master_contract_workflow import is_lc_received_status
from app.common.workflow import PIPELINE_NA_PRESETS, PIPELINE_STAGES
from app.models import (
    Bom,
    DeliveryChallan,
    DeliveryChallanOrder,
    GoodsReceiving,
    GoodsReceivingItem,
    Inquiry,
    ManufacturingWorkOrder,
    MasterContract,
    Order,
    OrderFollowupAction,
    ProcessOrder,
    ProformaInvoice,
    ProformaInvoiceOrder,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    TradeCase,
    Voucher,
)

# Default % of BOM-linked PO qty received to mark RM_RECEIVED milestone
DEFAULT_RM_THRESHOLD_PCT = Decimal("80")


def suggest_na_steps(order_type: str | None) -> list[str]:
    key = (order_type or "export").strip().lower()
    if key not in PIPELINE_NA_PRESETS:
        key = "both"
    return list(PIPELINE_NA_PRESETS.get(key, []))


def _na_list(order: Order) -> set[str]:
    raw = order.pipeline_na_steps
    if raw is None:
        return set()
    if isinstance(raw, list):
        return {str(x).upper() for x in raw}
    if isinstance(raw, dict) and "steps" in raw:
        return {str(x).upper() for x in raw.get("steps", [])}
    return set()


def _parse_qty(s: str | None) -> Decimal:
    if not s:
        return Decimal("0")
    try:
        return Decimal(str(s).strip() or "0")
    except Exception:
        return Decimal("0")


async def compute_rm_inhouse_pct(db: AsyncSession, *, tenant_id: int, order_id: int) -> Decimal:
    """Sum accepted/received GRN qty vs PO line qty for POs tied to this order or its BOMs."""
    bom_ids_result = await db.execute(select(Bom.id).where(Bom.tenant_id == tenant_id, Bom.order_id == order_id))
    bom_ids = [r[0] for r in bom_ids_result.all()]
    if bom_ids:
        po_cond = or_(PurchaseOrder.source_order_id == order_id, PurchaseOrder.source_bom_id.in_(bom_ids))
    else:
        po_cond = PurchaseOrder.source_order_id == order_id

    po_ids_result = await db.execute(
        select(PurchaseOrder.id).where(PurchaseOrder.tenant_id == tenant_id).where(po_cond)
    )
    po_ids = [r[0] for r in po_ids_result.all()]
    if not po_ids:
        return Decimal("0")

    lines_result = await db.execute(
        select(PurchaseOrderItem.quantity).where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.purchase_order_id.in_(po_ids),
        )
    )
    ordered = sum(_parse_qty(r[0]) for r in lines_result.all())
    if ordered <= 0:
        return Decimal("0")

    grn_items_result = await db.execute(
        select(GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty).where(
            GoodsReceivingItem.tenant_id == tenant_id,
            GoodsReceivingItem.purchase_order_line_id.in_(
                select(PurchaseOrderItem.id).where(PurchaseOrderItem.purchase_order_id.in_(po_ids))
            ),
        )
    )
    received = Decimal("0")
    for acc, rec in grn_items_result.all():
        q = _parse_qty(acc) if acc else _parse_qty(rec)
        received += q

    pct = (received / ordered) * Decimal("100")
    if pct > Decimal("100"):
        pct = Decimal("100")
    return pct.quantize(Decimal("0.01"))


async def compute_tna_warnings(db: AsyncSession, *, tenant_id: int, order_id: int) -> list[str]:
    """Pending merch follow-up actions that look like approvals (soft gate)."""
    q = (
        select(OrderFollowupAction)
        .where(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.order_id == order_id,
            OrderFollowupAction.is_active.is_(True),
        )
        .order_by(OrderFollowupAction.sequence_no, OrderFollowupAction.id)
    )
    result = await db.execute(q)
    rows = result.scalars().all()
    warnings: list[str] = []
    for row in rows:
        st = (row.status or "").lower()
        appr = (row.approval_status or "").upper()
        if st in ("done", "completed", "cancelled"):
            continue
        if appr == "APPROVED":
            continue
        action_type = (row.action_type or "").lower()
        title = row.title or ""
        if "approval" in action_type or "approval" in title.lower() or row.milestone_type:
            warnings.append(f"{title} pending")
        elif row.is_mandatory and st == "pending":
            warnings.append(f"{title} pending")
    return warnings


async def _has_pi_issued(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    subq = select(ProformaInvoiceOrder.proforma_invoice_id).where(ProformaInvoiceOrder.order_id == order_id)
    r = await db.execute(
        select(func.count())
        .select_from(ProformaInvoice)
        .where(
            ProformaInvoice.tenant_id == tenant_id,
            ProformaInvoice.id.in_(subq),
            ProformaInvoice.status.in_(
                ("APPROVED", "SENT", "ISSUED", "CONVERTED", "POSTED", "PAID", "FINALIZED")
            ),
        )
    )
    return (r.scalar() or 0) > 0


async def _has_bom(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    """Execution BOM for the order must exist and be approved or frozen (Phase 8 authority)."""
    r = await db.execute(
        select(func.count())
        .select_from(Bom)
        .where(
            Bom.tenant_id == tenant_id,
            Bom.order_id == order_id,
            Bom.is_active.is_(True),
            Bom.is_legacy.is_(False),
            Bom.status.in_(("APPROVED", "FROZEN")),
        )
    )
    return (r.scalar() or 0) > 0


async def _has_po(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    bom_ids_r = await db.execute(select(Bom.id).where(Bom.tenant_id == tenant_id, Bom.order_id == order_id))
    bom_ids = [x[0] for x in bom_ids_r.all()]
    cond = PurchaseOrder.source_order_id == order_id
    if bom_ids:
        cond = or_(cond, PurchaseOrder.source_bom_id.in_(bom_ids))
    r = await db.execute(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id).where(cond))
    return (r.scalar() or 0) > 0


async def _has_grn(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    r = await db.execute(
        select(func.count())
        .select_from(GoodsReceiving)
        .where(
            GoodsReceiving.tenant_id == tenant_id,
            or_(
                GoodsReceiving.source_order_id == order_id,
                GoodsReceiving.purchase_order_id.in_(
                    select(PurchaseOrder.id).where(
                        or_(
                            PurchaseOrder.source_order_id == order_id,
                            PurchaseOrder.source_bom_id.in_(
                                select(Bom.id).where(Bom.tenant_id == tenant_id, Bom.order_id == order_id)
                            ),
                        )
                    )
                ),
            ),
            GoodsReceiving.status.in_(("RECEIVED", "POSTED", "APPROVED", "COMPLETED", "CLOSED")),
        )
    )
    return (r.scalar() or 0) > 0


async def _has_production(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    r1 = await db.execute(
        select(func.count()).select_from(ProcessOrder).where(
            ProcessOrder.tenant_id == tenant_id,
            or_(ProcessOrder.source_order_id == order_id, ProcessOrder.linked_order_id == order_id),
        )
    )
    if (r1.scalar() or 0) > 0:
        return True
    r2 = await db.execute(
        select(func.count()).select_from(ManufacturingWorkOrder).where(
            ManufacturingWorkOrder.tenant_id == tenant_id,
            ManufacturingWorkOrder.order_id == order_id,
        )
    )
    return (r2.scalar() or 0) > 0


async def _has_shipped(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    r = await db.execute(
        select(func.count())
        .select_from(DeliveryChallanOrder)
        .join(DeliveryChallan, DeliveryChallan.id == DeliveryChallanOrder.delivery_challan_id)
        .where(
            DeliveryChallanOrder.tenant_id == tenant_id,
            DeliveryChallanOrder.order_id == order_id,
            DeliveryChallan.status == "POSTED",
        )
    )
    return (r.scalar() or 0) > 0


async def _has_payment(db: AsyncSession, tenant_id: int, order_id: int) -> bool:
    r = await db.execute(
        select(func.count())
        .select_from(Voucher)
        .where(
            Voucher.tenant_id == tenant_id,
            Voucher.voucher_type == "RECEIPT",
            Voucher.status == "POSTED",
            or_(
                Voucher.order_id == order_id,
                Voucher.trade_case_id.in_(
                    select(TradeCase.id).where(
                        TradeCase.tenant_id == tenant_id,
                        TradeCase.order_id == order_id,
                    )
                ),
            ),
        )
    )
    return (r.scalar() or 0) > 0


async def is_stage_complete(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    stage: str,
    na: set[str],
    rm_pct: Decimal,
    threshold: Decimal = DEFAULT_RM_THRESHOLD_PCT,
) -> bool:
    if stage in na:
        return True
    oid = order.id
    if stage == "INQUIRY":
        if not order.quotation_id:
            return False
        q = await db.get(Quotation, order.quotation_id)
        return bool(q and q.inquiry_id and await db.get(Inquiry, q.inquiry_id))
    if stage == "QUOTATION":
        return bool(order.quotation_id)
    if stage == "ORDER_CONFIRMED":
        return True
    if stage == "PI_ISSUED":
        return await _has_pi_issued(db, tenant_id, oid)
    if stage == "LC_RECEIVED":
        if not order.master_contract_id:
            return False
        mc = await db.get(MasterContract, order.master_contract_id)
        if not mc or mc.tenant_id != tenant_id:
            return False
        return is_lc_received_status(mc.status)
    if stage == "BOM_CREATED":
        return await _has_bom(db, tenant_id, oid)
    if stage == "PO_ISSUED":
        return await _has_po(db, tenant_id, oid)
    if stage == "RM_RECEIVED":
        return rm_pct >= threshold or await _has_grn(db, tenant_id, oid)
    if stage == "IN_PRODUCTION":
        return await _has_production(db, tenant_id, oid)
    if stage == "SHIPPED":
        return await _has_shipped(db, tenant_id, oid)
    if stage == "PAYMENT_RECEIVED":
        return await _has_payment(db, tenant_id, oid)
    if stage == "COMPLETED":
        return False
    return False


async def compute_current_pipeline_stage(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    rm_pct: Decimal | None = None,
    threshold: Decimal = DEFAULT_RM_THRESHOLD_PCT,
) -> str:
    """First incomplete stage (after N/A skips), or COMPLETED if all done."""
    if rm_pct is None:
        rm_pct = await compute_rm_inhouse_pct(db, tenant_id=tenant_id, order_id=order.id)
    na = _na_list(order)
    for stage in PIPELINE_STAGES:
        ok = await is_stage_complete(
            db, tenant_id=tenant_id, order=order, stage=stage, na=na, rm_pct=rm_pct, threshold=threshold
        )
        if not ok:
            return stage
    return "COMPLETED"


async def sync_milestone_timestamps(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
    rm_pct: Decimal,
    threshold: Decimal = DEFAULT_RM_THRESHOLD_PCT,
) -> None:
    """Fill *_at columns when milestones newly satisfied (best-effort)."""
    na = _na_list(order)
    now = datetime.utcnow()

    if await is_stage_complete(
        db, tenant_id=tenant_id, order=order, stage="PI_ISSUED", na=na, rm_pct=rm_pct, threshold=threshold
    ):
        if order.pi_issued_at is None:
            order.pi_issued_at = now
    lc_ok = False
    if order.master_contract_id:
        mc = await db.get(MasterContract, order.master_contract_id)
        if mc and mc.tenant_id == tenant_id:
            lc_ok = is_lc_received_status(mc.status)
    if lc_ok or "LC_RECEIVED" in na:
        if order.lc_received_at is None and lc_ok:
            order.lc_received_at = now
    if await _has_bom(db, tenant_id, order.id) and order.bom_created_at is None:
        order.bom_created_at = now
    if await _has_po(db, tenant_id, order.id) and order.po_issued_at is None:
        order.po_issued_at = now
    order.rm_received_pct = float(rm_pct)
    if (rm_pct >= threshold or await _has_grn(db, tenant_id, order.id)) and order.rm_received_at is None:
        order.rm_received_at = now
    if await _has_production(db, tenant_id, order.id) and order.production_started_at is None:
        order.production_started_at = now
    if await _has_shipped(db, tenant_id, order.id) and order.shipped_at is None:
        order.shipped_at = now
    if await _has_payment(db, tenant_id, order.id) and order.payment_received_at is None:
        order.payment_received_at = now


async def auto_advance_order_pipeline(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    threshold: Decimal = DEFAULT_RM_THRESHOLD_PCT,
) -> str | None:
    """Recompute RM %, milestone timestamps, and pipeline_status. Returns new pipeline_status."""
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return None
    rm_pct = await compute_rm_inhouse_pct(db, tenant_id=tenant_id, order_id=order_id)
    order.rm_received_pct = float(rm_pct)
    await sync_milestone_timestamps(db, tenant_id=tenant_id, order=order, rm_pct=rm_pct, threshold=threshold)
    new_stage = await compute_current_pipeline_stage(
        db, tenant_id=tenant_id, order=order, rm_pct=rm_pct, threshold=threshold
    )
    order.pipeline_status = new_stage
    if new_stage == "COMPLETED" and order.completed_at is None:
        order.completed_at = datetime.utcnow()
    try:
        from app.modules.production.line_reservation_service import maybe_auto_propose_line_booking

        await maybe_auto_propose_line_booking(db, tenant_id=tenant_id, order_id=order_id, user_id=None)
    except Exception:
        import logging

        logging.getLogger(__name__).warning("auto line booking proposal skipped", exc_info=True)
    return new_stage


async def build_milestone_payload(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
    threshold: Decimal = DEFAULT_RM_THRESHOLD_PCT,
) -> dict[str, Any]:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        return {}
    rm_pct = await compute_rm_inhouse_pct(db, tenant_id=tenant_id, order_id=order_id)
    na = _na_list(order)
    tna_warnings = await compute_tna_warnings(db, tenant_id=tenant_id, order_id=order_id)
    steps: list[dict[str, Any]] = []
    current = await compute_current_pipeline_stage(
        db, tenant_id=tenant_id, order=order, rm_pct=rm_pct, threshold=threshold
    )

    for stage in PIPELINE_STAGES:
        complete = await is_stage_complete(
            db, tenant_id=tenant_id, order=order, stage=stage, na=na, rm_pct=rm_pct, threshold=threshold
        )
        if stage in na:
            st = "na"
        elif complete:
            st = "done"
        elif stage == current:
            st = "current"
        else:
            st = "pending"
        entry: dict[str, Any] = {
            "name": stage,
            "status": st,
            "timestamp": None,
            "linked_ids": [],
        }
        if stage == "RM_RECEIVED":
            entry["rm_pct"] = float(rm_pct)
        # timestamps
        ts_map = {
            "PI_ISSUED": order.pi_issued_at,
            "LC_RECEIVED": order.lc_received_at,
            "BOM_CREATED": order.bom_created_at,
            "PO_ISSUED": order.po_issued_at,
            "RM_RECEIVED": order.rm_received_at,
            "IN_PRODUCTION": order.production_started_at,
            "SHIPPED": order.shipped_at,
            "PAYMENT_RECEIVED": order.payment_received_at,
            "COMPLETED": order.completed_at,
        }
        if stage in ts_map and ts_map[stage]:
            entry["timestamp"] = ts_map[stage].isoformat()
        steps.append(entry)

    return {
        "pipeline_status": order.pipeline_status,
        "rm_inhouse_pct": float(rm_pct),
        "steps": steps,
        "tna_warnings": tna_warnings,
        "pipeline_na_steps": list(na),
        "order_type": order.order_type,
    }
