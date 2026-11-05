"""Shared unstructured / semantic search for MCP tools and internal AI tools."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai_tool.retrieval.adapters import PgVectorRetrievalAdapter, SqlKeywordRetrievalAdapter
from app.modules.ai_tool.retrieval.bm25_adapter import BM25EmbeddingChunksAdapter
from app.modules.ai_tool.retrieval.fusion import merge_hybrid_hits


def _hits_to_payload(hits: list, *, retrieval_method: str, query: str, domain: str) -> dict[str, Any]:
    results = []
    for h in hits:
        results.append(
            {
                "source_type": h.doc_type,
                "source_ref": h.document_code,
                "source_module": h.source_area,
                "heading": h.heading,
                "snippet": h.snippet,
                "similarity_score": h.score,
                "metadata": dict(h.metadata or {}),
            }
        )
    return {
        "query": query,
        "domain": domain,
        "results": results,
        "total_found": len(results),
        "retrieval_method": retrieval_method,
        "disclaimer": "Results are based on semantic or keyword retrieval and may not be exhaustive.",
    }


async def search_unstructured_context(
    db: AsyncSession,
    *,
    tenant_id: int,
    query: str,
    domain: str,
    filters: dict | None,
    top_k: int,
    user: User | None = None,
) -> dict[str, Any]:
    vec = PgVectorRetrievalAdapter(db=db, tenant_id=tenant_id, domain=domain, filters=filters)
    bm25 = BM25EmbeddingChunksAdapter(db=db, tenant_id=tenant_id, domain=domain, filters=filters)

    # Each search runs in a SAVEPOINT so a failed query (e.g. pgvector missing) is rolled back
    # without aborting the caller's transaction or the fallback searches below.
    async def _safe_vector() -> list:
        try:
            async with db.begin_nested():
                return await vec.search(query, top_k=top_k)
        except Exception:
            return []

    async def _safe_bm25() -> list:
        try:
            if not (query or "").strip():
                return []
            async with db.begin_nested():
                return await bm25.search(query, top_k=top_k)
        except Exception:
            return []

    # One AsyncSession cannot run two queries at the same time, so these run one after the other.
    vhits = await _safe_vector()
    bhits = await _safe_bm25()
    fused, method = merge_hybrid_hits(vector_hits=vhits, bm25_hits=bhits, top_k=top_k)
    if fused:
        return _hits_to_payload(fused, retrieval_method=method, query=query, domain=domain)

    kw = SqlKeywordRetrievalAdapter(db=db, tenant_id=tenant_id, user=user)
    khits = await kw.search(query, top_k=top_k)
    return _hits_to_payload(khits, retrieval_method="keyword_fallback", query=query, domain=domain)
