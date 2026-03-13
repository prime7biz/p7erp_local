from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.modules.ai_tool import repository
from app.modules.ai_tool.authz import has_tool_permission
from app.modules.ai_tool.retrieval.base import BaseRetrievalAdapter, RetrievalHit


def _terms(query: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9_]+", query.lower())
    return [w for w in words if len(w) >= 3][:12]


def _score(text: str, title: str, terms: list[str]) -> float:
    hay = f"{title} {text}".lower()
    score = 0.0
    for term in terms:
        if term in hay:
            score += 1.0
            if term in title.lower():
                score += 0.5
    return score


def _snippet(text: str, terms: list[str], size: int = 220) -> str:
    body = " ".join(text.split())
    if len(body) <= size:
        return body
    low = body.lower()
    idx = min((low.find(term) for term in terms if low.find(term) >= 0), default=0)
    start = max(0, idx - 40)
    end = min(len(body), start + size)
    result = body[start:end]
    if start > 0:
        result = "..." + result
    if end < len(body):
        result = result + "..."
    return result


@dataclass
class SqlKeywordRetrievalAdapter(BaseRetrievalAdapter):
    db: AsyncSession
    tenant_id: int
    user: User

    async def search(self, query: str, *, top_k: int = 5) -> list[RetrievalHit]:
        top_k = max(1, min(20, top_k))
        terms = _terms(query)
        rows = await repository.search_knowledge_chunks_raw(
            self.db, tenant_id=self.tenant_id, terms=terms, limit=max(50, top_k * 20)
        )
        scored: list[RetrievalHit] = []
        for chunk, document in rows:
            if document.permission_key:
                allowed = await has_tool_permission(self.db, self.user, document.permission_key)
                if not allowed:
                    continue
            score = _score(chunk.content_text, document.title, terms)
            if score <= 0:
                continue
            scored.append(
                RetrievalHit(
                    document_code=document.document_code,
                    title=document.title,
                    doc_type=document.doc_type,
                    source_area=document.source_area,
                    snippet=_snippet(chunk.content_text, terms),
                    heading=chunk.heading,
                    score=round(score, 3),
                    metadata={
                        "visibility": document.visibility,
                        "owner_scope": document.owner_scope,
                        "chunk_index": chunk.chunk_index,
                    },
                )
            )

        scored.sort(key=lambda x: x.score, reverse=True)
        return scored[:top_k]
