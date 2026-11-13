"""Material readiness v3 (read-only; flag ``mfg_material_allocation_v1``). Plan section 6.

A BOM line is READY only when ``issued (consumption allowlist, net of returns) + this order's effective HARD holds``
covers its requirement. Open purchase orders never make a line ready: when the shortfall is covered by this order's
HARD pegs the line is not ready but gets an expected material date (the latest ETA of those pegs); a shortfall that is
not pegged is ``SUPPLY_NOT_PEGGED``. TENTATIVE holds are information only (``TENTATIVE_HOLD_NOT_READY``).
The shared-supply caveat of Phase 1 (``SHARED_SUPPLY_NOT_ALLOCATED``) no longer applies and is dropped.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, BomItem, Order
from app.modules.inventory import pegging_service
from app.modules.inventory.material_allocation_service import APPROVED_BOM_STATUSES, build_order_states
from app.modules.inventory.reservation_service import item_allocation_views
from app.modules.mfg_intelligence.decimals import ZERO, dec_str
from app.modules.mfg_intelligence.readiness_service import (
    AUTH_ORDER_BOM,
    BLOCKED,
    PARTIAL,
    SHORT_TOLERANCE,
    UNKNOWN,
    MaterialResult,
    _status_from_lines,
    compute_material,
)

SHARED = "SHARED_SUPPLY_NOT_ALLOCATED"


async def compute_material_v3(db: AsyncSession, tenant_id: int, order: Order) -> MaterialResult:
    active_bom = (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.order_id == order.id, Bom.is_active.is_(True))
            .order_by(Bom.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if active_bom is None or (active_bom.status or "").strip().upper() not in APPROVED_BOM_STATUSES:
        # no binding Order BOM: same result as Phase 1 (blocked / style estimate), without the shared-supply caveat
        legacy = await compute_material(db, tenant_id, order)
        legacy.reason_codes = [c for c in legacy.reason_codes if c != SHARED]
        return legacy

    state = (await build_order_states(db, tenant_id, [order]))[int(order.id)]
    unlinked = int(
        (
            await db.execute(
                select(func.count())
                .select_from(BomItem)
                .where(BomItem.tenant_id == tenant_id, BomItem.bom_id == active_bom.id, BomItem.item_id.is_(None))
            )
        ).scalar()
        or 0
    )
    item_ids = sorted({ln.item_id for ln in state.lines})
    views = await item_allocation_views(db, tenant_id, item_ids, own_order_id=order.id) if item_ids else {}
    # ETA of this order's effective hard pegs, per PO line
    eta = await pegging_service.peg_eta_by_line(
        db, tenant_id, [p.po_line_id for p in state.pegs if p.po_line_id is not None]
    )
    hard_pegs_by_item: dict[int, list[Any]] = {}
    for p in state.pegs:
        if p.kind == "HARD" and p.effective_qty > ZERO:
            hard_pegs_by_item.setdefault(p.item_id, []).append(p)

    lines: list[dict[str, Any]] = []
    expected_dates: list[date] = []
    all_dated = True
    any_unpegged = False
    any_tentative = False
    for ln in state.lines[:500]:
        required = ln.required
        ready_qty = ln.issued + ln.hold_hard
        short = max(ZERO, required - ready_qty) if required is not None else None
        ready = None if short is None else short <= SHORT_TOLERANCE
        view = views.get(ln.item_id)
        codes: list[str] = []
        line_date: date | None = None
        if ln.hold_tentative > ZERO or ln.peg_tentative > ZERO:
            any_tentative = True
            codes.append("TENTATIVE_HOLD_NOT_READY")
        if short is not None and not ready:
            pegged = min(short, ln.peg_hard)
            if short - pegged > SHORT_TOLERANCE:
                codes.append("SUPPLY_NOT_PEGGED")
                any_unpegged = True
                all_dated = False
            else:
                dates = []
                unknown = False
                for p in hard_pegs_by_item.get(ln.item_id, []):
                    d = eta.get(p.po_line_id, (None, "", None))[0] if p.po_line_id is not None else None
                    if d is None:
                        unknown = True
                    else:
                        dates.append(d)
                if unknown or not dates:
                    codes.append("SUPPLY_ETA_UNKNOWN")
                    all_dated = False
                else:
                    line_date = max(dates)
                    expected_dates.append(line_date)
        elif short is None:
            all_dated = False
        lines.append(
            {
                "bom_item_id": ln.bom_item_id,
                "item_id": ln.item_id,
                "item_name": ln.item_name,
                "category": ln.category,
                "uom": ln.uom,
                "required_qty": dec_str(required, 4),
                "requirement_source": ln.requirement_source,
                "on_hand_qty": dec_str(view.on_hand, 4) if view else dec_str(ZERO, 4),
                "in_transit_qty": dec_str(view.free_inbound, 4) if view else dec_str(ZERO, 4),
                "available_qty": dec_str(view.atp_hard, 4) if view else dec_str(ZERO, 4),
                "short_qty": dec_str(short, 4),
                "ready": ready,
                # Phase 2 additions (only present with mfg_material_allocation_v1)
                "issued_qty": dec_str(ln.issued, 4),
                "held_qty": dec_str(ln.hold_hard, 4),
                "tentative_held_qty": dec_str(ln.hold_tentative, 4),
                "pegged_qty": dec_str(ln.peg_hard, 4),
                "expected_material_date": line_date,
                "reason_codes": codes,
            }
        )

    status = _status_from_lines(lines)
    reasons: list[str] = []
    detail: str | None = None
    if not lines:
        reasons.append("ORDER_BOM_HAS_NO_ITEMS")
    elif status in (PARTIAL, BLOCKED):
        short_n = sum(1 for x in lines if x["ready"] is False)
        reasons.append("MATERIAL_SHORT")
        detail = f"{short_n} of {len(lines)} material line(s) not covered by issued stock or approved holds"
        if any_unpegged:
            reasons.append("SUPPLY_NOT_PEGGED")
    elif status == UNKNOWN:
        reasons.append("REQUIREMENT_UNKNOWN")
        detail = "Some material requirements cannot be calculated (order quantity or consumption missing)"
    if unlinked:
        reasons.append("BOM_ITEMS_WITHOUT_ITEM_MASTER")

    info = [
        {
            "dimension": "materials_ready",
            "reason": "READY_MEANS_ISSUED_PLUS_OWN_HARD_HOLDS",
            "detail": "A line is ready when issued stock plus this order's approved hard holds cover it; open POs only give an expected date.",
        }
    ]
    if any_tentative:
        info.append({"dimension": "materials_ready", "reason": "TENTATIVE_HOLD_NOT_READY",
                     "detail": "Tentative holds / pegs are shown but never count as ready."})
    short_lines = [x for x in lines if x["ready"] is False]
    expected = max(expected_dates) if expected_dates and all_dated and short_lines else None
    if expected is not None:
        info.append({"dimension": "materials_ready", "reason": "MATERIAL_EXPECTED_DATE", "detail": expected.isoformat()})
    return MaterialResult(
        authority=AUTH_ORDER_BOM,
        status=status,
        reason_codes=reasons,
        detail=detail,
        bom_id=int(active_bom.id),
        bom_status=(active_bom.status or "").strip().upper(),
        lines=lines,
        lines_truncated=len(state.lines) > 500,
        info=info,
        expected_material_date=expected,
        expected_date_complete=bool(short_lines) and all_dated and expected is not None,
    )

