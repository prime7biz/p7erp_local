"""Aggregated read-only selectors for financier portal (tenant scoped)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models import Customer, Inquiry, Order, Quotation, StockMovement, Voucher
from app.models.finance import OutstandingBill
from app.models.trade import Shipment


def _today() -> date:
    return datetime.now(timezone.utc).date()


async def count_inquiries_by_status(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    r = await db.execute(
        select(Inquiry.status, func.count())
        .where(Inquiry.tenant_id == tenant_id)
        .group_by(Inquiry.status)
    )
    return {str(row[0]): int(row[1]) for row in r.all()}


async def count_quotations_by_status(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    r = await db.execute(
        select(Quotation.status, func.count())
        .where(Quotation.tenant_id == tenant_id)
        .group_by(Quotation.status)
    )
    return {str(row[0]): int(row[1]) for row in r.all()}


async def order_book(
    db: AsyncSession, tenant_id: int, limit: int, offset: int
) -> tuple[list[tuple[Order, str | None]], int]:
    total = int(
        (await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id))).scalar() or 0
    )
    cust = aliased(Customer)
    stmt = (
        select(Order, cust.name)
        .outerjoin(cust, Order.customer_id == cust.id)
        .where(Order.tenant_id == tenant_id)
        .order_by(Order.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).all()
    return [(row[0], row[1]) for row in rows], total


async def get_order_with_buyer(db: AsyncSession, tenant_id: int, order_id: int) -> tuple[Order, str | None] | None:
    cust = aliased(Customer)
    r = await db.execute(
        select(Order, cust.name)
        .outerjoin(cust, Order.customer_id == cust.id)
        .where(Order.tenant_id == tenant_id, Order.id == order_id)
    )
    row = r.first()
    if not row:
        return None
    return row[0], row[1]


async def stock_movement_summary(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    r = await db.execute(
        select(StockMovement.movement_type, func.count())
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(StockMovement.movement_type)
    )
    raw = {str(row[0]).upper(): int(row[1]) for row in r.all()}
    since = _today() - timedelta(days=30)
    recent = await db.execute(
        select(func.count())
        .select_from(StockMovement)
        .where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.movement_date.isnot(None),
            StockMovement.movement_date >= since,
        )
    )
    return {
        "IN": raw.get("IN", 0),
        "OUT": raw.get("OUT", 0),
        "ADJUST": raw.get("ADJUST", 0),
        "last_30": int(recent.scalar() or 0),
    }


async def shipments_due_this_month(db: AsyncSession, tenant_id: int) -> int:
    t = _today()
    start = date(t.year, t.month, 1)
    if t.month == 12:
        end = date(t.year + 1, 1, 1)
    else:
        end = date(t.year, t.month + 1, 1)
    r = await db.execute(
        select(func.count())
        .select_from(Shipment)
        .where(
            Shipment.tenant_id == tenant_id,
            Shipment.etd.isnot(None),
            Shipment.etd >= start,
            Shipment.etd < end,
        )
    )
    return int(r.scalar() or 0)


async def financial_counts(db: AsyncSession, tenant_id: int) -> dict:
    since = _today() - timedelta(days=90)
    v = await db.execute(
        select(func.count())
        .select_from(Voucher)
        .where(Voucher.tenant_id == tenant_id, Voucher.voucher_date >= since)
    )
    ar = await db.execute(
        select(func.count())
        .select_from(OutstandingBill)
        .where(
            OutstandingBill.tenant_id == tenant_id,
            OutstandingBill.status == "OPEN",
            OutstandingBill.bill_type == "RECEIVABLE",
        )
    )
    ap = await db.execute(
        select(func.count())
        .select_from(OutstandingBill)
        .where(
            OutstandingBill.tenant_id == tenant_id,
            OutstandingBill.status == "OPEN",
            OutstandingBill.bill_type == "PAYABLE",
        )
    )
    return {
        "voucher_count_90d": int(v.scalar() or 0),
        "receivable_open": int(ar.scalar() or 0),
        "payable_open": int(ap.scalar() or 0),
    }


async def projected_units_by_month(db: AsyncSession, tenant_id: int, months: int = 6) -> list[tuple[str, int]]:
    """Bucket visible orders by delivery_date month (units = quantity sum)."""
    r = await db.execute(
        select(Order.delivery_date, Order.quantity).where(
            Order.tenant_id == tenant_id,
            Order.delivery_date.isnot(None),
        )
    )
    buckets: dict[str, int] = defaultdict(int)
    for d, qty in r.all():
        if not d:
            continue
        key = f"{d.year}-{d.month:02d}"
        buckets[key] += int(qty or 0)
    keys = sorted(buckets.keys())[:months]
    return [(k, buckets[k]) for k in keys]


async def build_alerts(db: AsyncSession, tenant_id: int) -> list[dict]:
    alerts: list[dict] = []
    today = _today()
    overdue = await db.execute(
        select(func.count())
        .select_from(Order)
        .where(
            Order.tenant_id == tenant_id,
            Order.delivery_date.isnot(None),
            Order.delivery_date < today,
            Order.status.not_in(("DELIVERED", "CANCELLED", "CLOSED")),
        )
    )
    n_over = int(overdue.scalar() or 0)
    if n_over > 0:
        alerts.append(
            {
                "code": "OVERDUE_DELIVERY",
                "severity": "warning",
                "title": "Orders past expected delivery",
                "detail": f"{n_over} order(s) show delivery dates in the past without a closed status.",
            }
        )

    iq = await count_inquiries_by_status(db, tenant_id)
    open_iq = sum(v for k, v in iq.items() if k.upper() in ("DRAFT", "SUBMITTED", "OPEN"))
    if open_iq > 50:
        alerts.append(
            {
                "code": "PIPELINE_BACKLOG",
                "severity": "info",
                "title": "Large inquiry backlog",
                "detail": f"{open_iq} inquiries in early/open stages — monitor conversion.",
            }
        )

    conc = await db.execute(
        select(Order.customer_id, func.count())
        .where(Order.tenant_id == tenant_id)
        .group_by(Order.customer_id)
        .order_by(func.count().desc())
        .limit(1)
    )
    row = conc.first()
    if row and row[1] and int(row[1]) >= 8:
        alerts.append(
            {
                "code": "ORDER_CONCENTRATION",
                "severity": "info",
                "title": "Order concentration",
                "detail": "A single buyer represents a high share of open orders — review exposure.",
            }
        )

    return alerts
