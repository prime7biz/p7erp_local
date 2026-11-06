"""Hybrid search runs its queries one at a time and a failed vector query cannot poison the session.

Run:
docker compose exec backend pytest tests/test_unstructured_search_session_safety.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import text

from app.modules.ai_tool.retrieval import unstructured_search
from app.modules.ai_tool.retrieval.adapters import PgVectorRetrievalAdapter, SqlKeywordRetrievalAdapter
from app.modules.ai_tool.retrieval.bm25_adapter import BM25EmbeddingChunksAdapter


@pytest.mark.asyncio
async def test_failed_vector_query_does_not_break_fallbacks(db_session_integration, monkeypatch):
    db = db_session_integration
    calls: list[str] = []

    async def _broken_vector(self, query, *, top_k=5):
        calls.append("vector")
        await self.db.execute(text("SELECT * FROM table_that_does_not_exist_p7"))
        return []

    async def _bm25(self, query, *, top_k=5):
        calls.append("bm25")
        await self.db.execute(text("SELECT 1"))
        return []

    async def _keyword(self, query, *, top_k=5):
        calls.append("keyword")
        await self.db.execute(text("SELECT 1"))
        return []

    monkeypatch.setattr(PgVectorRetrievalAdapter, "search", _broken_vector)
    monkeypatch.setattr(BM25EmbeddingChunksAdapter, "search", _bm25)
    monkeypatch.setattr(SqlKeywordRetrievalAdapter, "search", _keyword)

    out = await unstructured_search.search_unstructured_context(
        db, tenant_id=1, query="fabric delay", domain="", filters=None, top_k=3
    )

    assert calls == ["vector", "bm25", "keyword"]
    assert out["retrieval_method"] == "keyword_fallback"
    assert (await db.execute(text("SELECT 1"))).scalar_one() == 1
