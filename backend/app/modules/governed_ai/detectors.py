"""Exception agents: deterministic detectors that *propose* actions.

Each finding has a stable ``key`` and a suggested action (notify someone). Nothing is sent
until a person confirms it through the router; see ``router.confirm_exception``.

Agents:
- ``tna_delay``     — overdue TNA / follow-up actions (reuses the merch alert rule).
- ``lc_expiry``     — LC / master contract expiring within 14 days (reuses the trade alert rule).
- ``bom_shortfall`` — orders due within 45 days whose BOM materials are not fully on purchase orders.
- ``finance_exceptions`` — Finance Control Tower cards (budget breach, negative cash, stock vs GL, old unbilled
  GRNs); acknowledge only, never a notification.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

AGENTS: dict[str, str] = {
    "tna_delay": "TNA delay",
    "lc_expiry": "LC expiry",
    "bom_shortfall": "BOM shortfall",
    "finance_exceptions": "Finance exceptions",
}
# Agents that read finance data: extra gates (flags finance_ai_insights_v2 + finance_control_tower_v2, fail-closed
# ai.tools.finance.read, soft finance.mis_report.view), acknowledge-only actions, never part of the owner brief.
FINANCE_AGENTS = frozenset({"finance_exceptions"})
FINANCE_GRN_UNBILLED_DAYS = 30
# Control Tower cards the finance agent turns into findings (code -> severity of the finding).
FINANCE_AGENT_CARDS = {
    "BUDGET_BREACH": "high",
    "NEGATIVE_CASH": "high",
    "STOCK_GL_MISMATCH": "high",
    "GRN_NOT_BILLED": "medium",
}
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
BOM_HORIZON_DAYS = 45
BOM_TOLERANCE = Decimal("0.98")
CLOSED_ORDER_STATUSES = ("COMPLETED", "CANCELLED", "CLOSED", "SHIPPED", "DELIVERED")
MAX_PER_AGENT = 50


def _finding(
    *,
    agent: str,
    key: str,
    severity: str,
    title: str,
    detail: str,
    recommended_action: str,
    href: str | None,
    order_id: int | None = None,
    assignee_user_id: int | None = None,
) -> dict[str, Any]:
    return {
        "agent": agent,
        "agent_label": AGENTS[agent],
        "key": key,
        "severity": severity,
        "title": title,
        "detail": detail,
        "recommended_action": recommended_action,
        "href": href,
        "order_id": order_id,
        "assignee_user_id": assignee_user_id,
    }


async def detect_tna_delay(db: AsyncSession, tenant_id: int) -> list[dict[str, Any]]:
    from app.models.merch import Order, OrderFollowupAction
    from app.modules.merch.alert_rules import rule_tna_action_overdue

    hits = await rule_tna_action_overdue(db, tenant_id, None)
    if not hits:
        return []
    action_ids = [h["entity_id"] for h in hits]
    rows = (
        await db.execute(
            select(OrderFollowupAction.id, OrderFollowupAction.assigned_to_id, Order.order_code)
            .join(Order, Order.id == OrderFollowupAction.order_id)
            .where(OrderFollowupAction.tenant_id == tenant_id, OrderFollowupAction.id.in_(action_ids))
        )
    ).all()
    meta = {r.id: (r.assigned_to_id, r.order_code) for r in rows}
    out = []
    for h in hits:
        assignee, code = meta.get(h["entity_id"], (None, None))
        out.append(
            _finding(
                agent="tna_delay",
                key=h["natural_key"],
                severity=h["severity"],
                title=f"{code or 'Order'} · {h['title']}",
                detail=h["description"],
                recommended_action=h["recommended_action"],
                href=f"/app/orders/{h['order_id']}" if h.get("order_id") else None,
                order_id=h.get("order_id"),
                assignee_user_id=assignee,
            )
        )
    return out


async def detect_lc_expiry(db: AsyncSession, tenant_id: int) -> list[dict[str, Any]]:
    from app.modules.merch.alert_rules import rule_trade_lc_expiry_soon

    hits = await rule_trade_lc_expiry_soon(db, tenant_id, None)
    out = []
    for h in hits:
        facts = (h.get("evidence_json") or {}).get("facts") or {}
        days = facts.get("days_until_expiry")
        expiry = facts.get("expiry_date")
        if isinstance(days, int) and days < 0:
            title = h["title"].replace("expiry soon", "expired")
            detail = f"Linked LC/contract expired {-days} day(s) ago ({expiry})."
        else:
            title, detail = h["title"], h["description"]
        out.append(
            _finding(
                agent="lc_expiry",
                key=h["natural_key"],
                severity=h["severity"],
                title=title,
                detail=detail,
                recommended_action=h["recommended_action"],
                href=f"/app/trade/cases/{h['entity_id']}",
                order_id=h.get("order_id"),
            )
        )
    return out


def _required_per_unit(line: Any) -> Decimal:
    gross = getattr(line, "bom_gross_consumption_per_unit", None)
    if gross:
        return Decimal(str(gross))
    base = Decimal(str(line.base_consumption or 0))
    wastage = Decimal(str(line.wastage_pct or 0))
    return base * (Decimal("1") + wastage / Decimal("100"))


async def detect_bom_shortfall(db: AsyncSession, tenant_id: int, *, today: date | None = None) -> list[dict[str, Any]]:
    from app.models.costing import Item
    from app.models.inventory import PurchaseOrder, PurchaseOrderItem
    from app.models.merch import Bom, BomItem, Order

    today = today or date.today()
    horizon = today + timedelta(days=BOM_HORIZON_DAYS)
    orders = (
        await db.execute(
            select(Order)
            .where(
                Order.tenant_id == tenant_id,
                Order.delivery_date.is_not(None),
                Order.delivery_date >= today,
                Order.delivery_date <= horizon,
                func.upper(Order.status).notin_(CLOSED_ORDER_STATUSES),
                Order.quantity.is_not(None),
                Order.quantity > 0,
            )
            .order_by(Order.delivery_date)
            .limit(200)
        )
    ).scalars().all()
    if not orders:
        return []
    order_ids = [o.id for o in orders]
    boms = (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == tenant_id, Bom.order_id.in_(order_ids), Bom.is_active.is_(True))
            .order_by(Bom.order_id, Bom.version_no.desc())
        )
    ).scalars().all()
    latest_bom: dict[int, Any] = {}
    for b in boms:
        latest_bom.setdefault(b.order_id, b)
    if not latest_bom:
        return []
    lines = (
        await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant_id,
                BomItem.bom_id.in_([b.id for b in latest_bom.values()]),
                BomItem.item_id.is_not(None),
            )
        )
    ).scalars().all()
    by_bom: dict[int, list[Any]] = {}
    for ln in lines:
        by_bom.setdefault(ln.bom_id, []).append(ln)
    po_rows = (
        await db.execute(
            select(
                func.coalesce(PurchaseOrderItem.source_order_id, PurchaseOrder.source_order_id).label("oid"),
                PurchaseOrderItem.item_id,
                func.sum(PurchaseOrderItem.quantity),
            )
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                func.upper(PurchaseOrder.status).notin_(("CANCELLED", "CANCELED", "REJECTED")),
                func.coalesce(PurchaseOrderItem.source_order_id, PurchaseOrder.source_order_id).in_(order_ids),
            )
            .group_by("oid", PurchaseOrderItem.item_id)
        )
    ).all()
    ordered = {(int(r[0]), int(r[1])): Decimal(str(r[2] or 0)) for r in po_rows}
    item_ids = {ln.item_id for ln in lines}
    names = (
        {i.id: i.name for i in (await db.execute(select(Item).where(Item.id.in_(item_ids)))).scalars().all()}
        if item_ids
        else {}
    )
    out: list[dict[str, Any]] = []
    for o in orders:
        bom = latest_bom.get(o.id)
        if not bom:
            continue
        required: dict[int, Decimal] = {}
        for ln in by_bom.get(bom.id, []):
            required[ln.item_id] = required.get(ln.item_id, Decimal("0")) + _required_per_unit(ln) * Decimal(o.quantity)
        short = []
        for item_id, need in required.items():
            have = ordered.get((o.id, item_id), Decimal("0"))
            if need > 0 and have < need * BOM_TOLERANCE:
                short.append((item_id, need, have))
        if not short:
            continue
        short.sort(key=lambda x: (x[1] - x[2]) / x[1], reverse=True)
        days_left = (o.delivery_date - today).days
        severity = "critical" if days_left <= 14 else "high" if days_left <= 30 else "medium"
        top = ", ".join(
            f"{names.get(i, f'item {i}')} {float(h):,.0f}/{float(n):,.0f}" for i, n, h in short[:3]
        )
        out.append(
            _finding(
                agent="bom_shortfall",
                key=f"bom_shortfall:order:{o.id}:bom:{bom.id}",
                severity=severity,
                title=f"{o.order_code} · {len(short)} material(s) not fully on PO",
                detail=f"Delivery in {days_left} day(s). Ordered vs required: {top}.",
                recommended_action="Raise or increase purchase orders for the missing materials.",
                href=f"/app/orders/{o.id}",
                order_id=o.id,
            )
        )
    return out


async def detect_finance_exceptions(
    db: AsyncSession, tenant_id: int, *, today: date | None = None
) -> list[dict[str, Any]]:
    """Read-only: budget lines at or over 100%, negative cash, stock-vs-GL mismatch, GRNs not billed for
    FINANCE_GRN_UNBILLED_DAYS+ days. Numbers come from the Control Tower service (same figures as that page).
    The only actions are navigation (href) and acknowledge; nothing is posted or changed."""
    from datetime import timedelta

    from app.common.business_date import today_local
    from app.common.tenant_feature_keys import is_finance_ai_insights_v2_enabled, is_finance_control_tower_v2_enabled
    from app.models import Tenant
    from app.modules.finance.control.control_tower_service import build_control_tower

    tenant = await db.get(Tenant, tenant_id)
    if tenant is None or tenant.id != tenant_id:
        return []
    flags = tenant.feature_flags
    if not is_finance_ai_insights_v2_enabled(flags) or not is_finance_control_tower_v2_enabled(flags):
        return []
    as_of = today or today_local(tenant)
    tower = await build_control_tower(db, tenant, as_of=as_of, severity="all")
    out: list[dict[str, Any]] = []
    for card in tower.cards:
        severity = FINANCE_AGENT_CARDS.get(card.code)
        if severity is None or card.count <= 0 or (card.note and "could not be calculated" in card.note):
            continue
        if card.code == "GRN_NOT_BILLED":
            # Raised once the oldest unbilled GRN is FINANCE_GRN_UNBILLED_DAYS old; count and amount cover every
            # unbilled GRN, exactly as on the Control Tower card.
            if card.oldest_date is None or card.oldest_date > as_of - timedelta(days=FINANCE_GRN_UNBILLED_DAYS):
                continue
        amount = f" totalling {tower.base_currency} {card.amount:,.2f}" if card.amount else ""
        oldest = (
            f" Oldest: {card.oldest_date.isoformat()} ({(as_of - card.oldest_date).days} days)."
            if card.oldest_date
            else ""
        )
        out.append(
            _finding(
                agent="finance_exceptions",
                key=f"finance_exception:{card.code}",
                severity=severity,
                title=f"{card.label}: {card.count}",
                detail=f"{card.count} item(s){amount}.{oldest}",
                recommended_action="Open the Finance Control Tower list, review the items and fix them in the normal screens.",
                href=card.href,
            )
        )
    return out


DETECTORS = {
    "tna_delay": detect_tna_delay,
    "lc_expiry": detect_lc_expiry,
    "bom_shortfall": detect_bom_shortfall,
    "finance_exceptions": detect_finance_exceptions,
}


def sort_findings(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda x: (SEVERITY_ORDER.get(x["severity"], 9), x["agent"], x["title"]))
