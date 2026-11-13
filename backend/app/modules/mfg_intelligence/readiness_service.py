"""Order production readiness (read-only): dimensions, blockers and informational items.

Material authority (doc 05, section 2):
- flag `mfg_order_bom_readiness_v2` ON and an ACTIVE Order BOM (`boms.order_id = order.id AND is_active`)
  in status APPROVED / FROZEN  -> authority ORDER_BOM (can make the order fully ready)
- active Order BOM that is not approved / frozen -> materials BLOCKED, reason ORDER_BOM_NOT_APPROVED
- no active Order BOM -> latest style BOM is shown as STYLE_ESTIMATE (informational, fully ready impossible)
- flag OFF -> the existing legacy readiness result is returned unchanged under `legacy`

Phase 1 limitation, stated in every material result: stock and open POs are checked per order in isolation
(`SHARED_SUPPLY_NOT_ALLOCATED`).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, GarmentStyle, Item, Order, OrderFollowupAction
from app.modules.inventory.stock_availability_service import compute_items_availability
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_DRAFT,
    CLASS_FIRM,
    CLASS_SOFT,
    demand_class,
    fetch_order_plan_rows,
)
from app.modules.production.readiness_service import get_order_chain_readiness

READY = "READY"
PARTIAL = "PARTIAL"
BLOCKED = "BLOCKED"
UNKNOWN = "UNKNOWN"
NOT_APPLICABLE = "NOT_APPLICABLE"
NOT_EVALUATED = "NOT_EVALUATED"

AUTH_ORDER_BOM = "ORDER_BOM"
AUTH_STYLE_ESTIMATE = "STYLE_ESTIMATE"
AUTH_NONE = "NONE"
AUTH_LEGACY = "LEGACY_STYLE_BOM"

MODE_ORDER_BOM_V2 = "ORDER_BOM_V2"
MODE_LEGACY = "LEGACY_STYLE_BOM"

APPROVED_BOM_STATUSES = ("APPROVED", "FROZEN")
TECHNICAL_APPROVAL_KEYS = (
    "lab_dip_approval",
    "fit_sample_approval",
    "pp_approval",
    "bulk_fabric_approval",
    "accessories_approval",
)
MAX_MATERIAL_LINES = 500
SHORT_TOLERANCE = Decimal("0.001")

DEPT_MERCH = "Merchandising"
DEPT_PROCUREMENT = "Merchandising / Procurement"
DEPT_PLANNING = "Production Planning"

_DIMENSION_LABELS = {
    "commercially_confirmed": "Commercially confirmed",
    "technically_approved": "Technically approved",
    "materials_ready": "Materials ready",
    "capacity_allocated": "Capacity allocated",
    "financially_supported": "Financially supported",
    "fully_ready": "Fully ready",
}


@dataclass
class MaterialResult:
    authority: str
    status: str
    reason_codes: list[str] = field(default_factory=list)
    detail: str | None = None
    bom_id: int | None = None
    bom_status: str | None = None
    lines: list[dict[str, Any]] = field(default_factory=list)
    lines_truncated: bool = False
    info: list[dict[str, Any]] = field(default_factory=list)
    # Phase 2 (flag mfg_material_allocation_v1 only): date by which the pegged open-PO supply is expected, and whether
    # every unready line has such a date. None / False in Phase 1 results.
    expected_material_date: date | None = None
    expected_date_complete: bool = False

    @property
    def informational(self) -> bool:
        return self.authority != AUTH_ORDER_BOM


def _dimension(key: str, status: str, reasons: list[str] | None = None, detail: str | None = None, *, informational: bool = False) -> dict[str, Any]:
    return {
        "key": key,
        "label": _DIMENSION_LABELS[key],
        "status": status,
        "reason_codes": reasons or [],
        "detail": detail,
        "informational": informational,
    }


# ------------------------------------------------------------------ technical approvals


def _action_done(a: OrderFollowupAction) -> bool:
    if a.approval_received_date is not None:
        return True
    if (a.approval_status or "").strip().lower() in ("approved", "pass", "ok", "accepted"):
        return True
    return (a.status or "").strip().lower() in ("completed", "done", "approved", "closed")


def _action_rejected(a: OrderFollowupAction) -> bool:
    return bool(a.is_rejected) or (a.approval_status or "").strip().lower() == "rejected" or (
        (a.status or "").strip().lower() == "rejected"
    )


async def _technical_dimension(db: AsyncSession, tenant_id: int, order_id: int, today: date) -> dict[str, Any]:
    key_expr = func.lower(func.coalesce(OrderFollowupAction.milestone_type, OrderFollowupAction.action_type, ""))
    rows = list(
        (
            await db.execute(
                select(OrderFollowupAction)
                .where(
                    OrderFollowupAction.tenant_id == tenant_id,
                    OrderFollowupAction.order_id == order_id,
                    OrderFollowupAction.is_active.is_(True),
                    key_expr.in_(TECHNICAL_APPROVAL_KEYS),
                )
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    relevant = [a for a in rows if (a.status or "").strip().lower() != "cancelled"]
    if not relevant:
        return _dimension("technically_approved", NOT_APPLICABLE, ["NO_TECHNICAL_APPROVAL_ACTIONS"])
    done = [a for a in relevant if _action_done(a)]
    rejected = [a for a in relevant if not _action_done(a) and _action_rejected(a)]
    overdue = [
        a for a in relevant if not _action_done(a) and not _action_rejected(a) and a.planned_date and a.planned_date < today
    ]
    pending = [a for a in relevant if a not in done]
    detail = f"{len(done)}/{len(relevant)} approvals cleared"
    if rejected:
        return _dimension("technically_approved", BLOCKED, ["APPROVAL_REJECTED"], detail + f"; {len(rejected)} rejected")
    if overdue:
        return _dimension("technically_approved", BLOCKED, ["APPROVAL_OVERDUE"], detail + f"; {len(overdue)} overdue")
    if pending:
        return _dimension("technically_approved", PARTIAL, ["APPROVAL_PENDING"], detail)
    return _dimension("technically_approved", READY, [], detail)


# ------------------------------------------------------------------ materials


def _requirement(order_qty: Decimal | None, item: BomItem) -> tuple[Decimal | None, str]:
    """Required gross quantity and its source. Matches `bom_calculation_service` field names."""
    gross = to_dec(item.required_gross_qty)
    if gross is not None and gross > ZERO:
        return gross, "BOM_REQUIRED_GROSS_QTY"
    if order_qty is None or order_qty <= ZERO:
        return None, "ORDER_QTY_MISSING"
    net = to_dec(item.bom_net_consumption_per_unit)
    if net is None:
        net = to_dec(item.base_consumption)
    if net is None:
        return None, "CONSUMPTION_MISSING"
    wastage = max(ZERO, to_dec(item.wastage_pct) or ZERO)
    loss = max(ZERO, to_dec(item.process_loss_pct) or ZERO)
    factor = Decimal(1) + wastage / Decimal(100) + loss / Decimal(100)
    return quant(order_qty * max(ZERO, net) * factor, 4), "ORDER_QTY_X_NET_X_LOSS"


async def _material_lines(
    db: AsyncSession, tenant_id: int, order: Order, bom: Bom
) -> tuple[list[dict[str, Any]], bool, int, list[str]]:
    """Material lines for one BOM (batched: one query for items, one for names, one for availability)."""
    bom_items = list(
        (
            await db.execute(
                select(BomItem)
                .where(BomItem.tenant_id == tenant_id, BomItem.bom_id == bom.id)
                .order_by(BomItem.sort_order, BomItem.id)
                .limit(MAX_MATERIAL_LINES + 1)
            )
        )
        .scalars()
        .all()
    )
    truncated = len(bom_items) > MAX_MATERIAL_LINES
    bom_items = bom_items[:MAX_MATERIAL_LINES]
    linked = [bi for bi in bom_items if bi.item_id]
    unlinked = len(bom_items) - len(linked)
    item_ids = sorted({int(bi.item_id) for bi in linked})
    names: dict[int, str] = {}
    availability: dict[int, Any] = {}
    if item_ids:
        for iid, name in (
            await db.execute(select(Item.id, Item.name).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))
        ).all():
            names[int(iid)] = name
        availability = await compute_items_availability(
            db,
            tenant_id,
            item_ids,
            warehouse_id=None,
            include_in_transit_po=True,
            exclude_reserved=True,
            own_order_id=order.id,  # only used when mfg_material_allocation_v1 is ON
        )
    order_qty = to_dec(order.quantity)
    lines: list[dict[str, Any]] = []
    for bi in linked:
        required, req_source = _requirement(order_qty, bi)
        slot = availability.get(bi.item_id)
        on_hand = to_dec(slot.on_hand) if slot else ZERO
        in_transit = to_dec(slot.in_transit) if slot else ZERO
        available = to_dec(slot.available) if slot else ZERO
        short = max(ZERO, required - available) if required is not None else None
        ready = None if short is None else short <= SHORT_TOLERANCE
        lines.append(
            {
                "bom_item_id": bi.id,
                "item_id": bi.item_id,
                "item_name": names.get(int(bi.item_id)) or bi.description_snapshot or bi.description,
                "category": bi.category,
                "uom": bi.uom,
                "required_qty": dec_str(required, 4),
                "requirement_source": req_source,
                "on_hand_qty": dec_str(on_hand, 4),
                "in_transit_qty": dec_str(in_transit, 4),
                "available_qty": dec_str(available, 4),
                "short_qty": dec_str(short, 4),
                "ready": ready,
            }
        )
    reasons: list[str] = []
    if unlinked:
        reasons.append("BOM_ITEMS_WITHOUT_ITEM_MASTER")
    return lines, truncated, unlinked, reasons


def _status_from_lines(lines: list[dict[str, Any]]) -> str:
    if not lines:
        return BLOCKED
    short = [x for x in lines if x["ready"] is False]
    unknown = [x for x in lines if x["ready"] is None]
    if short:
        return BLOCKED if len(short) == len(lines) else PARTIAL
    return UNKNOWN if unknown else READY


async def compute_material(db: AsyncSession, tenant_id: int, order: Order) -> MaterialResult:
    """Material dimension with its authority. Used by readiness and by delivery prediction."""
    shared = "SHARED_SUPPLY_NOT_ALLOCATED"
    active_bom = (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.order_id == order.id, Bom.is_active.is_(True))
            .order_by(Bom.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if active_bom is not None:
        bom_status = (active_bom.status or "").strip().upper()
        if bom_status not in APPROVED_BOM_STATUSES:
            return MaterialResult(
                authority=AUTH_ORDER_BOM,
                status=BLOCKED,
                reason_codes=["ORDER_BOM_NOT_APPROVED", shared],
                detail=f"Order BOM is {bom_status or 'UNKNOWN'}; approve or freeze it first",
                bom_id=active_bom.id,
                bom_status=bom_status,
            )
        lines, truncated, _unlinked, extra = await _material_lines(db, tenant_id, order, active_bom)
        status = _status_from_lines(lines)
        reasons: list[str] = []
        detail = None
        if not lines:
            reasons.append("ORDER_BOM_HAS_NO_ITEMS")
        elif status in (PARTIAL, BLOCKED):
            short_n = sum(1 for x in lines if x["ready"] is False)
            reasons.append("MATERIAL_SHORT")
            detail = f"{short_n} of {len(lines)} material line(s) short"
        elif status == UNKNOWN:
            reasons.append("REQUIREMENT_UNKNOWN")
            detail = "Some material requirements cannot be calculated (order quantity or consumption missing)"
        reasons.extend(extra)
        reasons.append(shared)
        info = [{"dimension": "materials_ready", "reason": "AVAILABILITY_INCLUDES_OPEN_PO_SUPPLY",
                 "detail": "Available quantity = on hand + open PO balance - reservations (existing availability rule)."}]
        return MaterialResult(
            authority=AUTH_ORDER_BOM,
            status=status,
            reason_codes=reasons,
            detail=detail,
            bom_id=active_bom.id,
            bom_status=bom_status,
            lines=lines,
            lines_truncated=truncated,
            info=info,
        )

    style_id = order.style_id
    if style_id is None and order.style_ref:
        style_id = (
            await db.execute(
                select(GarmentStyle.id).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.style_code == order.style_ref.strip()
                )
            )
        ).scalar_one_or_none()
    style_bom = None
    if style_id is not None:
        style_bom = (
            await db.execute(
                select(Bom)
                .where(Bom.tenant_id == tenant_id, Bom.style_id == style_id, Bom.order_id.is_(None))
                .order_by(Bom.version_no.desc(), Bom.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if style_bom is None:
        return MaterialResult(
            authority=AUTH_NONE,
            status=UNKNOWN,
            reason_codes=["NO_BOM_FOUND", shared],
            detail="No Order BOM and no style BOM found",
        )
    lines, truncated, _unlinked, extra = await _material_lines(db, tenant_id, order, style_bom)
    return MaterialResult(
        authority=AUTH_STYLE_ESTIMATE,
        status=_status_from_lines(lines),
        reason_codes=["STYLE_ESTIMATE_ONLY", shared, *extra],
        detail="Estimate from the style BOM; create and approve an Order BOM for a binding result",
        bom_id=style_bom.id,
        bom_status=(style_bom.status or "").strip().upper(),
        lines=lines,
        lines_truncated=truncated,
    )


# ------------------------------------------------------------------ capacity dimension


def _capacity_dimension(order: Order, plan_rows: list[Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    firm = [r for r in plan_rows if demand_class(r.reservation_status) == CLASS_FIRM]
    soft = [r for r in plan_rows if demand_class(r.reservation_status) == CLASS_SOFT]
    draft = [r for r in plan_rows if demand_class(r.reservation_status) == CLASS_DRAFT]
    info: list[dict[str, Any]] = []
    if firm:
        planned = sum((to_dec(r.planned_qty) or ZERO for r in firm), ZERO)
        order_qty = to_dec(order.quantity)
        if order_qty is not None and order_qty > ZERO and planned < order_qty:
            info.append(
                {
                    "dimension": "capacity_allocated",
                    "reason": "FIRM_PLANNED_QTY_BELOW_ORDER_QTY",
                    "detail": f"Firm planned {dec_str(planned, 3)} of order quantity {dec_str(order_qty, 3)}",
                }
            )
        return _dimension("capacity_allocated", READY, [], f"{len(firm)} firm line booking(s)"), info
    if soft or draft:
        reason = "ONLY_SOFT_BOOKED" if soft else "ONLY_DRAFT_BOOKED"
        return _dimension("capacity_allocated", PARTIAL, [reason], "No firm line booking yet"), info
    return _dimension("capacity_allocated", BLOCKED, ["NO_LINE_BOOKING"], "Order is not booked on any sewing line"), info


# ------------------------------------------------------------------ main


def _blocker(dim: dict[str, Any], department: str) -> dict[str, Any]:
    return {
        "dimension": dim["key"],
        "reason": (dim["reason_codes"] or [dim["status"]])[0],
        "department": department,
        "detail": dim["detail"],
    }


async def build_order_readiness(
    db: AsyncSession, tenant_id: int, order: Order, *, today: date, order_bom_v2: bool, allocation_v1: bool = False
) -> dict[str, Any]:
    confirmed = is_confirmed_status(order.status)
    commercial = (
        _dimension("commercially_confirmed", READY, [], f"Order status {order.status}")
        if confirmed
        else _dimension("commercially_confirmed", BLOCKED, ["ORDER_NOT_CONFIRMED"], f"Order status {order.status} is not confirmed demand")
    )
    technical = await _technical_dimension(db, tenant_id, order.id, today)
    plan_rows = await fetch_order_plan_rows(db, tenant_id, [order.id])
    capacity, cap_info = _capacity_dimension(order, plan_rows)
    finance = _dimension("financially_supported", NOT_EVALUATED, ["FINANCE_NOT_EVALUATED_PHASE1"])

    info: list[dict[str, Any]] = list(cap_info)
    info.append({"dimension": "financially_supported", "reason": "FINANCE_NOT_EVALUATED_PHASE1", "detail": "Finance coverage is evaluated in a later phase"})
    blockers: list[dict[str, Any]] = []
    legacy: dict[str, Any] | None = None
    lines: list[dict[str, Any]] = []
    lines_truncated = False
    bom_summary: dict[str, Any] | None = None

    if not order_bom_v2:
        materials = _dimension("materials_ready", NOT_EVALUATED, ["ORDER_BOM_READINESS_FLAG_OFF"], "Legacy style-BOM readiness is returned under `legacy`")
        fully = _dimension("fully_ready", NOT_EVALUATED, ["ORDER_BOM_READINESS_FLAG_OFF"])
        legacy = await get_order_chain_readiness(db, tenant_id, order.id)
        mode, authority = MODE_LEGACY, AUTH_LEGACY
    else:
        mode = MODE_ORDER_BOM_V2
        if allocation_v1:
            from app.modules.mfg_intelligence.allocation_readiness_service import compute_material_v3

            mat = await compute_material_v3(db, tenant_id, order)
        else:
            mat = await compute_material(db, tenant_id, order)
        authority = mat.authority
        lines, lines_truncated = mat.lines, mat.lines_truncated
        bom_summary = {"bom_id": mat.bom_id, "status": mat.bom_status}
        materials = _dimension("materials_ready", mat.status, mat.reason_codes, mat.detail, informational=mat.informational)
        info.extend(mat.info)
        if not allocation_v1:
            info.append({"dimension": "materials_ready", "reason": "SHARED_SUPPLY_NOT_ALLOCATED",
                         "detail": "Stock and open POs are checked per order; several orders may count the same supply (fixed in Phase 2)."})
        if mat.authority == AUTH_STYLE_ESTIMATE:
            info.append({"dimension": "materials_ready", "reason": "STYLE_ESTIMATE_ONLY", "detail": mat.detail})
        mandatory = [commercial, technical, capacity] + ([materials] if mat.authority == AUTH_ORDER_BOM else [])
        fully = _fully_ready(mandatory, mat.authority)

    # blockers: mandatory dimensions that are not ready; informational items go to `info`
    for dim, dept in ((commercial, DEPT_MERCH), (technical, DEPT_MERCH), (capacity, DEPT_PLANNING)):
        if dim["status"] in (BLOCKED, PARTIAL, UNKNOWN):
            blockers.append(_blocker(dim, dept))
    if order_bom_v2:
        if authority == AUTH_ORDER_BOM:
            if materials["status"] in (BLOCKED, PARTIAL, UNKNOWN):
                blockers.append(_blocker(materials, DEPT_PROCUREMENT))
        else:
            blockers.append(
                {
                    "dimension": "fully_ready",
                    "reason": "ORDER_BOM_MISSING",
                    "department": DEPT_MERCH,
                    "detail": "No active Order BOM; the order cannot be fully ready on a style estimate",
                }
            )

    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "order_status": (order.status or "").strip().upper(),
        "mode": mode,
        "material_authority": authority,
        "mfg_order_bom_readiness_v2": order_bom_v2,
        "dimensions": [commercial, technical, materials, capacity, finance, fully],
        "blockers": blockers,
        "info": info,
        "material_lines": lines,
        "material_lines_truncated": lines_truncated,
        "order_bom": bom_summary,
        "legacy": legacy,
        "assumptions": (
            [
                "Materials are ready only for issued stock plus this order's own approved hard holds; open purchase orders "
                "give an expected date through hard pegs, never readiness.",
                "Financial support is not evaluated in Phase 1.",
            ]
            if allocation_v1 and order_bom_v2
            else [
                "Phase 1 checks stock and open POs per order in isolation (SHARED_SUPPLY_NOT_ALLOCATED).",
                "Financial support is not evaluated in Phase 1.",
            ]
        ),
    }


def _fully_ready(mandatory: list[dict[str, Any]], authority: str) -> dict[str, Any]:
    statuses = [d["status"] for d in mandatory]
    if authority != AUTH_ORDER_BOM:
        return _dimension("fully_ready", PARTIAL if BLOCKED not in statuses else BLOCKED, ["ORDER_BOM_REQUIRED_FOR_FULL_READINESS"])
    if BLOCKED in statuses:
        return _dimension("fully_ready", BLOCKED, ["MANDATORY_DIMENSION_BLOCKED"])
    if all(s in (READY, NOT_APPLICABLE) for s in statuses):
        return _dimension("fully_ready", READY, [])
    return _dimension("fully_ready", PARTIAL, ["MANDATORY_DIMENSION_NOT_READY"])
