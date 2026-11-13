"""Single source of truth for open purchase-order supply (Manufacturing Intelligence Phase 2).

Rules (docs/manufacturing-intelligence/13-phase2-implementation-plan.md section 15, finding 7):

* A PO is *open* when its status is APPROVED or PARTIALLY_RECEIVED. DRAFT / SUBMITTED POs are not supply; they only
  appear as an informational "pending PO" quantity.
* ``usable_received`` of a PO line = QC-accepted quantity on RECEIVED goods receipts that point at the line.
  ``accepted_qty`` is the QC result (with QC off it equals the received quantity at GRN creation). Only a blank
  ``accepted_qty`` (very old rows) falls back to ``received_qty``. A GRN line waiting for QC has accepted 0, so it is
  NOT usable and NOT on hand (the stock still sits in the quarantine warehouse).
* ``line_on_order_net = max(0, ordered - usable_received)``. Quantity that is received but pending QC, and quantity
  that QC rejected, therefore stay in the open balance while the PO is open (owner to confirm the rejected rule).
* ``pending_qc`` is the part of the line balance that is physically received and waiting for QC (inbound, never on
  hand, never "ready").
* Everything is Decimal and read in batches (a fixed number of queries per call, not per item). Read only.

ETA chain per PO line: newest supplier update that carries a date (SHIP_DATE or CONFIRMED) unless the newest
status-like update (CONFIRMED / DECLINED / SHIP_DATE) is DECLINED, then ``purchase_orders.expected_date``, then
``order_date + item lead time``, else UNKNOWN. ``receipt_buffer_days`` (default 0, a caller / planning setting) is
added to a known date.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    GrnQualityInspection,
    PurchaseOrder,
    PurchaseOrderItem,
)
from app.models.supplier_portal import (
    UPDATE_CONFIRMED,
    UPDATE_DECLINED,
    UPDATE_SHIP_DATE,
    SupplierPoUpdate,
)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")

OPEN_PO_STATUSES: tuple[str, ...] = ("APPROVED", "PARTIALLY_RECEIVED")
PENDING_PO_STATUSES: tuple[str, ...] = ("DRAFT", "SUBMITTED")

ETA_SUPPLIER_SHIP_DATE = "SUPPLIER_SHIP_DATE"
ETA_SUPPLIER_CONFIRMED = "SUPPLIER_CONFIRMED"
ETA_PO_EXPECTED_DATE = "PO_EXPECTED_DATE"
ETA_ORDER_DATE_LEAD_TIME = "ORDER_DATE_PLUS_LEAD_TIME"
ETA_UNKNOWN = "UNKNOWN"


def to_decimal(value: Any) -> Decimal:
    """Decimal from a Numeric, a text quantity or None (bad text counts as 0)."""
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        text = str(value).strip()
        return Decimal(text) if text else ZERO
    except (InvalidOperation, ValueError):
        return ZERO


def q4(value: Decimal) -> Decimal:
    return value.quantize(Q4)


@dataclass(frozen=True)
class OpenPoLine:
    po_line_id: int
    po_id: int
    po_code: str
    item_id: int
    warehouse_id: int | None
    ordered: Decimal
    usable_received: Decimal
    pending_qc: Decimal
    on_order_net: Decimal
    expected_date: date | None
    eta_source: str


@dataclass
class ItemInbound:
    item_id: int
    ordered: Decimal = ZERO
    usable_received: Decimal = ZERO
    on_order_net: Decimal = ZERO
    pending_qc: Decimal = ZERO
    earliest_expected_date: date | None = None
    lines: list[OpenPoLine] = field(default_factory=list)


def usable_received_qty(accepted_qty: Any, received_qty: Any) -> Decimal:
    """QC-accepted quantity of one GRN line (blank accepted = legacy row, use received)."""
    if accepted_qty is None or str(accepted_qty).strip() == "":
        return max(ZERO, to_decimal(received_qty))
    return max(ZERO, to_decimal(accepted_qty))


def _scope_warehouse(stmt, warehouse_id: int | None):
    if warehouse_id is None:
        return stmt
    return stmt.where(
        or_(PurchaseOrderItem.warehouse_id.is_(None), PurchaseOrderItem.warehouse_id == warehouse_id)
    )


async def _receipts_by_line(
    db: AsyncSession, tenant_id: int, line_ids: list[int]
) -> tuple[dict[int, Decimal], dict[int, Decimal]]:
    """(usable received, pending-QC quantity) per PO line over RECEIVED goods receipts."""
    usable: dict[int, Decimal] = defaultdict(lambda: ZERO)
    pending: dict[int, Decimal] = defaultdict(lambda: ZERO)
    if not line_ids:
        return usable, pending
    stmt = (
        select(
            GoodsReceivingItem.purchase_order_line_id,
            GoodsReceivingItem.accepted_qty,
            GoodsReceivingItem.received_qty,
            GoodsReceivingItem.rejected_qty,
            GrnQualityInspection.id,
        )
        .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
        .outerjoin(
            GrnQualityInspection,
            (GrnQualityInspection.grn_item_id == GoodsReceivingItem.id)
            & (GrnQualityInspection.tenant_id == tenant_id)
            & (GrnQualityInspection.status == "PENDING"),
        )
        .where(
            GoodsReceiving.tenant_id == tenant_id,
            GoodsReceivingItem.tenant_id == tenant_id,
            GoodsReceivingItem.purchase_order_line_id.in_(line_ids),
            GoodsReceiving.status == "RECEIVED",
        )
    )
    for line_id, accepted, received, rejected, pending_inspection_id in (await db.execute(stmt)).all():
        if line_id is None:
            continue
        lid = int(line_id)
        ok = usable_received_qty(accepted, received)
        usable[lid] += ok
        if pending_inspection_id is not None:
            waiting = to_decimal(received) - ok - to_decimal(rejected)
            if waiting > ZERO:
                pending[lid] += waiting
    return usable, pending


async def _supplier_updates(
    db: AsyncSession, tenant_id: int, po_ids: list[int]
) -> dict[int, list[SupplierPoUpdate]]:
    out: dict[int, list[SupplierPoUpdate]] = defaultdict(list)
    if not po_ids:
        return out
    stmt = (
        select(SupplierPoUpdate)
        .where(
            SupplierPoUpdate.tenant_id == tenant_id,
            SupplierPoUpdate.purchase_order_id.in_(po_ids),
            SupplierPoUpdate.kind.in_((UPDATE_CONFIRMED, UPDATE_DECLINED, UPDATE_SHIP_DATE)),
        )
        .order_by(SupplierPoUpdate.created_at.desc(), SupplierPoUpdate.id.desc())
    )
    for row in (await db.execute(stmt)).scalars().all():
        out[int(row.purchase_order_id)].append(row)
    return out


def resolve_eta(
    po_expected: date | None,
    po_order_date: date | None,
    item_lead_time_days: int | None,
    updates_newest_first: list[SupplierPoUpdate],
    *,
    receipt_buffer_days: int = 0,
) -> tuple[date | None, str]:
    """ETA chain for one PO line (see module docstring)."""
    buffer = timedelta(days=max(0, int(receipt_buffer_days or 0)))
    if updates_newest_first and updates_newest_first[0].kind != UPDATE_DECLINED:
        for u in updates_newest_first:
            if u.kind in (UPDATE_SHIP_DATE, UPDATE_CONFIRMED) and u.expected_ship_date is not None:
                source = ETA_SUPPLIER_SHIP_DATE if u.kind == UPDATE_SHIP_DATE else ETA_SUPPLIER_CONFIRMED
                return u.expected_ship_date + buffer, source
    if po_expected is not None:
        return po_expected + buffer, ETA_PO_EXPECTED_DATE
    if po_order_date is not None and item_lead_time_days is not None:
        return po_order_date + timedelta(days=int(item_lead_time_days)) + buffer, ETA_ORDER_DATE_LEAD_TIME
    return None, ETA_UNKNOWN


async def load_open_po_lines(
    db: AsyncSession,
    tenant_id: int,
    item_ids: list[int],
    *,
    warehouse_id: int | None = None,
    with_eta: bool = True,
    receipt_buffer_days: int | None = None,
) -> list[OpenPoLine]:
    """Open PO lines (APPROVED / PARTIALLY_RECEIVED) of the items, with net balance, pending QC and ETA.

    `receipt_buffer_days=None` reads the tenant planning setting (default 0, read-only, only when an ETA is wanted).
    """
    unique_ids = sorted({int(i) for i in item_ids})
    if not unique_ids:
        return []
    if with_eta and receipt_buffer_days is None:
        from app.modules.production.planning_settings_service import get_receipt_buffer_days

        receipt_buffer_days = await get_receipt_buffer_days(db, tenant_id)
    receipt_buffer_days = int(receipt_buffer_days or 0)
    stmt = (
        select(
            PurchaseOrderItem.id,
            PurchaseOrderItem.purchase_order_id,
            PurchaseOrderItem.item_id,
            PurchaseOrderItem.warehouse_id,
            PurchaseOrderItem.quantity,
            PurchaseOrder.po_code,
            PurchaseOrder.expected_date,
            PurchaseOrder.order_date,
        )
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrderItem.item_id.in_(unique_ids),
            PurchaseOrder.status.in_(OPEN_PO_STATUSES),
        )
        .order_by(PurchaseOrderItem.id)
    )
    rows = list((await db.execute(_scope_warehouse(stmt, warehouse_id))).all())
    if not rows:
        return []
    usable, pending = await _receipts_by_line(db, tenant_id, [int(r[0]) for r in rows])

    updates: dict[int, list[SupplierPoUpdate]] = {}
    lead_times: dict[int, int | None] = {}
    if with_eta:
        updates = await _supplier_updates(db, tenant_id, sorted({int(r[1]) for r in rows}))
        for iid, lead in (
            await db.execute(select(Item.id, Item.lead_time_days).where(Item.tenant_id == tenant_id, Item.id.in_(unique_ids)))
        ).all():
            lead_times[int(iid)] = lead

    lines: list[OpenPoLine] = []
    for line_id, po_id, item_id, wh_id, qty, po_code, expected, order_date in rows:
        ordered = max(ZERO, to_decimal(qty))
        got = usable.get(int(line_id), ZERO)
        net = max(ZERO, ordered - got)
        waiting = min(pending.get(int(line_id), ZERO), net)
        eta, source = (None, ETA_UNKNOWN)
        if with_eta:
            eta, source = resolve_eta(
                expected,
                order_date,
                lead_times.get(int(item_id)),
                updates.get(int(po_id), []),
                receipt_buffer_days=receipt_buffer_days,
            )
        lines.append(
            OpenPoLine(
                po_line_id=int(line_id),
                po_id=int(po_id),
                po_code=po_code,
                item_id=int(item_id),
                warehouse_id=int(wh_id) if wh_id is not None else None,
                ordered=q4(ordered),
                usable_received=q4(got),
                pending_qc=q4(waiting),
                on_order_net=q4(net),
                expected_date=eta,
                eta_source=source,
            )
        )
    return lines


async def inbound_by_item(
    db: AsyncSession,
    tenant_id: int,
    item_ids: list[int],
    *,
    warehouse_id: int | None = None,
    with_eta: bool = False,
    receipt_buffer_days: int | None = None,
) -> dict[int, ItemInbound]:
    """Per-item open supply: ``on_order_net`` is the only inbound figure readers may use."""
    out: dict[int, ItemInbound] = {int(i): ItemInbound(item_id=int(i)) for i in item_ids}
    lines = await load_open_po_lines(
        db, tenant_id, list(out), warehouse_id=warehouse_id, with_eta=with_eta, receipt_buffer_days=receipt_buffer_days
    )
    for ln in lines:
        slot = out[ln.item_id]
        slot.ordered += ln.ordered
        slot.usable_received += ln.usable_received
        slot.on_order_net += ln.on_order_net
        slot.pending_qc += ln.pending_qc
        slot.lines.append(ln)
        if ln.expected_date is not None and (
            slot.earliest_expected_date is None or ln.expected_date < slot.earliest_expected_date
        ):
            slot.earliest_expected_date = ln.expected_date
    return out


async def on_order_net_by_item(
    db: AsyncSession, tenant_id: int, item_ids: list[int], *, warehouse_id: int | None = None
) -> dict[int, Decimal]:
    inbound = await inbound_by_item(db, tenant_id, item_ids, warehouse_id=warehouse_id, with_eta=False)
    return {iid: q4(slot.on_order_net) for iid, slot in inbound.items()}


async def pending_po_by_item(
    db: AsyncSession, tenant_id: int, item_ids: list[int], *, warehouse_id: int | None = None
) -> dict[int, Decimal]:
    """Informational only: quantity on DRAFT / SUBMITTED POs (not supply, never counted anywhere)."""
    unique_ids = sorted({int(i) for i in item_ids})
    out: dict[int, Decimal] = {i: ZERO for i in unique_ids}
    if not unique_ids:
        return out
    stmt = (
        select(PurchaseOrderItem.item_id, PurchaseOrderItem.quantity)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrderItem.item_id.in_(unique_ids),
            PurchaseOrder.status.in_(PENDING_PO_STATUSES),
        )
    )
    for iid, qty in (await db.execute(_scope_warehouse(stmt, warehouse_id))).all():
        out[int(iid)] += max(ZERO, to_decimal(qty))
    return {i: q4(v) for i, v in out.items()}
