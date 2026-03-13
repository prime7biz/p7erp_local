from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool.authz import has_tool_permission
from app.modules.ai_tool.forecast.adapters import (
    CapacityShortfallForecastAdapter,
    CashFlowProjectionAdapter,
    InventoryShortageForecastAdapter,
    ProductionOutputForecastAdapter,
    ReceivableRiskForecastAdapter,
    ShipmentDelayRiskForecastAdapter,
)
from app.modules.ai_tool.schemas import AiToolInvocationResult


@dataclass(slots=True)
class ForecastTemplate:
    forecast_code: str
    forecast_name: str
    source_modules: list[str]
    required_permission_keys: list[str]
    adapter_name: str


FORECAST_TEMPLATES: dict[str, ForecastTemplate] = {
    "cash_flow_projection": ForecastTemplate(
        forecast_code="cash_flow_projection",
        forecast_name="Cash Flow Projection",
        source_modules=["finance"],
        required_permission_keys=["ai.tools.finance.read"],
        adapter_name="cashflow",
    ),
    "inventory_shortage_forecast": ForecastTemplate(
        forecast_code="inventory_shortage_forecast",
        forecast_name="Inventory Shortage Forecast",
        source_modules=["inventory"],
        required_permission_keys=["ai.tools.inventory.read"],
        adapter_name="inventory_shortage",
    ),
    "production_output_forecast": ForecastTemplate(
        forecast_code="production_output_forecast",
        forecast_name="Production Output Forecast",
        source_modules=["manufacturing"],
        required_permission_keys=["ai.tools.production.read"],
        adapter_name="production_output",
    ),
    "shipment_delay_risk_projection": ForecastTemplate(
        forecast_code="shipment_delay_risk_projection",
        forecast_name="Shipment Delay Risk Projection",
        source_modules=["orders"],
        required_permission_keys=["ai.tools.orders.read"],
        adapter_name="shipment_delay",
    ),
    "receivable_risk_outlook": ForecastTemplate(
        forecast_code="receivable_risk_outlook",
        forecast_name="Receivable Risk Outlook",
        source_modules=["finance"],
        required_permission_keys=["ai.tools.finance.read"],
        adapter_name="receivable_risk",
    ),
    "capacity_shortfall_projection": ForecastTemplate(
        forecast_code="capacity_shortfall_projection",
        forecast_name="Capacity Shortfall Projection",
        source_modules=["manufacturing"],
        required_permission_keys=["ai.tools.production.read"],
        adapter_name="capacity_shortfall",
    ),
}


def detect_forecast_template(prompt: str) -> ForecastTemplate:
    text = prompt.lower()
    if "cash" in text and ("flow" in text or "liquidity" in text):
        return FORECAST_TEMPLATES["cash_flow_projection"]
    if "inventory" in text and ("shortage" in text or "stockout" in text or "stock out" in text):
        return FORECAST_TEMPLATES["inventory_shortage_forecast"]
    if "production" in text and ("output" in text or "projection" in text or "forecast" in text):
        return FORECAST_TEMPLATES["production_output_forecast"]
    if "shipment" in text and ("delay" in text or "risk" in text):
        return FORECAST_TEMPLATES["shipment_delay_risk_projection"]
    if "receivable" in text or ("ar" in text and "risk" in text):
        return FORECAST_TEMPLATES["receivable_risk_outlook"]
    if "capacity" in text and ("shortfall" in text or "gap" in text):
        return FORECAST_TEMPLATES["capacity_shortfall_projection"]
    return FORECAST_TEMPLATES["production_output_forecast"]


def _resolve_adapter(template: ForecastTemplate, db: AsyncSession, tenant_id: int):
    if template.adapter_name == "cashflow":
        return CashFlowProjectionAdapter(db=db, tenant_id=tenant_id)
    if template.adapter_name == "inventory_shortage":
        return InventoryShortageForecastAdapter(db=db, tenant_id=tenant_id)
    if template.adapter_name == "production_output":
        return ProductionOutputForecastAdapter(db=db, tenant_id=tenant_id)
    if template.adapter_name == "shipment_delay":
        return ShipmentDelayRiskForecastAdapter(db=db, tenant_id=tenant_id)
    if template.adapter_name == "receivable_risk":
        return ReceivableRiskForecastAdapter(db=db, tenant_id=tenant_id)
    return CapacityShortfallForecastAdapter(db=db, tenant_id=tenant_id)


async def execute_forecast_request(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: Any,
    prompt: str,
    horizon_days: int = 30,
    from_date: date | None = None,
    to_date: date | None = None,
) -> tuple[ForecastTemplate | None, dict[str, Any] | None, str | None, str | None]:
    template = detect_forecast_template(prompt)
    for permission_key in template.required_permission_keys:
        allowed = await has_tool_permission(db, user, permission_key)
        if not allowed:
            return None, None, None, f"Permission denied for forecast template {template.forecast_code}"
    adapter = _resolve_adapter(template, db, tenant_id)
    payload = {
        "prompt": prompt,
        "horizon_days": max(7, min(365, int(horizon_days))),
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
    }
    result = await adapter.run(payload)
    confidence = result.get("confidence_score")
    narrative = (
        f"{template.forecast_name} generated with confidence {confidence}. "
        "Projection depends on historical trend assumptions and may vary with new data."
    )
    return template, result, narrative, None


def build_forecast_tool_result(template: ForecastTemplate, payload: dict[str, Any], narrative: str) -> AiToolInvocationResult:
    return AiToolInvocationResult(
        tool_name="generate_forecast",
        status="SUCCESS",
        summary=narrative,
        source_area="forecast",
        data={
            "forecast_metadata": {
                "forecast_code": template.forecast_code,
                "forecast_name": template.forecast_name,
                "source_modules": template.source_modules,
            },
            "assumptions": payload.get("assumptions", {}),
            "confidence_score": payload.get("confidence_score"),
            "limitations": payload.get("limitations"),
            "forecast_points": payload.get("forecast_points", []),
            **{k: v for k, v in payload.items() if k not in {"assumptions", "confidence_score", "limitations", "forecast_points"}},
        },
    )
