"""MCP / async forecast orchestration (sync completion using existing adapters)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.models.ai_tool import AiForecastRun
from app.modules.ai_tool import repository
from app.modules.ai_tool.forecast.validators import summarize_payload_quality
from app.modules.ai_tool.forecasting import execute_forecast_request

_TARGET_PROMPTS: dict[str, str] = {
    "inventory_consumption": "inventory shortage forecast for consumption",
    "shipment_delay_risk": "shipment delay risk projection",
    "sales_trend": "sales trend outlook",
    "margin_trend": "margin trend projection",
    "manpower_load": "production output capacity forecast",
}


def _parse_timeframe(timeframe: str) -> int:
    t = (timeframe or "30d").strip().lower()
    if t.endswith("d"):
        try:
            return max(7, min(365, int(t[:-1] or 30)))
        except ValueError:
            return 30
    return 30


async def _first_tenant_user(db: AsyncSession, tenant_id: int) -> User | None:
    r = await db.scalars(select(User).where(User.tenant_id == tenant_id).order_by(User.id.asc()).limit(1))
    return r.first()


async def run_forecast_for_mcp(
    db: AsyncSession,
    *,
    tenant_id: int,
    target_variable: str,
    timeframe: str,
    parameters: dict[str, Any] | None,
    request_id: str | None = None,
) -> dict[str, Any]:
    user = await _first_tenant_user(db, tenant_id)
    if not user:
        return {"status": "FAILED", "message": "No tenant user found to evaluate forecast permissions."}

    prompt = _TARGET_PROMPTS.get(
        (target_variable or "").strip().lower(),
        "production output forecast",
    )
    horizon = _parse_timeframe(timeframe)
    settings = get_settings()
    if horizon > settings.forecast_sync_max_horizon_days:
        return {
            "status": "FAILED",
            "message": (
                f"Forecast horizon {horizon}d exceeds sync limit of "
                f"{settings.forecast_sync_max_horizon_days}d. Reduce timeframe or enable async forecasting."
            ),
        }
    params = dict(parameters or {})
    from_date = params.get("from_date")
    to_date = params.get("to_date")

    try:
        template, payload, narrative, err = await asyncio.wait_for(
            execute_forecast_request(
                db,
                tenant_id=tenant_id,
                user=user,
                prompt=prompt,
                horizon_days=horizon,
                from_date=from_date,
                to_date=to_date,
            ),
            timeout=settings.forecast_sync_timeout_seconds,
        )
    except asyncio.TimeoutError:
        return {
            "status": "FAILED",
            "message": "Forecast generation timed out. Try a shorter timeframe.",
        }
    if err or not template or payload is None or narrative is None:
        return {"status": "FAILED", "message": err or "Forecast could not be generated."}

    forecast_run = await repository.create_forecast_run(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        session_id=None,
        request_id=request_id,
        forecast_code=template.forecast_code,
        forecast_name=template.forecast_name,
        source_modules=template.source_modules,
        assumptions_json=payload.get("assumptions", {}),
        parameters_json={"target_variable": target_variable, "timeframe": timeframe, **params},
    )
    quality = summarize_payload_quality(payload)
    expires_at = datetime.utcnow() + timedelta(days=max(1, horizon // 3))
    await repository.complete_forecast_run(
        db,
        row=forecast_run,
        status="SUCCESS",
        confidence_score=payload.get("confidence_score"),
        narrative_explanation=narrative,
        result_json=payload,
    )
    forecast_run.model_type = "heuristic_v1"
    forecast_run.model_version = "1.0"
    forecast_run.quality_metrics = quality
    forecast_run.expires_at = expires_at
    await db.flush()

    chart_data = [
        {"date": p.get("date"), "value": p.get("value") or p.get("predicted")}
        for p in (payload.get("forecast_points") or [])
        if isinstance(p, dict)
    ]
    chart_config = {
        "type": "line",
        "title": f"{template.forecast_name} ({target_variable})",
        "x_axis": {"field": "date", "label": "Date"},
        "y_axis": {"field": "value", "label": "Value"},
        "data": chart_data[:120],
    }

    return {
        "status": "SUCCESS",
        "forecast_run_id": forecast_run.id,
        "target_variable": target_variable,
        "timeframe": timeframe,
        "model_type": forecast_run.model_type,
        "model_version": forecast_run.model_version,
        "forecast_points": payload.get("forecast_points", []),
        "quality": quality,
        "confidence_score": payload.get("confidence_score"),
        "assumptions": payload.get("assumptions", {}),
        "limitations": payload.get("limitations"),
        "narrative_explanation": narrative,
        "expires_at": expires_at.isoformat(),
        "chart_config": chart_config,
    }
