"""Pegging of open purchase-order supply to orders (Manufacturing Intelligence Phase 2, run R2).

A peg promises part of the *not yet received* balance of a PO line (``OpenPoLine.on_order_net``) to one order.

* HARD pegs belong to confirmed orders, TENTATIVE pegs to DRAFT orders (they expire).
* Effective pegs per PO line are capped by the line's open balance in creation order, so a receipt that shrinks the
  balance below the pegs never makes free inbound negative: the excess becomes a conflict (see
  ``allocation_reconcile_service``), never an automatic change.
* Invariant (F-T2): ``free_inbound + hard_pegged_effective = on_order_net`` for every item.
* Pegs of orders that are not open (cancelled, completed ...) and expired TENTATIVE pegs count 0.
* Reads and the create / release writers only touch ``mfg_material_supply_peggings``. No stock movement, valuation or
  voucher is ever created.

Lock order for writers (plan section 8): orders -> stock items (advisory) -> reservations -> PurchaseOrderItem rows
(sorted) -> pegs. Callers take the earlier locks; ``create_peg`` takes the PO line lock and then the peg lock.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MfgMaterialSupplyPegging, Order, PurchaseOrderItem
from app.models.mfg_planning import (
    PEG_HARD,
    PEG_STATUS_ACTIVE,
    PEG_STATUS_RELEASED,
    PEG_TENTATIVE,
)
from app.modules.inventory.open_po_supply_service import (
    OPEN_PO_STATUSES,
    ZERO,
    ItemInbound,
    OpenPoLine,
    inbound_by_item,
    q4,
    to_decimal,
)

OPEN_PEG_ORDER_STATUSES: frozenset[str] = frozenset({"NEW", "CONFIRMED", "IN_PROGRESS", "DRAFT"})


@dataclass
class PegLineView:
    po_line_id: int
    on_order_net: Decimal
    hard_effective: Decimal = ZERO
    tentative_effective: Decimal = ZERO

    @property
    def free(self) -> Decimal:
        return q4(max(ZERO, self.on_order_net - self.hard_effective))


@dataclass
class ItemPegTotals:
    """Effective pegged supply of one item (own order excluded when ``own_order_id`` was given)."""

    item_id: int
    hard: Decimal = ZERO
    tentative: Decimal = ZERO
    lines: dict[int, PegLineView] = field(default_factory=dict)


@dataclass(frozen=True)
class EffectivePeg:
    peg_id: int
    order_id: int
    item_id: int
    po_line_id: int | None
    bom_item_id: int | None
    kind: str
    pegged_qty: Decimal
    effective_qty: Decimal
    lock_version: int


async def load_effective_pegs(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    inbound: dict[int, ItemInbound] | None = None,
    now: datetime | None = None,
) -> tuple[list[EffectivePeg], dict[int, PegLineView]]:
    """Effective (capped) pegs of the items plus the per-line views. ``inbound`` may be passed to avoid a re-read."""
    ids = sorted({int(i) for i in item_ids})
    if not ids:
        return [], {}
    now = now or datetime.utcnow()
    if inbound is None:
        inbound = await inbound_by_item(db, tenant_id, ids)
    line_net: dict[int, Decimal] = {}
    for slot in inbound.values():
        for ln in slot.lines:
            line_net[ln.po_line_id] = ln.on_order_net
    views: dict[int, PegLineView] = {lid: PegLineView(lid, net) for lid, net in line_net.items()}

    rows = (
        await db.execute(
            select(MfgMaterialSupplyPegging, Order.status)
            .join(Order, (Order.id == MfgMaterialSupplyPegging.order_id) & (Order.tenant_id == tenant_id))
            .where(
                MfgMaterialSupplyPegging.tenant_id == tenant_id,
                MfgMaterialSupplyPegging.item_id.in_(ids),
                MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
            )
            .order_by(MfgMaterialSupplyPegging.created_at, MfgMaterialSupplyPegging.id)
        )
    ).all()

    out: list[EffectivePeg] = []
    # hard pegs consume the line balance first (creation order), tentative pegs only what is left
    for kind in (PEG_HARD, PEG_TENTATIVE):
        for peg, order_status in rows:
            if peg.peg_kind != kind:
                continue
            if (order_status or "").upper() not in OPEN_PEG_ORDER_STATUSES:
                continue
            if kind == PEG_TENTATIVE and peg.expires_at is not None and peg.expires_at <= now:
                continue
            lid = int(peg.purchase_order_item_id) if peg.purchase_order_item_id is not None else None
            view = views.get(lid) if lid is not None else None
            qty = max(ZERO, to_decimal(peg.pegged_qty))
            if view is None:
                eff = ZERO  # PO line gone, not open, or out of scope: the peg supports nothing
            elif kind == PEG_HARD:
                eff = min(qty, max(ZERO, view.on_order_net - view.hard_effective))
                view.hard_effective += eff
            else:
                eff = min(qty, max(ZERO, view.on_order_net - view.hard_effective - view.tentative_effective))
                view.tentative_effective += eff
            out.append(
                EffectivePeg(
                    peg_id=int(peg.id),
                    order_id=int(peg.order_id),
                    item_id=int(peg.item_id),
                    po_line_id=lid,
                    bom_item_id=int(peg.bom_item_id) if peg.bom_item_id is not None else None,
                    kind=kind,
                    pegged_qty=q4(qty),
                    effective_qty=q4(eff),
                    lock_version=int(peg.lock_version or 0),
                )
            )
    return out, views


async def pegged_supply_by_item(
    db: AsyncSession,
    tenant_id: int,
    item_ids: Iterable[int],
    *,
    own_order_id: int | None = None,
    inbound: dict[int, ItemInbound] | None = None,
    now: datetime | None = None,
) -> dict[int, ItemPegTotals]:
    """Hard / tentative effective pegged quantity per item. ``own_order_id`` adds the order's own pegs back."""
    ids = sorted({int(i) for i in item_ids})
    totals = {i: ItemPegTotals(item_id=i) for i in ids}
    pegs, views = await load_effective_pegs(db, tenant_id, ids, inbound=inbound, now=now)
    for p in pegs:
        if own_order_id is not None and p.order_id == int(own_order_id):
            continue
        slot = totals[p.item_id]
        if p.kind == PEG_HARD:
            slot.hard += p.effective_qty
        else:
            slot.tentative += p.effective_qty
    for p in pegs:
        if p.po_line_id is not None and p.po_line_id in views:
            totals[p.item_id].lines[p.po_line_id] = views[p.po_line_id]
    return {i: ItemPegTotals(i, q4(t.hard), q4(t.tentative), t.lines) for i, t in totals.items()}


def free_inbound_for(inbound: ItemInbound | None, pegs: ItemPegTotals | None) -> Decimal:
    """free_inbound = on_order_net - hard_pegged_effective (never negative)."""
    net = inbound.on_order_net if inbound is not None else ZERO
    hard = pegs.hard if pegs is not None else ZERO
    return q4(max(ZERO, net - hard))


# --------------------------------------------------------------------------- writers


def _validate_reason(reason: str | None) -> str | None:
    text = (reason or "").strip()
    return text or None


async def lock_po_lines(db: AsyncSession, tenant_id: int, line_ids: Iterable[int]) -> dict[int, PurchaseOrderItem]:
    """Lock PurchaseOrderItem rows (sorted ids, tenant scoped). Returns the locked rows by id."""
    ids = sorted({int(i) for i in line_ids})
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(PurchaseOrderItem)
            .where(PurchaseOrderItem.tenant_id == tenant_id, PurchaseOrderItem.id.in_(ids))
            .order_by(PurchaseOrderItem.id)
            .with_for_update()
        )
    ).scalars().all()
    return {int(r.id): r for r in rows}


async def create_peg(
    db: AsyncSession,
    tenant_id: int,
    *,
    po_line: OpenPoLine,
    order_id: int,
    bom_item_id: int | None,
    kind: str,
    qty: Decimal,
    user_id: int | None,
    expires_at: datetime | None = None,
    reason: str | None = None,
) -> MfgMaterialSupplyPegging:
    """Create or top up the ACTIVE peg of (PO line, order, BOM line, kind). The PO line must already be locked."""
    if kind not in (PEG_HARD, PEG_TENTATIVE):
        raise HTTPException(status_code=422, detail="Invalid peg kind")
    qty = q4(to_decimal(qty))
    if qty <= ZERO:
        raise HTTPException(status_code=422, detail="Peg quantity must be positive")
    if kind == PEG_TENTATIVE and expires_at is None:
        raise HTTPException(status_code=422, detail="A tentative peg needs an expiry date")
    stmt = (
        select(MfgMaterialSupplyPegging)
        .where(
            MfgMaterialSupplyPegging.tenant_id == tenant_id,
            MfgMaterialSupplyPegging.purchase_order_item_id == po_line.po_line_id,
            MfgMaterialSupplyPegging.order_id == order_id,
            MfgMaterialSupplyPegging.peg_kind == kind,
            MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
        )
        .with_for_update()
    )
    if bom_item_id is None:
        stmt = stmt.where(MfgMaterialSupplyPegging.bom_item_id.is_(None))
    else:
        stmt = stmt.where(MfgMaterialSupplyPegging.bom_item_id == bom_item_id)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        existing.pegged_qty = q4(to_decimal(existing.pegged_qty) + qty)
        existing.lock_version = int(existing.lock_version or 0) + 1
        if expires_at is not None:
            existing.expires_at = expires_at
        await db.flush()
        return existing
    row = MfgMaterialSupplyPegging(
        tenant_id=tenant_id,
        purchase_order_item_id=po_line.po_line_id,
        purchase_order_id=po_line.po_id,
        item_id=po_line.item_id,
        order_id=order_id,
        bom_item_id=bom_item_id,
        peg_kind=kind,
        pegged_qty=qty,
        status=PEG_STATUS_ACTIVE,
        expires_at=expires_at,
        reason=_validate_reason(reason),
        created_by_user_id=user_id,
    )
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # a concurrent writer created the same ACTIVE peg first: top that one up instead
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Peg could not be created, retry")
        existing.pegged_qty = q4(to_decimal(existing.pegged_qty) + qty)
        existing.lock_version = int(existing.lock_version or 0) + 1
        await db.flush()
        return existing
    return row


async def release_peg(
    db: AsyncSession,
    tenant_id: int,
    peg_id: int,
    *,
    reason: str | None,
    user_id: int | None,
    expected_lock_version: int | None = None,
    lock: bool = True,
) -> tuple[MfgMaterialSupplyPegging, bool]:
    """Release one ACTIVE peg (full). Idempotent: an already released peg returns ``(row, False)``."""
    stmt = select(MfgMaterialSupplyPegging).where(
        MfgMaterialSupplyPegging.id == int(peg_id), MfgMaterialSupplyPegging.tenant_id == tenant_id
    )
    if lock:
        stmt = stmt.with_for_update()
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Peg not found")
    if row.status != PEG_STATUS_ACTIVE:
        return row, False
    if expected_lock_version is not None and int(row.lock_version or 0) != int(expected_lock_version):
        raise HTTPException(status_code=409, detail="The peg changed, reload and retry")
    row.status = PEG_STATUS_RELEASED
    row.release_reason = _validate_reason(reason)
    row.released_by_user_id = user_id
    row.released_at = datetime.utcnow()
    row.lock_version = int(row.lock_version or 0) + 1
    await db.flush()
    return row, True


async def active_pegs_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> list[MfgMaterialSupplyPegging]:
    return list(
        (
            await db.execute(
                select(MfgMaterialSupplyPegging)
                .where(
                    MfgMaterialSupplyPegging.tenant_id == tenant_id,
                    MfgMaterialSupplyPegging.order_id == order_id,
                    MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
                )
                .order_by(MfgMaterialSupplyPegging.id)
            )
        )
        .scalars()
        .all()
    )


async def peg_eta_by_line(db: AsyncSession, tenant_id: int, po_line_ids: Iterable[int]) -> dict[int, tuple[date | None, str, str | None]]:
    """(expected date, ETA source, PO code) per PO line, via the open-supply ETA chain (open lines only)."""
    from app.modules.inventory.open_po_supply_service import load_open_po_lines

    ids = sorted({int(i) for i in po_line_ids})
    if not ids:
        return {}
    item_ids = (
        await db.execute(
            select(PurchaseOrderItem.item_id).where(PurchaseOrderItem.tenant_id == tenant_id, PurchaseOrderItem.id.in_(ids))
        )
    ).scalars().all()
    lines = await load_open_po_lines(db, tenant_id, list({int(i) for i in item_ids}))
    wanted = set(ids)
    return {ln.po_line_id: (ln.expected_date, ln.eta_source, ln.po_code) for ln in lines if ln.po_line_id in wanted}


__all__ = [
    "OPEN_PEG_ORDER_STATUSES",
    "OPEN_PO_STATUSES",
    "EffectivePeg",
    "ItemPegTotals",
    "PegLineView",
    "active_pegs_for_order",
    "create_peg",
    "free_inbound_for",
    "load_effective_pegs",
    "lock_po_lines",
    "peg_eta_by_line",
    "pegged_supply_by_item",
    "release_peg",
]
