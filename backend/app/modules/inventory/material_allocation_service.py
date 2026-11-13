"""Material allocation engine (Manufacturing Intelligence Phase 2, run R2). Flag: ``mfg_material_allocation_v1``.

An allocation *holds* usable stock (``stock_reservations`` ACTIVE rows) and *pegs* open purchase-order supply
(``mfg_material_supply_peggings``) for the lines of an order's Order BOM. It never moves stock and never creates a
valuation entry or voucher.

Rules (docs/manufacturing-intelligence/13-phase2-implementation-plan.md section 15, owner decisions in doc 11):

* HARD_ATP holds / HARD pegs only for confirmed orders (status NEW / CONFIRMED / IN_PROGRESS) whose active Order BOM
  is APPROVED or FROZEN. TENTATIVE holds / pegs only for DRAFT orders, with an expiry of at most 180 days.
* Hard holds come only from usable on-hand stock (movement balance outside quarantine / rejected warehouses).
  Shortfall that stock cannot cover is pegged to open PO supply (earliest known ETA first).
* Priority (highest first): an order with an IN_PROGRESS plan row; firm orders by the earliest FIRM / IN_PROGRESS plan
  row start; firm orders without a firm plan row by delivery date; then tentative (DRAFT) orders by delivery date.
  An allocation never takes stock that a higher-priority order still needs (unmet hard shortfall is protected).
* Covered quantity of a BOM line = issued to production (net of returns) + effective own holds + effective own pegs.
* ``state_token`` is a sha256 of everything the plan was computed from. Confirm recomputes under locks: a changed
  state gives 409, and a replay that has nothing left to allocate returns ``NOOP`` (nothing is created twice).

Lock order (plan section 8 / 15 #10): orders (sorted) -> ``lock_stock_items`` -> reservations -> PurchaseOrderItem
(sorted) -> pegs. An allocation run commits per order (max 200 orders) with ``SET LOCAL lock_timeout = '5s'``.
The caller commits single-order confirms.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.document_history import record_doc_event
from app.database import safe_async_session_rollback
from app.models import (
    Bom,
    BomItem,
    Item,
    MfgMaterialSupplyPegging,
    Order,
    SewingLineStyleConfig,
    StockReservation,
)
from app.models.mfg_planning import PEG_HARD, PEG_STATUS_ACTIVE, PEG_TENTATIVE
from app.modules.audit.service import log_action
from app.modules.inventory import pegging_service
from app.modules.inventory.open_po_supply_service import (
    ZERO,
    ItemInbound,
    OpenPoLine,
    inbound_by_item,
    load_open_po_lines,
    q4,
    to_decimal,
)
from app.modules.inventory.reservation_service import (
    CONFIRMED_ORDER_STATUSES,
    KIND_HARD_ATP,
    KIND_TENTATIVE,
    SOURCE_ALLOCATION,
    STATUS_ACTIVE,
    EffectiveHold,
    create_hold,
    issued_for_orders,
    load_effective_holds,
    lock_orders,
)
from app.modules.inventory.stock_locks import lock_stock_items

logger = logging.getLogger(__name__)

DRAFT_STATUS = "DRAFT"
OPEN_STATUSES: frozenset[str] = frozenset(CONFIRMED_ORDER_STATUSES | {DRAFT_STATUS})
APPROVED_BOM_STATUSES = ("APPROVED", "FROZEN")
MAX_RUN_ORDERS = 200
MAX_PROTECT_ORDERS = 200
MAX_QUEUE_ORDERS = 2000
MAX_TENTATIVE_DAYS = 180
LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '5s'"

_PLAN_EXCLUDED_ROWS = ("CANCELLED", "COMPLETED")


def _conflict(code: str, message: str, status_code: int = 409, **extra) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message, **extra})


# ------------------------------------------------------------------ requirement (same rule as Phase 1 readiness)


def bom_line_requirement(order_qty: Decimal | None, item: BomItem) -> tuple[Decimal | None, str]:
    """Required gross quantity of a BOM line. Mirrors ``mfg_intelligence.readiness_service._requirement``."""
    gross = to_decimal(item.required_gross_qty) if item.required_gross_qty is not None else None
    if gross is not None and gross > ZERO:
        return q4(gross), "BOM_REQUIRED_GROSS_QTY"
    if order_qty is None or order_qty <= ZERO:
        return None, "ORDER_QTY_MISSING"
    net = to_decimal(item.bom_net_consumption_per_unit) if item.bom_net_consumption_per_unit is not None else None
    if net is None:
        net = to_decimal(item.base_consumption) if item.base_consumption is not None else None
    if net is None:
        return None, "CONSUMPTION_MISSING"
    wastage = max(ZERO, to_decimal(item.wastage_pct))
    loss = max(ZERO, to_decimal(item.process_loss_pct))
    factor = Decimal(1) + wastage / Decimal(100) + loss / Decimal(100)
    return q4(order_qty * max(ZERO, net) * factor), "ORDER_QTY_X_NET_X_LOSS"


# ------------------------------------------------------------------ state


@dataclass
class LineState:
    bom_item_id: int
    item_id: int
    item_name: str | None
    category: str | None
    uom: str | None
    required: Decimal | None
    requirement_source: str
    issued: Decimal = ZERO
    hold_hard: Decimal = ZERO
    hold_tentative: Decimal = ZERO
    peg_hard: Decimal = ZERO
    peg_tentative: Decimal = ZERO


def line_covered(line: LineState, kind: str) -> Decimal:
    covered = line.issued + line.hold_hard + line.peg_hard
    if kind == KIND_TENTATIVE:
        covered += line.hold_tentative + line.peg_tentative
    return covered


def line_shortfall(line: LineState, kind: str) -> Decimal:
    if line.required is None:
        return ZERO
    return q4(max(ZERO, line.required - line_covered(line, kind)))


@dataclass
class OrderState:
    order: Order
    bom: Bom | None
    bom_ok: bool
    lines: list[LineState] = field(default_factory=list)
    holds: list[EffectiveHold] = field(default_factory=list)
    pegs: list[pegging_service.EffectivePeg] = field(default_factory=list)


def assert_kind_allowed(order: Order, kind: str, state: OrderState) -> None:
    """409 unless this kind of allocation is allowed for the order (status and Order BOM rules)."""
    status = (order.status or "").strip().upper()
    if status not in OPEN_STATUSES:
        raise _conflict("ORDER_NOT_OPEN", "The order is not open for material allocation")
    if kind == KIND_HARD_ATP and status not in CONFIRMED_ORDER_STATUSES:
        raise _conflict("ORDER_NOT_CONFIRMED", "Hard allocation is only for confirmed orders")
    if kind == KIND_TENTATIVE and status != DRAFT_STATUS:
        raise _conflict("TENTATIVE_ONLY_FOR_DRAFT_ORDERS", "Tentative allocation is only for draft orders")
    if state.bom is None:
        raise _conflict("NO_ORDER_BOM", "The order has no active Order BOM")
    if not state.bom_ok:
        raise _conflict("ORDER_BOM_NOT_APPROVED", "The Order BOM must be approved or frozen first")


def normalize_expiry(kind: str, expires_at: datetime | None, now: datetime) -> datetime | None:
    """Tentative needs an expiry in the future and within 180 days (422); hard ignores it."""
    if kind != KIND_TENTATIVE:
        return None
    if expires_at is None:
        raise HTTPException(status_code=422, detail="A tentative allocation needs an expiry date (expires_at)")
    if expires_at.tzinfo is not None:
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    if expires_at <= now:
        raise HTTPException(status_code=422, detail="expires_at must be in the future")
    if expires_at > now + timedelta(days=MAX_TENTATIVE_DAYS):
        raise HTTPException(status_code=422, detail=f"expires_at must be within {MAX_TENTATIVE_DAYS} days")
    return expires_at


async def _active_order_boms(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> dict[int, Bom]:
    out: dict[int, Bom] = {}
    if not order_ids:
        return out
    rows = (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.order_id.in_(order_ids), Bom.is_active.is_(True))
            .order_by(Bom.id.desc())
        )
    ).scalars().all()
    for bom in rows:
        out.setdefault(int(bom.order_id), bom)
    return out


def _spread(pool: Decimal, lines: list[LineState], attr: str, kind: str) -> None:
    """Hand a pool of unlinked coverage to the lines of one item that still have a gap (BOM order)."""
    for ln in lines:
        if pool <= ZERO:
            return
        if ln.required is None:
            continue
        gap = max(ZERO, ln.required - line_covered(ln, kind))
        take = min(pool, gap)
        if take > ZERO:
            setattr(ln, attr, getattr(ln, attr) + take)
            pool -= take


async def build_order_states(
    db: AsyncSession, tenant_id: int, orders: list[Order], *, now: datetime | None = None
) -> dict[int, OrderState]:
    """Requirement, issued and effective own holds / pegs per BOM line, batched for several orders.

    DRAFT orders may use an active Order BOM in any status (tentative planning); every other open order needs an
    APPROVED / FROZEN one (``bom_ok``). Without a usable BOM the lines list is empty.
    """
    now = now or datetime.utcnow()
    order_ids = sorted({int(o.id) for o in orders})
    boms = await _active_order_boms(db, tenant_id, order_ids)
    states: dict[int, OrderState] = {}
    usable_bom: dict[int, Bom] = {}
    for o in orders:
        bom = boms.get(int(o.id))
        draft = (o.status or "").strip().upper() == DRAFT_STATUS
        ok = bom is not None and ((bom.status or "").strip().upper() in APPROVED_BOM_STATUSES or draft)
        states[int(o.id)] = OrderState(order=o, bom=bom, bom_ok=bool(ok))
        if ok:
            usable_bom[int(o.id)] = bom
    if not usable_bom:
        return states

    bom_ids = sorted({int(b.id) for b in usable_bom.values()})
    bom_rows = (
        await db.execute(
            select(BomItem)
            .where(BomItem.tenant_id == tenant_id, BomItem.bom_id.in_(bom_ids), BomItem.item_id.isnot(None))
            .order_by(BomItem.bom_id, BomItem.sort_order, BomItem.id)
            .limit(20000)
        )
    ).scalars().all()
    items_by_bom: dict[int, list[BomItem]] = {}
    for bi in bom_rows:
        items_by_bom.setdefault(int(bi.bom_id), []).append(bi)
    item_ids = sorted({int(bi.item_id) for bi in bom_rows})
    names = {
        int(i): n
        for i, n in (
            await db.execute(select(Item.id, Item.name).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))
        ).all()
    }
    wanted_orders = set(usable_bom)
    holds_all = [h for h in await load_effective_holds(db, tenant_id, item_ids, now=now) if h.order_id in wanted_orders]
    inbound = await inbound_by_item(db, tenant_id, item_ids)
    pegs_all, _views = await pegging_service.load_effective_pegs(db, tenant_id, item_ids, inbound=inbound, now=now)
    pegs_all = [p for p in pegs_all if p.order_id in wanted_orders]
    issued = await issued_for_orders(db, tenant_id, wanted_orders, item_ids)

    for oid, bom in usable_bom.items():
        st = states[oid]
        order_qty = to_decimal(st.order.quantity) if st.order.quantity is not None else None
        lines: list[LineState] = []
        for bi in items_by_bom.get(int(bom.id), []):
            required, source = bom_line_requirement(order_qty, bi)
            lines.append(
                LineState(
                    bom_item_id=int(bi.id), item_id=int(bi.item_id), item_name=names.get(int(bi.item_id)) or bi.description,
                    category=bi.category, uom=bi.uom, required=required, requirement_source=source,
                )
            )
        st.lines = lines
        st.holds = [h for h in holds_all if h.order_id == oid]
        st.pegs = [p for p in pegs_all if p.order_id == oid]
        by_item: dict[int, list[LineState]] = {}
        for ln in lines:
            by_item.setdefault(ln.item_id, []).append(ln)
        for iid, group in by_item.items():
            line_ids = {ln.bom_item_id for ln in group}
            by_id = {ln.bom_item_id: ln for ln in group}
            pool = {"issued": ZERO, "hold_hard": ZERO, "hold_tentative": ZERO, "peg_hard": ZERO, "peg_tentative": ZERO}
            view = issued.get((oid, iid))
            if view is not None:
                pool["issued"] += view.unattributed
                for line_id, qty in view.by_line.items():
                    if line_id in by_id:
                        by_id[line_id].issued += qty
                    else:
                        pool["issued"] += qty
            for h in st.holds:
                if h.item_id != iid:
                    continue
                attr = "hold_hard" if h.category == "hard" else "hold_tentative"
                if h.bom_item_id in line_ids:
                    setattr(by_id[h.bom_item_id], attr, getattr(by_id[h.bom_item_id], attr) + h.effective_qty)
                else:
                    pool[attr] += h.effective_qty
            for p in st.pegs:
                if p.item_id != iid:
                    continue
                attr = "peg_hard" if p.kind == PEG_HARD else "peg_tentative"
                if p.bom_item_id in line_ids:
                    setattr(by_id[p.bom_item_id], attr, getattr(by_id[p.bom_item_id], attr) + p.effective_qty)
                else:
                    pool[attr] += p.effective_qty
            _spread(pool["issued"], group, "issued", KIND_HARD_ATP)
            _spread(pool["hold_hard"], group, "hold_hard", KIND_HARD_ATP)
            _spread(pool["peg_hard"], group, "peg_hard", KIND_HARD_ATP)
            _spread(pool["hold_tentative"], group, "hold_tentative", KIND_TENTATIVE)
            _spread(pool["peg_tentative"], group, "peg_tentative", KIND_TENTATIVE)
    return states


# ------------------------------------------------------------------ priority queue


@dataclass(frozen=True)
class QueueEntry:
    order_id: int
    rank: int  # 0 in progress, 1 firm by plan start, 2 firm by delivery date, 3 tentative
    key: tuple
    confirmed: bool


async def load_priority_queue(
    db: AsyncSession, tenant_id: int, extra_orders: Iterable[Order] = ()
) -> tuple[list[QueueEntry], dict[int, Order], bool]:
    """Open orders with an active Order BOM, highest priority first. ``extra_orders`` are always included."""
    rows = (
        await db.execute(
            select(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.status.in_(tuple(OPEN_STATUSES)),
                Order.id.in_(
                    select(Bom.order_id).where(Bom.tenant_id == tenant_id, Bom.is_active.is_(True), Bom.order_id.isnot(None))
                ),
            )
            .order_by(Order.id)
            .limit(MAX_QUEUE_ORDERS + 1)
        )
    ).scalars().all()
    truncated = len(rows) > MAX_QUEUE_ORDERS
    orders: dict[int, Order] = {int(o.id): o for o in rows[:MAX_QUEUE_ORDERS]}
    for o in extra_orders:
        orders.setdefault(int(o.id), o)
    plan_rows = (
        await db.execute(
            select(
                SewingLineStyleConfig.order_id,
                SewingLineStyleConfig.reservation_status,
                SewingLineStyleConfig.start_date,
            ).where(
                SewingLineStyleConfig.tenant_id == tenant_id,
                SewingLineStyleConfig.order_id.in_(list(orders)),
            )
        )
    ).all() if orders else []
    in_progress: dict[int, date] = {}
    firm: dict[int, date] = {}
    for oid, rs, start in plan_rows:
        status = (rs or "").strip().upper()
        if status in _PLAN_EXCLUDED_ROWS or start is None:
            continue
        if status == "IN_PROGRESS":
            in_progress[int(oid)] = min(start, in_progress.get(int(oid), start))
        if status in ("IN_PROGRESS", "FIRM_BOOKED"):
            firm[int(oid)] = min(start, firm.get(int(oid), start))
    entries: list[QueueEntry] = []
    for oid, o in orders.items():
        status = (o.status or "").strip().upper()
        delivery = o.delivery_date or date.max
        if status in CONFIRMED_ORDER_STATUSES:
            if oid in in_progress:
                rank, when = 0, in_progress[oid]
            elif oid in firm:
                rank, when = 1, firm[oid]
            else:
                rank, when = 2, delivery
            entries.append(QueueEntry(oid, rank, (rank, when, oid), True))
        else:
            entries.append(QueueEntry(oid, 3, (3, delivery, oid), False))
    entries.sort(key=lambda e: e.key)
    return entries, orders, truncated


# ------------------------------------------------------------------ supply (free stock / inbound)


@dataclass
class SupplyCtx:
    on_hand: dict[int, Decimal]
    hard_all: dict[int, Decimal]
    tent_all: dict[int, Decimal]
    inbound: dict[int, ItemInbound]
    peg_views: dict[int, pegging_service.PegLineView]
    po_lines: dict[int, OpenPoLine]


async def load_supply(db: AsyncSession, tenant_id: int, item_ids: Iterable[int], now: datetime) -> SupplyCtx:
    from app.modules.inventory.stock_availability_service import _compute_items_availability_legacy

    ids = sorted({int(i) for i in item_ids})
    on_hand: dict[int, Decimal] = {}
    hard = {i: ZERO for i in ids}
    tent = {i: ZERO for i in ids}
    if ids:
        base = await _compute_items_availability_legacy(
            db, tenant_id, ids, warehouse_id=None, include_in_transit_po=False, exclude_reserved=False,
            exclude_non_available_warehouses=True,
        )
        on_hand = {i: max(ZERO, to_decimal(base[i].on_hand)) for i in ids}
        for h in await load_effective_holds(db, tenant_id, ids, now=now):
            (hard if h.category == "hard" else tent)[h.item_id] += h.effective_qty
    inbound = await inbound_by_item(db, tenant_id, ids, with_eta=True) if ids else {}
    _pegs, views = await pegging_service.load_effective_pegs(db, tenant_id, ids, inbound=inbound, now=now)
    po_lines = {ln.po_line_id: ln for slot in inbound.values() for ln in slot.lines}
    return SupplyCtx(on_hand, hard, tent, inbound, views, po_lines)


@dataclass
class SimState:
    """Quantities planned earlier in the same allocation run (preview only; nothing is written)."""

    hold_added: dict[int, Decimal] = field(default_factory=dict)
    peg_added: dict[int, Decimal] = field(default_factory=dict)
    cut: dict[tuple[int, int], Decimal] = field(default_factory=dict)

    def add(self, order_id: int, plan: "AllocationPlan") -> None:
        for lp in plan.lines:
            iid = lp.line.item_id
            took = lp.hold_qty + sum((p.qty for p in lp.pegs), ZERO)
            if lp.hold_qty > ZERO:
                self.hold_added[iid] = self.hold_added.get(iid, ZERO) + lp.hold_qty
            for p in lp.pegs:
                self.peg_added[p.po_line_id] = self.peg_added.get(p.po_line_id, ZERO) + p.qty
            if took > ZERO:
                self.cut[(order_id, iid)] = self.cut.get((order_id, iid), ZERO) + took


# ------------------------------------------------------------------ plan


@dataclass
class PegPlan:
    po_line_id: int
    po_id: int
    po_code: str
    item_id: int
    qty: Decimal
    expected_date: date | None
    eta_source: str


@dataclass
class LinePlan:
    line: LineState
    shortfall: Decimal
    hold_qty: Decimal = ZERO
    pegs: list[PegPlan] = field(default_factory=list)

    @property
    def remaining(self) -> Decimal:
        return q4(max(ZERO, self.shortfall - self.hold_qty - sum((p.qty for p in self.pegs), ZERO)))


@dataclass
class AllocationPlan:
    order_id: int
    order_code: str
    order_status: str
    kind: str
    expires_at: datetime | None
    bom_id: int | None
    bom_status: str | None
    lines: list[LinePlan]
    priority_rank: int
    warnings: list[str]
    token: str = ""

    @property
    def creates_anything(self) -> bool:
        return any(lp.hold_qty > ZERO or lp.pegs for lp in self.lines)


def _unmet_by_item(state: OrderState, confirmed: bool, sim: SimState) -> dict[int, Decimal]:
    kind = KIND_HARD_ATP if confirmed else KIND_TENTATIVE
    out: dict[int, Decimal] = {}
    for ln in state.lines:
        short = line_shortfall(ln, kind)
        if short > ZERO:
            out[ln.item_id] = out.get(ln.item_id, ZERO) + short
    oid = int(state.order.id)
    return {iid: max(ZERO, v - sim.cut.get((oid, iid), ZERO)) for iid, v in out.items()}


def _token(plan: AllocationPlan, state: OrderState, free_numbers: dict) -> str:
    payload = {
        "order": [plan.order_id, plan.order_status, str(state.order.quantity)],
        "kind": plan.kind,
        "expires": plan.expires_at.isoformat() if plan.expires_at else None,
        "bom": [plan.bom_id, plan.bom_status],
        "lines": [
            [
                lp.line.bom_item_id, str(lp.line.required), str(lp.line.issued), str(lp.line.hold_hard),
                str(lp.line.hold_tentative), str(lp.line.peg_hard), str(lp.line.peg_tentative),
                str(lp.hold_qty), [[p.po_line_id, str(p.qty)] for p in lp.pegs],
            ]
            for lp in plan.lines
        ],
        "holds": sorted([h.reservation_id, str(h.reserved_qty), str(h.consumed_qty)] for h in state.holds),
        "pegs": sorted([p.peg_id, str(p.pegged_qty), p.lock_version] for p in state.pegs),
        "free": free_numbers,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _plan_one(
    order: Order,
    state: OrderState,
    kind: str,
    expires_at: datetime | None,
    rank: int,
    higher_unmet: dict[int, Decimal],
    supply: SupplyCtx,
    sim: SimState,
) -> AllocationPlan:
    tentative = kind == KIND_TENTATIVE
    avail_oh: dict[int, Decimal] = {}
    ib_budget: dict[int, Decimal] = {}
    line_free: dict[int, Decimal] = {}
    free_numbers: dict = {}
    warnings: list[str] = []
    for iid in sorted({ln.item_id for ln in state.lines}):
        on_hand = supply.on_hand.get(iid, ZERO)
        taken = supply.hard_all.get(iid, ZERO) + (supply.tent_all.get(iid, ZERO) if tentative else ZERO)
        free_oh = max(ZERO, on_hand - taken - sim.hold_added.get(iid, ZERO))
        free_total_ib = ZERO
        slot = supply.inbound.get(iid)
        for ln in (slot.lines if slot else []):
            view = supply.peg_views.get(ln.po_line_id)
            used = (view.hard_effective + (view.tentative_effective if tentative else ZERO)) if view else ZERO
            free = max(ZERO, ln.on_order_net - used - sim.peg_added.get(ln.po_line_id, ZERO))
            line_free[ln.po_line_id] = free
            free_total_ib += free
        protect = higher_unmet.get(iid, ZERO)
        r_oh = min(protect, free_oh)
        r_ib = min(protect - r_oh, free_total_ib)
        avail_oh[iid] = free_oh - r_oh
        ib_budget[iid] = free_total_ib - r_ib
        free_numbers[str(iid)] = [str(avail_oh[iid]), str(ib_budget[iid])]
        if protect > ZERO:
            warnings.append(f"HIGHER_PRIORITY_DEMAND_PROTECTED:{iid}")

    plans: list[LinePlan] = []
    for ln in state.lines:
        short = line_shortfall(ln, kind)
        lp = LinePlan(line=ln, shortfall=short)
        if short > ZERO:
            iid = ln.item_id
            take = min(short, avail_oh[iid])
            if take > ZERO:
                lp.hold_qty = q4(take)
                avail_oh[iid] -= take
            rem = short - take
            if rem > ZERO:
                slot = supply.inbound.get(iid)
                candidates = sorted(
                    (slot.lines if slot else []),
                    key=lambda x: (x.expected_date is None, x.expected_date or date.max, x.po_line_id),
                )
                for po in candidates:
                    if rem <= ZERO or ib_budget[iid] <= ZERO:
                        break
                    free = line_free.get(po.po_line_id, ZERO)
                    qty = min(rem, free, ib_budget[iid])
                    if qty <= ZERO:
                        continue
                    lp.pegs.append(
                        PegPlan(po.po_line_id, po.po_id, po.po_code, iid, q4(qty), po.expected_date, po.eta_source)
                    )
                    line_free[po.po_line_id] = free - qty
                    ib_budget[iid] -= qty
                    rem -= qty
        plans.append(lp)

    plan = AllocationPlan(
        order_id=int(order.id),
        order_code=order.order_code,
        order_status=(order.status or "").strip().upper(),
        kind=kind,
        expires_at=expires_at,
        bom_id=int(state.bom.id) if state.bom else None,
        bom_status=(state.bom.status or "").strip().upper() if state.bom else None,
        lines=plans,
        priority_rank=rank,
        warnings=warnings,
    )
    plan.token = _token(plan, state, free_numbers)
    return plan


@dataclass
class PlannedOrder:
    order: Order
    plan: AllocationPlan | None
    skipped: str | None = None  # error code when the order cannot be planned (run only)
    skipped_message: str | None = None


async def plan_orders(
    db: AsyncSession,
    tenant_id: int,
    orders: list[Order],
    kind: str,
    expires_at: datetime | None,
    *,
    now: datetime,
    skip_invalid: bool,
) -> tuple[list[PlannedOrder], bool]:
    """Plan one or several orders in priority order (earlier plans reduce what later orders can take)."""
    if kind not in (KIND_HARD_ATP, KIND_TENTATIVE):
        raise HTTPException(status_code=422, detail="kind must be HARD_ATP or TENTATIVE")
    expires = normalize_expiry(kind, expires_at, now)
    queue, queue_orders, truncated = await load_priority_queue(db, tenant_id, orders)
    key_of = {e.order_id: e for e in queue}
    protect_pool = queue[:MAX_PROTECT_ORDERS]
    target_ids = {int(o.id) for o in orders}
    state_orders = {int(o.id): o for o in orders}
    for e in protect_pool:
        state_orders.setdefault(e.order_id, queue_orders[e.order_id])
    states = await build_order_states(db, tenant_id, list(state_orders.values()), now=now)

    results: list[PlannedOrder] = []
    runnable: list[Order] = []
    for o in sorted(orders, key=lambda x: key_of[int(x.id)].key):
        try:
            assert_kind_allowed(o, kind, states[int(o.id)])
        except HTTPException as exc:
            if not skip_invalid:
                raise
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            results.append(PlannedOrder(o, None, detail.get("code", "NOT_ALLOWED"), detail.get("message")))
            continue
        runnable.append(o)
    item_ids = {ln.item_id for o in runnable for ln in states[int(o.id)].lines}
    supply = await load_supply(db, tenant_id, item_ids, now)
    sim = SimState()
    planned: dict[int, PlannedOrder] = {}
    for o in runnable:
        oid = int(o.id)
        entry = key_of[oid]
        higher: dict[int, Decimal] = {}
        for e in protect_pool:
            if e.key >= entry.key or e.order_id == oid or e.order_id not in states:
                continue
            for iid, qty in _unmet_by_item(states[e.order_id], e.confirmed, sim).items():
                higher[iid] = higher.get(iid, ZERO) + qty
        plan = _plan_one(o, states[oid], kind, expires, entry.rank, higher, supply, sim)
        if truncated:
            plan.warnings.append("QUEUE_TRUNCATED")
        sim.add(oid, plan)
        planned[oid] = PlannedOrder(o, plan)
    ordered = []
    done_skipped = {int(r.order.id): r for r in results}
    for o in sorted(orders, key=lambda x: key_of[int(x.id)].key):
        ordered.append(planned.get(int(o.id)) or done_skipped[int(o.id)])
    _ = target_ids
    return ordered, truncated


# ------------------------------------------------------------------ public: state, preview, confirm


async def load_order_for_allocation(db: AsyncSession, tenant_id: int, order_id: int) -> Order:
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id == int(order_id)))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


async def order_allocation_state(db: AsyncSession, tenant_id: int, order: Order, *, now: datetime | None = None) -> dict:
    """Read-only view of an order's lines, holds, pegs and priority (no plan, no token)."""
    now = now or datetime.utcnow()
    queue, _orders, _trunc = await load_priority_queue(db, tenant_id, [order])
    entry = next(e for e in queue if e.order_id == int(order.id))
    state = (await build_order_states(db, tenant_id, [order], now=now))[int(order.id)]
    kind = KIND_HARD_ATP if entry.confirmed else KIND_TENTATIVE
    reservations = (
        await db.execute(
            select(StockReservation)
            .where(
                StockReservation.tenant_id == tenant_id,
                StockReservation.order_id == int(order.id),
                StockReservation.status.in_((STATUS_ACTIVE, "HARD", "SOFT")),
            )
            .order_by(StockReservation.id)
        )
    ).scalars().all()
    eff_hold = {h.reservation_id: h for h in state.holds}
    pegs = await pegging_service.active_pegs_for_order(db, tenant_id, int(order.id))
    eff_peg = {p.peg_id: p for p in state.pegs}
    po_eta = await pegging_service.peg_eta_by_line(db, tenant_id, [p.purchase_order_item_id for p in pegs if p.purchase_order_item_id])
    return {
        "order": order,
        "state": state,
        "kind": kind,
        "priority_rank": entry.rank,
        "priority_key_date": entry.key[1] if entry.key[1] != date.max else None,
        "reservations": [(r, eff_hold.get(int(r.id))) for r in reservations],
        "pegs": [(p, eff_peg.get(int(p.id)), po_eta.get(int(p.purchase_order_item_id)) if p.purchase_order_item_id else None) for p in pegs],
    }


async def preview_order_allocation(
    db: AsyncSession,
    tenant_id: int,
    order: Order,
    kind: str,
    expires_at: datetime | None,
    *,
    now: datetime | None = None,
) -> AllocationPlan:
    now = now or datetime.utcnow()
    planned, _ = await plan_orders(db, tenant_id, [order], kind, expires_at, now=now, skip_invalid=False)
    plan = planned[0].plan
    assert plan is not None
    return plan


@dataclass
class ConfirmResult:
    order_id: int
    kind: str
    status: str  # ALLOCATED | NOOP
    replayed: bool
    holds: list[dict]
    pegs: list[dict]
    plan: AllocationPlan
    state_token: str


async def _lock_for_allocation(db: AsyncSession, tenant_id: int, order_id: int) -> Order:
    """Take the locks of plan section 8 for one order and return the locked order row."""
    locked = await lock_orders(db, tenant_id, [order_id])
    order = locked.get(int(order_id))
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    states = await build_order_states(db, tenant_id, [order])
    item_ids = sorted({ln.item_id for ln in states[int(order.id)].lines})
    await lock_stock_items(db, tenant_id, item_ids)
    await db.execute(
        select(StockReservation.id)
        .where(
            StockReservation.tenant_id == tenant_id,
            StockReservation.order_id == int(order.id),
            StockReservation.status == STATUS_ACTIVE,
        )
        .order_by(StockReservation.id)
        .with_for_update()
    )
    open_lines = await load_open_po_lines(db, tenant_id, item_ids, with_eta=False) if item_ids else []
    await pegging_service.lock_po_lines(db, tenant_id, [ln.po_line_id for ln in open_lines])
    await db.execute(
        select(MfgMaterialSupplyPegging.id)
        .where(
            MfgMaterialSupplyPegging.tenant_id == tenant_id,
            MfgMaterialSupplyPegging.order_id == int(order.id),
            MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
        )
        .order_by(MfgMaterialSupplyPegging.id)
        .with_for_update()
    )
    return order


def _hold_kind_to_peg(kind: str) -> str:
    return PEG_HARD if kind == KIND_HARD_ATP else PEG_TENTATIVE


async def confirm_order_allocation(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
    *,
    kind: str,
    expires_at: datetime | None,
    state_token: str | None,
    user_id: int | None,
    now: datetime | None = None,
    set_lock_timeout: bool = True,
) -> ConfirmResult:
    """Apply an allocation under locks. ``state_token=None`` skips the stale check (allocation run only).

    The plan is recomputed after the locks are held, so the shortfall is always current: a second call with the same
    token either hits 409 (state changed) or finds nothing left to allocate and returns ``NOOP`` (``replayed``).
    """
    now = now or datetime.utcnow()
    if set_lock_timeout:
        await db.execute(text(LOCK_TIMEOUT_SQL))
    order = await _lock_for_allocation(db, tenant_id, order_id)
    plan = await preview_order_allocation(db, tenant_id, order, kind, expires_at, now=now)
    if state_token is not None and state_token != plan.token:
        if plan.creates_anything:
            raise _conflict(
                "STALE_STATE", "Stock or demand changed since the preview; preview again", state_token=plan.token
            )
        return ConfirmResult(plan.order_id, kind, "NOOP", True, [], [], plan, plan.token)
    if not plan.creates_anything:
        return ConfirmResult(plan.order_id, kind, "NOOP", state_token is not None, [], [], plan, plan.token)

    created_holds: list[dict] = []
    created_pegs: list[dict] = []
    for lp in plan.lines:
        if lp.hold_qty > ZERO:
            row = await create_hold(
                db, tenant_id, item_id=lp.line.item_id, order_id=plan.order_id, bom_item_id=lp.line.bom_item_id,
                qty=lp.hold_qty, kind=kind, user_id=user_id, source=SOURCE_ALLOCATION, expires_at=plan.expires_at,
            )
            created_holds.append(
                {"reservation_id": int(row.id), "item_id": lp.line.item_id, "bom_item_id": lp.line.bom_item_id,
                 "quantity": lp.hold_qty, "kind": kind}
            )
        for p in lp.pegs:
            ln = OpenPoLine(
                po_line_id=p.po_line_id, po_id=p.po_id, po_code=p.po_code, item_id=p.item_id, warehouse_id=None,
                ordered=ZERO, usable_received=ZERO, pending_qc=ZERO, on_order_net=ZERO,
                expected_date=p.expected_date, eta_source=p.eta_source,
            )
            row = await pegging_service.create_peg(
                db, tenant_id, po_line=ln, order_id=plan.order_id, bom_item_id=lp.line.bom_item_id,
                kind=_hold_kind_to_peg(kind), qty=p.qty, user_id=user_id, expires_at=plan.expires_at,
            )
            created_pegs.append(
                {"peg_id": int(row.id), "purchase_order_item_id": p.po_line_id, "po_code": p.po_code,
                 "item_id": p.item_id, "quantity": p.qty, "expected_date": p.expected_date, "kind": row.peg_kind}
            )
    total_hold = sum((h["quantity"] for h in created_holds), ZERO)
    total_peg = sum((p["quantity"] for p in created_pegs), ZERO)
    summary = f"{kind} allocation: held {total_hold}, pegged {total_peg}"
    await log_action(
        db, tenant_id, "mfg_allocation.confirm", user_id=user_id, resource=f"order:{plan.order_id}",
        details=f"{summary}; holds={len(created_holds)} pegs={len(created_pegs)}",
    )
    await record_doc_event(
        db, tenant_id=tenant_id, user_id=user_id, doc_type="order", doc_id=plan.order_id,
        event="material_allocation", summary=summary,
        extra={"kind": kind, "holds": len(created_holds), "pegs": len(created_pegs)},
    )
    after = await preview_order_allocation(db, tenant_id, order, kind, plan.expires_at, now=now)
    return ConfirmResult(plan.order_id, kind, "ALLOCATED", False, created_holds, created_pegs, after, after.token)


# ------------------------------------------------------------------ allocation run


@dataclass
class RunPreview:
    kind: str
    expires_at: datetime | None
    items: list[PlannedOrder]
    state_token: str
    truncated: bool


async def _select_run_orders(
    db: AsyncSession, tenant_id: int, order_ids: list[int] | None, kind: str
) -> list[Order]:
    if order_ids is not None:
        ids = sorted({int(i) for i in order_ids})
        if len(ids) > MAX_RUN_ORDERS:
            raise HTTPException(status_code=422, detail=f"At most {MAX_RUN_ORDERS} orders per run")
        rows = (
            await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(ids)).order_by(Order.id))
        ).scalars().all()
        if len(rows) != len(ids):
            raise HTTPException(status_code=404, detail="Order not found")
        return list(rows)
    queue, orders, _trunc = await load_priority_queue(db, tenant_id)
    wanted_confirmed = kind == KIND_HARD_ATP
    return [orders[e.order_id] for e in queue if e.confirmed == wanted_confirmed][:MAX_RUN_ORDERS]


async def preview_allocation_run(
    db: AsyncSession,
    tenant_id: int,
    *,
    order_ids: list[int] | None,
    kind: str,
    expires_at: datetime | None,
    now: datetime | None = None,
) -> RunPreview:
    now = now or datetime.utcnow()
    orders = await _select_run_orders(db, tenant_id, order_ids, kind)
    if not orders:
        return RunPreview(kind, None, [], hashlib.sha256(f"{kind}:empty".encode()).hexdigest(), False)
    planned, truncated = await plan_orders(db, tenant_id, orders, kind, expires_at, now=now, skip_invalid=True)
    parts = [kind] + [(p.plan.token if p.plan else f"skip:{p.order.id}:{p.skipped}") for p in planned]
    token = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    expires = planned[0].plan.expires_at if planned and planned[0].plan else normalize_expiry(kind, expires_at, now)
    return RunPreview(kind, expires, planned, token, truncated)


def _is_lock_timeout(exc: DBAPIError) -> bool:
    text_ = f"{exc.orig!r} {exc}".lower()
    return "55p03" in text_ or "lock timeout" in text_ or "locknotavailable" in text_


@dataclass
class RunResult:
    kind: str
    results: list[dict]
    state_token: str


async def confirm_allocation_run(
    db: AsyncSession,
    tenant_id: int,
    *,
    order_ids: list[int] | None,
    kind: str,
    expires_at: datetime | None,
    state_token: str,
    user_id: int | None,
    now: datetime | None = None,
) -> RunResult:
    """Confirm an allocation run: stale token -> 409, then one transaction (commit) per order in priority order."""
    now = now or datetime.utcnow()
    preview = await preview_allocation_run(db, tenant_id, order_ids=order_ids, kind=kind, expires_at=expires_at, now=now)
    if preview.state_token != state_token:
        raise _conflict("STALE_STATE", "Stock or demand changed since the preview; preview again", state_token=preview.state_token)
    results: list[dict] = []
    for item in preview.items:
        oid = int(item.order.id)
        if item.plan is None:
            results.append({"order_id": oid, "status": "SKIPPED", "code": item.skipped, "detail": item.skipped_message,
                            "holds": [], "pegs": []})
            continue
        try:
            res = await confirm_order_allocation(
                db, tenant_id, oid, kind=kind, expires_at=expires_at, state_token=None, user_id=user_id, now=now
            )
            await db.commit()
            results.append({"order_id": oid, "status": res.status, "code": None, "detail": None,
                            "holds": res.holds, "pegs": res.pegs})
        except HTTPException as exc:
            await safe_async_session_rollback(db)
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            results.append({"order_id": oid, "status": "SKIPPED", "code": detail.get("code", f"HTTP_{exc.status_code}"),
                            "detail": detail.get("message"), "holds": [], "pegs": []})
        except DBAPIError as exc:
            await safe_async_session_rollback(db)
            if not _is_lock_timeout(exc):
                raise
            logger.warning("mfg_allocation_run lock timeout tenant=%s order=%s", tenant_id, oid)
            results.append({"order_id": oid, "status": "SKIPPED", "code": "LOCK_TIMEOUT",
                            "detail": "Another posting holds these items; run again", "holds": [], "pegs": []})
    return RunResult(kind, results, preview.state_token)
