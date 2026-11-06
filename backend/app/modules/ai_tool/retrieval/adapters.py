from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.permissions import HR_SETUP_BYPASS_ROLES
from app.models import User
from app.modules.ai_tool import repository
from app.modules.ai_tool.authz import get_role_name, has_tool_permission
from app.modules.ai_tool.retrieval.base import BaseRetrievalAdapter, RetrievalHit
from app.modules.ai_tool.retrieval.source_registry import permission_key_for_module

PUBLIC_VISIBILITIES = frozenset({"", "public"})


def is_public_visibility(visibility: str | None) -> bool:
    return (visibility or "").strip().lower() in PUBLIC_VISIBILITIES


async def filter_chunk_rows_for_user(db: AsyncSession, user: User | None, rows: list) -> list:
    """Keep only ai_embedding_chunks rows the user may read.

    Each row needs ``permission_key``, ``visibility`` and ``source_module``. Non-public rows
    without their own permission_key are limited to manager-type roles.
    """
    if user is None:
        return []
    allowed_by_key: dict[str | None, bool] = {}
    allowed_rows = []
    for row in rows:
        key = row.get("permission_key") or None
        if key is None and is_public_visibility(row.get("visibility")):
            key = permission_key_for_module(row.get("source_module"))
        if key not in allowed_by_key:
            if key is None:
                allowed_by_key[key] = (await get_role_name(db, user)) in HR_SETUP_BYPASS_ROLES
            else:
                allowed_by_key[key] = await has_tool_permission(db, user, key)
        if allowed_by_key[key]:
            allowed_rows.append(row)
    return allowed_rows


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
    user: User | None

    async def search(self, query: str, *, top_k: int = 5) -> list[RetrievalHit]:
        top_k = max(1, min(20, top_k))
        terms = _terms(query)
        rows = await repository.search_knowledge_chunks_raw(
            self.db, tenant_id=self.tenant_id, terms=terms, limit=max(50, top_k * 20)
        )
        scored: list[RetrievalHit] = []
        for chunk, document in rows:
            if self.user is None and not is_public_visibility(document.visibility):
                continue
            if document.permission_key:
                if self.user is None:
                    continue
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


_MAX_COSINE_DIST = 1.25  # ~similarity > 0.375 for normalized embeddings


@dataclass
class PgVectorRetrievalAdapter(BaseRetrievalAdapter):
    """Semantic search over ai_embedding_chunks (pgvector)."""

    db: AsyncSession
    tenant_id: int
    domain: str
    user: User | None
    filters: dict | None = None

    async def search(self, query: str, *, top_k: int = 5) -> list[RetrievalHit]:
        from app.modules.ai_tool.retrieval.embeddings import embed_query

        if self.user is None:
            return []
        top_k = max(1, min(20, top_k))
        # CPU-bound model call (and first-time model load): keep it off the event loop.
        qvec = await asyncio.to_thread(embed_query, query)
        vec_lit = "[" + ",".join(f"{float(x):.8f}" for x in qvec) + "]"
        filt = self.filters or {}
        clauses = [
            "tenant_id = :tid",
            "is_stale = false",
            "(:domain = '' OR source_module = :domain)",
        ]
        # Over-fetch so permission filtering below still leaves enough hits.
        params: dict = {"tid": self.tenant_id, "domain": (self.domain or "").strip(), "qv": vec_lit, "lim": top_k * 20}
        if filt.get("document_type"):
            clauses.append("document_type = :document_type")
            params["document_type"] = str(filt["document_type"])
        if filt.get("order_id") is not None:
            clauses.append("order_id = :order_id")
            params["order_id"] = int(filt["order_id"])
        if filt.get("style_id") is not None:
            clauses.append("style_id = :style_id")
            params["style_id"] = int(filt["style_id"])
        if filt.get("date_from"):
            clauses.append("date_reference >= :date_from")
            params["date_from"] = _parse_date(filt["date_from"])
        if filt.get("date_to"):
            clauses.append("date_reference <= :date_to")
            params["date_to"] = _parse_date(filt["date_to"])

        where_sql = " AND ".join(clauses)
        sql = text(
            f"""
            SELECT id, source_type, source_ref, source_module, heading, content_text,
                   indexed_at, permission_key, visibility,
                   (embedding <=> CAST(:qv AS vector)) AS dist
            FROM ai_embedding_chunks
            WHERE {where_sql}
            ORDER BY dist ASC
            LIMIT :lim
            """
        )
        # The savepoint rolls back only this query on failure, keeping the caller's transaction usable.
        try:
            async with self.db.begin_nested():
                result = await self.db.execute(sql, params)
                raw_rows = result.mappings().all()
        except Exception:
            return []
        raw_rows = await filter_chunk_rows_for_user(self.db, self.user, raw_rows)

        best_by_ref: dict[str, tuple[float, dict]] = {}
        for row in raw_rows:
            dist = float(row["dist"])
            if dist > _MAX_COSINE_DIST:
                continue
            sim = max(0.0, min(1.0, 1.0 - dist / 2.0))
            ref = str(row["source_ref"])
            if ref not in best_by_ref or dist < best_by_ref[ref][0]:
                merged = dict(row)
                merged["similarity"] = sim
                best_by_ref[ref] = (dist, merged)

        hits: list[RetrievalHit] = []
        for _dist, data in sorted(best_by_ref.values(), key=lambda x: x[0]):
            snippet = (data.get("content_text") or "")[:280]
            ia = data.get("indexed_at")
            hits.append(
                RetrievalHit(
                    document_code=str(data.get("source_ref") or ""),
                    title=str(data.get("heading") or data.get("source_type") or "chunk")[:200],
                    doc_type=str(data.get("source_type") or ""),
                    source_area=str(data.get("source_module") or ""),
                    snippet=snippet,
                    heading=data.get("heading"),
                    score=round(float(data["similarity"]), 4),
                    metadata={
                        "chunk_id": data.get("id"),
                        "source_ref": data.get("source_ref"),
                        "indexed_at": ia.isoformat() if hasattr(ia, "isoformat") else ia,
                    },
                )
            )
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits[:top_k]


def _parse_date(val: object) -> date:
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()[:10]
    y, m, d = s.split("-")
    return date(int(y), int(m), int(d))
