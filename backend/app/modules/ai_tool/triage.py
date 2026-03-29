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


def parse_ollama_response(raw_text: str, *, prompt: str) -> TriageResult:
    """
    Parse tier-1 output.

    - If it contains a strict escalation JSON, return tier=escalate.
    - Otherwise treat it as normal local response text.
    """
    text = (raw_text or "").strip()
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
            if str(payload.get("status")).lower() == "escalate":
                tool_required = str(payload.get("tool_required") or "").strip()
                reason = str(payload.get("reason") or "").strip()
                if not tool_required:
                    tool_required = infer_tool_from_prompt(prompt) or "mcp_tool_required"
                if not reason:
                    reason = "This request needs advanced paid processing with ERP tools."
                return TriageResult(
                    tier="escalate",
                    tool_required=tool_required,
                    escalation_reason=reason,
                )
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
                    tool_required = str(payload.get("tool_required") or "").strip() or infer_tool_from_prompt(prompt) or "mcp_tool_required"
                    reason = str(payload.get("reason") or "").strip() or "This request needs advanced paid processing with ERP tools."
                    return TriageResult(
                        tier="escalate",
                        tool_required=tool_required,
                        escalation_reason=reason,
                    )
            except Exception:
                pass

    return TriageResult(tier="local", local_answer=text)
