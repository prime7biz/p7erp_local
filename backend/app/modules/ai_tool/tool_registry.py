from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool.schemas import AiIntent

SafetyClass = Literal["READ_ONLY", "DRAFT_ONLY", "COMMIT_REQUIRED"]
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
    suggest_bom_from_similar_style,
    suggest_items_for_bom_line,
    suggest_orders_with_shortage,
    suggest_vendor_for_item,
)
from app.modules.ai_tool.analysis.registry import detect_analysis_type, run_analysis
from app.modules.ai_tool.retrieval.unstructured_search import search_unstructured_context
from app.modules.ai_tool.tools.calendar_tools import (
    calendar_impact_tool,
    calendar_manage_tool,
    calendar_summary_tool,
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
    safety_class: SafetyClass
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


async def _suggest_bom_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await suggest_bom_from_similar_style(db, tenant_id=tenant_id, prompt=prompt)


async def _suggest_items_bom_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await suggest_items_for_bom_line(db, tenant_id=tenant_id, prompt=prompt)


async def _suggest_vendor_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await suggest_vendor_for_item(db, tenant_id=tenant_id, prompt=prompt)


async def _orders_shortage_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await suggest_orders_with_shortage(db, tenant_id=tenant_id, prompt=prompt)


async def _calendar_summary_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await calendar_summary_tool(db, tenant_id, prompt)


async def _calendar_impact_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await calendar_impact_tool(db, tenant_id, prompt)


async def _calendar_manage_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    return await calendar_manage_tool(db, tenant_id, prompt)


async def _analyze_structured_metrics_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    mtype = detect_analysis_type(prompt)
    text = prompt.lower()
    include_sem = any(k in text for k in ("note", "remark", "comment", "context", "unstructured"))
    out = await run_analysis(
        db,
        tenant_id=tenant_id,
        metric_type=mtype,
        parameters={},
        include_semantic_context=include_sem,
        semantic_query=prompt if include_sem else None,
    )
    summary = str(out.get("commentary") or f"Completed {mtype} analysis.")
    return {"summary": summary, "data": out}


async def _search_unstructured_handler(db: AsyncSession, tenant_id: int, prompt: str) -> dict:
    text = prompt.lower()
    domain = "merch"
    if "policy" in text or " hr" in text or text.strip().startswith("hr "):
        domain = "hr"
    if "shipment" in text or "follow-up" in text or "follow up" in text or "logistics" in text:
        domain = "logistics"
    if "sop" in text or "procedure" in text or "manual" in text:
        domain = "knowledge"
    out = await search_unstructured_context(
        db,
        tenant_id=tenant_id,
        query=prompt,
        domain=domain,
        filters=None,
        top_k=5,
        user=None,
    )
    summary = f"Retrieved {out.get('total_found', 0)} sources via {out.get('retrieval_method')}."
    return {"summary": summary, "data": out}


REGISTRY: dict[str, ToolDefinition] = {
    "get_dashboard_summary": ToolDefinition(
        name="get_dashboard_summary",
        source_area="dashboard",
        allowed_intents={"summary_request", "help_request", "report_request"},
        permission_key="ai.tools.dashboard.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_dashboard_handler,
    ),
    "get_pending_approvals": ToolDefinition(
        name="get_pending_approvals",
        source_area="workflow",
        allowed_intents={"summary_request", "help_request", "report_request"},
        permission_key="ai.tools.approvals.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_approvals_handler,
    ),
    "search_pending_approvals": ToolDefinition(
        name="search_pending_approvals",
        source_area="workflow",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.approvals.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_approvals_search_handler,
    ),
    "search_sales_orders": ToolDefinition(
        name="search_sales_orders",
        source_area="orders",
        allowed_intents={"search_query", "summary_request", "report_request"},
        permission_key="ai.tools.orders.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_orders_handler,
    ),
    "get_inventory_snapshot": ToolDefinition(
        name="get_inventory_snapshot",
        source_area="inventory",
        allowed_intents={"summary_request", "search_query", "report_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_inventory_handler,
    ),
    "search_inventory_shortages": ToolDefinition(
        name="search_inventory_shortages",
        source_area="inventory",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_inventory_shortages_handler,
    ),
    "get_production_summary": ToolDefinition(
        name="get_production_summary",
        source_area="manufacturing",
        allowed_intents={"summary_request", "report_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_production_handler,
    ),
    "search_production_issues": ToolDefinition(
        name="search_production_issues",
        source_area="manufacturing",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_production_issues_handler,
    ),
    "search_repeated_late_vendors": ToolDefinition(
        name="search_repeated_late_vendors",
        source_area="inventory",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_vendors_handler,
    ),
    "get_financial_summary": ToolDefinition(
        name="get_financial_summary",
        source_area="finance",
        allowed_intents={"summary_request", "report_request"},
        permission_key="ai.tools.finance.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_finance_handler,
    ),
    "suggest_bom_from_similar_style": ToolDefinition(
        name="suggest_bom_from_similar_style",
        source_area="merch",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_suggest_bom_handler,
    ),
    "suggest_items_for_bom_line": ToolDefinition(
        name="suggest_items_for_bom_line",
        source_area="merch",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_suggest_items_bom_handler,
    ),
    "suggest_vendor_for_item": ToolDefinition(
        name="suggest_vendor_for_item",
        source_area="inventory",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_suggest_vendor_handler,
    ),
    "suggest_orders_with_shortage": ToolDefinition(
        name="suggest_orders_with_shortage",
        source_area="merch",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.inventory.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_orders_shortage_handler,
    ),
    "calendar_summary": ToolDefinition(
        name="calendar_summary",
        source_area="manufacturing",
        allowed_intents={"search_query", "summary_request", "help_request", "action_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_calendar_summary_handler,
    ),
    "calendar_impact": ToolDefinition(
        name="calendar_impact",
        source_area="manufacturing",
        allowed_intents={"search_query", "summary_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_calendar_impact_handler,
    ),
    "calendar_manage": ToolDefinition(
        name="calendar_manage",
        source_area="manufacturing",
        allowed_intents={"action_request"},
        permission_key="ai.tools.production.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="DRAFT_ONLY",
        handler=_calendar_manage_handler,
    ),
    "search_unstructured_context": ToolDefinition(
        name="search_unstructured_context",
        source_area="knowledge",
        allowed_intents={"search_query", "help_request", "semantic_search"},
        permission_key="ai.tools.dashboard.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_search_unstructured_handler,
    ),
    "analyze_structured_metrics": ToolDefinition(
        name="analyze_structured_metrics",
        source_area="analytics",
        allowed_intents={"analysis_request"},
        permission_key="ai.tools.dashboard.read",
        requires_confirmation=False,
        is_read_only=True,
        safety_class="READ_ONLY",
        handler=_analyze_structured_metrics_handler,
    ),
}


def _contains_any(text: str, tokens: set[str]) -> bool:
    return any(x in text for x in tokens)


def _factory_calendar_tools(intent: AiIntent, prompt: str) -> list[ToolDefinition] | None:
    text = prompt.lower()
    cal_keys = (
        "factory calendar",
        "working days",
        "working day",
        "next holiday",
        "public holiday",
        "calendar impact",
        "import holiday",
        "import holidays",
    )
    holiday_cal = "holiday" in text and any(
        x in text for x in ("factory", "working", "calendar", "next", "public", "import", "add ", "eid")
    )
    matched = any(k in text for k in cal_keys) or holiday_cal
    if intent == "action_request" and any(k in text for k in ("add holiday", "import holiday", "eid")):
        matched = True
    if not matched:
        return None
    if any(k in text for k in ("what happens", "calendar impact", "if i add", "if we add")) and "holiday" in text:
        return [REGISTRY["calendar_impact"]]
    if intent == "action_request" and any(k in text for k in ("add holiday", "import holiday", "eid")):
        return [REGISTRY["calendar_manage"]]
    return [REGISTRY["calendar_summary"]]


def select_tools(intent: AiIntent, prompt: str) -> list[ToolDefinition]:
    text = prompt.lower()
    cal_pick = _factory_calendar_tools(intent, prompt)
    if cal_pick is not None:
        return cal_pick
    if intent == "semantic_search":
        return [REGISTRY["search_unstructured_context"]]
    if intent == "analysis_request":
        return [REGISTRY["analyze_structured_metrics"]]
    if intent in {"search_query", "help_request", "semantic_search"} and any(
        k in text
        for k in (
            "unstructured",
            "merch note",
            "follow-up note",
            "follow up note",
            "qa remark",
            "policy text",
            "shipment log",
            "semantic search",
        )
    ):
        return [REGISTRY["search_unstructured_context"]]
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
        if parsed.domain == "bom":
            if _contains_any(text, {"item", "search item", "suggest item", "bom line"}):
                return [REGISTRY["suggest_items_for_bom_line"]]
            return [REGISTRY["suggest_bom_from_similar_style"]]
        if parsed.domain == "purchase":
            if _contains_any(text, {"shortage", "order shortage", "orders with shortage", "create po"}):
                return [REGISTRY["suggest_orders_with_shortage"]]
            if _contains_any(text, {"vendor", "suggest vendor", "vendor for item"}):
                return [REGISTRY["suggest_vendor_for_item"]]
            return [REGISTRY["suggest_orders_with_shortage"]]
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
            if _contains_any(text, {"suggest vendor", "vendor for item", "item"}):
                return [REGISTRY["suggest_vendor_for_item"]]
            return [REGISTRY["search_repeated_late_vendors"]]
        if _contains_any(text, {"bom", "similar style", "suggest item", "bom line"}):
            if _contains_any(text, {"item", "suggest item", "search item"}):
                return [REGISTRY["suggest_items_for_bom_line"]]
            return [REGISTRY["suggest_bom_from_similar_style"]]
        if _contains_any(text, {"material requirement", "shortage", "order shortage", "orders with shortage"}):
            return [REGISTRY["suggest_orders_with_shortage"]]
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
            if _contains_any(text, {"suggest vendor", "vendor for item"}):
                return [REGISTRY["suggest_vendor_for_item"]]
            return [REGISTRY["search_repeated_late_vendors"]]
        if _contains_any(text, {"bom", "similar style", "suggest item"}):
            if _contains_any(text, {"item", "suggest item"}):
                return [REGISTRY["suggest_items_for_bom_line"]]
            return [REGISTRY["suggest_bom_from_similar_style"]]
        if _contains_any(text, {"material requirement", "shortage", "order shortage"}):
            return [REGISTRY["suggest_orders_with_shortage"]]
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
