"""Whitelisted dashboard metrics for natural-language cards.

A question is matched to ONE catalog entry (keywords first, optional LLM pick validated against
the catalog). Each metric is a fixed, tenant-scoped query — the model never writes SQL.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Awaitable, Callable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

OPEN_ORDER_EXCLUDED = ("COMPLETED", "CANCELLED", "CLOSED", "SHIPPED", "DELIVERED")
CLOSED_PO = ("CLOSED", "CANCELLED", "CANCELED", "REJECTED", "RECEIVED")
VOUCHER_WORKFLOW = ("SUBMITTED", "CHECKED", "RECOMMENDED")

Compute = Callable[[AsyncSession, int], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class Metric:
    id: str
    label: str
    description: str
    permission: str
    unit: str
    keywords: tuple[str, ...]
    href: str
    compute: Compute


def _open_order_filter(Order):  # noqa: N803 - model class argument
    return func.upper(Order.status).notin_(OPEN_ORDER_EXCLUDED)


async def _open_orders(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.merch import Order

    n = (await db.execute(select(func.count(Order.id)).where(Order.tenant_id == tid, _open_order_filter(Order)))).scalar_one()
    return {"value": int(n or 0)}


async def _open_order_qty(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.merch import Order

    n = (
        await db.execute(
            select(func.coalesce(func.sum(Order.quantity), 0)).where(Order.tenant_id == tid, _open_order_filter(Order))
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _orders_due_14d(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.merch import Order

    today = date.today()
    n = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tid,
                _open_order_filter(Order),
                Order.delivery_date >= today,
                Order.delivery_date <= today + timedelta(days=14),
            )
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _late_orders(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.merch import Order

    n = (
        await db.execute(
            select(func.count(Order.id)).where(
                Order.tenant_id == tid, _open_order_filter(Order), Order.delivery_date < date.today()
            )
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _open_orders_by_buyer(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.customer import Customer
    from app.models.merch import Order

    rows = (
        await db.execute(
            select(Customer.name, func.count(Order.id).label("n"))
            .join(Customer, (Customer.id == Order.customer_id) & (Customer.tenant_id == tid))
            .where(Order.tenant_id == tid, _open_order_filter(Order))
            .group_by(Customer.name)
            .order_by(func.count(Order.id).desc())
            .limit(5)
        )
    ).all()
    return {"value": int(sum(r.n for r in rows)), "breakdown": [{"label": r.name, "value": int(r.n)} for r in rows]}


async def _overdue_tna(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.merch import OrderFollowupAction
    from app.modules.merch.alert_rules import CLOSED_TNA_ACTION_STATUSES

    n = (
        await db.execute(
            select(func.count(OrderFollowupAction.id)).where(
                OrderFollowupAction.tenant_id == tid,
                OrderFollowupAction.is_active.is_(True),
                OrderFollowupAction.planned_date < date.today(),
                OrderFollowupAction.status.notin_(CLOSED_TNA_ACTION_STATUSES),
            )
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _open_pos(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.inventory import PurchaseOrder

    n = (
        await db.execute(
            select(func.count(PurchaseOrder.id)).where(
                PurchaseOrder.tenant_id == tid, func.upper(PurchaseOrder.status).notin_(CLOSED_PO)
            )
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _btb_expiring_30d(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.commercial import BtbLc

    today = date.today()
    n = (
        await db.execute(
            select(func.count(BtbLc.id)).where(
                BtbLc.tenant_id == tid,
                BtbLc.expiry_date >= today,
                BtbLc.expiry_date <= today + timedelta(days=30),
                func.upper(BtbLc.status).notin_(("CLOSED", "CANCELLED", "SETTLED")),
            )
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _vouchers_in_workflow(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.finance import Voucher

    n = (
        await db.execute(
            select(func.count(Voucher.id)).where(Voucher.tenant_id == tid, Voucher.status.in_(VOUCHER_WORKFLOW))
        )
    ).scalar_one()
    return {"value": int(n or 0)}


async def _active_employees(db: AsyncSession, tid: int) -> dict[str, Any]:
    from app.models.hr import Employee

    q = select(func.count(Employee.id)).where(Employee.tenant_id == tid)
    if hasattr(Employee, "is_active"):
        q = q.where(Employee.is_active.is_(True))
    n = (await db.execute(q)).scalar_one()
    return {"value": int(n or 0)}


CATALOG: tuple[Metric, ...] = (
    Metric("open_orders", "Open orders", "Orders not completed, shipped or cancelled.", "merch.access", "orders",
           ("open order", "active order", "running order", "orders open", "how many orders"), "/app/orders", _open_orders),
    Metric("open_order_qty", "Open order quantity", "Total pieces on open orders.", "merch.access", "pcs",
           ("order quantity", "pieces", "pcs", "open quantity", "total quantity"), "/app/orders", _open_order_qty),
    Metric("orders_due_14d", "Orders due in 14 days", "Open orders with delivery in the next 14 days.", "merch.access", "orders",
           ("due", "delivery this", "next two weeks", "14 days", "upcoming delivery", "due soon", "ship soon"), "/app/orders", _orders_due_14d),
    Metric("late_orders", "Late orders", "Open orders past their delivery date.", "merch.access", "orders",
           ("late", "overdue order", "delayed order", "past delivery", "behind"), "/app/orders", _late_orders),
    Metric("open_orders_by_buyer", "Open orders by buyer", "Top 5 buyers by number of open orders.", "merch.access", "orders",
           ("orders by buyer", "orders per buyer", "orders by customer", "by buyer", "per buyer", "by customer",
            "per customer", "top buyer", "which buyer"), "/app/orders", _open_orders_by_buyer),
    Metric("overdue_tna", "Overdue TNA actions", "Follow-up / TNA actions past their planned date.", "merch.access", "actions",
           ("tna", "follow up", "followup", "time and action", "milestone"), "/app/tna/dashboard", _overdue_tna),
    Metric("open_pos", "Open purchase orders", "Purchase orders not closed, received or cancelled.", "inventory.access", "POs",
           ("purchase order", "po ", "pos", "open po", "procurement"), "/app/inventory/purchase-orders", _open_pos),
    Metric("btb_expiring_30d", "BTB LCs expiring in 30 days", "Back-to-back LCs with expiry in the next 30 days.", "trade.access", "LCs",
           ("lc", "letter of credit", "btb", "back to back", "expiring", "expiry"), "/app/commercial/btb-lcs", _btb_expiring_30d),
    Metric("vouchers_in_workflow", "Vouchers awaiting approval", "Vouchers submitted, checked or recommended.", "finance.access", "vouchers",
           ("voucher", "approval", "pending approval", "awaiting approval", "journal"), "/app/accounts/vouchers", _vouchers_in_workflow),
    Metric("active_employees", "Active employees", "Employees on the active roll.", "hr.access", "people",
           ("employee", "headcount", "staff", "workers", "manpower"), "/app/hr/employees", _active_employees),
)
BY_ID = {m.id: m for m in CATALOG}


def match_metric(question: str, allowed_ids: set[str] | None = None) -> tuple[Metric | None, list[str]]:
    """Keyword score → best metric (or None) plus up to 3 suggestion ids."""
    q = " " + re.sub(r"[^a-z0-9 ]+", " ", (question or "").lower()) + " "
    scored: list[tuple[int, Metric]] = []
    for m in CATALOG:
        if allowed_ids is not None and m.id not in allowed_ids:
            continue
        score = sum(len(k) for k in m.keywords if k in q)
        if score:
            scored.append((score, m))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return None, [m.id for m in CATALOG if allowed_ids is None or m.id in allowed_ids][:3]
    best = scored[0][1]
    return best, [m.id for _, m in scored[1:4]]
