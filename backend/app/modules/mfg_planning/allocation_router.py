"""Material allocation API (Manufacturing Intelligence Phase 2, run R2).

Prefix ``/api/v1/mfg-intelligence`` (shared with the read-only Phase 1 router in ``mfg_intelligence``).

Every endpoint:
1. needs ``production.planning.read`` (router level) plus the endpoint key listed below
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 unless the tenant flags ``manufacturing_intelligence_v1`` AND ``mfg_material_allocation_v1`` are true
4. checks tenant ownership of every id in the path / body (another tenant's id looks like "not found")
5. never creates stock movements, valuation entries or vouchers (holds and pegs only)

Releasing a HARD hold / peg of a confirmed order and moving held material between orders need the admin / manager
role (``assert_manager_role_only``, enforced even when RBAC is off) and a reason of at least 10 characters.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.document_history import record_doc_event
from app.common.ownership import ensure_owned
from app.common.permissions import assert_manager_role_only, require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Item, MfgMaterialSupplyPegging, Order, StockReservation, Tenant, User
from app.models.mfg_planning import PEG_HARD, PEG_STATUS_ACTIVE
from app.modules.audit.service import log_action
from app.modules.inventory import allocation_reconcile_service as reconcile
from app.modules.inventory import material_allocation_service as mas
from app.modules.inventory import pegging_service
from app.modules.inventory.open_po_supply_service import load_open_po_lines
from app.modules.inventory.reservation_service import (
    CONFIRMED_ORDER_STATUSES,
    KIND_HARD_ATP,
    STATUS_ACTIVE,
    item_allocation_views,
    load_effective_holds,
    lock_orders,
    reassign_between_orders,
    release_hold,
)
from app.modules.inventory.stock_locks import lock_stock_items
from app.modules.mfg_intelligence.decimals import dec_str
from app.modules.mfg_intelligence.flags import require_allocation_enabled
from app.modules.mfg_planning import schemas

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-allocation"],
    dependencies=[Depends(require_internal_permission("production.planning.read"))],
)

MIN_HARD_REASON_LEN = 10


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    require_allocation_enabled(tenant)


def _q(value: Decimal | None) -> str | None:
    return dec_str(value, 4)


def _qs(value: Decimal) -> str:
    return dec_str(value, 4) or "0.0000"


def _reason(reason: str | None, *, required_len: int = 0) -> str | None:
    text = (reason or "").strip()
    if required_len and len(text) < required_len:
        raise HTTPException(status_code=422, detail=f"A reason of at least {required_len} characters is required")
    return text or None


# ------------------------------------------------------------------ serializers


def _plan_out(plan: mas.AllocationPlan) -> dict:
    return {
        "order_id": plan.order_id,
        "order_code": plan.order_code,
        "order_status": plan.order_status,
        "kind": plan.kind,
        "expires_at": plan.expires_at,
        "order_bom_id": plan.bom_id,
        "order_bom_status": plan.bom_status,
        "priority_rank": plan.priority_rank,
        "state_token": plan.token,
        "creates_anything": plan.creates_anything,
        "warnings": plan.warnings,
        "lines": [_line_out(lp.line, lp.shortfall, lp.hold_qty, lp.pegs, lp.remaining) for lp in plan.lines],
    }


def _line_out(line: mas.LineState, shortfall: Decimal, hold_qty: Decimal, pegs: list, remaining: Decimal) -> dict:
    return {
        "bom_item_id": line.bom_item_id,
        "item_id": line.item_id,
        "item_name": line.item_name,
        "category": line.category,
        "uom": line.uom,
        "required_qty": _q(line.required),
        "requirement_source": line.requirement_source,
        "issued_qty": _qs(line.issued),
        "held_qty": _qs(line.hold_hard),
        "tentative_held_qty": _qs(line.hold_tentative),
        "pegged_qty": _qs(line.peg_hard),
        "tentative_pegged_qty": _qs(line.peg_tentative),
        "shortfall_qty": _qs(shortfall),
        "hold_qty": _qs(hold_qty),
        "pegs": [
            {
                "purchase_order_item_id": p.po_line_id,
                "purchase_order_id": p.po_id,
                "po_code": p.po_code,
                "quantity": _qs(p.qty),
                "expected_date": p.expected_date,
                "eta_source": p.eta_source,
            }
            for p in pegs
        ],
        "remaining_short_qty": _qs(remaining),
    }


def _holds_out(rows: list[tuple[StockReservation, object | None]]) -> list[dict]:
    out = []
    for r, eff in rows:
        legacy = r.status in ("HARD", "SOFT")
        out.append(
            {
                "reservation_id": int(r.id),
                "status": r.status,
                "kind": r.reservation_kind or ("HARD_ATP" if r.status == "HARD" else "TENTATIVE" if r.status == "SOFT" else None),
                "source": r.reservation_source,
                "item_id": int(r.item_id),
                "bom_item_id": int(r.bom_item_id) if r.bom_item_id is not None else None,
                "reserved_qty": _qs(Decimal(str(r.reserved_qty))),
                "consumed_qty": _qs(eff.consumed_qty) if eff is not None else None,
                "effective_qty": _qs(eff.effective_qty) if eff is not None else None,
                "expires_at": r.expires_at,
                "lock_version": int(r.lock_version or 0),
                "legacy": legacy,
            }
        )
    return out


def _pegs_out(rows: list[tuple[MfgMaterialSupplyPegging, object | None, tuple | None]]) -> list[dict]:
    out = []
    for p, eff, eta in rows:
        out.append(
            {
                "peg_id": int(p.id),
                "kind": p.peg_kind,
                "item_id": int(p.item_id),
                "bom_item_id": int(p.bom_item_id) if p.bom_item_id is not None else None,
                "purchase_order_item_id": int(p.purchase_order_item_id) if p.purchase_order_item_id is not None else None,
                "po_code": eta[2] if eta else None,
                "pegged_qty": _qs(Decimal(str(p.pegged_qty))),
                "effective_qty": _qs(eff.effective_qty) if eff is not None else None,
                "expected_date": eta[0] if eta else None,
                "eta_source": eta[1] if eta else None,
                "expires_at": p.expires_at,
                "lock_version": int(p.lock_version or 0),
            }
        )
    return out


def _confirm_out(res: mas.ConfirmResult) -> dict:
    return {
        "order_id": res.order_id,
        "kind": res.kind,
        "status": res.status,
        "replayed": res.replayed,
        "holds": [{**h, "quantity": _qs(h["quantity"])} for h in res.holds],
        "pegs": [{**p, "quantity": _qs(p["quantity"])} for p in res.pegs],
        "state_token": res.state_token,
        "after": _plan_out(res.plan),
    }


async def _order_404(db: AsyncSession, tenant: Tenant, order_id: int) -> Order:
    return await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)  # type: ignore[return-value]


# ------------------------------------------------------------------ reads


@router.get(
    "/items/{item_id}/allocation-availability",
    response_model=schemas.ItemAllocationAvailabilityOut,
    dependencies=[Depends(require_internal_permission("inventory.items.read"))],
)
async def item_allocation_availability(
    item_id: int,
    own_order_id: int | None = Query(None, ge=1, description="Add back this order's own holds and pegs"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    item = await ensure_owned(db, Item, item_id, tenant.id, "Item", status_code=404)
    if own_order_id is not None:
        await _order_404(db, tenant, own_order_id)
    view = (await item_allocation_views(db, tenant.id, [item_id], own_order_id=own_order_id))[item_id]
    holds = await load_effective_holds(db, tenant.id, [item_id])
    hold_rows: list[tuple[StockReservation, object | None]] = []
    if holds:
        ids = [h.reservation_id for h in holds][:200]
        eff = {h.reservation_id: h for h in holds}
        rows = (
            await db.execute(
                select(StockReservation).where(StockReservation.tenant_id == tenant.id, StockReservation.id.in_(ids)).order_by(StockReservation.id)
            )
        ).scalars().all()
        hold_rows = [(r, eff.get(int(r.id))) for r in rows]
    lines = await load_open_po_lines(db, tenant.id, [item_id])
    eff_pegs, _views = await pegging_service.load_effective_pegs(db, tenant.id, [item_id])
    peg_rows: list[tuple[MfgMaterialSupplyPegging, object | None, tuple | None]] = []
    if eff_pegs:
        by_id = {p.peg_id: p for p in eff_pegs}
        rows = (
            await db.execute(
                select(MfgMaterialSupplyPegging)
                .where(MfgMaterialSupplyPegging.tenant_id == tenant.id, MfgMaterialSupplyPegging.id.in_(list(by_id)[:200]))
                .order_by(MfgMaterialSupplyPegging.id)
            )
        ).scalars().all()
        eta = {ln.po_line_id: (ln.expected_date, ln.eta_source, ln.po_code) for ln in lines}
        peg_rows = [(p, by_id.get(int(p.id)), eta.get(int(p.purchase_order_item_id)) if p.purchase_order_item_id else None) for p in rows]
    return {
        "item_id": item_id,
        "item_code": item.item_code,
        "item_name": item.name,
        "own_order_id": own_order_id,
        "on_hand_qty": _qs(view.on_hand),
        "hard_reserved_qty": _qs(view.hard_reserved),
        "tentative_reserved_qty": _qs(view.tentative_reserved),
        "on_order_net_qty": _qs(view.on_order_net),
        "hard_pegged_qty": _qs(view.hard_pegged),
        "tentative_pegged_qty": _qs(view.tentative_pegged),
        "free_inbound_qty": _qs(view.free_inbound),
        "pending_qc_qty": _qs(view.pending_qc),
        "pending_po_qty": _qs(view.pending_po),
        "earliest_expected_date": view.earliest_expected_date,
        "atp_hard_qty": _qs(view.atp_hard),
        "atp_stressed_qty": _qs(view.atp_stressed),
        "holds": _holds_out(hold_rows),
        "pegs": _pegs_out(peg_rows),
        "po_lines": [
            {
                "purchase_order_item_id": ln.po_line_id,
                "po_code": ln.po_code,
                "ordered_qty": _qs(ln.ordered),
                "usable_received_qty": _qs(ln.usable_received),
                "pending_qc_qty": _qs(ln.pending_qc),
                "on_order_net_qty": _qs(ln.on_order_net),
                "expected_date": ln.expected_date,
                "eta_source": ln.eta_source,
            }
            for ln in lines
        ],
    }


@router.get(
    "/orders/{order_id}/materials/allocation",
    response_model=schemas.AllocationStateOut,
    dependencies=[Depends(require_internal_permission("inventory.items.read"))],
)
async def order_allocation(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    order = await _order_404(db, tenant, order_id)
    data = await mas.order_allocation_state(db, tenant.id, order)
    state: mas.OrderState = data["state"]
    kind = data["kind"]
    return {
        "order_id": int(order.id),
        "order_code": order.order_code,
        "order_status": (order.status or "").strip().upper(),
        "order_bom_id": int(state.bom.id) if state.bom else None,
        "order_bom_status": (state.bom.status or "").strip().upper() if state.bom else None,
        "order_bom_usable": state.bom_ok,
        "default_kind": kind,
        "priority_rank": data["priority_rank"],
        "priority_date": data["priority_key_date"],
        "lines": [
            _line_out(ln, mas.line_shortfall(ln, kind), Decimal("0"), [], mas.line_shortfall(ln, kind)) for ln in state.lines
        ],
        "holds": _holds_out(data["reservations"]),
        "pegs": _pegs_out(data["pegs"]),
    }


@router.get(
    "/materials/conflicts",
    response_model=schemas.ConflictListOut,
    dependencies=[Depends(require_internal_permission("inventory.items.read"))],
)
async def allocation_conflicts(
    limit: int = Query(200, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    data = await reconcile.list_conflicts(db, tenant.id, limit=limit)
    return {
        "items": [{**i, "quantity": _q(i["quantity"]) if i["quantity"] is not None else None} for i in data["items"]],
        "truncated": data["truncated"],
    }


# ------------------------------------------------------------------ allocate (order)


@router.post(
    "/orders/{order_id}/materials/allocate-preview",
    response_model=schemas.AllocationPreviewOut,
    dependencies=[Depends(require_internal_permission("inventory.items.read"))],
)
async def allocate_preview(
    order_id: int,
    body: schemas.AllocatePreviewIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    order = await _order_404(db, tenant, order_id)
    plan = await mas.preview_order_allocation(db, tenant.id, order, body.kind, body.expires_at)
    return _plan_out(plan)


@router.post(
    "/orders/{order_id}/materials/allocate-confirm",
    response_model=schemas.AllocationConfirmOut,
    dependencies=[Depends(require_internal_permission("inventory.items.approve"))],
)
async def allocate_confirm(
    order_id: int,
    body: schemas.AllocateConfirmIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    await _order_404(db, tenant, order_id)
    result = await mas.confirm_order_allocation(
        db, tenant.id, order_id, kind=body.kind, expires_at=body.expires_at, state_token=body.state_token, user_id=user.id
    )
    return _confirm_out(result)


# ------------------------------------------------------------------ allocation run


@router.post(
    "/materials/allocation-run/preview",
    response_model=schemas.AllocationRunPreviewOut,
    dependencies=[Depends(require_internal_permission("inventory.items.read"))],
)
async def allocation_run_preview(
    body: schemas.AllocationRunPreviewIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    for oid in dict.fromkeys(body.order_ids or []):
        await _order_404(db, tenant, oid)
    preview = await mas.preview_allocation_run(
        db, tenant.id, order_ids=body.order_ids, kind=body.kind, expires_at=body.expires_at
    )
    return {
        "kind": preview.kind,
        "expires_at": preview.expires_at,
        "state_token": preview.state_token,
        "truncated": preview.truncated,
        "orders": [
            {
                "order_id": int(p.order.id),
                "order_code": p.order.order_code,
                "skipped_code": p.skipped,
                "skipped_message": p.skipped_message,
                "preview": _plan_out(p.plan) if p.plan else None,
            }
            for p in preview.items
        ],
    }


@router.post(
    "/materials/allocation-run/confirm",
    response_model=schemas.AllocationRunConfirmOut,
    dependencies=[Depends(require_internal_permission("inventory.items.approve"))],
)
async def allocation_run_confirm(
    body: schemas.AllocationRunConfirmIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    for oid in dict.fromkeys(body.order_ids or []):
        await _order_404(db, tenant, oid)
    run = await mas.confirm_allocation_run(
        db, tenant.id, order_ids=body.order_ids, kind=body.kind, expires_at=body.expires_at,
        state_token=body.state_token, user_id=user.id,
    )
    results = [
        {
            **r,
            "holds": [{**h, "quantity": _qs(h["quantity"])} for h in r["holds"]],
            "pegs": [{**p, "quantity": _qs(p["quantity"])} for p in r["pegs"]],
        }
        for r in run.results
    ]
    return {"kind": run.kind, "state_token": run.state_token, "results": results}


# ------------------------------------------------------------------ release / reassign


@router.post(
    "/materials/reservations/{reservation_id}/release",
    response_model=schemas.ReleaseOut,
    dependencies=[Depends(require_internal_permission("production.planning.approve"))],
)
async def release_reservation(
    reservation_id: int,
    body: schemas.ReleaseReservationIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    probe = await ensure_owned(db, StockReservation, reservation_id, tenant.id, "Reservation", status_code=404)
    assert probe is not None
    order = await db.get(Order, probe.order_id) if probe.order_id is not None else None
    if order is not None and order.tenant_id != tenant.id:
        order = None
    hard_of_confirmed = (
        probe.status == STATUS_ACTIVE
        and probe.reservation_kind == KIND_HARD_ATP
        and order is not None
        and (order.status or "").strip().upper() in CONFIRMED_ORDER_STATUSES
    )
    if hard_of_confirmed:
        await assert_manager_role_only(db, user, tenant.id)
    reason = _reason(body.reason, required_len=MIN_HARD_REASON_LEN if hard_of_confirmed else 0)
    if probe.order_id is not None:
        await lock_orders(db, tenant.id, [int(probe.order_id)])
    await lock_stock_items(db, tenant.id, [int(probe.item_id)])
    outcome = await release_hold(
        db, tenant.id, reservation_id, qty=body.quantity, reason=reason, user_id=user.id,
        expected_lock_version=body.expected_lock_version,
    )
    if outcome.changed:
        summary = f"Released {outcome.released_qty} of hold #{reservation_id}" + (f": {reason}" if reason else "")
        await log_action(db, tenant.id, "mfg_allocation.release_hold", user_id=user.id,
                         resource=f"stock_reservation:{reservation_id}", details=summary)
        if probe.order_id is not None:
            await record_doc_event(db, tenant_id=tenant.id, user_id=user.id, doc_type="order", doc_id=int(probe.order_id),
                                   event="material_release", summary=summary, reason=reason)
    return {
        "id": outcome.reservation_id,
        "status": outcome.status,
        "released_qty": _q(outcome.released_qty),
        "remaining_qty": _q(outcome.remaining_qty),
        "lock_version": outcome.lock_version,
        "changed": outcome.changed,
    }


@router.post(
    "/materials/peggings/{peg_id}/release",
    response_model=schemas.ReleaseOut,
    dependencies=[Depends(require_internal_permission("production.planning.approve"))],
)
async def release_pegging(
    peg_id: int,
    body: schemas.ReleasePegIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    probe = await ensure_owned(db, MfgMaterialSupplyPegging, peg_id, tenant.id, "Peg", status_code=404)
    assert probe is not None
    order = await db.get(Order, probe.order_id)
    hard_of_confirmed = (
        probe.status == PEG_STATUS_ACTIVE
        and probe.peg_kind == PEG_HARD
        and order is not None
        and order.tenant_id == tenant.id
        and (order.status or "").strip().upper() in CONFIRMED_ORDER_STATUSES
    )
    if hard_of_confirmed:
        await assert_manager_role_only(db, user, tenant.id)
    reason = _reason(body.reason, required_len=MIN_HARD_REASON_LEN if hard_of_confirmed else 0)
    await lock_orders(db, tenant.id, [int(probe.order_id)])
    row, changed = await pegging_service.release_peg(
        db, tenant.id, peg_id, reason=reason, user_id=user.id, expected_lock_version=body.expected_lock_version
    )
    if changed:
        summary = f"Released peg #{peg_id}" + (f": {reason}" if reason else "")
        await log_action(db, tenant.id, "mfg_allocation.release_peg", user_id=user.id,
                         resource=f"mfg_supply_peg:{peg_id}", details=summary)
        await record_doc_event(db, tenant_id=tenant.id, user_id=user.id, doc_type="order", doc_id=int(probe.order_id),
                               event="material_release", summary=summary, reason=reason)
    return {"id": int(row.id), "status": row.status, "released_qty": None, "remaining_qty": None,
            "lock_version": int(row.lock_version or 0), "changed": changed}


@router.post(
    "/materials/reassign",
    response_model=schemas.ReassignOut,
    dependencies=[Depends(require_internal_permission("inventory.items.approve"))],
)
async def reassign_material(
    body: schemas.ReassignIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    await assert_manager_role_only(db, user, tenant.id)  # admin / manager only, even when RBAC is off
    reason = _reason(body.reason, required_len=MIN_HARD_REASON_LEN)
    await ensure_owned(db, StockReservation, body.from_reservation_id, tenant.id, "Reservation", status_code=404)
    await _order_404(db, tenant, body.to_order_id)
    result = await reassign_between_orders(
        db, tenant.id, from_reservation_id=body.from_reservation_id, to_order_id=body.to_order_id,
        qty=body.quantity, user_id=user.id,
    )
    summary = (
        f"Moved {result['quantity']} of item {result['item_id']} from order {result['from_order_id']} "
        f"to order {result['to_order_id']}: {reason}"
    )
    await log_action(db, tenant.id, "mfg_allocation.reassign", user_id=user.id,
                     resource=f"stock_reservation:{result['from_reservation_id']}", details=summary)
    for oid in (result["from_order_id"], result["to_order_id"]):
        await record_doc_event(db, tenant_id=tenant.id, user_id=user.id, doc_type="order", doc_id=int(oid),
                               event="material_reassign", summary=summary, reason=reason)
    return {**result, "quantity": _qs(result["quantity"]), "source_remaining_qty": _qs(result["source_remaining_qty"])}
