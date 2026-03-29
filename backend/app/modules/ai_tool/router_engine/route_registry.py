from __future__ import annotations

from app.modules.ai_tool.schemas import AiIntent

# Primary route label for audit / observability (maps intent to high-level path)
INTENT_PRIMARY_ROUTE: dict[AiIntent, str] = {
    "search_query": "semantic_memory",
    "help_request": "semantic_memory",
    "semantic_search": "semantic_memory",
    "report_request": "structured_analysis",
    "analysis_request": "structured_analysis",
    "summary_request": "standard_tools",
    "forecast_request": "forecasting",
    "action_request": "tasks",
    "unsupported_request": "blocked",
}


def primary_route_for_intent(intent: AiIntent) -> str:
    return INTENT_PRIMARY_ROUTE.get(intent, "standard_tools")
