"""Auto-escalation tool mapping for report / analysis / forecast intents."""

from __future__ import annotations

from app.modules.ai_tool.service import AUTO_ESCALATION_INTENTS, _escalation_tool_for_auto_intent


def test_auto_escalation_intents_cover_extended_work() -> None:
    assert "report_request" in AUTO_ESCALATION_INTENTS
    assert "analysis_request" in AUTO_ESCALATION_INTENTS
    assert "forecast_request" in AUTO_ESCALATION_INTENTS


def test_escalation_tool_forecast_defaults_to_generate_forecast() -> None:
    assert _escalation_tool_for_auto_intent("forecast_request", "inventory outlook next month") == "generate_forecast"


def test_escalation_tool_analysis_defaults_to_structured_metrics() -> None:
    assert _escalation_tool_for_auto_intent("analysis_request", "margin by style") == "analyze_structured_metrics"


def test_escalation_tool_respects_transaction_phrases() -> None:
    assert _escalation_tool_for_auto_intent("report_request", "create a goods receipt report") == "process_goods_receipt"
