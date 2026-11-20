"""Transparent rule-based order delay risk (Phase K). Weights are ILLUSTRATIVE config."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kpi_engine import KpiPrediction
from app.models.merch import Order
from app.modules.kpi_engine.compute.service import OPEN_ORDER_EXCLUDED
from app.modules.kpi_engine.compute_base import utcnow

# Illustrative configuration — not an industry benchmark.
ORDER_DELAY_WEIGHTS = {
    "material_risk": Decimal("0.25"),
    "milestone_slippage": Decimal("0.15"),
    "capacity_gap": Decimal("0.15"),
    "production_attainment": Decimal("0.15"),
    "quality_rework": Decimal("0.10"),
    "external_process": Decimal("0.10"),
    "commercial_logistics": Decimal("0.10"),
}
MODEL_VERSION = "rules-order-delay-v1"


async def score_order_delay_risk(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
) -> dict[str, Any]:
    order = (
        await db.execute(
            select(Order).where(Order.id == order_id, Order.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not order:
        return {"error": "not_found"}

    # Transparent 0-100 factor scores from available signals only.
    features: dict[str, float] = {}
    from datetime import date

    today = date.today()
    if order.delivery_date and order.delivery_date < today:
        features["commercial_logistics"] = 90.0
    elif order.delivery_date and (order.delivery_date - today).days <= 7:
        features["commercial_logistics"] = 60.0
    else:
        features["commercial_logistics"] = 20.0

    status = (order.status or "").upper()
    if status in OPEN_ORDER_EXCLUDED:
        features["production_attainment"] = 10.0
    elif status in {"IN_PROGRESS", "CONFIRMED"}:
        features["production_attainment"] = 40.0
    else:
        features["production_attainment"] = 55.0

    # Unknown factors stay mid with labelled missing — never invent certainty.
    for key in ORDER_DELAY_WEIGHTS:
        features.setdefault(key, 50.0)

    score = Decimal("0")
    top: list[dict[str, Any]] = []
    for key, weight in ORDER_DELAY_WEIGHTS.items():
        part = Decimal(str(features[key])) * weight
        score += part
        top.append({"factor": key, "score": features[key], "weight": format(weight, "f")})
    top.sort(key=lambda x: x["score"], reverse=True)

    pred = KpiPrediction(
        tenant_id=tenant_id,
        prediction_code="order_delay_risk",
        subject_type="order",
        subject_id=order_id,
        model_version=MODEL_VERSION,
        score=score,
        confidence=Decimal("0.55"),
        features=features,
        top_factors=top[:5],
        predicted_at=utcnow(),
    )
    db.add(pred)
    await db.flush()
    return {
        "prediction_id": pred.id,
        "order_id": order_id,
        "score": format(score, "f"),
        "confidence": "0.55",
        "model_version": MODEL_VERSION,
        "top_factors": top[:5],
        "note": "Weights are ILLUSTRATIVE configuration, not a published benchmark.",
    }
