from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel

ESCALATE_TOOL_MAP = {
    "sales inquiry": "create_sales_inquiry",
    "financial voucher": "create_financial_voucher",
    "voucher": "create_financial_voucher",
    "goods receipt": "process_goods_receipt",
    "grn": "process_goods_receipt",
}


class TriageResult(BaseModel):
    tier: Literal["local", "escalate"]
    local_answer: str | None = None
    tool_required: str | None = None
    escalation_reason: str | None = None


def infer_tool_from_prompt(prompt: str) -> str | None:
    text = prompt.lower()
    for key, tool_name in ESCALATE_TOOL_MAP.items():
        if key in text:
            return tool_name
    return None


# Assistant / model may invent names; map to registered MCP tools (see mcp_server/tools.py TOOL_REGISTRY).
_PAID_MCP_TOOL_ALIASES: dict[str, str] = {
    "risk_analysis_tool": "analyze_structured_metrics",
    "company_risk_tool": "analyze_structured_metrics",
    "risk_assessment_tool": "analyze_structured_metrics",
}


def normalize_paid_mcp_tool_name(raw: str | None) -> str:
    """Map synthetic escalation tool names to real ERP MCP tool names."""
    t = str(raw or "").strip()
    if not t:
        return t
    key = t.lower().replace("-", "_")
    return _PAID_MCP_TOOL_ALIASES.get(key, t)


def normalize_escalation_tool_required(raw: str | None, *, prompt: str) -> str:
    """Map model junk like 'none' / empty to a real tool name for paid MCP escalation."""
    t = str(raw or "").strip().lower()
    if t in ("", "none", "null", "undefined", "n/a", "na", "nil"):
        return infer_tool_from_prompt(prompt) or "mcp_tool_required"
    return normalize_paid_mcp_tool_name(str(raw or "").strip())


def _strip_markdown_json_fence(text: str) -> str:
    """Remove ```json ... ``` wrappers some cloud models add around triage JSON."""
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _local_text_from_triage_json(payload: dict) -> str | None:
    """Prefer human-readable fields when the model returns JSON for a local (non-escalation) reply."""
    for key in ("answer", "message", "content", "reason", "text", "reply"):
        v = payload.get(key)
        if v is not None and str(v).strip():
            return str(v).strip()
    return None


def parse_ollama_response(raw_text: str, *, prompt: str) -> TriageResult:
    """
    Parse tier-1 output.

    - If it contains a strict escalation JSON, return tier=escalate.
    - Otherwise treat it as normal local response text.
    """
    text = _strip_markdown_json_fence((raw_text or "").strip())
    if not text:
        return TriageResult(
            tier="escalate",
            tool_required=infer_tool_from_prompt(prompt) or "mcp_tool_required",
            escalation_reason="Local AI returned an empty response and requires paid processing.",
        )

    # Common case: model obeys and returns pure JSON.
    if text.startswith("{") and text.endswith("}"):
        try:
            payload = json.loads(text)
            status = str(payload.get("status") or "").lower()
            if status == "escalate":
                tool_required = normalize_escalation_tool_required(
                    str(payload.get("tool_required") or "").strip() or None,
                    prompt=prompt,
                )
                reason = str(payload.get("reason") or "").strip()
                if not reason:
                    reason = "This request needs advanced paid processing with ERP tools."
                return TriageResult(
                    tier="escalate",
                    tool_required=tool_required,
                    escalation_reason=reason,
                )
            # OpenRouter / some models return {"status":"HANDLE",...} with reason/answer fields instead of prose.
            local_txt = _local_text_from_triage_json(payload)
            if local_txt:
                return TriageResult(tier="local", local_answer=local_txt)
        except Exception:
            pass

    # Fallback: detect escalation intent if the model wrapped JSON in prose.
    if '"status"' in text and '"escalate"' in text:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                payload = json.loads(text[start : end + 1])
                if str(payload.get("status")).lower() == "escalate":
                    tool_required = normalize_escalation_tool_required(
                        str(payload.get("tool_required") or "").strip() or None,
                        prompt=prompt,
                    )
                    reason = str(payload.get("reason") or "").strip() or "This request needs advanced paid processing with ERP tools."
                    return TriageResult(
                        tier="escalate",
                        tool_required=tool_required,
                        escalation_reason=reason,
                    )
            except Exception:
                pass

    return TriageResult(tier="local", local_answer=text)
