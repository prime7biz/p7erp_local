from __future__ import annotations

from typing import Any, Type

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool.analysis.base import BaseAnalysisPipeline
from app.modules.ai_tool.analysis.output_formatter import analysis_result_to_dict
from app.modules.ai_tool.analysis.pipelines import (
    CostingAnalysisPipeline,
    FinanceExceptionsPipeline,
    InventoryVarianceAnalysisPipeline,
    MarginAnalysisPipeline,
    OrderRiskAnalysisPipeline,
    TnaDelayAnalysisPipeline,
    WastageAnalysisPipeline,
)

PIPELINES: dict[str, Type[BaseAnalysisPipeline]] = {
    "margin": MarginAnalysisPipeline,
    "inventory_variance": InventoryVarianceAnalysisPipeline,
    "costing": CostingAnalysisPipeline,
    "wastage": WastageAnalysisPipeline,
    "order_risk": OrderRiskAnalysisPipeline,
    "tna_delay": TnaDelayAnalysisPipeline,
    "finance_exceptions": FinanceExceptionsPipeline,
}


def detect_analysis_type(prompt: str) -> str:
    t = (prompt or "").lower()
    if "wastage" in t:
        return "wastage"
    if "inventory variance" in t or ("variance" in t and "inventory" in t):
        return "inventory_variance"
    if "costing" in t or "cm%" in t or "cost breakdown" in t:
        return "costing"
    if "tna" in t or "delay analysis" in t:
        return "tna_delay"
    if "order risk" in t or ("risk" in t and "order" in t):
        return "order_risk"
    if "finance" in t and ("exception" in t or "voucher" in t):
        return "finance_exceptions"
    return "margin"


async def run_analysis(
    db: AsyncSession,
    *,
    tenant_id: int,
    metric_type: str,
    parameters: dict[str, Any] | None = None,
    include_semantic_context: bool = False,
    semantic_query: str | None = None,
) -> dict[str, Any]:
    cls = PIPELINES.get(metric_type, MarginAnalysisPipeline)
    pipeline = cls(db, tenant_id)
    params = await pipeline.validate_parameters(parameters or {})
    df = await pipeline.fetch_data(params)
    result = await pipeline.compute(df, params)
    out = analysis_result_to_dict(result)
    if include_semantic_context and semantic_query:
        from app.modules.ai_tool.retrieval.unstructured_search import search_unstructured_context

        sem = await search_unstructured_context(
            db,
            tenant_id=tenant_id,
            query=semantic_query,
            domain="merch",
            filters=None,
            top_k=3,
            user=None,
        )
        out["semantic_context"] = sem.get("results", [])
    return out
