from __future__ import annotations

import logging

from app.config import get_settings
from app.modules.mcp_server.tools import execute_tool_call, get_tools, register_tools

logger = logging.getLogger(__name__)

try:
    from mcp.server.fastmcp import FastMCP
except Exception:  # pragma: no cover - safety when dependency is missing
    FastMCP = None  # type: ignore[assignment]

_MCP_SERVER = None


def _build_server():
    global _MCP_SERVER
    if _MCP_SERVER is not None:
        return _MCP_SERVER
    if FastMCP is None:
        return None
    server = FastMCP("P7 ERP MCP", stateless_http=True)
    register_tools(server)
    _MCP_SERVER = server
    return _MCP_SERVER


def mount_mcp(app) -> None:
    settings = get_settings()
    if not settings.mcp_enabled:
        logger.info("MCP mount skipped because MCP_ENABLED=false")
        return
    server = _build_server()
    if server is None:
        logger.warning("MCP library unavailable. Install `mcp[httpx]` to enable /mcp.")
        return

    from app.modules.mcp_server.auth import McpAuthMiddleware

    mcp_asgi = server.streamable_http_app()
    secured_app = McpAuthMiddleware(
        mcp_asgi, require_auth=settings.mcp_require_auth
    )
    app.mount("/mcp", secured_app)
    logger.info(
        "Mounted MCP server at /mcp (auth_required=%s)", settings.mcp_require_auth
    )


def get_registered_tools() -> list[dict]:
    """
    In-process MCP bridge for tool discovery.

    This gives the paid provider dynamic tool schemas without hardcoding them.
    """
    return get_tools()


async def call_registered_tool(
    tool_name: str,
    arguments: dict,
    *,
    context_tenant_id: int | None = None,
) -> dict:
    """
    In-process MCP bridge for tool execution.

    This mirrors an MCP client/server roundtrip while staying inside backend process.
    """
    return await execute_tool_call(tool_name, arguments, context_tenant_id=context_tenant_id)
