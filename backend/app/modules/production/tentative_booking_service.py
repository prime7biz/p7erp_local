"""Tentative line bookings for inquiries and quotations (Manufacturing Intelligence Phase 2, run R3).

They live in `mfg_tentative_line_bookings` (never in `sewing_line_style_configs`), so legacy line-booking readers never
see them. Phase 1 line loading counts them as SOFT load only while `mfg_integrated_planning_v1` is on.

Rules
- exactly one of inquiry_id / quotation_id; every client id passes `ensure_owned` (another tenant's id = 404)
- confidence 0-100 is required unless the tenant set a default stage probability (planning settings)
- expires_at must be in the future and at most 180 days ahead (default: settings `tentative_default_expiry_days`)
- SMV per piece comes from the Phase 1 hierarchy (approved OB, latest approved OB of the style, ...). When it is unknown the
  booking is saved with no SMV and its load shows as unresolved
- an inquiry / quotation that already has an order cannot get a booking; when an order appears later the booking becomes
  CONVERTED (`convert_ordered_bookings`) and is never counted twice
- the service never commits (the router does)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.models import GarmentStyle, Inquiry, OperationBulletin, ProductionShift, Quotation, SewingLine, Tenant, User
from app.models.mfg_planning import (
    TENTATIVE_ACTIVE,
    TENTATIVE_CANCELLED,
    TENTATIVE_CONVERTED,
    TENTATIVE_EXPIRED,
    MfgTentativeLineBooking,
)
from app.modules.audit.service import log_action
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from app.modules.mfg_intelligence.tentative_demand_service import REASON_CONVERTED, evaluate_bookings
from app.modules.production.planning_settings_service import read_planning_settings

MAX_EXPIRY_DAYS = 180
MAX_SPAN_DAYS = 366


class TentativeCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inquiry_id: int | None = Field(None, ge=1)
    quotation_id: int | None = Field(None, ge=1)
    line_id: int = Field(..., ge=1)
    style_id: int | None = Field(None, ge=1)
    ob_id: int | None = Field(None, ge=1)
    shift_id: int | None = Field(None, ge=1)
    start_date: date
    planned_end_date: date | None = None
    planned_qty: Decimal = Field(..., gt=0, max_digits=18, decimal_places=3)
    confidence_pct: Decimal | None = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)
    expires_at: datetime | None = None
    notes: str | None = Field(None, max_length=2000)


class TentativeUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_lock_version: int | None = Field(None, ge=0)
    line_id: int | None = Field(None, ge=1)
    style_id: int | None = Field(None, ge=1)
    ob_id: int | None = Field(None, ge=1)
    shift_id: int | None = Field(None, ge=1)
    start_date: date | None = None
    planned_end_date: date | None = None
    planned_qty: Decimal | None = Field(None, gt=0, max_digits=18, decimal_places=3)
    confidence_pct: Decimal | None = Field(None, ge=0, le=100, max_digits=5, decimal_places=2)
    expires_at: datetime | None = None
    notes: str | None = Field(None, max_length=2000)


def _err(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _naive_utc(value: datetime | None) -> datetime | None:
    """Browsers send `...Z` (aware); the column and `utcnow()` are naive UTC."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _check_expiry(expires_at: datetime, now: datetime) -> None:
    if expires_at <= now:
        raise _err(422, "expires_at must be in the future")
    if expires_at > now + timedelta(days=MAX_EXPIRY_DAYS):
        raise _err(422, f"expires_at can be at most {MAX_EXPIRY_DAYS} days ahead")


def _check_dates(start: date, end: date | None) -> None:
    if end is not None and end < start:
        raise _err(422, "planned_end_date must be on or after start_date")
    if end is not None and (end - start).days > MAX_SPAN_DAYS:
        raise _err(422, f"A booking cannot span more than {MAX_SPAN_DAYS} days")


async def _resolve_smv(db: AsyncSession, tenant_id: int, *, ob_id: int | None, style_id: int | None):
    row = SimpleNamespace(id=0, ob_id=ob_id, style_id=style_id, smv_per_piece=None)
    # Tentative bookings exist only behind mfg_integrated_planning_v1, so the style standard SMV level applies.
    return (await resolve_smv_for_rows(db, tenant_id, [row], use_style_standard=True))[0]


async def _order_exists_for(db: AsyncSession, tenant_id: int, bk: MfgTentativeLineBooking) -> int | None:
    # `bk` may not be saved yet (no id): evaluate a transient stand-in so nothing is added to the session.
    probe: Any = SimpleNamespace(
        id=-1,
        inquiry_id=bk.inquiry_id,
        quotation_id=bk.quotation_id,
        status=TENTATIVE_ACTIVE,
        expires_at=datetime.utcnow() + timedelta(days=1),
    )
    verdict = await evaluate_bookings(db, tenant_id, [probe])
    reason, order_id = verdict.get(-1, (None, None))
    return order_id if reason == REASON_CONVERTED else None


async def _owned_demand(db: AsyncSession, tenant_id: int, inquiry_id: int | None, quotation_id: int | None):
    if (inquiry_id is None) == (quotation_id is None):
        raise _err(422, "Give exactly one of inquiry_id or quotation_id")
    if inquiry_id is not None:
        return await ensure_owned(db, Inquiry, inquiry_id, tenant_id, "Inquiry", status_code=404)
    return await ensure_owned(db, Quotation, quotation_id, tenant_id, "Quotation", status_code=404)


async def create_booking(
    db: AsyncSession, *, tenant: Tenant, user: User, data: TentativeCreateIn
) -> MfgTentativeLineBooking:
    tenant_id = tenant.id
    now = datetime.utcnow()
    demand = await _owned_demand(db, tenant_id, data.inquiry_id, data.quotation_id)
    await ensure_owned(db, SewingLine, data.line_id, tenant_id, "Sewing line", status_code=404)
    style_id = data.style_id if data.style_id is not None else getattr(demand, "style_id", None)
    await ensure_owned(db, GarmentStyle, style_id, tenant_id, "Style", status_code=404)
    await ensure_owned(db, OperationBulletin, data.ob_id, tenant_id, "Operation bulletin", status_code=404)
    await ensure_owned(db, ProductionShift, data.shift_id, tenant_id, "Shift", status_code=404)
    _check_dates(data.start_date, data.planned_end_date)

    settings = await read_planning_settings(db, tenant_id)
    confidence = data.confidence_pct
    if confidence is None:
        stage = "INQUIRY" if data.inquiry_id is not None else "QUOTATION"
        default = settings["stage_probability"].get(stage)
        if default is None:
            raise _err(422, "confidence_pct (0-100) is required: no default probability is set for this stage")
        confidence = Decimal(default)
    expires_at = _naive_utc(data.expires_at) or (now + timedelta(days=int(settings["tentative_default_expiry_days"])))
    _check_expiry(expires_at, now)

    smv = await _resolve_smv(db, tenant_id, ob_id=data.ob_id, style_id=style_id)
    bk = MfgTentativeLineBooking(
        tenant_id=tenant_id,
        line_id=data.line_id,
        inquiry_id=data.inquiry_id,
        quotation_id=data.quotation_id,
        style_id=style_id,
        ob_id=data.ob_id,
        shift_id=data.shift_id,
        start_date=data.start_date,
        planned_end_date=data.planned_end_date,
        planned_qty=data.planned_qty,
        smv_per_piece=smv.value,
        source_smv_type=smv.source,
        confidence_pct=confidence,
        expires_at=expires_at,
        status=TENTATIVE_ACTIVE,
        notes=(data.notes or "").strip() or None,
        created_by_user_id=user.id,
    )
    order_id = await _order_exists_for(db, tenant_id, bk)
    if order_id is not None:
        raise _err(409, "An order already exists for this inquiry / quotation; book the order instead")
    db.add(bk)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="mfg_tentative_booking.create",
        resource=f"mfg_tentative_line_booking:{bk.id}",
        details=f"line_id={bk.line_id} inquiry_id={bk.inquiry_id} quotation_id={bk.quotation_id} confidence={confidence}",
    )
    return bk


async def _get_locked(db: AsyncSession, tenant_id: int, booking_id: int) -> MfgTentativeLineBooking:
    bk = (
        await db.execute(
            select(MfgTentativeLineBooking)
            .where(MfgTentativeLineBooking.tenant_id == tenant_id, MfgTentativeLineBooking.id == booking_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if bk is None:
        raise _err(404, "Tentative booking not found")
    return bk


async def update_booking(
    db: AsyncSession, *, tenant: Tenant, user: User, booking_id: int, data: TentativeUpdateIn
) -> MfgTentativeLineBooking:
    tenant_id = tenant.id
    now = datetime.utcnow()
    bk = await _get_locked(db, tenant_id, booking_id)
    if bk.status != TENTATIVE_ACTIVE:
        raise _err(409, f"A {bk.status} booking cannot be changed")
    if data.expected_lock_version is not None and int(data.expected_lock_version) != int(bk.lock_version or 0):
        raise _err(409, "The booking changed since you loaded it. Reload and try again")
    sent = data.model_fields_set - {"expected_lock_version"}
    if not sent:
        raise _err(422, "Nothing to change")
    if "expires_at" in sent:
        data.expires_at = _naive_utc(data.expires_at)
    for name in ("line_id", "start_date", "planned_qty", "confidence_pct", "expires_at"):
        if name in sent and getattr(data, name) is None:
            raise _err(422, f"{name} cannot be empty")
    if "line_id" in sent:
        await ensure_owned(db, SewingLine, data.line_id, tenant_id, "Sewing line", status_code=404)
    if "style_id" in sent:
        await ensure_owned(db, GarmentStyle, data.style_id, tenant_id, "Style", status_code=404)
    if "ob_id" in sent:
        await ensure_owned(db, OperationBulletin, data.ob_id, tenant_id, "Operation bulletin", status_code=404)
    if "shift_id" in sent:
        await ensure_owned(db, ProductionShift, data.shift_id, tenant_id, "Shift", status_code=404)
    start = data.start_date if "start_date" in sent else bk.start_date
    end = data.planned_end_date if "planned_end_date" in sent else bk.planned_end_date
    _check_dates(start, end)
    if "expires_at" in sent:
        _check_expiry(data.expires_at, now)  # type: ignore[arg-type]

    for name in ("line_id", "style_id", "ob_id", "shift_id", "start_date", "planned_end_date", "planned_qty",
                 "confidence_pct", "expires_at"):
        if name in sent:
            setattr(bk, name, getattr(data, name))
    if "notes" in sent:
        bk.notes = (data.notes or "").strip() or None
    if sent & {"style_id", "ob_id"}:
        smv = await _resolve_smv(db, tenant_id, ob_id=bk.ob_id, style_id=bk.style_id)
        bk.smv_per_piece = smv.value
        bk.source_smv_type = smv.source
    bk.lock_version = int(bk.lock_version or 0) + 1
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="mfg_tentative_booking.update",
        resource=f"mfg_tentative_line_booking:{bk.id}",
        details="fields=" + ",".join(sorted(sent)),
    )
    return bk


async def cancel_booking(
    db: AsyncSession, *, tenant: Tenant, user: User, booking_id: int
) -> tuple[MfgTentativeLineBooking, bool]:
    bk = await _get_locked(db, tenant.id, booking_id)
    if bk.status == TENTATIVE_CANCELLED:
        return bk, False
    if bk.status != TENTATIVE_ACTIVE:
        raise _err(409, f"A {bk.status} booking cannot be cancelled")
    bk.status = TENTATIVE_CANCELLED
    bk.lock_version = int(bk.lock_version or 0) + 1
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="mfg_tentative_booking.cancel",
        resource=f"mfg_tentative_line_booking:{bk.id}",
        details=f"booking_id={bk.id}",
    )
    return bk, True


async def convert_ordered_bookings(db: AsyncSession, tenant_id: int, *, limit: int = 500) -> int:
    """ACTIVE bookings whose quotation / inquiry now has an order become CONVERTED (link kept). Returns how many.

    Readers already ignore such bookings (`evaluate_bookings`); this makes the status explicit. Also used by the
    daily lifecycle job (run R4).
    """
    b = MfgTentativeLineBooking
    active = list(
        (
            await db.execute(
                select(b).where(b.tenant_id == tenant_id, b.status == TENTATIVE_ACTIVE).order_by(b.id).limit(limit).with_for_update()
            )
        )
        .scalars()
        .all()
    )
    if not active:
        return 0
    verdict = await evaluate_bookings(db, tenant_id, active)
    changed = 0
    for bk in active:
        reason, order_id = verdict.get(bk.id, (None, None))
        if reason == REASON_CONVERTED and order_id is not None:
            bk.status = TENTATIVE_CONVERTED
            bk.converted_order_id = order_id
            bk.lock_version = int(bk.lock_version or 0) + 1
            changed += 1
    if changed:
        await db.flush()
    return changed


async def expire_due_bookings(db: AsyncSession, tenant_id: int, *, now: datetime | None = None, limit: int = 1000) -> int:
    """ACTIVE bookings past `expires_at` become EXPIRED (daily job, run R4). Returns how many."""
    now = now or datetime.utcnow()
    b = MfgTentativeLineBooking
    rows = list(
        (
            await db.execute(
                select(b)
                .where(b.tenant_id == tenant_id, b.status == TENTATIVE_ACTIVE, b.expires_at <= now)
                .order_by(b.id)
                .limit(limit)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for bk in rows:
        bk.status = TENTATIVE_EXPIRED
        bk.lock_version = int(bk.lock_version or 0) + 1
    if rows:
        await db.flush()
    return len(rows)
