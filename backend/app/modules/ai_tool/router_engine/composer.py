from __future__ import annotations

from typing import Any

from app.modules.ai_tool.schemas import AiToolInvocationResult


def merge_route_metadata(
    *,
    tool_results: list[AiToolInvocationResult],
    route_labels: list[str],
) -> dict[str, Any]:
    """Attach routing metadata for assistant message JSON (extensible for multi-route)."""
    return {
        "routes_used": route_labels,
        "tool_names": [t.tool_name for t in tool_results],
    }
