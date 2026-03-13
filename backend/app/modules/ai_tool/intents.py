from __future__ import annotations

from dataclasses import dataclass

from app.modules.ai_tool.schemas import AiIntent


@dataclass(slots=True)
class IntentResult:
    intent: AiIntent
    confidence: float
    reason: str


def detect_intent(prompt: str) -> IntentResult:
    text = prompt.lower().strip()

    action_keywords = {"approve", "post", "create", "update", "delete", "execute", "run payment", "submit"}
    report_verb_keywords = {"generate", "create", "build", "prepare"}
    forecast_keywords = {"forecast", "projection", "project", "trend prediction", "outlook", "shortfall", "delay risk"}
    report_keywords = {"report", "summary report", "executive summary", "insight report"}
    search_keywords = {
        "search",
        "find",
        "lookup",
        "show",
        "list",
        "which",
        "delayed",
        "late",
        "shortage",
        "pending approvals",
        "buyer-wise",
        "buyer wise",
        "vendor",
        "status",
    }
    summary_keywords = {"summary", "snapshot", "dashboard", "production issues", "inventory", "finance"}
    help_keywords = {
        "help",
        "how to",
        "guide",
        "what can you do",
        "sop",
        "manual",
        "policy",
        "compliance",
        "buyer requirement",
        "document",
        "knowledge",
    }

    if any(k in text for k in report_verb_keywords) and any(
        k in text for k in {"report", "summary", "kpi", "profitability", "comparison"}
    ):
        return IntentResult(intent="report_request", confidence=0.9, reason="Report generation request detected")
    if any(k in text for k in action_keywords) and not any(
        k in text for k in forecast_keywords.union(report_keywords).union({"summary", "kpi"})
    ):
        return IntentResult(intent="action_request", confidence=0.92, reason="Write/action keyword detected")
    if any(k in text for k in forecast_keywords):
        return IntentResult(intent="forecast_request", confidence=0.9, reason="Forecast keyword detected")
    if any(k in text for k in search_keywords):
        return IntentResult(intent="search_query", confidence=0.88, reason="Search-oriented query detected")
    if any(k in text for k in report_keywords):
        return IntentResult(intent="report_request", confidence=0.84, reason="Report keyword detected")
    if any(k in text for k in summary_keywords):
        return IntentResult(intent="summary_request", confidence=0.8, reason="Summary keyword detected")
    if any(k in text for k in help_keywords):
        return IntentResult(intent="help_request", confidence=0.8, reason="Help keyword detected")

    if len(text) < 8:
        return IntentResult(intent="unsupported_request", confidence=0.5, reason="Prompt too short to classify")

    return IntentResult(intent="help_request", confidence=0.55, reason="Fallback to help intent")
