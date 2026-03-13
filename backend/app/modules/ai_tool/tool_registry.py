from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool.schemas import AiIntent
from app.modules.ai_tool.query_parser import parse_search_query
from app.modules.ai_tool.tools import (
    get_dashboard_summary,
    get_financial_summary,
    get_inventory_snapshot,
    get_pending_approvals,
    get_production_summary,
    search_inventory_shortages,
    search_pending_approvals,
    search_production_issues,
    search_repeated_late_vendors,
    search_sales_orders,
)

ToolHandler = Callable[[AsyncSession, int, str], Awaitable[dict]]


@dataclass(slots=True)
class ToolDefinition:
    name: str
    source_area: str
    allowed_intents: set[AiIntent]
    permission_key: str
    requires_confirmation: bool
    is_read_only: bool
    handler: ToolHandler


async def _dashboard_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    del prompt
    return await get_dashboard_summary(db, tenant_id=tenant_id)


async def _approvals_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    del prompt
    return await get_pending_approvals(db, tenant_id=tenant_id)


async def _approvals_search_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await search_pending_approvals(db, tenant_id=tenant_id, prompt=prompt)


async def _orders_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await search_sales_orders(db, tenant_id=tenant_id, prompt=prompt)


async def _inventory_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    del prompt
    return await get_inventory_snapshot(db, tenant_id=tenant_id)


async def _inventory_shortages_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await search_inventory_shortages(db, tenant_id=tenant_id, prompt=prompt)


async def _production_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    del prompt
    return await get_production_summary(db, tenant_id=tenant_id)


async def _production_issues_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await search_production_issues(db, tenant_id=tenant_id, prompt=prompt)


async def _vendors_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await search_repeated_late_vendors(db, tenant_id=tenant_id, prompt=prompt)


async def _finance_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    del prompt
    return await get_financial_summary(db, tenant_id=tenant_id)


REGISTRY: dict[str, ToolDefinition] = {
    "get_dashboard_summary": ToolDefinition(
        name="get_dashboard_summary",
        source_area="dashboard",
        allowed_intents={"summary_request", "help_request", "report_request"},
        permission_key="ai.tools.dashboard.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_dashboard_handler,
    ),
    "get_pending_approvals": ToolDefinition(
        name="get_pending_approvals",
        source_area="workflow",
        allowed_intents={"summary_request", "help_request", "report_request"},
        permission_key="ai.tools.approvals.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_approvals_handler,
    ),
    "search_pending_approvals": ToolDefinition(
        name="search_pending_approvals",
        source_area="workflow",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.approvals.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_approvals_search_handler,
    ),
    "search_sales_orders": ToolDefinition(
        name="search_sales_orders",
        source_area="orders",
        allowed_intents={"search_query", "summary_request", "report_request"},
        permission_key="ai.tools.orders.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_orders_handler,
    ),
    "get_inventory_snapshot": ToolDefinition(
        name="get_inventory_snapshot",
        source_area="inventory",
        allowed_intents={"summary_request", "search_query", "report_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_inventory_handler,
    ),
    "search_inventory_shortages": ToolDefinition(
        name="search_inventory_shortages",
        source_area="inventory",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_inventory_shortages_handler,
    ),
    "get_production_summary": ToolDefinition(
        name="get_production_summary",
        source_area="manufacturing",
        allowed_intents={"summary_request", "report_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_production_handler,
    ),
    "search_production_issues": ToolDefinition(
        name="search_production_issues",
        source_area="manufacturing",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_production_issues_handler,
    ),
    "search_repeated_late_vendors": ToolDefinition(
        name="search_repeated_late_vendors",
        source_area="inventory",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_vendors_handler,
    ),
    "get_financial_summary": ToolDefinition(
        name="get_financial_summary",
        source_area="finance",
        allowed_intents={"summary_request", "report_request"},
        permission_key="ai.tools.finance.read",
        requires_confirmation=False,
        is_read_only=True,
        handler=_finance_handler,
    ),
}


def _contains_any(text: str, tokens: set[str]) -> bool:
    return any(x in text for x in tokens)


def select_tools(intent: AiIntent, prompt: str) -> list[ToolDefinition]:
    text = prompt.lower()
    parsed = parse_search_query(prompt)
    if intent == "search_query":
        if parsed.ambiguous:
            return []
        if parsed.domain == "orders":
            return [REGISTRY["search_sales_orders"]]
        if parsed.domain == "approvals":
            return [REGISTRY["search_pending_approvals"]]
        if parsed.domain == "inventory":
            if parsed.shortage_only:
                return [REGISTRY["search_inventory_shortages"]]
            return [REGISTRY["get_inventory_snapshot"]]
        if parsed.domain == "production":
            if any(x in text for x in {"issue", "issues", "downtime", "ncr"}):
                return [REGISTRY["search_production_issues"]]
            return [REGISTRY["get_production_summary"]]
        if parsed.domain == "vendors":
            return [REGISTRY["search_repeated_late_vendors"]]
        if parsed.domain == "finance":
            return [REGISTRY["get_financial_summary"]]
        if _contains_any(text, {"order", "sales", "delayed"}):
            return [REGISTRY["search_sales_orders"]]
        if _contains_any(text, {"approval", "pending"}):
            return [REGISTRY["search_pending_approvals"]]
        if _contains_any(text, {"inventory", "stock"}):
            if _contains_any(text, {"shortage", "low stock"}):
                return [REGISTRY["search_inventory_shortages"]]
            return [REGISTRY["get_inventory_snapshot"]]
        if _contains_any(text, {"vendor", "supplier", "late vendors"}):
            return [REGISTRY["search_repeated_late_vendors"]]
        if _contains_any(text, {"production", "downtime", "ncr", "issue"}):
            return [REGISTRY["search_production_issues"]]
        return [REGISTRY["search_sales_orders"]]
    if intent == "summary_request":
        if _contains_any(text, {"approval", "pending"}):
            return [REGISTRY["get_pending_approvals"]]
        if _contains_any(text, {"inventory", "stock"}):
            if _contains_any(text, {"shortage", "low stock"}):
                return [REGISTRY["search_inventory_shortages"]]
            return [REGISTRY["get_inventory_snapshot"]]
        if _contains_any(text, {"production", "shopfloor", "work order", "tna"}):
            if _contains_any(text, {"issue", "issues", "downtime", "ncr"}):
                return [REGISTRY["search_production_issues"]]
            return [REGISTRY["get_production_summary"]]
        if _contains_any(text, {"vendor", "supplier"}):
            return [REGISTRY["search_repeated_late_vendors"]]
        if _contains_any(text, {"finance", "voucher", "cash", "reconciliation"}):
            return [REGISTRY["get_financial_summary"]]
        return [REGISTRY["get_dashboard_summary"]]
    if intent == "report_request":
        selected: list[ToolDefinition] = []
        for key in ("get_dashboard_summary", "get_pending_approvals", "get_financial_summary"):
            selected.append(REGISTRY[key])
        return selected
    if intent == "help_request":
        return [REGISTRY["get_dashboard_summary"]]
    return []
