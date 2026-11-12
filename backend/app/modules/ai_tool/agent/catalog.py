"""Read-only ERP tools the agent model may call, each behind the caller's own permissions.

Every call is checked twice:
1. ``evaluate_ai_safety_for_user`` (tenant AI flags, ``AiPermissionPolicy`` rows and the ``ai.tools.*`` key,
   which is fail-closed for finance / HR / payroll even when RBAC enforcement is off), and
2. ``can_access_module`` for each ERP module the tool reads (only denies in enforced RBAC mode).

``tenant_id`` always comes from the signed-in session; any ``tenant_id`` the model sends is dropped.
Tools not listed here (including every write tool) do not exist for the model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant, User
from app.modules.ai_tool.policy_eval import evaluate_ai_safety_for_user
from app.modules.ai_tool.screen_context import can_access_module, resolve_screen_context_nested

MAX_FOCUS_CHARS = 300
MAX_AGENT_FINANCE_FACTS = 40
FINANCE_REPORTS = (
    "trial_balance",
    "balance_sheet",
    "profit_loss",
    "cash_flow_monthly",
    "funds_flow_monthly",
    "ratio_analysis",
    "budget_analytics",
    "expense_analysis",
    "control_tower",
)


@dataclass
class AgentContext:
    db: AsyncSession
    tenant: Tenant
    user: User
    session_id: int
    message_id: int | None
    request_id: str
    _gate_cache: dict[tuple, tuple[bool, str | None]] = field(default_factory=dict)


@dataclass(frozen=True)
class Gate:
    """One permission requirement: AI policy ``module`` + ``ai.tools.*`` key + ERP module access keys."""

    module: str
    permission_key: str
    access_keys: tuple[str, ...] = ()


async def check_gate(ctx: AgentContext, tool_name: str, gate: Gate) -> tuple[bool, str | None]:
    key = (tool_name, gate)
    if key in ctx._gate_cache:
        return ctx._gate_cache[key]
    ok, reason = await evaluate_ai_safety_for_user(
        ctx.db,
        user=ctx.user,
        tenant=ctx.tenant,
        tool_name=tool_name,
        module=gate.module,
        safety_class="READ_ONLY",
        permission_key=gate.permission_key,
    )
    if ok:
        for access_key in gate.access_keys:
            if not await can_access_module(ctx.db, ctx.tenant, ctx.user, access_key):
                ok, reason = False, "No access to this ERP module."
                break
    ctx._gate_cache[key] = (ok, reason)
    return ok, reason


async def gate_allowed(ctx: AgentContext, tool_name: str, gate: Gate) -> bool:
    return (await check_gate(ctx, tool_name, gate))[0]


GATE_DASHBOARD = Gate("dashboard", "ai.tools.dashboard.read")
GATE_ORDERS = Gate("orders", "ai.tools.orders.read", ("merch.access",))
GATE_INVENTORY = Gate("inventory", "ai.tools.inventory.read", ("inventory.access",))
GATE_PRODUCTION = Gate("manufacturing", "ai.tools.production.read", ("production.access",))
GATE_FINANCE = Gate("finance", "ai.tools.finance.read", ("finance.access",))
GATE_HR = Gate("hr", "ai.tools.hr.read", ("hr.access",))
GATE_BOM = Gate("merch", "ai.tools.inventory.read", ("merch.access",))
GATE_SHORTAGE = Gate("merch", "ai.tools.inventory.read", ("merch.access", "inventory.access"))
GATE_KNOWLEDGE = Gate("knowledge", "ai.tools.knowledge.read")

# Kinds the record search / record summary tools can return, and who may see each.
SEARCH_KIND_GATES: dict[str, Gate] = {
    "customer": GATE_ORDERS,
    "order": GATE_ORDERS,
    "purchase_order": GATE_INVENTORY,
    "item": GATE_INVENTORY,
    "vendor": GATE_INVENTORY,
    "voucher": GATE_FINANCE,
    "employee": GATE_HR,
}
RECORD_TYPE_GATES: dict[str, Gate] = {
    "order": GATE_ORDERS,
    "customer": GATE_ORDERS,
    "style": GATE_ORDERS,
    "voucher": GATE_FINANCE,
    "employee": GATE_HR,
}
ANALYSIS_GATES: dict[str, Gate] = {
    "margin": GATE_ORDERS,
    "costing": GATE_ORDERS,
    "order_risk": GATE_ORDERS,
    "tna_delay": GATE_ORDERS,
    "inventory_variance": GATE_INVENTORY,
    "wastage": GATE_PRODUCTION,
    "finance_exceptions": GATE_FINANCE,
}
UNSTRUCTURED_DOMAINS = ("merch", "logistics", "hr", "knowledge")

ToolHandler = Callable[[AgentContext, dict[str, Any]], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class AgentTool:
    name: str
    description: str
    parameters: dict[str, Any]
    gate: Gate
    handler: ToolHandler


def _focus(args: dict[str, Any], key: str = "focus") -> str:
    return str(args.get(key) or "").strip()[:MAX_FOCUS_CHARS]


def source_gate(source_module: str) -> Gate:
    """Gate for text indexed from a source module: its ``ai.tools.*`` key (fail-closed for finance / HR)
    plus the ERP module access key, so it does not depend on RBAC enforce mode or per-chunk keys."""
    from app.modules.ai_tool.retrieval.source_registry import (
        module_access_key_for_source,
        permission_key_for_module,
    )

    access = module_access_key_for_source(source_module)
    return Gate("dashboard", permission_key_for_module(source_module), (access,) if access else ())


async def _include_flags(ctx: AgentContext, tool_name: str) -> dict[str, bool]:
    return {
        "include_finance": await gate_allowed(ctx, tool_name, GATE_FINANCE),
        "include_hr": await gate_allowed(ctx, tool_name, GATE_HR),
    }


# ---- handlers -------------------------------------------------------------------------------


async def _search_records(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.global_search.service import SEARCH_KINDS, search_records

    query = _focus(args, "query")
    if len(query) < 2:
        return {"summary": "Give at least 2 characters to search for.", "data": {"groups": []}}
    raw_kinds = args.get("kinds")
    kinds = {k for k in raw_kinds if k in SEARCH_KINDS} if isinstance(raw_kinds, list) and raw_kinds else None

    async def _kind_allowed(kind: str) -> bool:
        gate = SEARCH_KIND_GATES.get(kind)
        return gate is not None and await gate_allowed(ctx, "search_records", gate)

    res = await search_records(
        ctx.db, tenant=ctx.tenant, user=ctx.user, query=query, limit=5, kinds=kinds, source_allowed=_kind_allowed
    )
    groups = [g.model_dump() for g in res.groups]
    citations = [
        {"label": h["title"], "href": h["href"], "record_type": h["kind"]} for g in groups for h in g["hits"]
    ]
    count = sum(len(g["hits"]) for g in groups)
    return {"summary": f"Found {count} matching record(s).", "data": {"groups": groups}, "citations": citations}


async def _get_record_summary(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    record_type = str(args.get("record_type") or "")
    try:
        record_id = int(args.get("record_id"))
    except (TypeError, ValueError):
        return {"summary": "record_id must be a number.", "data": {}}
    gate = RECORD_TYPE_GATES.get(record_type)
    not_found = {"summary": "Record not found.", "data": {"record_type": record_type, "record_id": record_id}}
    if gate is None or not await gate_allowed(ctx, "get_record_summary", gate):
        return not_found
    sc = await resolve_screen_context_nested(
        ctx.db, tenant=ctx.tenant, user=ctx.user, record_type=record_type, record_id=record_id
    )
    if sc is None:
        return not_found
    return {
        "summary": sc.summary_line(),
        "data": {"record_type": sc.record_type, "record_id": sc.record_id, "label": sc.label, "href": sc.href, "facts": sc.facts},
        "citations": [sc.citation()],
    }


async def _search_sales_orders(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import search_sales_orders

    out = await search_sales_orders(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args) or "orders")
    items = (out.get("data") or {}).get("items") or []
    out["citations"] = [
        {"label": f"Order {x['order_code']}", "href": f"/app/orders/{x['id']}", "record_type": "order"}
        for x in items
        if isinstance(x, dict) and x.get("id") and x.get("order_code")
    ][:10]
    return out


async def _pending_approvals(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import search_pending_approvals

    flags = await _include_flags(ctx, "get_pending_approvals")
    return await search_pending_approvals(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args), **flags)


async def _dashboard(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import get_dashboard_summary

    flags = await _include_flags(ctx, "get_dashboard_summary")
    return await get_dashboard_summary(ctx.db, tenant_id=ctx.tenant.id, **flags)


async def _inventory_snapshot(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import get_inventory_snapshot

    return await get_inventory_snapshot(ctx.db, tenant_id=ctx.tenant.id)


async def _inventory_shortages(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import search_inventory_shortages

    return await search_inventory_shortages(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args) or "shortages")


async def _production_summary(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import get_production_summary

    return await get_production_summary(ctx.db, tenant_id=ctx.tenant.id)


async def _production_issues(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import search_production_issues

    return await search_production_issues(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args) or "production issues")


async def _late_vendors(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import search_repeated_late_vendors

    return await search_repeated_late_vendors(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args) or "late vendors")


async def _financial_summary(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import get_financial_summary

    return await get_financial_summary(ctx.db, tenant_id=ctx.tenant.id)


async def _similar_style_boms(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import suggest_bom_from_similar_style

    return await suggest_bom_from_similar_style(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args))


async def _items_for_bom_line(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import suggest_items_for_bom_line

    return await suggest_items_for_bom_line(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args))


async def _vendor_for_item(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import suggest_vendor_for_item

    try:
        item_id = int(args.get("item_id"))
    except (TypeError, ValueError):
        return {"summary": "item_id must be a number (find it with search_records kind 'item').", "data": {}}
    return await suggest_vendor_for_item(ctx.db, tenant_id=ctx.tenant.id, prompt=f"item {item_id}")


async def _orders_with_shortage(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools import suggest_orders_with_shortage

    return await suggest_orders_with_shortage(ctx.db, tenant_id=ctx.tenant.id, prompt=_focus(args))


async def _calendar_summary(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools.calendar_tools import calendar_summary_tool

    return await calendar_summary_tool(ctx.db, ctx.tenant.id, _focus(args) or "factory calendar")


async def _calendar_impact(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.tools.calendar_tools import calendar_impact_tool

    return await calendar_impact_tool(ctx.db, ctx.tenant.id, _focus(args) or "calendar impact")


async def _analyze_metrics(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.analysis.registry import run_analysis

    metric_type = str(args.get("metric_type") or "")
    gate = ANALYSIS_GATES.get(metric_type)
    if gate is None:
        return {"summary": f"Unknown metric_type. Use one of: {', '.join(ANALYSIS_GATES)}.", "data": {}}
    ok, reason = await check_gate(ctx, "analyze_structured_metrics", gate)
    if not ok:
        return {"summary": f"Blocked: {reason or 'no permission'}", "data": {}, "blocked": True}
    out = await run_analysis(ctx.db, tenant_id=ctx.tenant.id, metric_type=metric_type, parameters={}, user=ctx.user)
    return {"summary": str(out.get("commentary") or f"Completed {metric_type} analysis."), "data": out}


async def _search_notes(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.ai_tool.retrieval.unstructured_search import search_unstructured_context

    query = _focus(args, "query")
    domain = str(args.get("domain") or "merch")
    if domain not in UNSTRUCTURED_DOMAINS:
        domain = "merch"

    async def _source_allowed(source_module: str) -> bool:
        return await gate_allowed(ctx, "search_notes", source_gate(source_module))

    out = await search_unstructured_context(
        ctx.db,
        tenant_id=ctx.tenant.id,
        query=query,
        domain=domain,
        filters=None,
        top_k=5,
        user=ctx.user,
        source_allowed=_source_allowed,
    )
    return {"summary": f"Retrieved {out.get('total_found', 0)} note(s).", "data": out}


async def _help_articles(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    """Keyword search over approved knowledge documents (read-only: no seeding, no extra audit rows)."""
    from app.modules.ai_tool.retrieval.adapters import SqlKeywordRetrievalAdapter
    from app.modules.ai_tool.retrieval.unstructured_search import filter_hits_by_source

    query = _focus(args, "query")
    if len(query) < 2:
        return {"summary": "Give a longer question.", "data": {"sources": []}}

    async def _source_allowed(source_module: str) -> bool:
        return await gate_allowed(ctx, "search_help_articles", source_gate(source_module))

    hits = await SqlKeywordRetrievalAdapter(db=ctx.db, tenant_id=ctx.tenant.id, user=ctx.user).search(query, top_k=5)
    hits = await filter_hits_by_source(hits, _source_allowed)
    sources = [
        {"title": h.title, "doc_type": h.doc_type, "source_area": h.source_area, "heading": h.heading, "snippet": h.snippet}
        for h in hits
    ]
    summary = f"Found {len(sources)} matching document section(s)." if sources else "No matching help document."
    return {"summary": summary, "data": {"sources": sources}}


async def _finance_statement_summary(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    """Same service and permissions as POST /finance/statements/commentary, deterministic text only (the agent
    model itself writes the answer; no second provider call). Read-only."""
    from datetime import date

    from fastapi import HTTPException

    from app.modules.finance.ai_insights.constants import AI_TOOL_NAME, COMPARISONS, REPORTS
    from app.modules.finance.ai_insights.schemas import CommentaryRequest
    from app.modules.finance.ai_insights.service import assert_commentary_allowed, build_commentary

    def _date(key: str) -> date | None:
        raw = args.get(key)
        return date.fromisoformat(str(raw)) if raw else None

    blocked = {"summary": "Blocked: finance statement summaries are not available to you.", "data": {}, "blocked": True}
    ok, reason = await check_gate(ctx, AI_TOOL_NAME, GATE_FINANCE)
    if not ok:
        return {"summary": f"Blocked: {reason or 'no permission'}", "data": {}, "blocked": True}
    try:
        await assert_commentary_allowed(ctx.db, ctx.tenant, ctx.user)
    except HTTPException:
        return blocked

    comparison = str(args.get("comparison") or "none")
    report = str(args.get("report") or "")
    if report not in REPORTS or comparison not in COMPARISONS:
        return {"summary": f"report must be one of: {', '.join(REPORTS)}.", "data": {}}
    try:
        fy = args.get("fiscal_year")
        req = CommentaryRequest(
            report=report,  # type: ignore[arg-type]
            from_date=_date("from_date"),
            to_date=_date("to_date"),
            fiscal_year=int(fy) if fy not in (None, "") else None,
            comparison=comparison,  # type: ignore[arg-type]
            question=_focus(args, "question") or None,
            use_ai=False,
        )
    except (ValueError, TypeError) as exc:
        return {"summary": f"Invalid arguments: {str(exc)[:MAX_FOCUS_CHARS]}", "data": {}}
    try:
        out = await build_commentary(ctx.db, ctx.tenant, ctx.user, req, audit=False)
    except HTTPException as exc:
        if exc.status_code in (403, 404):
            return blocked
        return {"summary": f"Could not build the report: {str(exc.detail)[:MAX_FOCUS_CHARS]}", "data": {}}
    except (ValueError, LookupError) as exc:
        return {"summary": f"Could not build the report: {str(exc)[:MAX_FOCUS_CHARS]}", "data": {}}
    data = out.model_dump(mode="json", exclude={"summary"})
    # Cited facts first, then the rest, so a truncated tool message still holds the numbers the findings use.
    cited = {fid for f in data["findings"] for fid in f["fact_ids"]}
    facts = sorted(data["facts"], key=lambda f: f["id"] not in cited)
    data["facts_total"] = len(facts)
    data["facts"] = facts[:MAX_AGENT_FINANCE_FACTS]
    return {"summary": out.summary, "data": data}


# ---- schemas --------------------------------------------------------------------------------

_NO_ARGS: dict[str, Any] = {"type": "object", "properties": {}, "additionalProperties": False}


def _focus_schema(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"focus": {"type": "string", "description": description}},
        "additionalProperties": False,
    }


def _query_schema(description: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    props: dict[str, Any] = {"query": {"type": "string", "description": description}}
    props.update(extra or {})
    return {"type": "object", "properties": props, "required": ["query"], "additionalProperties": False}


AGENT_TOOLS: dict[str, AgentTool] = {
    t.name: t
    for t in [
        AgentTool(
            "search_records",
            "Find customers, orders, purchase orders, items, vendors, vouchers or employees by name, code or number. "
            "Returns ids and links; use get_record_summary for details.",
            _query_schema(
                "Name, code or number to look for (e.g. 'H&M', 'ORD-1023', 'denim').",
                {
                    "kinds": {
                        "type": "array",
                        "items": {"type": "string", "enum": list(SEARCH_KIND_GATES)},
                        "description": "Optional: only these record kinds.",
                    }
                },
            ),
            GATE_DASHBOARD,
            _search_records,
        ),
        AgentTool(
            "get_record_summary",
            "Headline facts of one record (status, dates, buyer, quantities) by type and id.",
            {
                "type": "object",
                "properties": {
                    "record_type": {"type": "string", "enum": list(RECORD_TYPE_GATES)},
                    "record_id": {"type": "integer", "minimum": 1},
                },
                "required": ["record_type", "record_id"],
                "additionalProperties": False,
            },
            GATE_DASHBOARD,
            _get_record_summary,
        ),
        AgentTool(
            "search_sales_orders",
            "List sales orders with filters written in plain words: status, delayed only, buyer-wise, date range, "
            "order code / style / buyer name, 'top 20'.",
            _focus_schema("e.g. 'delayed orders', 'buyer-wise order status', 'orders for H&M last 30 days'."),
            GATE_ORDERS,
            _search_sales_orders,
        ),
        AgentTool(
            "get_pending_approvals",
            "Counts of items waiting for approval per queue (vouchers, payment runs, bank reconciliations, "
            "leave, payroll). Queues the user may not see are left out.",
            _focus_schema("Optional, e.g. 'above 10'."),
            GATE_DASHBOARD,
            _pending_approvals,
        ),
        AgentTool(
            "get_dashboard_summary",
            "Company headline numbers: order count, customer count, pending approvals.",
            _NO_ARGS,
            GATE_DASHBOARD,
            _dashboard,
        ),
        AgentTool(
            "get_inventory_snapshot",
            "Top items by on-hand stock quantity.",
            _NO_ARGS,
            GATE_INVENTORY,
            _inventory_snapshot,
        ),
        AgentTool(
            "search_inventory_shortages",
            "Items at or below a stock threshold (default 0).",
            _focus_schema("e.g. 'stock below 50', 'top 20 shortages'."),
            GATE_INVENTORY,
            _inventory_shortages,
        ),
        AgentTool(
            "get_production_summary",
            "Production overview: work orders, output and shop-floor status.",
            _NO_ARGS,
            GATE_PRODUCTION,
            _production_summary,
        ),
        AgentTool(
            "search_production_issues",
            "Production issues: downtime, NCRs and quality problems.",
            _focus_schema("e.g. 'downtime this week', 'open NCRs'."),
            GATE_PRODUCTION,
            _production_issues,
        ),
        AgentTool(
            "search_repeated_late_vendors",
            "Vendors that repeatedly deliver late.",
            _focus_schema("Optional filter, e.g. 'last 90 days'."),
            GATE_INVENTORY,
            _late_vendors,
        ),
        AgentTool(
            "get_financial_summary",
            "Finance overview: vouchers by status, cash and reconciliation position.",
            _NO_ARGS,
            GATE_FINANCE,
            _financial_summary,
        ),
        AgentTool(
            "finance_statement_summary",
            "Computed figures and plain commentary for one finance report (trial balance, balance sheet, profit and "
            "loss, cash flow, funds flow, ratios, budget analytics, expense analysis, control tower), optionally "
            "compared with the previous period or year. Every number comes with a fact id.",
            {
                "type": "object",
                "properties": {
                    "report": {"type": "string", "enum": list(FINANCE_REPORTS)},
                    "from_date": {"type": "string", "description": "YYYY-MM-DD, optional."},
                    "to_date": {"type": "string", "description": "YYYY-MM-DD, optional."},
                    "fiscal_year": {"type": "integer", "description": "Year the fiscal year starts in, optional."},
                    "comparison": {"type": "string", "enum": ["none", "previous_period", "previous_year"]},
                    "question": {"type": "string", "description": "Optional topic, e.g. 'why did gross margin fall'."},
                },
                "required": ["report"],
                "additionalProperties": False,
            },
            GATE_FINANCE,
            _finance_statement_summary,
        ),
        AgentTool(
            "suggest_bom_from_similar_style",
            "BOMs of similar styles (same department) as a starting point.",
            _focus_schema("e.g. 'style 5' or 'department Knit'."),
            GATE_BOM,
            _similar_style_boms,
        ),
        AgentTool(
            "suggest_items_for_bom_line",
            "Inventory items matching a name, code or category (for a BOM line).",
            _focus_schema("Item name, code or category."),
            GATE_INVENTORY,
            _items_for_bom_line,
        ),
        AgentTool(
            "suggest_vendor_for_item",
            "Vendors used for an item in past purchase orders.",
            {
                "type": "object",
                "properties": {"item_id": {"type": "integer", "minimum": 1}},
                "required": ["item_id"],
                "additionalProperties": False,
            },
            GATE_INVENTORY,
            _vendor_for_item,
        ),
        AgentTool(
            "suggest_orders_with_shortage",
            "Recent orders whose issued material is below the BOM requirement.",
            _focus_schema("Optional, e.g. 'top 10'."),
            GATE_SHORTAGE,
            _orders_with_shortage,
        ),
        AgentTool(
            "calendar_summary",
            "Factory calendar: working days, next holidays.",
            _focus_schema("e.g. 'working days this month', 'next holiday'."),
            GATE_PRODUCTION,
            _calendar_summary,
        ),
        AgentTool(
            "calendar_impact",
            "What happens to working days if a holiday is added (read-only preview).",
            _focus_schema("e.g. 'what if we add a holiday on 2026-12-16'."),
            GATE_PRODUCTION,
            _calendar_impact,
        ),
        AgentTool(
            "analyze_structured_metrics",
            "Run one analysis: margin, costing, order_risk, tna_delay, inventory_variance, wastage, finance_exceptions.",
            {
                "type": "object",
                "properties": {"metric_type": {"type": "string", "enum": list(ANALYSIS_GATES)}},
                "required": ["metric_type"],
                "additionalProperties": False,
            },
            GATE_DASHBOARD,
            _analyze_metrics,
        ),
        AgentTool(
            "search_notes",
            "Search free-text notes: order/style remarks, follow-up and shipment logs, HR policies, SOPs.",
            _query_schema(
                "What to look for.",
                {"domain": {"type": "string", "enum": list(UNSTRUCTURED_DOMAINS)}},
            ),
            GATE_DASHBOARD,
            _search_notes,
        ),
        AgentTool(
            "search_help_articles",
            "Search the company's approved how-to and policy documents (how do I ..., what is the process for ...).",
            _query_schema("The how-to question."),
            GATE_KNOWLEDGE,
            _help_articles,
        ),
    ]
}


def openai_tool_specs() -> list[dict[str, Any]]:
    return [
        {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}}
        for t in AGENT_TOOLS.values()
    ]


def parse_tool_arguments(raw: Any) -> tuple[dict[str, Any] | None, str | None]:
    """Model arguments as a dict without ``tenant_id``; (None, error) when they are not a JSON object."""
    if raw is None or raw == "":
        args: Any = {}
    elif isinstance(raw, str):
        try:
            args = json.loads(raw)
        except (TypeError, ValueError):
            return None, "Arguments were not valid JSON."
    else:
        args = raw
    if not isinstance(args, dict):
        return None, "Arguments must be a JSON object."
    args.pop("tenant_id", None)
    return args, None
