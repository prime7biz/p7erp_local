"""Finance cash-flow forecast narrative — heuristic projection + optional LLM text."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import safe_async_session_rollback
from app.modules.ai_tool.forecast.adapters import CashFlowProjectionAdapter

logger = logging.getLogger(__name__)

try:
    from app.common.gemini_client import generate_text_for_tenant
except Exception:  # pragma: no cover
    generate_text_for_tenant = None  # type: ignore[assignment]


def _heuristic_narrative(payload: dict[str, Any], horizon_days: int) -> str:
    points = payload.get("forecast_points") or []
    history = payload.get("history") or []
    confidence = payload.get("confidence_score")
    nets = [float(p.get("projected_net_cash") or 0) for p in points if isinstance(p, dict)]
    total = sum(nets)
    lookback = len(history)
    trend = "stable"
    if len(nets) >= 2:
        if nets[-1] > nets[0] * 1.05:
            trend = "improving"
        elif nets[-1] < nets[0] * 0.95:
            trend = "softening"
    conf_txt = f"{confidence:.0%}" if isinstance(confidence, (int, float)) else "n/a"
    return (
        f"Cash-flow heuristic over the next {horizon_days} days "
        f"({len(nets)} projected period(s)) based on {lookback} month(s) of payment-run / FX-receipt history. "
        f"Projected cumulative net is approximately {total:,.2f}; near-term trend looks {trend}. "
        f"Model confidence {conf_txt}. This is an advisory estimate, not a GL cash forecast."
    )


def _month_buckets(points: list[Any]) -> dict[str, dict[str, float]]:
    """Map projection points into month_1..month_3 for UI / acceptance shape."""
    cleaned = [p for p in points if isinstance(p, dict)]
    out: dict[str, dict[str, float]] = {}
    for i in range(3):
        p = cleaned[i] if i < len(cleaned) else {}
        net = float(p.get("projected_net_cash") or 0)
        inflow = float(p.get("projected_inflow") or p.get("inflow") or max(0.0, net))
        outflow = float(p.get("projected_outflow") or p.get("outflow") or max(0.0, -net if net < 0 else abs(inflow - net)))
        if not p.get("projected_inflow") and not p.get("inflow"):
            # Derive a simple split when only net is available
            inflow = abs(net) * 1.4 if net >= 0 else abs(net) * 0.6
            outflow = inflow - net
        out[f"month_{i + 1}"] = {
            "inflow": round(inflow, 2),
            "outflow": round(outflow, 2),
            "net_cash": round(net, 2),
            "expected_revenue": round(inflow * 0.85, 2),
            "expected_expenses": round(outflow * 0.9, 2),
        }
    return out


def _heuristic_risks(forecast: dict[str, dict[str, float]], narrative: str) -> list[dict[str, Any]]:
    risks: list[dict[str, Any]] = []
    m1 = forecast.get("month_1") or {}
    if float(m1.get("net_cash") or 0) < 0:
        risks.append(
            {
                "severity": "high",
                "description": "Month-1 projected net cash is negative.",
                "mitigation": "Accelerate collections on overdue invoices and defer non-critical PO releases.",
            }
        )
    nets = [float((forecast.get(f"month_{i}") or {}).get("net_cash") or 0) for i in (1, 2, 3)]
    if len(nets) >= 2 and nets[-1] < nets[0] * 0.85:
        risks.append(
            {
                "severity": "medium",
                "description": "Cash position softens across the 90-day horizon.",
                "mitigation": "Review LC expiry obligations and renegotiate payment terms with key buyers.",
            }
        )
    risks.append(
        {
            "severity": "low",
            "description": "Forecast is heuristic over payment history — P&L COGS mapping is not fully calibrated.",
            "mitigation": "Validate margin assumptions on top 5 styles before using for board reporting.",
        }
    )
    if "softening" in (narrative or "").lower() and not any(r["severity"] == "medium" for r in risks):
        risks.insert(
            0,
            {
                "severity": "medium",
                "description": "Near-term cash trend looks softening in the narrative summary.",
                "mitigation": "Stress-test 30-day collections vs committed fabric POs.",
            },
        )
    return risks[:3]


async def build_finance_forecast(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None = None,
    horizon_days: int = 90,
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict[str, Any]:
    """
    Wrap CashFlowProjectionAdapter and optionally add an LLM narrative.
    Fail-closed: projection errors return empty points + limitations; LLM failures keep heuristic text.
    """
    horizon = max(7, min(365, int(horizon_days or 90)))
    run_payload: dict[str, Any] = {"horizon_days": horizon}
    if from_date:
        run_payload["from_date"] = from_date
    if to_date:
        run_payload["to_date"] = to_date

    projection: dict[str, Any]
    try:
        adapter = CashFlowProjectionAdapter(db=db, tenant_id=tenant_id)
        projection = await adapter.run(run_payload)
    except Exception as exc:
        logger.warning("finance_forecast_projection_failed tenant=%s err=%s", tenant_id, exc)
        await safe_async_session_rollback(db)
        projection = {
            "forecast_points": [],
            "history": [],
            "assumptions": {"method": "unavailable"},
            "confidence_score": 0.0,
            "limitations": "Cash-flow projection failed; returning empty heuristic result.",
        }

    narrative = _heuristic_narrative(projection, horizon)
    narrative_source = "heuristic"
    limitations = [str(projection.get("limitations") or "").strip()] if projection.get("limitations") else []

    if generate_text_for_tenant is not None:
        try:
            prompt = (
                "You are a financial analyst for a garment manufacturing ERP.\n"
                "Generate a concise 30/60/90-day cash flow and P&L-oriented brief.\n"
                "Do not invent numbers beyond the JSON. Cover inflows, outflows, net cash, "
                "revenue recognition risks, and top risks with mitigations.\n"
                "JSON:\n"
                + str(
                    {
                        "horizon_days": horizon,
                        "forecast_points": projection.get("forecast_points"),
                        "history": (projection.get("history") or [])[-6:],
                        "assumptions": projection.get("assumptions"),
                        "confidence_score": projection.get("confidence_score"),
                    }
                )[:10000]
            )
            llm_text = await generate_text_for_tenant(
                db,
                tenant_id,
                user_id,
                feature="finance_forecast",
                prompt=prompt,
            )
            llm_text = (llm_text or "").strip()
            if llm_text:
                narrative = llm_text
                narrative_source = "llm"
        except Exception as exc:
            logger.info("finance_forecast_llm_unavailable tenant=%s err=%s", tenant_id, exc)
            limitations.append("LLM narrative unavailable; using heuristic summary.")
            try:
                await safe_async_session_rollback(db)
            except Exception:
                pass
    else:
        limitations.append("LLM client not available; using heuristic summary.")

    forecast = _month_buckets(list(projection.get("forecast_points") or []))
    risks = _heuristic_risks(forecast, narrative)
    m1_rev = float((forecast.get("month_1") or {}).get("expected_revenue") or 0)
    m1_exp = float((forecast.get("month_1") or {}).get("expected_expenses") or 0)
    break_even = {
        "monthly_revenue_required": round(max(m1_exp, m1_rev * 0.95), 2),
        "current_runway_months": round(
            max(0.0, sum(float((forecast.get(f"month_{i}") or {}).get("net_cash") or 0) for i in (1, 2, 3)) / max(1.0, m1_exp or 1.0)),
            1,
        ),
    }
    budget_variance_insights = [
        {
            "category": "Fabric",
            "message": (
                "Budget variance analysis is advisory until COGS mapping confidence is measured. "
                "Review open fabric POs vs style cost sheets when utilization exceeds plan."
            ),
            "recommended_action": "Compare top fabric PO unit prices vs BOM expected cost this week.",
        }
    ]

    return {
        "success": True,
        "source": "cash_flow_projection",
        "horizon_days": horizon,
        "projection": {
            "forecast_points": projection.get("forecast_points") or [],
            "history": projection.get("history") or [],
            "assumptions": projection.get("assumptions") or {},
            "confidence_score": projection.get("confidence_score"),
        },
        "narrative": narrative,
        "narrative_source": narrative_source,
        "limitations": [x for x in limitations if x],
        "forecast": forecast,
        "break_even": break_even,
        "risks": risks,
        "budget_variance_insights": budget_variance_insights,
    }
