"""Merch Critical Alert rules: evaluate conditions and return raw alert payloads for upsert."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bom,
    BomItem,
    CmCostActual,
    ConsumptionPlan,
    Followup,
    ManufacturingTnaPlan,
    Order,
    OrderFollowupAction,
    Quotation,
    StockMovement,
    TradeCase,
    Shipment,
    TradeDocument,
    MasterContract,
    BtbLc,
    BtbLcAccounting,
)
from app.models.merch import ConsumptionPlanItem
from app.models.costing import Item, ItemCategory, ItemUnit


ACTIVE_ORDER_STATUSES = ("NEW", "IN_PROGRESS", "CONFIRMED")
QUOTATION_PENDING_DAYS = 7

TRADE_RULE_KEYS = frozenset({
    "trade_lc_expiry_soon",
    "trade_docs_missing_before_etd",
    "trade_shipment_delayed",
    "trade_case_stuck",
    "master_contract_btb_utilization_risk",
    "btb_lc_maturity_due_or_overdue",
})
FOLLOWUP_CRITICAL_DAYS = 7
WASTAGE_THRESHOLD_PCT = 15.0
TRIM_WASTAGE_THRESHOLD_PCT = 10.0


def _to_float(value: str | int | float | Decimal | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
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


def _evidence_schema_v1(
    rule_key: str,
    *,
    thresholds: dict[str, Any] | None = None,
    facts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Structured facts + thresholds for API/UI (schema_version 1)."""
    return {
        "schema_version": 1,
        "rule_key": rule_key,
        "evaluated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "thresholds": thresholds or {},
        "facts": facts or {},
    }


def _d(val: date | datetime | None) -> str | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    return val.isoformat()


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
            "evidence_json": _evidence_schema_v1(
                "followup_overdue",
                thresholds={"critical_after_days": critical_days},
                facts={
                    "followup_id": r.id,
                    "order_id": r.order_id,
                    "due_date": _d(r.due_date),
                    "days_overdue": days_overdue,
                    "followup_status": r.status,
                },
            ),
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
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append({
            "natural_key": f"order_missing_delivery_date:order:{r.id}",
            "title": f"Order {r.order_code} missing delivery date",
            "description": f"Order {r.order_code} has status {r.status} but no delivery date set.",
            "severity": "high",
            "reason_text": "Delivery date is required for planning and TNA.",
            "recommended_action": "Set delivery date (and trigger TNA if applicable).",
            "entity_type": "order",
            "entity_id": r.id,
            "order_id": r.id,
            "evidence_json": _evidence_schema_v1(
                "order_missing_delivery_date",
                facts={
                    "order_id": r.id,
                    "order_code": r.order_code,
                    "order_status": r.status,
                },
            ),
        })
    return out


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
                "evidence_json": _evidence_schema_v1(
                    "quotation_pending_too_long",
                    thresholds={"quotation_pending_days": days},
                    facts={
                        "quotation_id": r.id,
                        "quotation_code": r.quotation_code,
                        "quotation_status": r.status,
                        "reference_date": ref_date.isoformat(),
                        "cutoff_date": cutoff.isoformat(),
                    },
                ),
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
            "evidence_json": _evidence_schema_v1(
                "order_missing_tna",
                thresholds={"critical_if_delivery_within_days": 14},
                facts={
                    "order_id": o.id,
                    "order_code": o.order_code,
                    "delivery_date": _d(o.delivery_date),
                    "days_to_delivery": days_to_delivery,
                    "order_status": o.status,
                },
            ),
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
                "evidence_json": _evidence_schema_v1(
                    "wastage_vs_bom",
                    thresholds={"wastage_threshold_pct": threshold},
                    facts={
                        "order_id": order.id,
                        "order_code": order.order_code,
                        "style_id": style_id,
                        "bom_id": bom.id,
                        "item_id": line.item_id,
                        "item_code": item_code,
                        "expected_qty": round(expected, 4),
                        "actual_qty": round(actual, 4),
                        "wastage_pct_vs_bom": round(wastage_pct, 2),
                    },
                ),
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
            if cat and cat.tenant_id != tenant_id:
                cat = None
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
                "evidence_json": _evidence_schema_v1(
                    "trim_overconsumption_above",
                    thresholds={"trim_wastage_threshold_pct": threshold},
                    facts={
                        "order_id": order.id,
                        "order_code": order.order_code,
                        "style_id": style_id,
                        "bom_id": bom.id,
                        "item_id": line.item_id,
                        "item_code": item_code,
                        "expected_qty": round(expected, 4),
                        "actual_qty": round(actual, 4),
                        "wastage_pct_vs_bom": round(wastage_pct, 2),
                    },
                ),
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
            "evidence_json": _evidence_schema_v1(
                "tna_action_overdue",
                thresholds={"critical_after_days": 7},
                facts={
                    "action_id": r.id,
                    "order_id": r.order_id,
                    "planned_date": _d(r.planned_date),
                    "days_overdue": days_overdue,
                    "action_status": r.status,
                },
            ),
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
            "evidence_json": _evidence_schema_v1(
                "tna_action_due_soon",
                thresholds={"tna_due_soon_days": n_days},
                facts={
                    "action_id": r.id,
                    "order_id": r.order_id,
                    "planned_date": _d(r.planned_date),
                    "days_until_due": days_until,
                },
            ),
        })
    return out


async def rule_trade_lc_expiry_soon(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Trade case with linked LC expiring soon."""
    days = int((config or {}).get("trade_lc_expiry_days", 14))
    cutoff = date.today() + timedelta(days=days)
    cases = (
        await db.execute(
            select(TradeCase).where(
                TradeCase.tenant_id == tenant_id,
                TradeCase.current_stage.notin_(("SETTLED",)),
            )
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for c in cases:
        expiry_date: date | None = None
        if c.master_contract_id:
            contract = await db.get(MasterContract, c.master_contract_id)
            if contract and contract.tenant_id == tenant_id:
                expiry_date = contract.expiry_date
        if not expiry_date and c.btb_lc_id:
            btb = await db.get(BtbLc, c.btb_lc_id)
            if btb and btb.tenant_id == tenant_id:
                expiry_date = btb.expiry_date
        if not expiry_date:
            continue
        if expiry_date <= cutoff:
            days_left = (expiry_date - date.today()).days
            severity = "critical" if days_left <= 3 else "high"
            out.append(
                {
                    "natural_key": f"trade_lc_expiry_soon:trade_case:{c.id}",
                    "title": f"Trade case {c.reference} LC expiry soon",
                    "description": f"Linked LC/contract expires in {days_left} day(s).",
                    "severity": severity,
                    "reason_text": f"Expiry date {expiry_date}.",
                    "recommended_action": "Review LC extension or expedite shipment and docs.",
                    "entity_type": "trade_case",
                    "entity_id": c.id,
                    "order_id": c.order_id,
                    "evidence_json": _evidence_schema_v1(
                        "trade_lc_expiry_soon",
                        thresholds={"trade_lc_expiry_days": days},
                        facts={
                            "trade_case_id": c.id,
                            "reference": c.reference,
                            "expiry_date": expiry_date.isoformat(),
                            "days_until_expiry": days_left,
                            "master_contract_id": c.master_contract_id,
                            "btb_lc_id": c.btb_lc_id,
                        },
                    ),
                }
            )
    return out


async def rule_trade_docs_missing_before_etd(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Trade case near ETD with missing core docs."""
    days = int((config or {}).get("trade_docs_before_etd_days", 5))
    required_docs = {str(x).upper() for x in ((config or {}).get("trade_required_docs") or ["PI", "INVOICE", "PACKING_LIST"])}
    cutoff = date.today() + timedelta(days=days)
    cases = (
        await db.execute(
            select(TradeCase).where(
                TradeCase.tenant_id == tenant_id,
                TradeCase.current_stage.notin_(("SETTLED",)),
                TradeCase.etd.isnot(None),
                TradeCase.etd <= cutoff,
            )
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for c in cases:
        docs = (
            await db.execute(
                select(TradeDocument.document_type).where(
                    TradeDocument.tenant_id == tenant_id,
                    TradeDocument.trade_case_id == c.id,
                )
            )
        ).scalars().all()
        have = {str(d).upper() for d in docs}
        missing = sorted(required_docs - have)
        if not missing:
            continue
        days_left = (c.etd - date.today()).days if c.etd else 999
        severity = "critical" if days_left <= 2 else "high"
        out.append(
            {
                "natural_key": f"trade_docs_missing_before_etd:trade_case:{c.id}",
                "title": f"Trade case {c.reference} missing docs before ETD",
                "description": f"Missing documents before ETD: {', '.join(missing)}.",
                "severity": severity,
                "reason_text": f"ETD {c.etd}; missing {', '.join(missing)}.",
                "recommended_action": "Upload missing shipping/commercial documents immediately.",
                "entity_type": "trade_case",
                "entity_id": c.id,
                "order_id": c.order_id,
                "evidence_json": _evidence_schema_v1(
                    "trade_docs_missing_before_etd",
                    thresholds={
                        "trade_docs_before_etd_days": days,
                        "trade_required_docs": sorted(required_docs),
                    },
                    facts={
                        "trade_case_id": c.id,
                        "reference": c.reference,
                        "etd": _d(c.etd),
                        "days_to_etd": days_left,
                        "missing_doc_types": missing,
                    },
                ),
            }
        )
    return out


async def rule_trade_shipment_delayed(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Shipment has ETA in the past and not delivered/closed."""
    delayed_status_block = {"DELIVERED", "CLOSED"}
    rows = (
        await db.execute(
            select(Shipment).where(
                Shipment.tenant_id == tenant_id,
                Shipment.eta.isnot(None),
                Shipment.eta < date.today(),
            )
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for s in rows:
        if (s.status or "").upper() in delayed_status_block:
            continue
        days_over = (date.today() - s.eta).days if s.eta else 0
        case = await db.get(TradeCase, s.trade_case_id)
        if not case or case.tenant_id != tenant_id:
            continue
        out.append(
            {
                "natural_key": f"trade_shipment_delayed:shipment:{s.id}",
                "title": f"Shipment {s.reference} delayed",
                "description": f"Shipment ETA passed by {days_over} day(s).",
                "severity": "high" if days_over < 5 else "critical",
                "reason_text": f"ETA {s.eta}, status {s.status}.",
                "recommended_action": "Follow up with carrier and update ETA/status.",
                "entity_type": "shipment",
                "entity_id": s.id,
                "order_id": case.order_id,
                "evidence_json": _evidence_schema_v1(
                    "trade_shipment_delayed",
                    facts={
                        "shipment_id": s.id,
                        "trade_case_id": case.id,
                        "reference": s.reference,
                        "eta": _d(s.eta),
                        "days_past_eta": days_over,
                        "shipment_status": s.status,
                    },
                ),
            }
        )
    return out


async def rule_trade_case_stuck(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Trade case not updated for configured days and not settled."""
    days = int((config or {}).get("trade_case_stuck_days", 10))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        await db.execute(
            select(TradeCase).where(
                TradeCase.tenant_id == tenant_id,
                TradeCase.current_stage.notin_(("SETTLED",)),
                TradeCase.updated_at < cutoff,
            )
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for c in rows:
        out.append(
            {
                "natural_key": f"trade_case_stuck:trade_case:{c.id}",
                "title": f"Trade case {c.reference} stuck in {c.current_stage}",
                "description": f"No updates in the last {days} day(s).",
                "severity": "medium",
                "reason_text": f"Last update at {c.updated_at.isoformat()}.",
                "recommended_action": "Review blockers and move case to next stage.",
                "entity_type": "trade_case",
                "entity_id": c.id,
                "order_id": c.order_id,
                "evidence_json": _evidence_schema_v1(
                    "trade_case_stuck",
                    thresholds={"trade_case_stuck_days": days},
                    facts={
                        "trade_case_id": c.id,
                        "reference": c.reference,
                        "current_stage": c.current_stage,
                        "last_updated_at": c.updated_at.isoformat() if c.updated_at else None,
                    },
                ),
            }
        )
    return out


def _utilization_band(percent: float) -> str:
    if percent < 50:
        return "VERY_GOOD"
    if percent < 60:
        return "GOOD"
    if percent < 65:
        return "SATISFACTORY"
    if percent <= 70:
        return "NO_CREDIT"
    return "RED_FLAG"


async def rule_master_contract_btb_utilization_risk(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Alert when master contract BTB utilization reaches risk zone.

    Defaults:
    - minimum_alert_pct = 65
    - red_flag_pct = 70
    """
    minimum_alert_pct = float((config or {}).get("minimum_alert_pct", 65))
    red_flag_pct = float((config or {}).get("red_flag_pct", 70))
    rows = (
        await db.execute(
            select(MasterContract).where(
                MasterContract.tenant_id == tenant_id,
                MasterContract.amount.isnot(None),
                MasterContract.amount > 0,
            )
        )
    ).scalars().all()
    out: list[dict[str, Any]] = []
    for contract in rows:
        amount = float(contract.amount or 0)
        utilized = float(contract.btb_utilized_amount or 0)
        if amount <= 0:
            continue
        pct = (utilized / amount) * 100
        if pct < minimum_alert_pct:
            continue
        band = _utilization_band(pct)
        if pct > red_flag_pct:
            severity = "critical"
        elif pct >= red_flag_pct:
            severity = "high"
        else:
            severity = "medium"
        out.append(
            {
                "natural_key": f"master_contract_btb_utilization_risk:master_contract:{contract.id}",
                "title": f"Master contract {contract.reference} BTB utilization at {pct:.1f}%",
                "description": (
                    f"BTB utilization is {pct:.1f}% ({utilized:.2f} of {amount:.2f}), "
                    f"band: {band.replace('_', ' ')}."
                ),
                "severity": severity,
                "reason_text": (
                    f"Utilized {utilized:.2f} against amount {amount:.2f}; threshold {minimum_alert_pct:.1f}%."
                ),
                "recommended_action": (
                    "Review BTB opening approvals and raw material costing to stay within policy."
                ),
                "entity_type": "master_contract",
                "entity_id": contract.id,
                "order_id": None,
                "evidence_json": _evidence_schema_v1(
                    "master_contract_btb_utilization_risk",
                    thresholds={
                        "minimum_alert_pct": minimum_alert_pct,
                        "red_flag_pct": red_flag_pct,
                    },
                    facts={
                        "master_contract_id": contract.id,
                        "reference": contract.reference,
                        "contract_amount": amount,
                        "btb_utilized_amount": utilized,
                        "utilization_pct": round(pct, 2),
                        "band": band,
                    },
                ),
            }
        )
    return out


async def rule_btb_lc_maturity_due_or_overdue(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """Alert when BTB LC maturity is near or overdue and not realized.

    Defaults:
    - due_soon_days = 7
    """
    due_soon_days = int((config or {}).get("due_soon_days", 7))
    today = date.today()
    due_cutoff = today + timedelta(days=due_soon_days)
    rows = (
        await db.execute(
            select(BtbLcAccounting, BtbLc)
            .join(BtbLc, BtbLc.id == BtbLcAccounting.btb_lc_id)
            .where(
                BtbLcAccounting.tenant_id == tenant_id,
                BtbLc.tenant_id == tenant_id,
                BtbLcAccounting.status != "REALIZED",
                BtbLcAccounting.maturity_date.isnot(None),
            )
        )
    ).all()
    out: list[dict[str, Any]] = []
    for acc, lc in rows:
        maturity = acc.maturity_date
        if maturity is None:
            continue
        if maturity > due_cutoff:
            continue
        days_delta = (maturity - today).days
        if days_delta < 0:
            severity = "critical"
            description = f"Maturity overdue by {abs(days_delta)} day(s)."
        elif days_delta <= 2:
            severity = "high"
            description = f"Maturity due in {days_delta} day(s)."
        else:
            severity = "medium"
            description = f"Maturity due in {days_delta} day(s)."
        out.append(
            {
                "natural_key": f"btb_lc_maturity_due_or_overdue:btb_lc:{lc.id}",
                "title": f"BTB LC {lc.reference} maturity risk",
                "description": description,
                "severity": severity,
                "reason_text": (
                    f"Maturity date {maturity.isoformat()}, status {acc.status}, due soon window {due_soon_days} days."
                ),
                "recommended_action": (
                    "Complete documents acceptance/realization and ensure payment readiness before maturity."
                ),
                "entity_type": "btb_lc",
                "entity_id": lc.id,
                "order_id": None,
                "evidence_json": _evidence_schema_v1(
                    "btb_lc_maturity_due_or_overdue",
                    thresholds={"due_soon_days": due_soon_days},
                    facts={
                        "btb_lc_id": lc.id,
                        "lc_reference": lc.reference,
                        "accounting_id": acc.id,
                        "maturity_date": maturity.isoformat(),
                        "days_to_maturity": days_delta,
                        "accounting_status": acc.status,
                    },
                ),
            }
        )
    return out


async def rule_production_cm_overrun(
    db: AsyncSession, tenant_id: int, config: dict[str, Any] | None
) -> list[dict[str, Any]]:
    """CM actual exceeds quoted CM beyond tenant threshold (see production CM recalc)."""
    stmt = (
        select(CmCostActual, Order)
        .outerjoin(Order, Order.id == CmCostActual.order_id)
        .where(
            CmCostActual.tenant_id == tenant_id,
            CmCostActual.is_over_budget.is_(True),
            CmCostActual.order_id.isnot(None),
        )
    )
    result = await db.execute(stmt)
    out: list[dict[str, Any]] = []
    for cm, ord_row in result.all():
        oid = int(cm.order_id)  # type: ignore[arg-type]
        sid = int(cm.style_id) if cm.style_id is not None else 0
        pd = cm.period_date.isoformat()
        natural_key = f"production_cm_overrun:order:{oid}:period:{pd}:style:{sid}"
        code = ord_row.order_code if ord_row else f"#{oid}"
        actual = float(cm.actual_cm_per_piece or 0)
        quoted = float(cm.quoted_cm_per_piece or 0)
        var_pct = float(cm.variance_pct or 0)
        severity = "high" if var_pct > 20 else "medium"
        out.append(
            {
                "natural_key": natural_key,
                "title": f"CM overrun: order {code} ({pd})",
                "description": (
                    f"Actual CM {actual:.4f} vs quoted {quoted:.4f} per piece "
                    f"(variance {var_pct:.1f}%)."
                ),
                "severity": severity,
                "reason_text": f"Production CM recalc flagged spend vs quoted CM for period {pd}.",
                "recommended_action": "Review line efficiency, rework, and costing inputs; adjust quote or recover variance.",
                "entity_type": "order",
                "entity_id": oid,
                "order_id": oid,
                "evidence_json": _evidence_schema_v1(
                    "production_cm_overrun",
                    thresholds={"high_severity_variance_pct": 20},
                    facts={
                        "order_id": oid,
                        "order_code": code,
                        "period_date": pd,
                        "style_id": sid,
                        "actual_cm_per_piece": round(actual, 6),
                        "quoted_cm_per_piece": round(quoted, 6),
                        "variance_pct": round(var_pct, 2),
                    },
                ),
            }
        )
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
    "trade_lc_expiry_soon": rule_trade_lc_expiry_soon,
    "trade_docs_missing_before_etd": rule_trade_docs_missing_before_etd,
    "trade_shipment_delayed": rule_trade_shipment_delayed,
    "trade_case_stuck": rule_trade_case_stuck,
    "master_contract_btb_utilization_risk": rule_master_contract_btb_utilization_risk,
    "btb_lc_maturity_due_or_overdue": rule_btb_lc_maturity_due_or_overdue,
    "production_cm_overrun": rule_production_cm_overrun,
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
    {"rule_key": "trade_lc_expiry_soon", "name": "Trade LC expiry soon", "severity_default": "high", "entity_type": "trade_case"},
    {"rule_key": "trade_docs_missing_before_etd", "name": "Trade docs missing before ETD", "severity_default": "high", "entity_type": "trade_case"},
    {"rule_key": "trade_shipment_delayed", "name": "Trade shipment delayed", "severity_default": "high", "entity_type": "shipment"},
    {"rule_key": "trade_case_stuck", "name": "Trade case stuck in stage", "severity_default": "medium", "entity_type": "trade_case"},
    {"rule_key": "master_contract_btb_utilization_risk", "name": "Master contract BTB utilization risk", "severity_default": "high", "entity_type": "master_contract"},
    {"rule_key": "btb_lc_maturity_due_or_overdue", "name": "BTB LC maturity due/overdue", "severity_default": "high", "entity_type": "btb_lc"},
    {"rule_key": "production_cm_overrun", "name": "Production CM overrun vs quote", "severity_default": "high", "entity_type": "order"},
]
