from __future__ import annotations

from typing import Any


def validate_tenant(*, tool_tenant_id: Any, context_tenant_id: int | None) -> tuple[bool, str | None]:
    """
    Ensure MCP tool payload tenant_id matches the authenticated / in-process tenant.

    When context_tenant_id is None (e.g. external MCP client without JWT binding),
    only basic validation on tool_tenant_id is applied.
    """
    try:
        tid = int(tool_tenant_id)
    except (TypeError, ValueError):
        return False, "Invalid or missing tenant_id in tool arguments."
    if tid < 1:
        return False, "tenant_id must be a positive integer."

    if context_tenant_id is not None and tid != int(context_tenant_id):
        return False, "tenant_id in tool arguments does not match the active tenant context."

    return True, None
