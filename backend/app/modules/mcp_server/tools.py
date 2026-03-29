import logging
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from app.config import get_settings
from app.modules.mcp_server import erp_backend
from app.modules.mcp_server.safety import check_commit_allowed
from app.modules.mcp_server.tenant_guard import validate_tenant

logger = logging.getLogger(__name__)


class InquiryItemInput(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    qty: float = Field(gt=0)


class CreateSalesInquiryInput(BaseModel):
    tenant_id: int = Field(ge=1)
    customer_id: int = Field(ge=1)
    items: list[InquiryItemInput] = Field(min_length=1)
    raw_notes: str = Field(default="", max_length=4000)
    human_approval_confirmed: bool = Field(default=False)
    human_approval_token: str = Field(default="", max_length=256)


class VoucherInput(BaseModel):
    tenant_id: int = Field(ge=1)
    voucher_type: str = Field(min_length=1, max_length=64)
    amount: float = Field(gt=0, strict=True)
    debit_account: str = Field(min_length=1, max_length=128)
    credit_account: str = Field(min_length=1, max_length=128)
    voucher_date: date
    narrative: str = Field(min_length=1, max_length=4000)
    human_approval_confirmed: bool = Field(default=False)
    human_approval_token: str = Field(default="", max_length=256)


class GoodsReceiptItemInput(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    qty: float = Field(gt=0)
    condition: str = Field(default="good", max_length=32)


class GoodsReceiptInput(BaseModel):
    tenant_id: int = Field(ge=1)
    po_number: str = Field(min_length=1, max_length=64)
    received_items: list[GoodsReceiptItemInput] = Field(min_length=1)
    reference_document: str = Field(min_length=1, max_length=4000)
    human_approval_confirmed: bool = Field(default=False)
    human_approval_token: str = Field(default="", max_length=256)


class SearchUnstructuredContextInput(BaseModel):
    tenant_id: int = Field(ge=1)
    query: str = Field(min_length=3, max_length=2000)
    domain: str = Field(min_length=1, max_length=64, description="merch, hr, logistics, knowledge, qa, inventory, etc.")
    filters: dict | None = Field(default=None, description="Optional: document_type, order_id, style_id, date_from, date_to")
    top_k: int = Field(default=5, ge=1, le=20)


class AnalyzeStructuredMetricsInput(BaseModel):
    tenant_id: int = Field(ge=1)
    metric_type: str = Field(
        min_length=1,
        max_length=64,
        description="margin | inventory_variance | costing | wastage | order_risk | tna_delay | finance_exceptions",
    )
    parameters: dict[str, Any] | None = None
    include_semantic_context: bool = False


class GenerateForecastInput(BaseModel):
    tenant_id: int = Field(ge=1)
    target_variable: str = Field(
        min_length=1,
        max_length=64,
        description="inventory_consumption | shipment_delay_risk | sales_trend | margin_trend | manpower_load",
    )
    timeframe: str = Field(default="30d", max_length=16, description='e.g. "7d", "30d", "365d"')
    parameters: dict[str, Any] | None = None


class CreateSystemTaskInput(BaseModel):
    tenant_id: int = Field(ge=1)
    task_type: str = Field(min_length=1, max_length=64)
    execution_conditions: dict[str, Any] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=5, ge=1, le=10)
    idempotency_key: str | None = Field(default=None, max_length=128)
    session_id: int | None = None
    simulation: bool = Field(default=False, description="If true, handler runs in dry-run / preview mode.")
    human_approval_confirmed: bool = Field(default=False)
    human_approval_token: str = Field(default="", max_length=256)


TOOL_REGISTRY: dict[str, tuple[type[BaseModel], str]] = {
    "create_sales_inquiry": (CreateSalesInquiryInput, "Create a sales inquiry transaction."),
    "create_financial_voucher": (VoucherInput, "Create a financial voucher transaction."),
    "process_goods_receipt": (GoodsReceiptInput, "Process a goods receipt against a PO."),
    "search_unstructured_context": (
        SearchUnstructuredContextInput,
        "Tenant-safe semantic search over notes, follow-ups, and knowledge (pgvector + keyword fallback).",
    ),
    "analyze_structured_metrics": (
        AnalyzeStructuredMetricsInput,
        "Run a tenant-scoped structured analysis pipeline (pandas) with optional semantic context.",
    ),
    "generate_forecast": (
        GenerateForecastInput,
        "Generate a draft forecast for a target variable; persists AiForecastRun for polling.",
    ),
    "create_system_task": (
        CreateSystemTaskInput,
        "Create an automation task; approval_gated types require human_approval_* fields.",
    ),
}


def get_tools() -> list[dict[str, Any]]:
    """Return dynamic MCP tool schemas for LLM tool-calling."""
    payload: list[dict[str, Any]] = []
    for name, (model_cls, description) in TOOL_REGISTRY.items():
        payload.append(
            {
                "name": name,
                "description": description,
                "input_schema": model_cls.model_json_schema(),
            }
        )
    return payload


async def execute_tool_call(
    tool_name: str,
    arguments: dict[str, Any],
    *,
    context_tenant_id: int | None = None,
) -> dict[str, Any]:
    """Validate and execute a dynamic tool call against ERP backend handlers."""
    if tool_name not in TOOL_REGISTRY:
        return {
            "status": "BLOCKED",
            "tool_name": tool_name,
            "message": "Unknown tool requested.",
        }

    ok_tenant, tenant_msg = validate_tenant(
        tool_tenant_id=arguments.get("tenant_id"),
        context_tenant_id=context_tenant_id,
    )
    if not ok_tenant:
        return {"status": "BLOCKED", "tool_name": tool_name, "message": tenant_msg or "Tenant validation failed."}

    ok_commit, commit_msg = check_commit_allowed(tool_name=tool_name, arguments=arguments)
    if not ok_commit:
        return {
            "status": "APPROVAL_REQUIRED",
            "tool_name": tool_name,
            "message": commit_msg or "Human approval required before commit.",
        }

    model_cls, _ = TOOL_REGISTRY[tool_name]
    payload = model_cls.model_validate(arguments)
    data = payload.model_dump()

    settings = get_settings()
    _ARTIFACT_COMMIT_TOOLS = frozenset(
        {"create_sales_inquiry", "create_financial_voucher", "process_goods_receipt"}
    )
    if settings.mcp_commit_uses_artifact and tool_name in _ARTIFACT_COMMIT_TOOLS:
        from app.database import AsyncSessionLocal
        from app.modules.ai_tool.artifacts.service import create_artifact

        mapping = {
            "create_sales_inquiry": ("sales_inquiry", "merch"),
            "create_financial_voucher": ("finance_voucher", "finance"),
            "process_goods_receipt": ("goods_receipt", "inventory"),
        }
        artifact_type, source_module = mapping[tool_name]
        async with AsyncSessionLocal() as session:
            try:
                art = await create_artifact(
                    session,
                    tenant_id=int(data["tenant_id"]),
                    user_id=None,
                    session_id=None,
                    artifact_type=artifact_type,
                    source_tool=tool_name,
                    source_module=source_module,
                    original_input=data,
                    generated_payload=data,
                )
                await session.commit()
                return {
                    "status": "DRAFT_CREATED",
                    "tool_name": tool_name,
                    "artifact_id": art.id,
                    "artifact_code": art.artifact_code,
                    "message": "Stored as approval artifact; review and commit via tenant AI Tool API.",
                }
            except Exception as exc:
                logger.exception("MCP artifact create failed for %s", tool_name)
                await session.rollback()
                return {"status": "FAILED", "tool_name": tool_name, "message": str(exc)}

    if tool_name == "search_unstructured_context":
        from app.database import AsyncSessionLocal
        from app.modules.ai_tool.retrieval.unstructured_search import search_unstructured_context

        async with AsyncSessionLocal() as session:
            try:
                out = await search_unstructured_context(
                    session,
                    tenant_id=int(data["tenant_id"]),
                    query=str(data["query"]),
                    domain=str(data["domain"]),
                    filters=data.get("filters"),
                    top_k=int(data.get("top_k") or 5),
                    user=None,
                )
                return {"status": "SUCCESS", **out}
            except Exception as exc:
                logger.exception("search_unstructured_context failed")
                return {"status": "FAILED", "tool_name": tool_name, "message": str(exc)}

    if tool_name == "analyze_structured_metrics":
        from app.database import AsyncSessionLocal
        from app.modules.ai_tool.analysis.registry import PIPELINES, run_analysis

        async with AsyncSessionLocal() as session:
            try:
                mt = str(data["metric_type"]).strip().lower()
                if mt not in PIPELINES:
                    mt = "margin"
                params = dict(data.get("parameters") or {})
                sem_q: str | None = None
                if data.get("include_semantic_context"):
                    sem_q = str(params.pop("semantic_query", "") or "") or mt
                out = await run_analysis(
                    session,
                    tenant_id=int(data["tenant_id"]),
                    metric_type=mt,
                    parameters=params,
                    include_semantic_context=bool(data.get("include_semantic_context")),
                    semantic_query=sem_q,
                )
                return {"status": "SUCCESS", "metric_type": mt, **out}
            except Exception as exc:
                logger.exception("analyze_structured_metrics failed")
                return {"status": "FAILED", "tool_name": tool_name, "message": str(exc)}

    if tool_name == "generate_forecast":
        from app.database import AsyncSessionLocal
        from app.modules.ai_tool.forecast.job_manager import run_forecast_for_mcp

        async with AsyncSessionLocal() as session:
            try:
                out = await run_forecast_for_mcp(
                    session,
                    tenant_id=int(data["tenant_id"]),
                    target_variable=str(data["target_variable"]),
                    timeframe=str(data.get("timeframe") or "30d"),
                    parameters=data.get("parameters"),
                    request_id=uuid4().hex,
                )
                await session.commit()
                return out
            except Exception as exc:
                logger.exception("generate_forecast failed")
                await session.rollback()
                return {"status": "FAILED", "tool_name": tool_name, "message": str(exc)}

    if tool_name == "create_system_task":
        from app.database import AsyncSessionLocal
        from app.modules.ai_tool import repository
        from app.modules.ai_tool.tasks.executor import execute_system_task_inline
        from app.modules.ai_tool.tasks.policies import classify_task
        from app.modules.ai_tool.tasks.policy_engine import evaluate_task_creation_policy

        async with AsyncSessionLocal() as session:
            try:
                tid = int(data["tenant_id"])
                sim = bool(data.get("simulation", False))
                ok_pol, pol_msg = await evaluate_task_creation_policy(
                    session,
                    tenant_id=tid,
                    task_type=str(data["task_type"]),
                    simulation=sim,
                )
                if not ok_pol:
                    return {
                        "status": "BLOCKED",
                        "tool_name": tool_name,
                        "message": pol_msg or "Task policy denied creation.",
                    }

                idem = data.get("idempotency_key")
                if idem:
                    existing = await repository.get_system_task_by_idempotency_key(
                        session, tenant_id=tid, idempotency_key=str(idem)
                    )
                    if existing:
                        await session.commit()
                        return {
                            "status": "SUCCESS",
                            "deduplicated": True,
                            "task_id": existing.id,
                            "task_code": existing.task_code,
                            "task_type": existing.task_type,
                            "task_category": existing.task_category,
                            "requires_approval": existing.requires_approval,
                            "task_status": existing.status,
                            "message": "Idempotent replay of existing task.",
                        }

                cat, gated = classify_task(str(data["task_type"]))
                code = f"TSK-{uuid4().hex[:10].upper()}"
                requires_flag = gated
                status_init = "pending_approval" if gated else "queued"
                row = await repository.create_system_task(
                    session,
                    tenant_id=tid,
                    user_id=None,
                    session_id=data.get("session_id"),
                    task_code=code,
                    task_type=str(data["task_type"]),
                    task_category=cat,
                    status=status_init,
                    priority=int(data.get("priority") or 5),
                    execution_conditions=data.get("execution_conditions") or {},
                    payload=data.get("payload") or {},
                    requires_approval=requires_flag,
                    idempotency_key=str(idem) if idem else None,
                    simulation=sim,
                )
                if not gated:
                    row.queued_at = datetime.utcnow()
                    await execute_system_task_inline(session, row)
                await session.commit()
                msg = (
                    "Approval-gated task created; pending tenant approval before execution."
                    if gated
                    else "Task created and executed (MCP commit gate satisfied when applicable)."
                )
                return {
                    "status": "SUCCESS",
                    "task_id": row.id,
                    "task_code": row.task_code,
                    "task_type": row.task_type,
                    "task_category": cat,
                    "requires_approval": requires_flag,
                    "task_status": row.status,
                    "approval_gated_type": gated,
                    "message": msg,
                }
            except Exception as exc:
                logger.exception("create_system_task failed")
                await session.rollback()
                return {"status": "FAILED", "tool_name": tool_name, "message": str(exc)}

    if tool_name == "create_sales_inquiry":
        return await erp_backend.create_sales_inquiry(
            tenant_id=int(data["tenant_id"]),
            customer_id=int(data["customer_id"]),
            items=list(data["items"]),
            raw_notes=str(data.get("raw_notes") or ""),
        )
    if tool_name == "create_financial_voucher":
        return await erp_backend.create_financial_voucher(
            tenant_id=int(data["tenant_id"]),
            voucher_type=str(data["voucher_type"]),
            amount=float(data["amount"]),
            debit_account=str(data["debit_account"]),
            credit_account=str(data["credit_account"]),
            voucher_date=data["voucher_date"],
            narrative=str(data["narrative"]),
        )
    if tool_name == "process_goods_receipt":
        return await erp_backend.process_goods_receipt(
            tenant_id=int(data["tenant_id"]),
            po_number=str(data["po_number"]),
            received_items=list(data["received_items"]),
            reference_document=str(data["reference_document"]),
        )
    return {
        "status": "BLOCKED",
        "tool_name": tool_name,
        "message": "Tool routing did not match any handler.",
    }


def register_tools(mcp) -> None:
    """Register MCP tools with strict Pydantic validation."""

    from app.modules.mcp_server.auth import get_mcp_tenant_id

    @mcp.tool(name="create_sales_inquiry")
    async def create_sales_inquiry_tool(payload: CreateSalesInquiryInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP create_sales_inquiry called", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "create_sales_inquiry",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="create_financial_voucher")
    async def create_financial_voucher_tool(payload: VoucherInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP create_financial_voucher called", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "create_financial_voucher",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="process_goods_receipt")
    async def process_goods_receipt_tool(payload: GoodsReceiptInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP process_goods_receipt called", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "process_goods_receipt",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="search_unstructured_context")
    async def search_unstructured_context_tool(payload: SearchUnstructuredContextInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP search_unstructured_context", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "search_unstructured_context",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="analyze_structured_metrics")
    async def analyze_structured_metrics_tool(payload: AnalyzeStructuredMetricsInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP analyze_structured_metrics", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "analyze_structured_metrics",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="generate_forecast")
    async def generate_forecast_tool(payload: GenerateForecastInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP generate_forecast", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "generate_forecast",
            payload.model_dump(),
            context_tenant_id=tid,
        )

    @mcp.tool(name="create_system_task")
    async def create_system_task_tool(payload: CreateSystemTaskInput) -> dict:
        tid = get_mcp_tenant_id()
        logger.info("MCP create_system_task", extra={"tenant_id": payload.tenant_id, "auth_tenant": tid})
        return await execute_tool_call(
            "create_system_task",
            payload.model_dump(),
            context_tenant_id=tid,
        )
