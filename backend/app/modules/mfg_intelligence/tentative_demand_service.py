"""Tentative inquiry / quotation demand on sewing lines (read-only; flag `mfg_integrated_planning_v1`).

Tentative bookings live in their own table (`mfg_tentative_line_bookings`), so no legacy line-booking reader ever
sees them. Phase 1 line loading reads them only when the integrated planning flag is on, and only as SOFT load.

"Counted" means a booking adds load. A booking is NOT counted (reason code) when:
- EXPIRED: status is not ACTIVE, or `expires_at` is in the past (the daily job marks it EXPIRED later);
- CONVERTED: an order already exists for the quotation (`orders.quotation_id`) of the booking or, for an inquiry
  booking, for any quotation of that inquiry;
- QUOTATION_BOOKING_EXISTS: an inquiry booking whose inquiry already has a counted quotation booking;
- SUPERSEDED_QUOTATION: a booking on a quotation revision that a newer revision of the same inquiry replaced.
Order beats quotation beats inquiry, so one piece of demand is never counted twice.

Weighted minutes = total SMV minutes x confidence % (reported next to, never instead of, the full minutes).
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Inquiry, Order, Quotation, SewingLine
from app.models.mfg_planning import TENTATIVE_ACTIVE, MfgTentativeLineBooking
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.scenario import TENTATIVE_ROW_ID_BASE, TentativeRow
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows

MAX_TENTATIVE_ROWS = 2000
LOOKBACK_DAYS = 60

REASON_EXPIRED = "EXPIRED"
REASON_CONVERTED = "CONVERTED"
REASON_QUOTATION_EXISTS = "QUOTATION_BOOKING_EXISTS"
REASON_SUPERSEDED = "SUPERSEDED_QUOTATION"

HUNDRED = Decimal("100")


@dataclass
class _Chain:
    booking_quotation: dict[int, int | None]  # quotation id -> inquiry id (any version)
    orders_by_quotation: dict[int, int]  # quotation id -> order id
    quotations_by_inquiry: dict[int, list[tuple[int, bool]]]  # inquiry id -> [(quotation id, is_current)]


async def _load_chain(db: AsyncSession, tenant_id: int, bookings: list[MfgTentativeLineBooking]) -> _Chain:
    inquiry_ids = {int(b.inquiry_id) for b in bookings if b.inquiry_id}
    quotation_ids = {int(b.quotation_id) for b in bookings if b.quotation_id}
    booking_quotation: dict[int, int | None] = {}
    quotations_by_inquiry: dict[int, list[tuple[int, bool]]] = defaultdict(list)
    if quotation_ids:
        for qid, iid in (
            await db.execute(select(Quotation.id, Quotation.inquiry_id).where(Quotation.tenant_id == tenant_id, Quotation.id.in_(quotation_ids)))
        ).all():
            booking_quotation[int(qid)] = int(iid) if iid else None
            if iid:
                inquiry_ids.add(int(iid))
    if inquiry_ids:
        for qid, iid, superseded in (
            await db.execute(
                select(Quotation.id, Quotation.inquiry_id, Quotation.superseded_at).where(
                    Quotation.tenant_id == tenant_id, Quotation.inquiry_id.in_(inquiry_ids)
                )
            )
        ).all():
            booking_quotation.setdefault(int(qid), int(iid))
            quotations_by_inquiry[int(iid)].append((int(qid), superseded is None))
    all_q = set(booking_quotation)
    orders_by_quotation: dict[int, int] = {}
    if all_q:
        for oid, qid in (
            await db.execute(
                select(Order.id, Order.quotation_id)
                .where(Order.tenant_id == tenant_id, Order.quotation_id.in_(all_q))
                .order_by(Order.id)
            )
        ).all():
            orders_by_quotation.setdefault(int(qid), int(oid))
    return _Chain(booking_quotation, orders_by_quotation, quotations_by_inquiry)


async def evaluate_bookings(
    db: AsyncSession,
    tenant_id: int,
    bookings: list[MfgTentativeLineBooking],
    *,
    now: datetime | None = None,
) -> dict[int, tuple[str | None, int | None]]:
    """booking id -> (reason it is NOT counted or None when counted, order id when converted)."""
    now = now or datetime.utcnow()
    chain = await _load_chain(db, tenant_id, bookings)
    result: dict[int, tuple[str | None, int | None]] = {}

    def order_for(b: MfgTentativeLineBooking) -> int | None:
        if b.quotation_id and int(b.quotation_id) in chain.orders_by_quotation:
            return chain.orders_by_quotation[int(b.quotation_id)]
        # an order from any revision of the same inquiry converts the whole chain
        iid = b.inquiry_id or (chain.booking_quotation.get(int(b.quotation_id)) if b.quotation_id else None)
        if iid:
            for qid, _cur in chain.quotations_by_inquiry.get(int(iid), []):
                if qid in chain.orders_by_quotation:
                    return chain.orders_by_quotation[qid]
        return None

    live = [b for b in bookings if b.status == TENTATIVE_ACTIVE and b.expires_at > now]
    for b in bookings:
        if b not in live:
            result[b.id] = (REASON_EXPIRED if b.status == TENTATIVE_ACTIVE or b.status == "EXPIRED" else b.status, None)
    # 1. converted
    remaining: list[MfgTentativeLineBooking] = []
    for b in live:
        oid = order_for(b)
        if oid is not None:
            result[b.id] = (REASON_CONVERTED, oid)
        else:
            remaining.append(b)
    # 2. quotation revisions: on a current quotation only
    current_by_inquiry: dict[int, set[int]] = {
        iid: {qid for qid, cur in qs if cur} for iid, qs in chain.quotations_by_inquiry.items()
    }
    after_rev: list[MfgTentativeLineBooking] = []
    for b in remaining:
        if b.quotation_id:
            iid = chain.booking_quotation.get(int(b.quotation_id))
            cur = current_by_inquiry.get(iid, set()) if iid else set()
            has_current_booking = any(
                x.quotation_id and int(x.quotation_id) in cur for x in remaining
            )
            if iid and cur and int(b.quotation_id) not in cur and has_current_booking:
                result[b.id] = (REASON_SUPERSEDED, None)
                continue
        after_rev.append(b)
    # 3. inquiry booking loses to a counted quotation booking of the same inquiry
    quotation_inquiries = {
        chain.booking_quotation.get(int(b.quotation_id)) for b in after_rev if b.quotation_id
    }
    for b in after_rev:
        if b.inquiry_id and int(b.inquiry_id) in quotation_inquiries:
            result[b.id] = (REASON_QUOTATION_EXISTS, None)
        else:
            result[b.id] = (None, None)
    return result


def _end(b: MfgTentativeLineBooking) -> date:
    return b.planned_end_date or b.start_date


async def fetch_tentative_rows(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    line_ids: Iterable[int] | None = None,
    now: datetime | None = None,
) -> list[TentativeRow]:
    """Counted tentative bookings overlapping the window as SOFT line-loading rows (read-only)."""
    now = now or datetime.utcnow()
    b = MfgTentativeLineBooking
    stmt = select(b).where(
        b.tenant_id == tenant_id,
        b.status == TENTATIVE_ACTIVE,
        b.expires_at > now,
        b.start_date <= window_end,
        func.coalesce(b.planned_end_date, b.start_date) >= window_start - timedelta(days=LOOKBACK_DAYS),
    )
    if line_ids is not None:
        ids = list(line_ids)
        if not ids:
            return []
        stmt = stmt.where(b.line_id.in_(ids))
    stmt = stmt.order_by(b.start_date, b.id).limit(MAX_TENTATIVE_ROWS)
    bookings = list((await db.execute(stmt)).scalars().all())
    if not bookings:
        return []
    verdict = await evaluate_bookings(db, tenant_id, bookings, now=now)
    rows: list[TentativeRow] = []
    for bk in bookings:
        if verdict.get(bk.id, (None, None))[0] is not None:
            continue
        rows.append(
            TentativeRow(
                id=TENTATIVE_ROW_ID_BASE - int(bk.id),
                tenant_id=tenant_id,
                line_id=int(bk.line_id),
                style_id=bk.style_id,
                ob_id=bk.ob_id,
                shift_id=bk.shift_id,
                start_date=bk.start_date,
                planned_end_date=bk.planned_end_date,
                planned_qty=to_dec(bk.planned_qty) or ZERO,
                smv_per_piece=to_dec(bk.smv_per_piece),
                confidence_pct=to_dec(bk.confidence_pct) or ZERO,
                booking_id=int(bk.id),
                inquiry_id=bk.inquiry_id,
                quotation_id=bk.quotation_id,
            )
        )
    return rows


def booking_view(
    bk: MfgTentativeLineBooking,
    *,
    reason: str | None,
    order_id: int | None,
    smv: Decimal | None,
    smv_source: str | None,
    line_code: str | None,
    inquiry_code: str | None,
    quotation_code: str | None,
) -> dict[str, Any]:
    qty = to_dec(bk.planned_qty) or ZERO
    total = quant(qty * smv, 4) if smv is not None else None
    conf = to_dec(bk.confidence_pct) or ZERO
    weighted = quant(total * conf / HUNDRED, 4) if total is not None else None
    return {
        "id": bk.id,
        "line_id": bk.line_id,
        "line_code": line_code,
        "inquiry_id": bk.inquiry_id,
        "inquiry_code": inquiry_code,
        "quotation_id": bk.quotation_id,
        "quotation_code": quotation_code,
        "style_id": bk.style_id,
        "ob_id": bk.ob_id,
        "shift_id": bk.shift_id,
        "start_date": bk.start_date,
        "planned_end_date": bk.planned_end_date,
        "planned_qty": dec_str(qty, 3),
        "smv_per_piece": dec_str(smv, 4),
        "smv_source": smv_source,
        "total_smv_minutes": dec_str(total, 2),
        "confidence_pct": dec_str(conf, 2),
        "weighted_smv_minutes": dec_str(weighted, 2),
        "expires_at": bk.expires_at,
        "status": bk.status,
        "counted": reason is None and bk.status == TENTATIVE_ACTIVE,
        "not_counted_reason": reason,
        "converted_order_id": order_id or bk.converted_order_id,
        "notes": bk.notes,
        "lock_version": int(bk.lock_version or 0),
    }


async def list_tentative_demand(
    db: AsyncSession,
    tenant_id: int,
    *,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    offset: int = 0,
    now: datetime | None = None,
    booking_id: int | None = None,
    line_id: int | None = None,
) -> dict[str, Any]:
    """Tentative bookings with the dedupe verdict and probability-weighted minutes (read-only)."""
    now = now or datetime.utcnow()
    b = MfgTentativeLineBooking
    conds = [b.tenant_id == tenant_id]
    if booking_id is not None:
        conds.append(b.id == booking_id)
    if line_id is not None:
        conds.append(b.line_id == line_id)
    if status:
        conds.append(b.status == status.upper())
    if date_from is not None:
        conds.append(func.coalesce(b.planned_end_date, b.start_date) >= date_from)
    if date_to is not None:
        conds.append(b.start_date <= date_to)
    total = (await db.execute(select(func.count()).select_from(b).where(*conds))).scalar_one()
    bookings = list(
        (await db.execute(select(b).where(*conds).order_by(b.start_date, b.id).limit(limit).offset(offset))).scalars().all()
    )
    verdict = await evaluate_bookings(db, tenant_id, bookings, now=now) if bookings else {}

    smv_rows = [
        type("R", (), {"id": bk.id, "ob_id": bk.ob_id, "style_id": bk.style_id, "smv_per_piece": bk.smv_per_piece})()
        for bk in bookings
    ]
    # Tentative demand is shown only behind mfg_integrated_planning_v1, so the style standard SMV level applies.
    smv_by_row = await resolve_smv_for_rows(db, tenant_id, smv_rows, use_style_standard=True) if smv_rows else {}
    line_codes: dict[int, str] = {}
    lids = {int(x.line_id) for x in bookings}
    if lids:
        for lid, code in (await db.execute(select(SewingLine.id, SewingLine.line_code).where(SewingLine.tenant_id == tenant_id, SewingLine.id.in_(lids)))).all():
            line_codes[int(lid)] = code
    inq_codes: dict[int, str] = {}
    iids = {int(x.inquiry_id) for x in bookings if x.inquiry_id}
    if iids:
        for iid, code in (await db.execute(select(Inquiry.id, Inquiry.inquiry_code).where(Inquiry.tenant_id == tenant_id, Inquiry.id.in_(iids)))).all():
            inq_codes[int(iid)] = code
    quo_codes: dict[int, str] = {}
    qids = {int(x.quotation_id) for x in bookings if x.quotation_id}
    if qids:
        for qid, code in (await db.execute(select(Quotation.id, Quotation.quotation_code).where(Quotation.tenant_id == tenant_id, Quotation.id.in_(qids)))).all():
            quo_codes[int(qid)] = code

    items = []
    counted_total = counted_weighted = ZERO
    counted = 0
    for bk in bookings:
        reason, order_id = verdict.get(bk.id, (None, None))
        smv = smv_by_row[bk.id]
        view = booking_view(
            bk,
            reason=reason,
            order_id=order_id,
            smv=smv.value,
            smv_source=smv.source,
            line_code=line_codes.get(int(bk.line_id)),
            inquiry_code=inq_codes.get(int(bk.inquiry_id)) if bk.inquiry_id else None,
            quotation_code=quo_codes.get(int(bk.quotation_id)) if bk.quotation_id else None,
        )
        items.append(view)
        if view["counted"]:
            counted += 1
            counted_total += to_dec(view["total_smv_minutes"]) or ZERO
            counted_weighted += to_dec(view["weighted_smv_minutes"]) or ZERO
    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "counted_count": counted,
        "counted_total_smv_minutes": dec_str(counted_total, 2),
        "counted_weighted_smv_minutes": dec_str(counted_weighted, 2),
    }
