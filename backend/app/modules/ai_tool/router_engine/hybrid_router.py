from __future__ import annotations

from dataclasses import dataclass, field

from app.modules.ai_tool.intents import IntentResult
from app.modules.ai_tool.router_engine.escalation import suggest_premium_escalation
from app.modules.ai_tool.router_engine.route_registry import primary_route_for_intent


@dataclass(slots=True)
class RouteDecision:
    """Outcome of hybrid routing before tool / LLM execution."""

    primary_route: str
    secondary_routes: list[str] = field(default_factory=list)
    use_tier1_triage: bool = True
    confidence: float = 1.0
    reasoning: str = ""
    estimated_latency_ms: int = 0
    estimated_cost_class: str = "free"  # free | low | medium | high
    suggest_premium: bool = False
    premium_reason: str = ""


class HybridRouter:
    """Maps detected intent + prompt heuristics to route metadata and escalation hints."""

    @staticmethod
    def route(*, intent_result: IntentResult, prompt: str) -> RouteDecision:
        primary = primary_route_for_intent(intent_result.intent)
        secondary: list[str] = []

        # Cross-route hint: anomaly-style prompts benefit from structured + semantic later
        text = prompt.lower()
        if any(k in text for k in ("anomaly", "risk", "exception", "margin issue")):
            if primary == "standard_tools":
                secondary.append("insights")

        suggest, prem_reason = suggest_premium_escalation(
            prompt=prompt,
            intent_confidence=intent_result.confidence,
        )
        cost = "free"
        if suggest:
            cost = "medium"
        elif primary in {"structured_analysis", "forecasting"}:
            cost = "low"

        latency = 800 if primary == "structured_analysis" else 400
        if primary == "forecasting":
            latency = 2500

        return RouteDecision(
            primary_route=primary,
            secondary_routes=secondary,
            use_tier1_triage=True,
            confidence=intent_result.confidence,
            reasoning=intent_result.reason,
            estimated_latency_ms=latency,
            estimated_cost_class=cost,
            suggest_premium=suggest,
            premium_reason=prem_reason,
        )
