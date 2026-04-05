"""DB selectors for customer portal (tenant + customer isolation)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExternalPrincipal,
    ManufacturingProductionPlanLine,
    ManufacturingWorkOrder,
    ManufacturingWorkOrderOperation,
    Order,
    OrderFollowupAction,
)
from app.models.trade import Shipment, TradeCase

from app.external_access.deps import get_allowed_customer_ids


def _today() -> date:
    return datetime.now(timezone.utc).date()


async def customer_ids_for_principal(db: AsyncSession, principal: ExternalPrincipal) -> list[int]:
    return await get_allowed_customer_ids(db, principal)


def _order_filters(principal: ExternalPrincipal, customer_ids: list[int]):  # noqa: ANN201
    return and_(
        Order.tenant_id == principal.tenant_id,
        Order.customer_id.in_(customer_ids),
    )


async def list_orders(
    db: AsyncSession,
    principal: ExternalPrincipal,
    *,
    limit: int,
    offset: int,
    search: str | None,
) -> tuple[list[Order], int]:
    cids = await customer_ids_for_principal(db, principal)
    if not cids:
        return [], 0
    cond = _order_filters(principal, cids)
    if search and search.strip():
        term = f"%{search.strip()}%"
        count_stmt = select(func.count()).select_from(Order).where(
            and_(
                cond,
                or_(Order.order_code.ilike(term), Order.style_ref.ilike(term)),  # type: ignore[arg-type]
            )
        )
    else:
        count_stmt = select(func.count()).select_from(Order).where(cond)
    total = int((await db.execute(count_stmt)).scalar() or 0)

    stmt = select(Order).where(cond)
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Order.order_code.ilike(term), Order.style_ref.ilike(term)),  # type: ignore[arg-type]
        )
    stmt = stmt.order_by(Order.updated_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows), total


async def get_order_if_allowed(
    db: AsyncSession, principal: ExternalPrincipal, order_id: int
) -> Order | None:
    cids = await customer_ids_for_principal(db, principal)
    if not cids:
        return None
    r = await db.execute(
        select(Order).where(
            Order.id == order_id,
            Order.tenant_id == principal.tenant_id,
            Order.customer_id.in_(cids),
        )
    )
    return r.scalar_one_or_none()


async def count_pending_approvals_for_orders(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> int:
    if not order_ids:
        return 0
    q = select(func.count()).select_from(OrderFollowupAction).where(
        OrderFollowupAction.tenant_id == tenant_id,
        OrderFollowupAction.order_id.in_(order_ids),
        func.lower(OrderFollowupAction.status).in_(("pending", "in_progress", "submitted")),
    )
    return int((await db.execute(q)).scalar() or 0)


async def pending_approvals_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> int:
    return await count_pending_approvals_for_orders(db, tenant_id, [order_id])


async def list_pending_approvals_all(
    db: AsyncSession, principal: ExternalPrincipal
) -> list[tuple[OrderFollowupAction, str, int]]:
    cids = await customer_ids_for_principal(db, principal)
    if not cids:
        return []
    r = await db.execute(
        select(OrderFollowupAction, Order.order_code, Order.id)
        .join(Order, OrderFollowupAction.order_id == Order.id)
        .where(
            Order.tenant_id == principal.tenant_id,
            Order.customer_id.in_(cids),
            OrderFollowupAction.tenant_id == principal.tenant_id,
            func.lower(OrderFollowupAction.status).in_(("pending", "in_progress", "submitted")),
        )
        .order_by(Order.order_code, OrderFollowupAction.sequence_no)
    )
    return [(row[0], row[1], row[2]) for row in r.all()]


async def list_followup_actions(db: AsyncSession, tenant_id: int, order_id: int) -> list[OrderFollowupAction]:
    r = await db.execute(
        select(OrderFollowupAction)
        .where(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.order_id == order_id,
        )
        .order_by(OrderFollowupAction.sequence_no, OrderFollowupAction.id)
    )
    return list(r.scalars().all())


async def production_summary_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> tuple[int, int, int]:
    """Returns (work_orders_count, ops_done, ops_total)."""
    r = await db.execute(
        select(ManufacturingWorkOrder.id)
        .join(
            ManufacturingProductionPlanLine,
            ManufacturingWorkOrder.plan_line_id == ManufacturingProductionPlanLine.id,
        )
        .where(
            ManufacturingWorkOrder.tenant_id == tenant_id,
            ManufacturingProductionPlanLine.order_id == order_id,
        )
    )
    wo_ids = [row[0] for row in r.all()]
    if not wo_ids:
        return 0, 0, 0
    tot = await db.execute(
        select(func.count())
        .select_from(ManufacturingWorkOrderOperation)
        .where(
            ManufacturingWorkOrderOperation.tenant_id == tenant_id,
            ManufacturingWorkOrderOperation.work_order_id.in_(wo_ids),
        )
    )
    ops_total = int(tot.scalar() or 0)
    done = await db.execute(
        select(func.count())
        .select_from(ManufacturingWorkOrderOperation)
        .where(
            ManufacturingWorkOrderOperation.tenant_id == tenant_id,
            ManufacturingWorkOrderOperation.work_order_id.in_(wo_ids),
            func.lower(ManufacturingWorkOrderOperation.status).in_(("done", "completed")),
        )
    )
    ops_done = int(done.scalar() or 0)
    return len(wo_ids), ops_done, ops_total


async def list_shipments_for_customer(
    db: AsyncSession, principal: ExternalPrincipal
) -> list[tuple[Shipment, TradeCase | None, Order | None]]:
    cids = await customer_ids_for_principal(db, principal)
    if not cids:
        return []
    r = await db.execute(
        select(Shipment, TradeCase, Order)
        .join(TradeCase, Shipment.trade_case_id == TradeCase.id)
        .outerjoin(Order, TradeCase.order_id == Order.id)
        .where(
            Shipment.tenant_id == principal.tenant_id,
            or_(Order.customer_id.in_(cids), TradeCase.customer_id.in_(cids)),  # type: ignore[arg-type]
        )
        .order_by(Shipment.id.desc())
    )
    return [(row[0], row[1], row[2]) for row in r.all()]


async def dashboard_metrics(db: AsyncSession, principal: ExternalPrincipal) -> dict:
    cids = await customer_ids_for_principal(db, principal)
    today = _today()
    out = {
        "active_orders": 0,
        "pending_approval_steps": 0,
        "in_production_hint": 0,
        "ready_to_ship": 0,
        "delayed_items": 0,
        "next_shipment_eta": None,
        "next_delivery_expected": None,
    }
    if not cids:
        return out

    base = select(Order).where(_order_filters(principal, cids))
    orders = (await db.execute(base)).scalars().all()
    order_ids = [o.id for o in orders]
    out["active_orders"] = sum(
        1
        for o in orders
        if (o.status or "").upper() not in ("CANCELLED", "CLOSED", "DELIVERED")
    )
    out["pending_approval_steps"] = await count_pending_approvals_for_orders(
        db, principal.tenant_id, order_ids
    )

    in_prod = 0
    ready = 0
    delayed = 0
    next_delivery: date | None = None
    for o in orders:
        st = (o.status or "").upper()
        if st in ("CANCELLED", "CLOSED"):
            continue
        if any(x in st for x in ("PRODUCTION", "WIP", "CUTTING", "SEWING")):
            in_prod += 1
        if any(x in st for x in ("READY", "PACKED", "SHIP")):
            ready += 1
        if o.delivery_date and o.delivery_date < today and st not in ("DELIVERED", "CANCELLED", "CLOSED"):
            delayed += 1
        if o.delivery_date and st not in ("DELIVERED", "CANCELLED", "CLOSED"):
            if next_delivery is None or o.delivery_date < next_delivery:
                next_delivery = o.delivery_date
    out["in_production_hint"] = in_prod
    out["ready_to_ship"] = ready
    out["delayed_items"] = delayed
    out["next_delivery_expected"] = next_delivery

    ship_rows = await list_shipments_for_customer(db, principal)
    next_eta: date | None = None
    for sh, _tc, _ord in ship_rows:
        if sh.eta and (next_eta is None or sh.eta < next_eta):
            next_eta = sh.eta
        if sh.etd and (next_eta is None or sh.etd < next_eta):
            if sh.eta is None:
                next_eta = sh.etd
    out["next_shipment_eta"] = next_eta

    return out
