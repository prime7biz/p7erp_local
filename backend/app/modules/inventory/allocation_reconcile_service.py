"""Allocation conflicts and lifecycle (Manufacturing Intelligence Phase 2, run R2). Flag: ``mfg_material_allocation_v1``.

* ``list_conflicts`` is read-only. Codes:
  PEG_EXCEEDS_OPEN_SUPPLY      a HARD peg is larger than the open balance of its PO line (or the line is gone / not open)
  ORDER_CANCELLED / ORDER_NOT_OPEN   an ACTIVE hold or peg belongs to an order that is cancelled / no longer open
  BOM_LINE_REMOVED             an ACTIVE hold points at a BOM line that is not in the order's active Order BOM
  ALLOCATED_ABOVE_REQUIREMENT  issued + holds + pegs of an item exceed what the order's BOM needs
  TENTATIVE_EXPIRED            a TENTATIVE hold / peg is past its expiry
  HOLD_ABOVE_USABLE_ON_HAND    hard holds of an item exceed its usable on-hand stock (holds never block issues)
  Peg conflicts are never fixed automatically.
* ``release_for_order`` releases every ACTIVE hold and peg of one order. Idempotent; takes no item locks (the order
  cancel hook must never wait on stock postings).
* ``apply_lifecycle`` (for the R4 job) expires TENTATIVE rows and releases rows of non-open orders / removed PO lines.

Nothing here moves stock or creates valuation entries or vouchers.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import is_mfg_material_allocation_v1_enabled
from app.models import BomItem, Item, MfgMaterialSupplyPegging, Order, StockReservation
from app.models.mfg_planning import PEG_HARD, PEG_STATUS_ACTIVE, PEG_STATUS_RELEASED, PEG_TENTATIVE
from app.modules.audit.service import log_action
from app.modules.inventory import material_allocation_service as mas
from app.modules.inventory import pegging_service
from app.modules.inventory.open_po_supply_service import ZERO, q4, to_decimal
from app.modules.inventory.reservation_service import KIND_TENTATIVE, STATUS_ACTIVE

logger = logging.getLogger(__name__)

TOLERANCE = Decimal("0.0001")
MAX_SCAN_ROWS = 2000
MAX_SCAN_ORDERS = 200


def _item(code: str, severity: str, *, order_id=None, item_id=None, reservation_id=None, peg_id=None, qty=None, detail="") -> dict:
    return {
        "code": code,
        "severity": severity,
        "order_id": order_id,
        "item_id": item_id,
        "reservation_id": reservation_id,
        "peg_id": peg_id,
        "quantity": q4(qty) if qty is not None else None,
        "detail": detail,
    }


async def list_conflicts(db: AsyncSession, tenant_id: int, *, now: datetime | None = None, limit: int = 500) -> dict[str, Any]:
    """Read-only conflict list (bounded). Returns ``{"items": [...], "truncated": bool}``."""
    now = now or datetime.utcnow()
    items: list[dict] = []

    # --- holds
    hold_rows = (
        await db.execute(
            select(StockReservation, Order.status)
            .outerjoin(Order, (Order.id == StockReservation.order_id) & (Order.tenant_id == tenant_id))
            .where(
                StockReservation.tenant_id == tenant_id,
                StockReservation.status == STATUS_ACTIVE,
                StockReservation.order_id.isnot(None),
            )
            .order_by(StockReservation.id)
            .limit(MAX_SCAN_ROWS)
        )
    ).all()
    order_ids = sorted({int(r.order_id) for r, _s in hold_rows})
    boms = await mas._active_order_boms(db, tenant_id, order_ids)
    bom_line_ids: dict[int, set[int]] = {}
    if boms:
        for bom_id, line_id in (
            await db.execute(
                select(BomItem.bom_id, BomItem.id).where(
                    BomItem.tenant_id == tenant_id, BomItem.bom_id.in_([int(b.id) for b in boms.values()])
                )
            )
        ).all():
            bom_line_ids.setdefault(int(bom_id), set()).add(int(line_id))
    for r, order_status in hold_rows:
        status = (order_status or "").strip().upper()
        if status not in mas.OPEN_STATUSES:
            code = "ORDER_CANCELLED" if status == "CANCELLED" else "ORDER_NOT_OPEN"
            items.append(_item(code, "WARNING", order_id=int(r.order_id), item_id=int(r.item_id), reservation_id=int(r.id),
                               qty=to_decimal(r.reserved_qty), detail=f"Order status {status or 'UNKNOWN'}; release the hold"))
            continue
        if r.reservation_kind == KIND_TENTATIVE and r.expires_at is not None and r.expires_at <= now:
            items.append(_item("TENTATIVE_EXPIRED", "INFO", order_id=int(r.order_id), item_id=int(r.item_id),
                               reservation_id=int(r.id), qty=to_decimal(r.reserved_qty), detail="Tentative hold expired"))
            continue
        bom = boms.get(int(r.order_id))
        lines = bom_line_ids.get(int(bom.id), set()) if bom else set()
        if bom is not None and (r.bom_item_id is None or int(r.bom_item_id) not in lines):
            items.append(_item("BOM_LINE_REMOVED", "WARNING", order_id=int(r.order_id), item_id=int(r.item_id),
                               reservation_id=int(r.id), qty=to_decimal(r.reserved_qty),
                               detail="The hold's BOM line is not in the active Order BOM"))

    # --- pegs
    peg_rows = (
        await db.execute(
            select(MfgMaterialSupplyPegging, Order.status)
            .join(Order, (Order.id == MfgMaterialSupplyPegging.order_id) & (Order.tenant_id == tenant_id))
            .where(MfgMaterialSupplyPegging.tenant_id == tenant_id, MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE)
            .order_by(MfgMaterialSupplyPegging.id)
            .limit(MAX_SCAN_ROWS)
        )
    ).all()
    if peg_rows:
        peg_items = sorted({int(p.item_id) for p, _s in peg_rows})
        eff, _views = await pegging_service.load_effective_pegs(db, tenant_id, peg_items, now=now)
        eff_by_id = {e.peg_id: e for e in eff}
        for p, order_status in peg_rows:
            status = (order_status or "").strip().upper()
            e = eff_by_id.get(int(p.id))
            if status not in mas.OPEN_STATUSES:
                code = "ORDER_CANCELLED" if status == "CANCELLED" else "ORDER_NOT_OPEN"
                items.append(_item(code, "WARNING", order_id=int(p.order_id), item_id=int(p.item_id), peg_id=int(p.id),
                                   qty=to_decimal(p.pegged_qty), detail=f"Order status {status or 'UNKNOWN'}; release the peg"))
                continue
            if p.peg_kind == PEG_TENTATIVE and p.expires_at is not None and p.expires_at <= now:
                items.append(_item("TENTATIVE_EXPIRED", "INFO", order_id=int(p.order_id), item_id=int(p.item_id),
                                   peg_id=int(p.id), qty=to_decimal(p.pegged_qty), detail="Tentative peg expired"))
                continue
            if p.peg_kind == PEG_HARD and e is not None and e.effective_qty + TOLERANCE < q4(to_decimal(p.pegged_qty)):
                items.append(_item("PEG_EXCEEDS_OPEN_SUPPLY", "CRITICAL", order_id=int(p.order_id), item_id=int(p.item_id),
                                   peg_id=int(p.id), qty=q4(to_decimal(p.pegged_qty)) - e.effective_qty,
                                   detail="Open PO balance is smaller than the pegged quantity (receipt, cancel or PO change)"))

    # --- requirement and on-hand checks (bounded)
    scan_orders = sorted(
        {int(r.order_id) for r, s in hold_rows if (s or "").strip().upper() in mas.OPEN_STATUSES}
        | {int(p.order_id) for p, s in peg_rows if (s or "").strip().upper() in mas.OPEN_STATUSES}
    )[:MAX_SCAN_ORDERS]
    if scan_orders:
        orders = list(
            (await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(scan_orders)))).scalars().all()
        )
        states = await mas.build_order_states(db, tenant_id, orders, now=now)
        for oid, st in states.items():
            by_item: dict[int, dict[str, Decimal]] = {}
            for ln in st.lines:
                slot = by_item.setdefault(ln.item_id, {"req": ZERO, "issued": ZERO})
                slot["req"] += ln.required or ZERO
                slot["issued"] += ln.issued
            for h in st.holds:
                by_item.setdefault(h.item_id, {"req": ZERO, "issued": ZERO}).setdefault("held", ZERO)
                by_item[h.item_id]["held"] = by_item[h.item_id].get("held", ZERO) + h.effective_qty
            for p in st.pegs:
                slot = by_item.setdefault(p.item_id, {"req": ZERO, "issued": ZERO})
                slot["held"] = slot.get("held", ZERO) + p.effective_qty
            for iid, slot in by_item.items():
                if slot["req"] <= ZERO:
                    continue
                covered = slot["issued"] + slot.get("held", ZERO)
                if covered > slot["req"] + TOLERANCE:
                    items.append(_item("ALLOCATED_ABOVE_REQUIREMENT", "WARNING", order_id=oid, item_id=iid,
                                       qty=covered - slot["req"], detail="Issued + held + pegged exceeds the BOM requirement"))

        hold_items = sorted({int(r.item_id) for r, _s in hold_rows})
        supply = await mas.load_supply(db, tenant_id, hold_items, now)
        for iid in hold_items:
            over = supply.hard_all.get(iid, ZERO) - supply.on_hand.get(iid, ZERO)
            if over > TOLERANCE:
                items.append(_item("HOLD_ABOVE_USABLE_ON_HAND", "WARNING", item_id=iid, qty=over,
                                   detail="Hard holds exceed usable on-hand stock"))

    truncated = len(items) > limit or len(hold_rows) >= MAX_SCAN_ROWS or len(peg_rows) >= MAX_SCAN_ROWS
    items = items[:limit]
    await _add_labels(db, tenant_id, items)
    return {"items": items, "truncated": truncated}


async def _add_labels(db: AsyncSession, tenant_id: int, items: list[dict]) -> None:
    """order_code / item_code / item_name for display (tenant-scoped, one query each)."""
    oids = {int(i["order_id"]) for i in items if i.get("order_id")}
    iids = {int(i["item_id"]) for i in items if i.get("item_id")}
    codes: dict[int, str] = {}
    names: dict[int, tuple[str | None, str | None]] = {}
    if oids:
        codes = {
            int(oid): code
            for oid, code in (
                await db.execute(select(Order.id, Order.order_code).where(Order.tenant_id == tenant_id, Order.id.in_(oids)))
            ).all()
        }
    if iids:
        names = {
            int(iid): (code, name)
            for iid, code, name in (
                await db.execute(
                    select(Item.id, Item.item_code, Item.name).where(Item.tenant_id == tenant_id, Item.id.in_(iids))
                )
            ).all()
        }
    for i in items:
        i["order_code"] = codes.get(int(i["order_id"])) if i.get("order_id") else None
        code, name = names.get(int(i["item_id"]), (None, None)) if i.get("item_id") else (None, None)
        i["item_code"], i["item_name"] = code, name


# --------------------------------------------------------------------------- release / lifecycle


async def _release_rows(
    db: AsyncSession,
    tenant_id: int,
    *,
    holds: list[StockReservation],
    pegs: list[MfgMaterialSupplyPegging],
    reason: str,
    user_id: int | None,
) -> tuple[int, int]:
    now = datetime.utcnow()
    for h in holds:
        h.status = "RELEASED"
        h.released_at = now
        h.lock_version = int(h.lock_version or 0) + 1
    for p in pegs:
        p.status = PEG_STATUS_RELEASED
        p.release_reason = reason
        p.released_at = now
        p.released_by_user_id = user_id
        p.lock_version = int(p.lock_version or 0) + 1
    if holds or pegs:
        await db.flush()
    return len(holds), len(pegs)


async def release_for_order(
    db: AsyncSession, tenant_id: int, order_id: int, *, reason: str, user_id: int | None = None
) -> dict[str, int]:
    """Release every ACTIVE hold and peg of the order (idempotent, no item locks)."""
    holds = list(
        (
            await db.execute(
                select(StockReservation)
                .where(
                    StockReservation.tenant_id == tenant_id,
                    StockReservation.order_id == int(order_id),
                    StockReservation.status == STATUS_ACTIVE,
                )
                .order_by(StockReservation.id)
                .with_for_update()
            )
        ).scalars().all()
    )
    pegs = list(
        (
            await db.execute(
                select(MfgMaterialSupplyPegging)
                .where(
                    MfgMaterialSupplyPegging.tenant_id == tenant_id,
                    MfgMaterialSupplyPegging.order_id == int(order_id),
                    MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
                )
                .order_by(MfgMaterialSupplyPegging.id)
                .with_for_update()
            )
        ).scalars().all()
    )
    n_holds, n_pegs = await _release_rows(db, tenant_id, holds=holds, pegs=pegs, reason=reason, user_id=user_id)
    if n_holds or n_pegs:
        await log_action(
            db, tenant_id, "mfg_allocation.release_for_order", user_id=user_id, resource=f"order:{int(order_id)}",
            details=f"{reason}; holds={n_holds} pegs={n_pegs}",
        )
    return {"holds_released": n_holds, "pegs_released": n_pegs}


async def release_allocation_on_cancel(db: AsyncSession, tenant: Any, order: Order, user_id: int | None) -> None:
    """Cancel hook (both order status paths): release inside a savepoint; a failure is logged, the cancel proceeds."""
    if not is_mfg_material_allocation_v1_enabled(getattr(tenant, "feature_flags", None)):
        return
    try:
        async with db.begin_nested():
            await release_for_order(db, int(tenant.id), int(order.id), reason="order cancelled", user_id=user_id)
    except Exception:  # noqa: BLE001 - never fail the cancel because of allocation clean-up
        logger.exception("mfg_allocation cancel hook failed tenant=%s order=%s", getattr(tenant, "id", None), order.id)


async def apply_lifecycle(db: AsyncSession, tenant_id: int, *, now: datetime | None = None) -> dict[str, int]:
    """Housekeeping for the (R4) job; the caller commits. Peg-exceeds-supply conflicts are never auto-fixed."""
    now = now or datetime.utcnow()
    open_statuses = tuple(mas.OPEN_STATUSES)
    stale_holds = list(
        (
            await db.execute(
                select(StockReservation)
                .outerjoin(Order, (Order.id == StockReservation.order_id) & (Order.tenant_id == tenant_id))
                .where(
                    StockReservation.tenant_id == tenant_id,
                    StockReservation.status == STATUS_ACTIVE,
                    ((StockReservation.reservation_kind == KIND_TENTATIVE) & (StockReservation.expires_at <= now))
                    | (StockReservation.order_id.isnot(None) & Order.status.notin_(open_statuses)),
                )
                .order_by(StockReservation.id)
                .limit(MAX_SCAN_ROWS)
                .with_for_update(of=StockReservation)
            )
        ).scalars().all()
    )
    stale_pegs = list(
        (
            await db.execute(
                select(MfgMaterialSupplyPegging)
                .join(Order, (Order.id == MfgMaterialSupplyPegging.order_id) & (Order.tenant_id == tenant_id))
                .where(
                    MfgMaterialSupplyPegging.tenant_id == tenant_id,
                    MfgMaterialSupplyPegging.status == PEG_STATUS_ACTIVE,
                    ((MfgMaterialSupplyPegging.peg_kind == PEG_TENTATIVE) & (MfgMaterialSupplyPegging.expires_at <= now))
                    | Order.status.notin_(open_statuses)
                    | MfgMaterialSupplyPegging.purchase_order_item_id.is_(None),
                )
                .order_by(MfgMaterialSupplyPegging.id)
                .limit(MAX_SCAN_ROWS)
                .with_for_update(of=MfgMaterialSupplyPegging)
            )
        ).scalars().all()
    )
    n_holds, n_pegs = await _release_rows(db, tenant_id, holds=stale_holds, pegs=stale_pegs, reason="lifecycle", user_id=None)
    if n_holds or n_pegs:
        await log_action(db, tenant_id, "mfg_allocation.lifecycle", user_id=None, resource="allocation",
                         details=f"holds={n_holds} pegs={n_pegs}")
    return {"holds_released": n_holds, "pegs_released": n_pegs}


