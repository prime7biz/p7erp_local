from __future__ import annotations

import logging
from typing import Any, Literal

from app.config import get_settings

logger = logging.getLogger(__name__)

SafetyClass = Literal["READ_ONLY", "DRAFT_ONLY", "COMMIT_REQUIRED"]

# Tool name -> safety class (MCP-registered tools)
TOOL_SAFETY: dict[str, SafetyClass] = {
    "create_sales_inquiry": "COMMIT_REQUIRED",
    "create_financial_voucher": "COMMIT_REQUIRED",
    "process_goods_receipt": "COMMIT_REQUIRED",
    "search_unstructured_context": "READ_ONLY",
    "analyze_structured_metrics": "READ_ONLY",
    "generate_forecast": "DRAFT_ONLY",
    # create_system_task: dynamic (approval_gated -> COMMIT_REQUIRED) via effective_tool_safety
    "create_system_task": "DRAFT_ONLY",
}


def get_tool_safety_class(tool_name: str) -> SafetyClass:
    return TOOL_SAFETY.get(tool_name, "READ_ONLY")


def effective_tool_safety(tool_name: str, arguments: dict[str, Any] | None = None) -> SafetyClass:
    """Resolve safety class; create_system_task depends on classified task_category."""
    args = arguments or {}
    if tool_name == "create_system_task":
        from app.modules.ai_tool.tasks.policies import classify_task

        cat, _ = classify_task(str(args.get("task_type") or ""))
        if cat == "approval_gated":
            return "COMMIT_REQUIRED"
        return "DRAFT_ONLY"
    return get_tool_safety_class(tool_name)


def check_commit_allowed(*, tool_name: str, arguments: dict[str, Any]) -> tuple[bool, str | None]:
    """
    COMMIT_REQUIRED tools must not execute without explicit human approval payload.

    When settings.mcp_commit_bypass is True (e.g. local dev), execution is allowed
    without approval for backward compatibility with demos.
    """
    safety = effective_tool_safety(tool_name, arguments)
    if safety != "COMMIT_REQUIRED":
        return True, None

    settings = get_settings()
    if getattr(settings, "mcp_commit_bypass", False):
        logger.warning("MCP COMMIT_REQUIRED tool %s executed with mcp_commit_bypass=True", tool_name)
        return True, None

    if bool(arguments.get("human_approval_confirmed")) is True:
        token = str(arguments.get("human_approval_token") or "").strip()
        expected = (getattr(settings, "mcp_human_approval_secret", "") or "").strip()
        if expected and token and token == expected:
            return True, None
        if not expected:
            return (
                False,
                "MCP_HUMAN_APPROVAL_SECRET is not configured. COMMIT_REQUIRED tools are blocked.",
            )
        return False, "Invalid or missing human_approval_token for COMMIT_REQUIRED tool."

    return (
        False,
        "This action requires human approval. Set human_approval_confirmed=true and a valid "
        "human_approval_token after user approval, or enable mcp_commit_bypass for local demos.",
    )
