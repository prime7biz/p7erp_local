"""Merch Critical Alert rules: evaluate conditions and return raw alert payloads for upsert."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bom,
    BomItem,
    ConsumptionPlan,
    Followup,
    ManufacturingTnaPlan,
    Order,
    OrderFollowupAction,
    Quotation,
    StockMovement,
)
from app.models.merch import ConsumptionPlanItem
from app.models.inventory import Item
from app.models.costing import ItemCategory, ItemUnit


ACTIVE_ORDER_STATUSES = ("NEW", "IN_PROGRESS", "CONFIRMED")
QUOTATION_PENDING_DAYS = 7
FOLLOWUP_CRITICAL_DAYS = 7
WASTAGE_THRESHOLD_PCT = 15.0
TRIM_WASTAGE_THRESHOLD_PCT = 10.0


def _to_float(value: str | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_trim_category(category: ItemCategory | None) -> bool:
    """True if item category is trim (TRIM, PACK, ACCESSORY in category_code)."""
    if not category:
        return False
    code = (category.category_code or "").upper()
    return "TRIM" in code or "PACK" in code or "ACCESSORY" in code


async def rule_followup_overdue(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Follow-up overdue: due_date < today, status != DONE."""
    today = date.today()
    critical_days = (config or {}).get("followup_overdue_critical_days", FOLLOWUP_CRITICAL_DAYS)
    stmt = select(Followup).where(
        and_(
            Followup.tenant_id == tenant_id,
            Followup.status != "DONE",
            Followup.due_date.isnot(None),
            Followup.due_date < today,
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        days_overdue = (today - r.due_date).days
        severity = "critical" if days_overdue > critical_days else "high"
        out.append({
            "natural_key": f"followup_overdue:followup:{r.id}",
            "title": r.title,
            "description": f"Order #{r.order_id} follow-up overdue by {days_overdue} day(s).",
            "severity": severity,
            "reason_text": f"Due date {r.due_date}, {days_overdue} days overdue.",
            "recommended_action": "Complete follow-up or reschedule with note.",
            "entity_type": "followup",
            "entity_id": r.id,
            "order_id": r.order_id,
        })
    return out


async def rule_order_missing_delivery_date(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Order status is CONFIRMED or beyond but delivery_date is null."""
    stmt = select(Order).where(
        and_(
            Order.tenant_id == tenant_id,
            Order.status.in_(ACTIVE_ORDER_STATUSES),
            Order.delivery_date.is_(None),
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {
            "natural_key": f"order_missing_delivery_date:order:{r.id}",
            "title": f"Order {r.order_code} missing delivery date",
            "description": f"Order {r.order_code} has status {r.status} but no delivery date set.",
            "severity": "high",
            "reason_text": "Delivery date is required for planning and TNA.",
            "recommended_action": "Set delivery date (and trigger TNA if applicable).",
            "entity_type": "order",
            "entity_id": r.id,
            "order_id": r.id,
        }
        for r in rows
    ]


async def rule_quotation_pending_too_long(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Quotation status DRAFT/NEW/SENT and (quotation_date or created_at) older than threshold days."""
    days = (config or {}).get("quotation_pending_days", QUOTATION_PENDING_DAYS)
    cutoff = date.today() - timedelta(days=days)
    stmt = select(Quotation).where(
        and_(
            Quotation.tenant_id == tenant_id,
            Quotation.status.in_(("DRAFT", "NEW", "SENT")),
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        ref_date = r.quotation_date if r.quotation_date else (r.created_at.date() if r.created_at else None)
        if ref_date is None:
            ref_date = r.created_at.date() if r.created_at else date.today()
        if ref_date <= cutoff:
            out.append({
                "natural_key": f"quotation_pending_too_long:quotation:{r.id}",
                "title": f"Quotation {r.quotation_code} pending too long",
                "description": f"Quotation {r.quotation_code} has been pending for more than {days} days.",
                "severity": "medium",
                "reason_text": f"Quotation date/created {ref_date}, threshold {days} days.",
                "recommended_action": "Send or revise quotation; set valid_until.",
                "entity_type": "quotation",
                "entity_id": r.id,
                "order_id": None,
            })
    return out


async def rule_order_missing_tna(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Order has delivery_date set, status not DRAFT/CANCELLED, but no TNA plan linked."""
    stmt = select(Order).where(
        and_(
            Order.tenant_id == tenant_id,
            Order.delivery_date.isnot(None),
            Order.status.notin_(("DRAFT", "CANCELLED")),
        )
    )
    result = await db.execute(stmt)
    orders = result.scalars().all()
    if not orders:
        return []
    order_ids = [o.id for o in orders]
    plan_stmt = select(ManufacturingTnaPlan.order_id).where(
        and_(
            ManufacturingTnaPlan.tenant_id == tenant_id,
            ManufacturingTnaPlan.order_id.in_(order_ids),
        )
    )
    plan_result = await db.execute(plan_stmt)
    orders_with_tna = {r[0] for r in plan_result.all() if r[0] is not None}
    out: list[dict[str, Any]] = []
    for o in orders:
        if o.id in orders_with_tna:
            continue
        days_to_delivery = (o.delivery_date - date.today()).days if o.delivery_date else 999
        severity = "critical" if days_to_delivery <= 14 else "high"
        out.append({
            "natural_key": f"order_missing_tna:order:{o.id}",
            "title": f"Order {o.order_code} has no TNA plan",
            "description": f"Order {o.order_code} (delivery {o.delivery_date}) has no Time & Action plan.",
            "severity": severity,
            "reason_text": f"Delivery date {o.delivery_date}; TNA plan not created.",
            "recommended_action": "Create TNA plan from template and link to order.",
            "entity_type": "order",
            "entity_id": o.id,
            "order_id": o.id,
        })
    return out


async def rule_wastage_vs_bom(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Orders with actual consumption vs BOM above threshold (reuse wastage report logic)."""
    threshold = (config or {}).get("wastage_threshold_pct", WASTAGE_THRESHOLD_PCT)
    mov_result = await db.execute(
        select(StockMovement.reference_id).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.reference_type == "CONSUMPTION_ISSUE",
            StockMovement.reference_id.isnot(None),
        ).distinct()
    )
    ref_ids = [r[0] for r in mov_result.scalars().all() if r[0] is not None]
    if not ref_ids:
        return []
    from app.models import GarmentStyle
    ord_stmt = select(Order).where(
        Order.tenant_id == tenant_id,
        Order.id.in_(ref_ids),
        Order.quotation_id.isnot(None),
    )
    ord_result = await db.execute(ord_stmt)
    orders = list(ord_result.scalars().all())
    out: list[dict[str, Any]] = []
    for order in orders:
        if not order.quotation_id:
            continue
        quotation = await db.get(Quotation, order.quotation_id)
        if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
            continue
        style_id = quotation.style_id
        order_qty = _to_float(str(order.quantity)) if order.quantity is not None else 0.0
        if order_qty <= 0:
            continue
        bom_result = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.style_id == style_id,
            ).order_by(Bom.version_no.desc()).limit(1)
        )
        bom = bom_result.scalar_one_or_none()
        if not bom:
            continue
        lines_result = await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant_id,
                BomItem.bom_id == bom.id,
                BomItem.item_id.isnot(None),
            )
        )
        for line in lines_result.scalars().all():
            item = await db.get(Item, line.item_id)
            if not item or item.tenant_id != tenant_id:
                continue
            base = _to_float(line.base_consumption)
            wastage = _to_float(line.wastage_pct) / 100.0
            expected = order_qty * base * (1.0 + wastage)
            mov_q = await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "CONSUMPTION_ISSUE",
                    StockMovement.reference_id == order.id,
                    StockMovement.item_id == line.item_id,
                )
            )
            actual = sum(
                _to_float(m.quantity) for m in mov_q.scalars().all()
                if (m.movement_type or "").upper() == "OUT"
            )
            if expected <= 0:
                continue
            wastage_pct = (actual - expected) / expected * 100.0
            if wastage_pct < threshold:
                continue
            severity = "high" if wastage_pct >= 25 else "medium"
            item_code = item.item_code or str(line.item_id)
            out.append({
                "natural_key": f"wastage_vs_bom:order:{order.id}:item:{line.item_id}",
                "title": f"Order {order.order_code} · {item_code} wastage vs BOM",
                "description": f"Wastage vs BOM: {wastage_pct:+.1f}% (expected {expected:.2f}, actual {actual:.2f}).",
                "severity": severity,
                "reason_text": f"Expected {expected:.2f}, actual {actual:.2f}; {wastage_pct:+.1f}%.",
                "recommended_action": "Investigate cause; log variance; adjust BOM or process.",
                "entity_type": "order",
                "entity_id": order.id,
                "order_id": order.id,
            })
    return out


async def rule_trim_overconsumption_above(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Trim items with actual consumption vs BOM above threshold (e.g. 10%)."""
    threshold = (config or {}).get("trim_wastage_threshold_pct", TRIM_WASTAGE_THRESHOLD_PCT)
    from app.models import GarmentStyle
    mov_result = await db.execute(
        select(StockMovement.reference_id).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.reference_type == "CONSUMPTION_ISSUE",
            StockMovement.reference_id.isnot(None),
        ).distinct()
    )
    ref_ids = [r[0] for r in mov_result.scalars().all() if r[0] is not None]
    if not ref_ids:
        return []
    ord_stmt = select(Order).where(
        Order.tenant_id == tenant_id,
        Order.id.in_(ref_ids),
        Order.quotation_id.isnot(None),
    )
    ord_result = await db.execute(ord_stmt)
    orders = list(ord_result.scalars().all())
    out: list[dict[str, Any]] = []
    for order in orders:
        if not order.quotation_id:
            continue
        quotation = await db.get(Quotation, order.quotation_id)
        if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
            continue
        style_id = quotation.style_id
        order_qty = _to_float(str(order.quantity)) if order.quantity is not None else 0.0
        if order_qty <= 0:
            continue
        bom_result = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.style_id == style_id,
            ).order_by(Bom.version_no.desc()).limit(1)
        )
        bom = bom_result.scalar_one_or_none()
        if not bom:
            continue
        lines_result = await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant_id,
                BomItem.bom_id == bom.id,
                BomItem.item_id.isnot(None),
            )
        )
        for line in lines_result.scalars().all():
            item = await db.get(Item, line.item_id)
            if not item or item.tenant_id != tenant_id:
                continue
            cat = await db.get(ItemCategory, item.category_id) if item.category_id else None
            if not _is_trim_category(cat):
                continue
            base = _to_float(line.base_consumption)
            wastage = _to_float(line.wastage_pct) / 100.0
            expected = order_qty * base * (1.0 + wastage)
            mov_q = await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "CONSUMPTION_ISSUE",
                    StockMovement.reference_id == order.id,
                    StockMovement.item_id == line.item_id,
                )
            )
            actual = sum(
                _to_float(m.quantity) for m in mov_q.scalars().all()
                if (m.movement_type or "").upper() == "OUT"
            )
            if expected <= 0:
                continue
            wastage_pct = (actual - expected) / expected * 100.0
            if wastage_pct < threshold:
                continue
            severity = "high" if wastage_pct >= 20 else "medium"
            item_code = item.item_code or str(line.item_id)
            out.append({
                "natural_key": f"trim_overconsumption:order:{order.id}:item:{line.item_id}",
                "title": f"Order {order.order_code} · {item_code} trim overconsumption",
                "description": f"Trim wastage vs BOM: {wastage_pct:+.1f}% (expected {expected:.2f}, actual {actual:.2f}).",
                "severity": severity,
                "reason_text": f"Trim item; expected {expected:.2f}, actual {actual:.2f}; {wastage_pct:+.1f}%.",
                "recommended_action": "Review trim issue policy and consumption; adjust BOM if needed.",
                "entity_type": "order",
                "entity_id": order.id,
                "order_id": order.id,
            })
    return out


async def rule_trim_overconsumption_above(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Trim items only: actual consumption vs BOM above threshold (e.g. 10%)."""
    threshold = (config or {}).get("trim_wastage_threshold_pct", TRIM_WASTAGE_THRESHOLD_PCT)
    mov_result = await db.execute(
        select(StockMovement.reference_id).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.reference_type == "CONSUMPTION_ISSUE",
            StockMovement.reference_id.isnot(None),
        ).distinct()
    )
    ref_ids = [r[0] for r in mov_result.scalars().all() if r[0] is not None]
    if not ref_ids:
        return []
    from app.models import GarmentStyle
    ord_stmt = select(Order).where(
        Order.tenant_id == tenant_id,
        Order.id.in_(ref_ids),
        Order.quotation_id.isnot(None),
    )
    ord_result = await db.execute(ord_stmt)
    orders = list(ord_result.scalars().all())
    out: list[dict[str, Any]] = []
    for order in orders:
        if not order.quotation_id:
            continue
        quotation = await db.get(Quotation, order.quotation_id)
        if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
            continue
        style_id = quotation.style_id
        order_qty = _to_float(str(order.quantity)) if order.quantity is not None else 0.0
        if order_qty <= 0:
            continue
        bom_result = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.style_id == style_id,
            ).order_by(Bom.version_no.desc()).limit(1)
        )
        bom = bom_result.scalar_one_or_none()
        if not bom:
            continue
        lines_result = await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant_id,
                BomItem.bom_id == bom.id,
                BomItem.item_id.isnot(None),
            )
        )
        for line in lines_result.scalars().all():
            item = await db.get(Item, line.item_id)
            if not item or item.tenant_id != tenant_id:
                continue
            cat = await db.get(ItemCategory, item.category_id) if item.category_id else None
            if _wastage_category_from_item(item, cat) != "trim":
                continue
            base = _to_float(line.base_consumption)
            wastage = _to_float(line.wastage_pct) / 100.0
            expected = order_qty * base * (1.0 + wastage)
            mov_q = await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "CONSUMPTION_ISSUE",
                    StockMovement.reference_id == order.id,
                    StockMovement.item_id == line.item_id,
                )
            )
            actual = sum(
                _to_float(m.quantity) for m in mov_q.scalars().all()
                if (m.movement_type or "").upper() == "OUT"
            )
            if expected <= 0:
                continue
            wastage_pct = (actual - expected) / expected * 100.0
            if wastage_pct < threshold:
                continue
            severity = "high"
            item_code = item.item_code or str(line.item_id)
            out.append({
                "natural_key": f"trim_overconsumption:order:{order.id}:item:{line.item_id}",
                "title": f"Order {order.order_code} · {item_code} trim overconsumption",
                "description": f"Trim wastage vs BOM: {wastage_pct:+.1f}% (expected {expected:.2f}, actual {actual:.2f}).",
                "severity": severity,
                "reason_text": f"Trim item; expected {expected:.2f}, actual {actual:.2f}; {wastage_pct:+.1f}%.",
                "recommended_action": "Review trim issue policy; tighten trim BOM or process.",
                "entity_type": "order",
                "entity_id": order.id,
                "order_id": order.id,
            })
    return out


CLOSED_TNA_ACTION_STATUSES = ("completed", "approved", "cancelled")
TNA_DUE_SOON_DAYS = 7


async def rule_tna_action_overdue(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """TNA action overdue: planned_date < today, status not completed/approved/cancelled, is_active."""
    today = date.today()
    stmt = select(OrderFollowupAction).where(
        and_(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.is_active == True,
            OrderFollowupAction.planned_date.isnot(None),
            OrderFollowupAction.planned_date < today,
            OrderFollowupAction.status.notin_(CLOSED_TNA_ACTION_STATUSES),
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        days_overdue = (today - r.planned_date).days
        severity = "critical" if days_overdue > 7 else "high"
        out.append({
            "natural_key": f"tna_action_overdue:action:{r.id}",
            "title": r.title or f"TNA action #{r.id}",
            "description": f"TNA action overdue by {days_overdue} day(s). Planned {r.planned_date}.",
            "severity": severity,
            "reason_text": f"Planned date {r.planned_date}, {days_overdue} days overdue.",
            "recommended_action": "Complete or reschedule the action.",
            "entity_type": "followup_action",
            "entity_id": r.id,
            "order_id": r.order_id,
        })
    return out


async def rule_tna_action_due_soon(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """TNA action due soon: planned_date in [today, today+N], status open, is_active. Config: tna_due_soon_days (default 7)."""
    today = date.today()
    n_days = (config or {}).get("tna_due_soon_days", TNA_DUE_SOON_DAYS)
    due_end = today + timedelta(days=n_days)
    stmt = select(OrderFollowupAction).where(
        and_(
            OrderFollowupAction.tenant_id == tenant_id,
            OrderFollowupAction.is_active == True,
            OrderFollowupAction.planned_date.isnot(None),
            OrderFollowupAction.planned_date >= today,
            OrderFollowupAction.planned_date <= due_end,
            OrderFollowupAction.status.notin_(CLOSED_TNA_ACTION_STATUSES),
        )
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        days_until = (r.planned_date - today).days
        out.append({
            "natural_key": f"tna_action_due_soon:action:{r.id}",
            "title": r.title or f"TNA action #{r.id}",
            "description": f"TNA action due in {days_until} day(s). Planned {r.planned_date}.",
            "severity": "medium",
            "reason_text": f"Planned date {r.planned_date}, due in {days_until} days.",
            "recommended_action": "Review and complete before due date.",
            "entity_type": "followup_action",
            "entity_id": r.id,
            "order_id": r.order_id,
        })
    return out


RULE_REGISTRY: dict[str, callable] = {
    "followup_overdue": rule_followup_overdue,
    "tna_action_overdue": rule_tna_action_overdue,
    "tna_action_due_soon": rule_tna_action_due_soon,
    "order_missing_delivery_date": rule_order_missing_delivery_date,
    "quotation_pending_too_long": rule_quotation_pending_too_long,
    "order_missing_tna": rule_order_missing_tna,
    "wastage_vs_bom": rule_wastage_vs_bom,
    "trim_overconsumption_above": rule_trim_overconsumption_above,
}

DEFAULT_DEFINITIONS: list[dict[str, Any]] = [
    {"rule_key": "followup_overdue", "name": "Follow-up overdue", "severity_default": "high", "entity_type": "followup"},
    {"rule_key": "tna_action_overdue", "name": "TNA action overdue", "severity_default": "high", "entity_type": "followup_action"},
    {"rule_key": "tna_action_due_soon", "name": "TNA action due soon", "severity_default": "medium", "entity_type": "followup_action"},
    {"rule_key": "order_missing_delivery_date", "name": "Order missing delivery date", "severity_default": "high", "entity_type": "order"},
    {"rule_key": "quotation_pending_too_long", "name": "Quotation pending too long", "severity_default": "medium", "entity_type": "quotation"},
    {"rule_key": "order_missing_tna", "name": "Order has no TNA plan", "severity_default": "high", "entity_type": "order"},
    {"rule_key": "wastage_vs_bom", "name": "High wastage vs BOM", "severity_default": "medium", "entity_type": "order"},
    {"rule_key": "trim_overconsumption_above", "name": "Trim overconsumption above threshold", "severity_default": "high", "entity_type": "order"},
]
