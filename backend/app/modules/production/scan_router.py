"""Shop-floor scan station API (flag `shop_floor_scan_enabled`, default on)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_shop_floor_scan_enabled
from app.database import get_db
from app.models import Order, Tenant, User
from app.models.merch import Quotation
from app.models.production import CuttingBundle, OperationBulletin, OperationBulletinOp, SewingLine
from app.models.shop_floor_scan import BundleOperationScan

router = APIRouter(prefix="/production/scan", tags=["production-scan"])

MAX_BATCH = 200
MAX_OFFLINE_AGE = timedelta(days=7)
MAX_CLOCK_SKEW = timedelta(minutes=10)


def _guard(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if not is_shop_floor_scan_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "The shop-floor scan station is not enabled for this company."},
        )


async def _order_style_id(db: AsyncSession, tenant_id: int, order: Order) -> int | None:
    if order.style_id:
        return order.style_id
    if order.quotation_id:
        q = await db.get(Quotation, order.quotation_id)
        if q and q.tenant_id == tenant_id:
            return q.style_id
    return None


async def _bulletin_for_order(db: AsyncSession, tenant_id: int, order: Order) -> OperationBulletin | None:
    """Same rule as line planning: latest operation bulletin version for the order's style."""
    style_id = await _order_style_id(db, tenant_id, order)
    if not style_id:
        return None
    return (
        await db.execute(
            select(OperationBulletin)
            .where(OperationBulletin.tenant_id == tenant_id, OperationBulletin.style_id == style_id)
            .order_by(OperationBulletin.version_no.desc(), OperationBulletin.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


# ---------------------------------------------------------------- setup


class SetupOut(BaseModel):
    lines: list[dict]
    orders: list[dict]


class OperationOut(BaseModel):
    id: int
    sequence_no: int
    operation_name: str
    smv: Decimal
    is_critical: bool


class OperationsOut(BaseModel):
    order_id: int
    order_code: str
    ob_code: str | None
    operations: list[OperationOut]


@router.get("/setup", response_model=SetupOut)
async def scan_setup(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    lines = (
        await db.execute(
            select(SewingLine.id, SewingLine.line_code, SewingLine.name)
            .where(SewingLine.tenant_id == tenant.id, SewingLine.is_active.is_(True))
            .order_by(SewingLine.line_code)
        )
    ).all()
    orders = (
        await db.execute(
            select(Order.id, Order.order_code, Order.style_ref)
            .where(Order.tenant_id == tenant.id, func.upper(Order.status).in_(("NEW", "CONFIRMED", "IN_PROGRESS")))
            .order_by(Order.id.desc())
            .limit(200)
        )
    ).all()
    return SetupOut(
        lines=[{"id": i, "line_code": c, "name": n} for i, c, n in lines],
        orders=[{"id": i, "order_code": c, "style_ref": s} for i, c, s in orders],
    )


@router.get("/orders/{order_id}/operations", response_model=OperationsOut)
async def order_operations(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    ob = await _bulletin_for_order(db, tenant.id, order)
    ops = (
        list(
            (
                await db.execute(
                    select(OperationBulletinOp).where(OperationBulletinOp.ob_id == ob.id).order_by(OperationBulletinOp.sequence_no)
                )
            ).scalars()
        )
        if ob
        else []
    )
    return OperationsOut(
        order_id=order.id,
        order_code=order.order_code,
        ob_code=ob.ob_code if ob else None,
        operations=[
            OperationOut(id=o.id, sequence_no=o.sequence_no, operation_name=o.operation_name, smv=Decimal(str(o.smv or 0)), is_critical=o.is_critical)
            for o in ops
        ],
    )


# ---------------------------------------------------------------- batch upload


class ScanIn(BaseModel):
    client_key: str = Field(..., min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    barcode: str = Field(..., min_length=1, max_length=128)
    ob_op_id: int
    scanned_at: datetime
    operator_code: str | None = Field(default=None, max_length=32)
    sewing_line_id: int | None = None
    pieces: int | None = Field(default=None, ge=0, le=10_000)


class BatchIn(BaseModel):
    device_id: str | None = Field(default=None, max_length=64)
    scans: list[ScanIn] = Field(..., min_length=1, max_length=MAX_BATCH)


ScanStatus = Literal["accepted", "duplicate", "already_scanned", "error"]


class ScanResult(BaseModel):
    client_key: str
    status: ScanStatus
    message: str | None = None
    bundle_no: str | None = None
    operation_name: str | None = None
    pieces: int | None = None


class BatchOut(BaseModel):
    results: list[ScanResult]
    accepted: int


def _utc_naive(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


@router.post("/batch", response_model=BatchOut)
async def upload_scans(
    body: BatchIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Idempotent: a client_key already stored returns `duplicate` (success) without counting twice."""
    _guard(user, tenant)
    now = datetime.utcnow()
    keys = [s.client_key for s in body.scans]
    existing = set(
        (await db.execute(select(BundleOperationScan.client_key).where(BundleOperationScan.tenant_id == tenant.id, BundleOperationScan.client_key.in_(keys)))).scalars()
    )
    valid_lines = set(
        (await db.execute(select(SewingLine.id).where(SewingLine.tenant_id == tenant.id))).scalars()
    )
    ob_cache: dict[int, OperationBulletin | None] = {}
    results: list[ScanResult] = []
    accepted = 0

    for s in body.scans:
        if s.client_key in existing:
            results.append(ScanResult(client_key=s.client_key, status="duplicate", message="Already received"))
            continue
        scanned_at = _utc_naive(s.scanned_at)
        if scanned_at > now + MAX_CLOCK_SKEW or scanned_at < now - MAX_OFFLINE_AGE:
            results.append(ScanResult(client_key=s.client_key, status="error", message="Scan time is outside the allowed window (device clock?)"))
            continue
        bundle = (
            await db.execute(select(CuttingBundle).where(CuttingBundle.tenant_id == tenant.id, CuttingBundle.barcode == s.barcode.strip()))
        ).scalar_one_or_none()
        if not bundle:
            results.append(ScanResult(client_key=s.client_key, status="error", message=f"Unknown bundle barcode {s.barcode}"))
            continue
        op = await db.get(OperationBulletinOp, s.ob_op_id)
        if not op or op.tenant_id != tenant.id:
            results.append(ScanResult(client_key=s.client_key, status="error", message="Unknown operation", bundle_no=bundle.bundle_no))
            continue
        if bundle.order_id:
            if bundle.order_id not in ob_cache:
                order = await db.get(Order, bundle.order_id)
                if order is not None and order.tenant_id != tenant.id:
                    order = None
                ob_cache[bundle.order_id] = await _bulletin_for_order(db, tenant.id, order) if order else None
            ob = ob_cache[bundle.order_id]
            if not ob or op.ob_id != ob.id:
                results.append(
                    ScanResult(
                        client_key=s.client_key,
                        status="error",
                        message="This operation is not in the operation bulletin of the bundle's order",
                        bundle_no=bundle.bundle_no,
                    )
                )
                continue
        if s.sewing_line_id is not None and s.sewing_line_id not in valid_lines:
            results.append(ScanResult(client_key=s.client_key, status="error", message="Unknown sewing line", bundle_no=bundle.bundle_no))
            continue
        pieces = bundle.qty_in_bundle if s.pieces is None else min(s.pieces, bundle.qty_in_bundle)
        done = await db.scalar(
            select(BundleOperationScan.id).where(BundleOperationScan.bundle_id == bundle.id, BundleOperationScan.ob_op_id == op.id)
        )
        if done:
            results.append(
                ScanResult(
                    client_key=s.client_key,
                    status="already_scanned",
                    message=f"Bundle {bundle.bundle_no} was already counted for {op.operation_name}",
                    bundle_no=bundle.bundle_no,
                    operation_name=op.operation_name,
                )
            )
            continue
        try:
            async with db.begin_nested():
                db.add(
                    BundleOperationScan(
                        tenant_id=tenant.id,
                        client_key=s.client_key,
                        bundle_id=bundle.id,
                        order_id=bundle.order_id,
                        ob_op_id=op.id,
                        operation_name=op.operation_name,
                        smv=Decimal(str(op.smv or 0)),
                        pieces=pieces,
                        sewing_line_id=s.sewing_line_id,
                        operator_code=(s.operator_code or "").strip().upper() or None,
                        device_id=body.device_id,
                        scanned_at=scanned_at,
                        created_by=user.id,
                    )
                )
        except IntegrityError:
            # Lost a race with another device sending the same key or the same bundle+operation.
            results.append(ScanResult(client_key=s.client_key, status="already_scanned", message="Already counted", bundle_no=bundle.bundle_no))
            continue
        existing.add(s.client_key)
        accepted += 1
        results.append(
            ScanResult(client_key=s.client_key, status="accepted", bundle_no=bundle.bundle_no, operation_name=op.operation_name, pieces=pieces)
        )

    await db.commit()
    return BatchOut(results=results, accepted=accepted)


# ---------------------------------------------------------------- summary


class SummaryOut(BaseModel):
    day: date
    total_pieces: int
    earned_minutes: Decimal
    hours: list[dict]
    operations: list[dict]
    operators: list[dict]


@router.get("/summary", response_model=SummaryOut)
async def scan_summary(
    day: date | None = None,
    sewing_line_id: int | None = None,
    order_id: int | None = None,
    tz_offset_minutes: int = Query(360, ge=-720, le=840, description="Device UTC offset; 360 = Bangladesh"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _guard(user, tenant)
    offset = timedelta(minutes=tz_offset_minutes)
    local_day = day or (datetime.utcnow() + offset).date()
    start = datetime.combine(local_day, datetime.min.time()) - offset
    stmt = select(BundleOperationScan).where(
        BundleOperationScan.tenant_id == tenant.id,
        BundleOperationScan.scanned_at >= start,
        BundleOperationScan.scanned_at < start + timedelta(days=1),
    )
    if sewing_line_id:
        stmt = stmt.where(BundleOperationScan.sewing_line_id == sewing_line_id)
    if order_id:
        stmt = stmt.where(BundleOperationScan.order_id == order_id)
    rows = list((await db.execute(stmt.limit(50_000))).scalars())

    hours: dict[int, list] = {}
    ops: dict[str, int] = {}
    people: dict[str, list] = {}
    total_pcs = 0
    total_min = Decimal("0")
    for r in rows:
        earned = Decimal(r.pieces) * Decimal(r.smv)
        h = (r.scanned_at + offset).hour
        hours.setdefault(h, [0, Decimal("0")])
        hours[h][0] += r.pieces
        hours[h][1] += earned
        ops[r.operation_name] = ops.get(r.operation_name, 0) + r.pieces
        key = r.operator_code or "—"
        people.setdefault(key, [0, Decimal("0")])
        people[key][0] += r.pieces
        people[key][1] += earned
        total_pcs += r.pieces
        total_min += earned
    q = Decimal("0.01")
    return SummaryOut(
        day=local_day,
        total_pieces=total_pcs,
        earned_minutes=total_min.quantize(q),
        hours=[{"hour": h, "pieces": v[0], "earned_minutes": v[1].quantize(q)} for h, v in sorted(hours.items())],
        operations=[{"operation_name": k, "pieces": v} for k, v in sorted(ops.items(), key=lambda x: -x[1])],
        operators=[
            {"operator_code": k, "pieces": v[0], "earned_minutes": v[1].quantize(q)} for k, v in sorted(people.items(), key=lambda x: -x[1][1])
        ],
    )
