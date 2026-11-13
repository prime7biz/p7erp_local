"""Reservation taxonomy and effective holds (Manufacturing Intelligence Phase 2, run R1: read side only).

Taxonomy (flag ``mfg_material_allocation_v1``; with the flag OFF no reader uses this module):

* ``HARD_ATP``      approved hold of a confirmed order; reduces promisable stock.
* ``TENTATIVE``     hold for non-confirmed (DRAFT) demand; shown as a stressed view, never reduces hard ATP.
* ``INFORMATIONAL`` shown only, never counted.
* Legacy rows keep status HARD / SOFT and are mapped HARD -> hard, SOFT -> tentative (while the flag is ON).
* New rows use ``status='ACTIVE'`` plus ``reservation_kind`` so legacy readers (which read only SOFT / HARD) never see them.

Effective quantity of a hold = max(0, reserved - consumed), where *consumed* is stock already issued to production
for the same tenant / order / item. A hold of an order that is not open (status not in NEW / CONFIRMED /
IN_PROGRESS / DRAFT, i.e. cancelled, completed, shipped ...) counts as 0.

Consumption allowlist (verified in ``inventory/router.py`` and ``manufacturing/execution_router.py``): an OUT movement
of the same tenant / order / item whose ``reference_type`` / ``movement_kind`` is one of

    PRODUCTION_MATERIAL_ISSUE / PROD_ISSUE     (router.py, production material issue)
    CONSUMPTION_ISSUE         / CONSUMPTION_ISSUE (router.py, issue against the consumption plan)
    PROCESS_ORDER             / PROCESS_INPUT  (router.py, process order input issue)
    MFG_ISSUE                 / (no kind)      (manufacturing/execution_router.py work-order issue)

issued from a warehouse that is not quarantine / rejected, at or after the hold's ``reserved_at``. When the hold has
a ``bom_item_id`` only movements with ``bom_line_id`` equal to it count; otherwise any movement of the order and item
that is not claimed by a sibling hold with a BOM line. Returns (``MFG_RETURN`` IN movements of the order's work
orders) give consumed quantity back to the order's hold. No stock movement, valuation or voucher is ever created
from a reservation. R2 adds the writers at the bottom (create / release / reassign) and the item allocation view.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_mfg_material_allocation_v1_enabled
from app.models import Order, StockMovement, StockReservation, Tenant
from app.modules.inventory.open_po_supply_service import ZERO, inbound_by_item, q4, to_decimal
from app.modules.inventory.pegging_service import free_inbound_for, pegged_supply_by_item

KIND_HARD_ATP = "HARD_ATP"
KIND_TENTATIVE = "TENTATIVE"
KIND_INFORMATIONAL = "INFORMATIONAL"
RESERVATION_KINDS: tuple[str, ...] = (KIND_HARD_ATP, KIND_TENTATIVE, KIND_INFORMATIONAL)

STATUS_ACTIVE = "ACTIVE"
LEGACY_HARD = "HARD"
LEGACY_SOFT = "SOFT"

# Orders whose holds still count. Anything else (CANCELLED, COMPLETED, SHIPPED, ...) counts as 0.
OPEN_HOLD_ORDER_STATUSES: frozenset[str] = frozenset({"NEW", "CONFIRMED", "IN_PROGRESS", "DRAFT"})

# (reference_type, movement_kind or None = any kind). Section 15 finding 2; strings verified in code.
CONSUMPTION_REFERENCES: tuple[tuple[str, str | None], ...] = (
    ("PRODUCTION_MATERIAL_ISSUE", "PROD_ISSUE"),
    ("CONSUMPTION_ISSUE", "CONSUMPTION_ISSUE"),
    ("PROCESS_ORDER", "PROCESS_INPUT"),
    ("MFG_ISSUE", None),
)

WAREHOUSE_ANY = "any"  # no warehouse scoping (MRP)
WAREHOUSE_UNSCOPED_OK = "include_unscoped"  # holds without a warehouse also count (availability)
WAREHOUSE_EXACT = "exact"  # only holds on exactly that warehouse (reorder)


def is_consumption_movement(movement_type: str | None, reference_type: str | None, movement_kind: str | None) -> bool:
    """True when an OUT movement counts as stock consumed by production (the netting allowlist)."""
    if (movement_type or "").upper() != "OUT":
        return False
    ref = (reference_type or "").upper()
    kind = (movement_kind or "").upper() or None
    for allowed_ref, allowed_kind in CONSUMPTION_REFERENCES:
        if ref == allowed_ref and (allowed_kind is None or kind == allowed_kind):
            return True
    return False


async def allocation_v1_enabled(db: AsyncSession, tenant_id: int, override: bool | None = None) -> bool:
    """Strict tenant flag lookup (identity-map ``db.get``); ``override`` lets a caller resolve it once per run."""
    if override is not None:
        return bool(override)
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        return False
    return is_mfg_material_allocation_v1_enabled(tenant.feature_flags)


@dataclass(frozen=True)
class EffectiveHold:
    reservation_id: int
    item_id: int
    order_id: int | None
    bom_item_id: int | None
    warehouse_id: int | None
    category: str  # "hard" | "tentative"
    reserved_qty: Decimal
    consumed_qty: Decimal
    effective_qty: Decimal


def _category(status: str | None, kind: str | None) -> str | None:
    """hard / tentative / None (informational, released or unknown rows count nowhere)."""
    s = (status or "").upper()
    if s == LEGACY_HARD:
        return "hard"
    if s == LEGACY_SOFT:
        return "tentative"
    if s == STATUS_ACTIVE:
        k = (kind or "").upper()
        if k == KIND_HARD_ATP:
            return "hard"
        if k == KIND_TENTATIVE:
            return "tentative"
    return None


async def _non_available_warehouses(db: AsyncSession, tenant_id: int) -> set[int]:
    from app.modules.inventory.grn_qc_service import get_non_available_warehouse_ids

    return await get_non_available_warehouse_ids(db, tenant_id)


async def load_effective_holds(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    warehouse_id: int | None = None,
    warehouse_mode: str = WAREHOUSE_ANY,
    exclude_order_ids: Iterable[int] = (),
    own_order_id: int | None = None,
    now: datetime | None = None,
) -> list[EffectiveHold]:
    """Hard / tentative holds of the items after expiry, order status and consumption netting.

    ``exclude_order_ids`` (MRP: orders already in the run's gross demand) and ``own_order_id`` (readiness / promise:
    the order being checked, whose own holds are added back) drop the holds of those orders.
    """
    unique_ids = sorted({int(i) for i in item_ids})
    if not unique_ids:
        return []
    now = now or datetime.utcnow()
    skip_orders = {int(o) for o in exclude_order_ids}
    if own_order_id is not None:
        skip_orders.add(int(own_order_id))

    stmt = (
        select(StockReservation, Order.status)
        .outerjoin(Order, and_(Order.id == StockReservation.order_id, Order.tenant_id == tenant_id))
        .where(
            StockReservation.tenant_id == tenant_id,
            StockReservation.item_id.in_(unique_ids),
            or_(
                StockReservation.status.in_((LEGACY_HARD, LEGACY_SOFT)),
                and_(
                    StockReservation.status == STATUS_ACTIVE,
                    StockReservation.reservation_kind.in_((KIND_HARD_ATP, KIND_TENTATIVE)),
                ),
            ),
        )
        .order_by(StockReservation.reserved_at, StockReservation.id)
    )
    if warehouse_id is not None and warehouse_mode == WAREHOUSE_UNSCOPED_OK:
        stmt = stmt.where(
            or_(StockReservation.warehouse_id.is_(None), StockReservation.warehouse_id == warehouse_id)
        )
    elif warehouse_id is not None and warehouse_mode == WAREHOUSE_EXACT:
        stmt = stmt.where(StockReservation.warehouse_id == warehouse_id)

    candidates: list[StockReservation] = []
    for row, order_status in (await db.execute(stmt)).all():
        if _category(row.status, row.reservation_kind) is None:
            continue
        if row.order_id is not None and (order_status or "").upper() not in OPEN_HOLD_ORDER_STATUSES:
            continue  # finding 11: holds of non-open (or unknown) orders count as 0
        if row.order_id is not None and int(row.order_id) in skip_orders:
            continue
        if (row.reservation_kind or "").upper() == KIND_TENTATIVE and row.expires_at is not None and row.expires_at <= now:
            continue  # expired tentative hold
        candidates.append(row)
    if not candidates:
        return []

    consumed = await _consumed_by_hold(db, tenant_id, candidates)
    holds: list[EffectiveHold] = []
    for row in candidates:
        reserved = max(ZERO, to_decimal(row.reserved_qty))
        used = min(reserved, consumed.get(int(row.id), ZERO))
        holds.append(
            EffectiveHold(
                reservation_id=int(row.id),
                item_id=int(row.item_id),
                order_id=int(row.order_id) if row.order_id is not None else None,
                bom_item_id=int(row.bom_item_id) if row.bom_item_id is not None else None,
                warehouse_id=int(row.warehouse_id) if row.warehouse_id is not None else None,
                category=_category(row.status, row.reservation_kind) or "hard",
                reserved_qty=q4(reserved),
                consumed_qty=q4(used),
                effective_qty=q4(max(ZERO, reserved - used)),
            )
        )
    return holds


async def _consumed_by_hold(db: AsyncSession, tenant_id: int, holds: list[StockReservation]) -> dict[int, Decimal]:
    """Netting: issued quantity per hold id (each issue movement is consumed by at most one hold)."""
    keyed = [h for h in holds if h.order_id is not None]
    if not keyed:
        return {}
    order_ids = sorted({int(h.order_id) for h in keyed})
    item_ids = sorted({int(h.item_id) for h in keyed})
    ref_filters = [
        and_(StockMovement.reference_type == ref, StockMovement.movement_kind == kind)
        if kind is not None
        else StockMovement.reference_type == ref
        for ref, kind in CONSUMPTION_REFERENCES
    ]
    stmt = (
        select(
            StockMovement.id,
            StockMovement.order_id,
            StockMovement.item_id,
            StockMovement.bom_line_id,
            StockMovement.warehouse_id,
            StockMovement.quantity,
            StockMovement.created_at,
        )
        .where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.movement_type == "OUT",
            StockMovement.order_id.in_(order_ids),
            StockMovement.item_id.in_(item_ids),
            or_(*ref_filters),
        )
        .order_by(StockMovement.created_at, StockMovement.id)
    )
    moves = (await db.execute(stmt)).all()
    if not moves:
        return {}
    bad_wh = await _non_available_warehouses(db, tenant_id)

    # remaining quantity per movement (a movement is consumed once)
    remaining: dict[int, Decimal] = {}
    by_key: dict[tuple[int, int], list[tuple[int, int | None, datetime]]] = defaultdict(list)
    for mid, oid, iid, bom_line, wh, qty, created in moves:
        if wh is not None and int(wh) in bad_wh:
            continue
        remaining[int(mid)] = max(ZERO, to_decimal(qty))
        by_key[(int(oid), int(iid))].append((int(mid), int(bom_line) if bom_line is not None else None, created))

    claimed_lines: dict[tuple[int, int], set[int]] = defaultdict(set)
    for h in keyed:
        if h.bom_item_id is not None:
            claimed_lines[(int(h.order_id), int(h.item_id))].add(int(h.bom_item_id))

    result: dict[int, Decimal] = {}
    # hard holds first, then older holds first, so a shared issue nets the stronger hold
    ordered = sorted(keyed, key=lambda h: (0 if _category(h.status, h.reservation_kind) == "hard" else 1, h.reserved_at, h.id))
    for h in ordered:
        key = (int(h.order_id), int(h.item_id))
        need = max(ZERO, to_decimal(h.reserved_qty))
        got = ZERO
        for mid, bom_line, created in by_key.get(key, []):
            if need <= ZERO:
                break
            if created < h.reserved_at:
                continue
            if h.bom_item_id is not None:
                if bom_line != int(h.bom_item_id):
                    continue
            elif bom_line is not None and bom_line in claimed_lines[key]:
                continue
            take = min(need, remaining.get(mid, ZERO))
            if take <= ZERO:
                continue
            remaining[mid] -= take
            need -= take
            got += take
        result[int(h.id)] = got

    # MFG_RETURN (R2 decision): material returned to stock for an order's work order gives the quantity back to the
    # order's hold (consumed shrinks; the effective hold never exceeds the original reservation).
    returned = await _returned_by_order_item(db, tenant_id, order_ids, item_ids, bad_wh)
    if returned:
        for h in ordered:
            key = (int(h.order_id), int(h.item_id))
            give_back = returned.get(key, ZERO)
            if give_back <= ZERO:
                continue
            reduce_by = min(give_back, result.get(int(h.id), ZERO))
            if reduce_by > ZERO:
                result[int(h.id)] -= reduce_by
                returned[key] = give_back - reduce_by
    return result


async def _returned_by_order_item(
    db: AsyncSession,
    tenant_id: int,
    order_ids: list[int],
    item_ids: list[int],
    bad_warehouses: set[int],
) -> dict[tuple[int, int], Decimal]:
    """Quantity returned to usable stock per (order, item): IN movements of reference MFG_RETURN whose work order
    belongs to the order (the return movement itself carries the work order id in ``reference_id``)."""
    from app.models import ManufacturingWorkOrder

    stmt = (
        select(ManufacturingWorkOrder.order_id, StockMovement.item_id, StockMovement.warehouse_id, StockMovement.quantity)
        .join(
            ManufacturingWorkOrder,
            and_(
                ManufacturingWorkOrder.id == StockMovement.reference_id,
                ManufacturingWorkOrder.tenant_id == tenant_id,
            ),
        )
        .where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.movement_type == "IN",
            StockMovement.reference_type == "MFG_RETURN",
            ManufacturingWorkOrder.order_id.in_(order_ids),
            StockMovement.item_id.in_(item_ids),
        )
    )
    out: dict[tuple[int, int], Decimal] = defaultdict(lambda: ZERO)
    for oid, iid, wh, qty in (await db.execute(stmt)).all():
        if wh is not None and int(wh) in bad_warehouses:
            continue
        out[(int(oid), int(iid))] += max(ZERO, to_decimal(qty))
    return dict(out)


@dataclass
class IssuedView:
    """Material issued to production for one (order, item), net of returns."""

    total: Decimal = ZERO
    by_line: dict[int, Decimal] = None  # type: ignore[assignment]
    unattributed: Decimal = ZERO

    def __post_init__(self) -> None:
        if self.by_line is None:
            self.by_line = {}


async def issued_for_orders(
    db: AsyncSession, tenant_id: int, order_ids: Iterable[int], item_ids: Iterable[int]
) -> dict[tuple[int, int], IssuedView]:
    """Issued quantity per (order, item) with the consumption allowlist (netting rule), minus MFG_RETURN."""
    oids = sorted({int(o) for o in order_ids})
    iids = sorted({int(i) for i in item_ids})
    if not oids or not iids:
        return {}
    ref_filters = [
        and_(StockMovement.reference_type == ref, StockMovement.movement_kind == kind)
        if kind is not None
        else StockMovement.reference_type == ref
        for ref, kind in CONSUMPTION_REFERENCES
    ]
    moves = (
        await db.execute(
            select(
                StockMovement.order_id,
                StockMovement.item_id,
                StockMovement.bom_line_id,
                StockMovement.warehouse_id,
                StockMovement.quantity,
            ).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.movement_type == "OUT",
                StockMovement.order_id.in_(oids),
                StockMovement.item_id.in_(iids),
                or_(*ref_filters),
            )
        )
    ).all()
    out: dict[tuple[int, int], IssuedView] = {}
    if not moves:
        return out
    bad_wh = await _non_available_warehouses(db, tenant_id)
    for oid, iid, bom_line, wh, qty in moves:
        if wh is not None and int(wh) in bad_wh:
            continue
        view = out.setdefault((int(oid), int(iid)), IssuedView())
        q = max(ZERO, to_decimal(qty))
        view.total += q
        if bom_line is None:
            view.unattributed += q
        else:
            view.by_line[int(bom_line)] = view.by_line.get(int(bom_line), ZERO) + q
    returned = await _returned_by_order_item(db, tenant_id, oids, iids, bad_wh)
    for key, back in returned.items():
        view = out.get(key)
        if view is None:
            continue
        back = min(back, view.total)
        view.total -= back
        take = min(back, view.unattributed)  # returns first reduce issues that are not tied to a BOM line
        view.unattributed -= take
        back -= take
        for line_id in sorted(view.by_line):
            if back <= ZERO:
                break
            cut = min(back, view.by_line[line_id])
            view.by_line[line_id] -= cut
            back -= cut
    return out


async def hard_reserved_by_item(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    warehouse_id: int | None = None,
    warehouse_mode: str = WAREHOUSE_ANY,
    exclude_order_ids: Iterable[int] = (),
    own_order_id: int | None = None,
) -> dict[int, Decimal]:
    return await _sum_by_item(
        db, tenant_id, item_ids, "hard",
        warehouse_id=warehouse_id, warehouse_mode=warehouse_mode,
        exclude_order_ids=exclude_order_ids, own_order_id=own_order_id,
    )


async def tentative_reserved_by_item(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    warehouse_id: int | None = None,
    warehouse_mode: str = WAREHOUSE_ANY,
    exclude_order_ids: Iterable[int] = (),
    own_order_id: int | None = None,
) -> dict[int, Decimal]:
    return await _sum_by_item(
        db, tenant_id, item_ids, "tentative",
        warehouse_id=warehouse_id, warehouse_mode=warehouse_mode,
        exclude_order_ids=exclude_order_ids, own_order_id=own_order_id,
    )


async def _sum_by_item(db, tenant_id, item_ids, category, **kw) -> dict[int, Decimal]:
    ids = sorted({int(i) for i in item_ids})
    out: dict[int, Decimal] = {i: ZERO for i in ids}
    for h in await load_effective_holds(db, tenant_id, ids, **kw):
        if h.category == category:
            out[h.item_id] += h.effective_qty
    return {i: q4(v) for i, v in out.items()}


async def compute_items_availability_v1(
    db: AsyncSession,
    tenant_id: int,
    item_ids: list[int],
    *,
    warehouse_id: int | None = None,
    include_in_transit_po: bool = True,
    exclude_reserved: bool = True,
    exclude_non_available_warehouses: bool = True,
    own_order_id: int | None = None,
):
    """Availability with the hard-only taxonomy; same ``ItemAvailability`` shape as the legacy reader.

    on_hand   = the legacy movement balance (quarantine / rejected excluded)
    reserved  = effective HARD holds only (legacy HARD + ACTIVE HARD_ATP), own order's holds added back
    in_transit = free inbound = open PO supply net of QC-accepted receipts minus effective HARD pegs (R2)
    available = on_hand + in_transit - reserved
    Tentative (legacy SOFT / TENTATIVE) holds never reduce it.
    """
    from app.modules.inventory.stock_availability_service import ItemAvailability, _compute_items_availability_legacy

    if not item_ids:
        return {}
    unique_ids = sorted({int(i) for i in item_ids})
    base = await _compute_items_availability_legacy(
        db,
        tenant_id,
        unique_ids,
        warehouse_id=warehouse_id,
        include_in_transit_po=False,
        exclude_reserved=False,
        exclude_non_available_warehouses=exclude_non_available_warehouses,
    )
    hard: dict[int, Decimal] = {}
    if exclude_reserved:
        hard = await hard_reserved_by_item(
            db, tenant_id, unique_ids,
            warehouse_id=warehouse_id, warehouse_mode=WAREHOUSE_UNSCOPED_OK, own_order_id=own_order_id,
        )
    inbound: dict = {}
    pegs: dict = {}
    if include_in_transit_po:
        inbound = await inbound_by_item(db, tenant_id, unique_ids, warehouse_id=warehouse_id)
        # R2: free_inbound = on_order_net - effective HARD pegs (the order's own pegs are added back)
        pegs = await pegged_supply_by_item(db, tenant_id, unique_ids, own_order_id=own_order_id, inbound=inbound)

    out: dict[int, ItemAvailability] = {}
    for iid in unique_ids:
        on_hand = to_decimal(base[iid].on_hand)
        free_inbound = free_inbound_for(inbound.get(iid), pegs.get(iid)) if iid in inbound else ZERO
        reserved = hard.get(iid, ZERO)
        out[iid] = ItemAvailability(
            item_id=iid,
            on_hand=round(float(on_hand), 4),
            in_transit=round(float(free_inbound), 4),
            reserved=round(float(reserved), 4),
            available=round(float(on_hand + free_inbound - reserved), 4),
        )
    return out


# --------------------------------------------------------------------------- item allocation view (R2)


@dataclass(frozen=True)
class ItemAllocationView:
    """One item's hard / stressed availability (flag ``mfg_material_allocation_v1``).

    atp_hard     = usable on hand - hard holds + free inbound          (free inbound = on_order_net - hard pegs)
    atp_stressed = atp_hard - tentative holds - tentative pegs         (information only, never a promise)
    Invariant (F-T2): free_inbound + hard_pegged = on_order_net.
    """

    item_id: int
    on_hand: Decimal
    hard_reserved: Decimal
    tentative_reserved: Decimal
    on_order_net: Decimal
    hard_pegged: Decimal
    tentative_pegged: Decimal
    free_inbound: Decimal
    pending_qc: Decimal
    pending_po: Decimal
    earliest_expected_date: object
    atp_hard: Decimal
    atp_stressed: Decimal


async def item_allocation_views(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    own_order_id: int | None = None,
    now: datetime | None = None,
) -> dict[int, ItemAllocationView]:
    from app.modules.inventory.open_po_supply_service import pending_po_by_item
    from app.modules.inventory.stock_availability_service import _compute_items_availability_legacy

    ids = sorted({int(i) for i in item_ids})
    if not ids:
        return {}
    base = await _compute_items_availability_legacy(
        db, tenant_id, ids, warehouse_id=None, include_in_transit_po=False, exclude_reserved=False,
        exclude_non_available_warehouses=True,
    )
    holds = await load_effective_holds(db, tenant_id, ids, warehouse_mode=WAREHOUSE_UNSCOPED_OK, own_order_id=own_order_id, now=now)
    hard = {i: ZERO for i in ids}
    tent = {i: ZERO for i in ids}
    for h in holds:
        (hard if h.category == "hard" else tent)[h.item_id] += h.effective_qty
    inbound = await inbound_by_item(db, tenant_id, ids, with_eta=True)
    pegs = await pegged_supply_by_item(db, tenant_id, ids, own_order_id=own_order_id, inbound=inbound, now=now)
    pending_po = await pending_po_by_item(db, tenant_id, ids)
    out: dict[int, ItemAllocationView] = {}
    for iid in ids:
        on_hand = to_decimal(base[iid].on_hand)
        slot = inbound[iid]
        free_inbound = free_inbound_for(slot, pegs[iid])
        atp_hard = on_hand - hard[iid] + free_inbound
        out[iid] = ItemAllocationView(
            item_id=iid,
            on_hand=q4(on_hand),
            hard_reserved=q4(hard[iid]),
            tentative_reserved=q4(tent[iid]),
            on_order_net=q4(slot.on_order_net),
            hard_pegged=q4(pegs[iid].hard),
            tentative_pegged=q4(pegs[iid].tentative),
            free_inbound=free_inbound,
            pending_qc=q4(slot.pending_qc),
            pending_po=pending_po.get(iid, ZERO),
            earliest_expected_date=slot.earliest_expected_date,
            atp_hard=q4(atp_hard),
            atp_stressed=q4(atp_hard - tent[iid] - pegs[iid].tentative),
        )
    return out


# --------------------------------------------------------------------------- writers (R2)
#
# Lock order (plan section 8 / 15 #10): orders (sorted) -> lock_stock_items -> reservations -> PurchaseOrderItem
# (sorted) -> pegs. Writers here never create stock movements, valuation or vouchers.

SOURCE_ALLOCATION = "ALLOCATION"
SOURCE_REASSIGN = "REASSIGN"
CONFIRMED_ORDER_STATUSES: frozenset[str] = frozenset({"NEW", "CONFIRMED", "IN_PROGRESS"})


def _as_decimal_qty(qty) -> Decimal:
    value = q4(to_decimal(qty))
    if value <= ZERO:
        raise HTTPException(status_code=422, detail="Quantity must be positive")
    return value


async def lock_orders(db: AsyncSession, tenant_id: int, order_ids: Iterable[int]) -> dict[int, Order]:
    """Lock Order rows FOR UPDATE in id order (tenant scoped); returns the fresh locked rows."""
    ids = sorted({int(i) for i in order_ids})
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(Order)
            .where(Order.tenant_id == tenant_id, Order.id.in_(ids))
            .order_by(Order.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalars().all()
    return {int(r.id): r for r in rows}


async def create_hold(
    db: AsyncSession,
    tenant_id: int,
    *,
    item_id: int,
    order_id: int,
    bom_item_id: int | None,
    qty,
    kind: str,
    user_id: int | None,
    source: str = SOURCE_ALLOCATION,
    expires_at: datetime | None = None,
    warehouse_id: int | None = None,
) -> StockReservation:
    """Create the ACTIVE hold of (order, BOM line, item, kind) or top up the existing one (the unique index key)."""
    if kind not in (KIND_HARD_ATP, KIND_TENTATIVE):
        raise HTTPException(status_code=422, detail="Invalid reservation kind")
    amount = _as_decimal_qty(qty)
    if kind == KIND_TENTATIVE and expires_at is None:
        raise HTTPException(status_code=422, detail="A tentative hold needs an expiry date")

    def _lookup():
        stmt = (
            select(StockReservation)
            .where(
                StockReservation.tenant_id == tenant_id,
                StockReservation.status == STATUS_ACTIVE,
                StockReservation.order_id == order_id,
                StockReservation.item_id == item_id,
                StockReservation.reservation_kind == kind,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if bom_item_id is None:
            return stmt.where(StockReservation.bom_item_id.is_(None))
        return stmt.where(StockReservation.bom_item_id == bom_item_id)

    existing = (await db.execute(_lookup())).scalar_one_or_none()
    if existing is not None:
        existing.reserved_qty = q4(to_decimal(existing.reserved_qty) + amount)
        existing.lock_version = int(existing.lock_version or 0) + 1
        if expires_at is not None and kind == KIND_TENTATIVE:
            existing.expires_at = expires_at
        await db.flush()
        return existing
    row = StockReservation(
        tenant_id=tenant_id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
        bom_item_id=bom_item_id,
        reserved_qty=amount,
        status=STATUS_ACTIVE,
        reservation_kind=kind,
        reservation_source=source,
        expires_at=expires_at if kind == KIND_TENTATIVE else None,
        created_by_user_id=user_id,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        existing = (await db.execute(_lookup())).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=409, detail="Hold could not be created, retry")
        existing.reserved_qty = q4(to_decimal(existing.reserved_qty) + amount)
        existing.lock_version = int(existing.lock_version or 0) + 1
        await db.flush()
        return existing
    return row


@dataclass(frozen=True)
class ReleaseOutcome:
    reservation_id: int
    status: str
    released_qty: Decimal
    remaining_qty: Decimal
    lock_version: int
    changed: bool


async def release_hold(
    db: AsyncSession,
    tenant_id: int,
    reservation_id: int,
    *,
    qty=None,
    reason: str | None,
    user_id: int | None,
    expected_lock_version: int | None = None,
    lock: bool = True,
) -> ReleaseOutcome:
    """Release an ACTIVE hold fully (``qty`` None or >= reserved) or partly (reserved shrinks, stays ACTIVE).

    Idempotent for full releases: a hold that is no longer ACTIVE returns ``changed=False``. Partial releases are
    guarded by ``expected_lock_version`` (stale -> 409), so a replay cannot release twice.
    """
    stmt = select(StockReservation).where(
        StockReservation.id == int(reservation_id), StockReservation.tenant_id == tenant_id
    ).execution_options(populate_existing=True)
    if lock:
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.status == "RELEASED":
        return ReleaseOutcome(int(row.id), "RELEASED", ZERO, ZERO, int(row.lock_version or 0), False)
    if row.status != STATUS_ACTIVE:
        raise HTTPException(status_code=409, detail="Only material allocation holds can be released here")
    if expected_lock_version is not None and int(row.lock_version or 0) != int(expected_lock_version):
        raise HTTPException(status_code=409, detail="The hold changed, reload and retry")
    reserved = to_decimal(row.reserved_qty)
    amount = reserved if qty is None else _as_decimal_qty(qty)
    if amount > reserved:
        raise HTTPException(status_code=422, detail="Release quantity exceeds the held quantity")
    row.lock_version = int(row.lock_version or 0) + 1
    if amount >= reserved:
        row.status = "RELEASED"
        row.released_at = datetime.utcnow()
        remaining = ZERO
    else:
        row.reserved_qty = q4(reserved - amount)
        remaining = q4(reserved - amount)
    await db.flush()
    return ReleaseOutcome(int(row.id), row.status, q4(amount), remaining, int(row.lock_version), True)


async def reassign_between_orders(
    db: AsyncSession,
    tenant_id: int,
    *,
    from_reservation_id: int,
    to_order_id: int,
    qty,
    user_id: int | None,
) -> dict:
    """Move held quantity from one order to another (same item, same kind). Total held is conserved.

    Caller has already checked admin / manager role and the reason. Target rules: HARD_ATP needs a confirmed order
    with an APPROVED / FROZEN active Order BOM that contains the item; TENTATIVE needs a DRAFT order. The target
    hold never exceeds the target line's open requirement.
    """
    from app.modules.inventory import material_allocation_service as mas
    from app.modules.inventory.stock_locks import lock_stock_items

    amount = _as_decimal_qty(qty)
    probe = (
        await db.execute(
            select(StockReservation).where(
                StockReservation.id == int(from_reservation_id), StockReservation.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if probe is None or probe.order_id is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if int(probe.order_id) == int(to_order_id):
        raise HTTPException(status_code=422, detail="Source and target order are the same")
    locked_orders = await lock_orders(db, tenant_id, [int(probe.order_id), int(to_order_id)])
    target = locked_orders.get(int(to_order_id))
    if target is None:
        raise HTTPException(status_code=404, detail="Order not found")
    await lock_stock_items(db, tenant_id, [int(probe.item_id)])
    src = (
        await db.execute(
            select(StockReservation)
            .where(StockReservation.id == int(from_reservation_id), StockReservation.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if src.status != STATUS_ACTIVE or src.reservation_kind not in (KIND_HARD_ATP, KIND_TENTATIVE):
        raise HTTPException(status_code=409, detail="Only an active hard or tentative hold can be reassigned")
    kind = src.reservation_kind
    effective = [
        h for h in await load_effective_holds(db, tenant_id, [int(src.item_id)]) if h.reservation_id == int(src.id)
    ]
    movable = effective[0].effective_qty if effective else ZERO
    if amount > movable:
        raise HTTPException(status_code=409, detail="Quantity exceeds the source hold that is still unissued")

    state = (await mas.build_order_states(db, tenant_id, [target]))[int(target.id)]
    mas.assert_kind_allowed(target, kind, state)
    lines = [ln for ln in state.lines if ln.item_id == int(src.item_id) and ln.required is not None]
    if not lines:
        raise HTTPException(status_code=409, detail="The target order does not need this item")
    gap_line = None
    for ln in lines:
        if mas.line_shortfall(ln, kind) >= amount:
            gap_line = ln
            break
    if gap_line is None:
        raise HTTPException(status_code=409, detail="Quantity exceeds what the target order still needs")

    expires = src.expires_at if kind == KIND_TENTATIVE else None
    release = await release_hold(db, tenant_id, int(src.id), qty=amount, reason="reassigned", user_id=user_id, lock=False)
    new_row = await create_hold(
        db, tenant_id,
        item_id=int(src.item_id), order_id=int(target.id), bom_item_id=gap_line.bom_item_id, qty=amount,
        kind=kind, user_id=user_id, source=SOURCE_REASSIGN, expires_at=expires,
    )
    return {
        "from_reservation_id": int(src.id),
        "from_order_id": int(src.order_id),
        "to_reservation_id": int(new_row.id),
        "to_order_id": int(target.id),
        "item_id": int(src.item_id),
        "kind": kind,
        "quantity": q4(amount),
        "source_remaining_qty": release.remaining_qty,
    }
