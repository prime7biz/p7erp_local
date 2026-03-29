"""Standard response envelope for AI assistant messages (Phase-2)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.modules.ai_tool.schemas import AiToolInvocationResult


class SourceCitation(BaseModel):
    source_type: str = ""
    source_ref: str = ""
    module: str = ""
    snippet: str = ""
    similarity_score: float | None = None


class ToolTraceEntry(BaseModel):
    tool_name: str
    status: str
    latency_ms: int = 0
    source_area: str = ""


class AiResponseEnvelope(BaseModel):
    answer: str
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_label: str = "medium"
    grounding: str = "llm_only"

    facts: list[dict[str, Any]] | None = None
    sources: list[SourceCitation] | None = None
    assumptions: list[str] | None = None
    warnings: list[str] | None = None
    recommended_actions: list[str] | None = None

    tool_trace: list[ToolTraceEntry] | None = None
    routes_used: list[str] | None = None
    model_used: str | None = None
    total_latency_ms: int | None = None
    data_freshness: str | None = "real-time"


def _confidence_label(score: float) -> str:
    if score >= 0.85:
        return "high"
    if score >= 0.55:
        return "medium"
    if score >= 0.3:
        return "low"
    return "uncertain"


def _infer_grounding(tool_results: list[AiToolInvocationResult]) -> str:
    names = {t.tool_name for t in tool_results if t.status == "SUCCESS"}
    if not names:
        return "llm_only"
    if "generate_forecast" in names or any("forecast" in n for n in names):
        if "search_unstructured_context" in names or "analyze_structured_metrics" in names:
            return "hybrid"
        return "forecast_model"
    if "analyze_structured_metrics" in names or any("margin" in n or "report" in n for n in names):
        if "search_unstructured_context" in names:
            return "hybrid"
        return "structured_data"
    if "search_unstructured_context" in names or "knowledge" in str(names):
        return "vector_retrieval"
    if names:
        return "structured_data"
    return "llm_only"


def _score_from_tools(tool_results: list[AiToolInvocationResult]) -> float:
    if not tool_results:
        return 0.35
    ok = [t for t in tool_results if t.status == "SUCCESS"]
    if not ok:
        return 0.2
    base = 0.70
    for t in ok:
        if t.tool_name == "search_unstructured_context":
            data = t.data or {}
            results = data.get("results") or []
            if results:
                scores = [float(r.get("similarity_score") or 0) for r in results if isinstance(r, dict)]
                if scores:
                    base = max(base, 0.5 + 0.35 * min(1.0, sum(scores) / max(len(scores), 1)))
        elif t.tool_name == "analyze_structured_metrics":
            base = max(base, 0.85)
        elif "forecast" in t.tool_name or t.tool_name == "generate_forecast":
            base = max(base, 0.80)
        elif t.tool_name in {"generate_report", "anomaly_insights"}:
            base = max(base, 0.85)
        else:
            base = max(base, 0.85)
    return min(1.0, base)


def extract_sources_from_tool_results(tool_results: list[AiToolInvocationResult]) -> list[SourceCitation]:
    out: list[SourceCitation] = []
    for t in tool_results:
        if t.status != "SUCCESS":
            continue
        if t.tool_name != "search_unstructured_context":
            continue
        for r in (t.data or {}).get("results") or []:
            if not isinstance(r, dict):
                continue
            out.append(
                SourceCitation(
                    source_type=str(r.get("source_type") or "embedding_chunk"),
                    source_ref=str(r.get("source_ref") or ""),
                    module=str(r.get("source_module") or ""),
                    snippet=str(r.get("snippet") or "")[:500],
                    similarity_score=r.get("similarity_score"),
                )
            )
    return out[:20]


def build_response_envelope(
    *,
    answer: str,
    tool_results: list[AiToolInvocationResult],
    primary_route: str,
    secondary_routes: list[str],
    total_latency_ms: int | None,
    model_used: str | None = None,
) -> dict[str, Any]:
    conf = _score_from_tools(tool_results)
    grounding = _infer_grounding(tool_results)
    warnings: list[str] = []
    if conf < 0.45:
        warnings.append("Low confidence: verify critical facts in source systems.")
    tool_trace = [
        ToolTraceEntry(
            tool_name=t.tool_name,
            status=t.status,
            latency_ms=0,
            source_area=t.source_area,
        )
        for t in tool_results
    ]
    envelope = AiResponseEnvelope(
        answer=answer,
        confidence=round(conf, 3),
        confidence_label=_confidence_label(conf),
        grounding=grounding,
        facts=None,
        sources=extract_sources_from_tool_results(tool_results) or None,
        assumptions=None,
        warnings=warnings or None,
        recommended_actions=None,
        tool_trace=tool_trace or None,
        routes_used=[primary_route, *secondary_routes],
        model_used=model_used,
        total_latency_ms=total_latency_ms,
        data_freshness="real-time",
    )
    return envelope.model_dump(mode="json")
