"""Triage JSON parsing (OpenRouter vs Ollama output shapes)."""

from __future__ import annotations

from app.modules.ai_tool.triage import normalize_escalation_tool_required, normalize_paid_mcp_tool_name, parse_ollama_response


def test_parse_handle_json_uses_reason_not_raw_json() -> None:
    raw = '{"status": "HANDLE", "tool_required": null, "reason": "Greeting."}'
    r = parse_ollama_response(raw, prompt="hi")
    assert r.tier == "local"
    assert r.local_answer == "Greeting."
    assert "{" not in (r.local_answer or "")


def test_parse_handle_json_with_markdown_fence() -> None:
    raw = '```json\n{"status": "HANDLE", "reason": "Hello there."}\n```'
    r = parse_ollama_response(raw, prompt="hi")
    assert r.tier == "local"
    assert r.local_answer == "Hello there."


def test_parse_escalate_json_unchanged() -> None:
    raw = '{"status": "escalate", "tool_required": "create_sales_inquiry", "reason": "User wants inquiry"}'
    r = parse_ollama_response(raw, prompt="create inquiry")
    assert r.tier == "escalate"
    assert r.tool_required == "create_sales_inquiry"


def test_parse_escalate_normalizes_none_tool_required() -> None:
    raw = '{"status": "escalate", "tool_required": "none", "reason": "Need tools"}'
    r = parse_ollama_response(raw, prompt="please create a sales inquiry")
    assert r.tier == "escalate"
    assert r.tool_required == "create_sales_inquiry"


def test_normalize_paid_mcp_tool_risk_alias() -> None:
    assert normalize_paid_mcp_tool_name("risk_analysis_tool") == "analyze_structured_metrics"
    assert normalize_paid_mcp_tool_name("analyze_structured_metrics") == "analyze_structured_metrics"


def test_normalize_escalation_applies_risk_alias() -> None:
    assert normalize_escalation_tool_required("risk_analysis_tool", prompt="x") == "analyze_structured_metrics"
