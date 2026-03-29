"""BM25-style full-text retrieval over ai_embedding_chunks (PostgreSQL ts_rank + ILIKE ERP codes)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai_tool.retrieval.adapters import _parse_date
from app.modules.ai_tool.retrieval.base import BaseRetrievalAdapter, RetrievalHit


def _erp_code_tokens(query: str) -> list[str]:
    """Extract likely ERP reference tokens (style no, LC, PI, PO patterns)."""
    q = (query or "").strip()
    if not q:
        return []
    tokens: set[str] = set()
    for m in re.finditer(r"[A-Za-z]{0,6}[-_/]?[0-9]{2,}(?:[-_/][A-Za-z0-9]+)*", q):
        t = m.group(0).strip()
        if len(t) >= 4:
            tokens.add(t)
    for m in re.finditer(r"\b(?:LC|PI|PO|INV)[-#:/\s]*[A-Za-z0-9][A-Za-z0-9/-]{2,}\b", q, re.I):
        t = m.group(0).strip()
        if len(t) >= 3:
            tokens.add(t)
    return list(tokens)[:8]


@dataclass
class BM25EmbeddingChunksAdapter(BaseRetrievalAdapter):
    """Full-text search on ai_embedding_chunks.search_tsv + optional ILIKE on ERP codes."""

    db: AsyncSession
    tenant_id: int
    domain: str
    filters: dict | None = None

    async def search(self, query: str, *, top_k: int = 5) -> list[RetrievalHit]:
        if not (query or "").strip():
            return []
        top_k = max(1, min(20, top_k))
        filt = self.filters or {}
        clauses = [
            "c.tenant_id = :tid",
            "c.is_stale = false",
            "(:domain = '' OR c.source_module = :domain)",
        ]
        params: dict[str, object] = {
            "tid": self.tenant_id,
            "domain": (self.domain or "").strip(),
            "lim": top_k * 10,
            "qplain": (query or "").strip()[:2000],
        }
        if filt.get("document_type"):
            clauses.append("c.document_type = :document_type")
            params["document_type"] = str(filt["document_type"])
        if filt.get("order_id") is not None:
            clauses.append("c.order_id = :order_id")
            params["order_id"] = int(filt["order_id"])
        if filt.get("style_id") is not None:
            clauses.append("c.style_id = :style_id")
            params["style_id"] = int(filt["style_id"])
        if filt.get("date_from"):
            clauses.append("c.date_reference >= :date_from")
            params["date_from"] = _parse_date(filt["date_from"])
        if filt.get("date_to"):
            clauses.append("c.date_reference <= :date_to")
            params["date_to"] = _parse_date(filt["date_to"])

        where_sql = " AND ".join(clauses)
        erp_tokens = _erp_code_tokens(query)
        ilike_clauses: list[str] = []
        for i, tok in enumerate(erp_tokens):
            key = f"erp{i}"
            ilike_clauses.append(f"c.content_text ILIKE :{key}")
            params[key] = f"%{tok}%"

        ts_condition = "c.search_tsv @@ websearch_to_tsquery('english', :qplain)"
        if ilike_clauses:
            cond = "(" + ts_condition + " OR " + " OR ".join(ilike_clauses) + ")"
        else:
            cond = ts_condition

        rank_expr = (
            "COALESCE(ts_rank_cd(c.search_tsv, websearch_to_tsquery('english', :qplain)), 0)"
            + (" + " + " + ".join(f"(CASE WHEN {ic} THEN 0.5 ELSE 0 END)" for ic in ilike_clauses) if ilike_clauses else "")
        )

        sql = text(
            f"""
            SELECT c.id, c.source_type, c.source_ref, c.source_module, c.heading, c.content_text,
                   c.indexed_at,
                   ({rank_expr}) AS rnk
            FROM ai_embedding_chunks c
            WHERE {where_sql}
              AND ({cond})
            ORDER BY rnk DESC
            LIMIT :lim
            """
        )
        try:
            result = await self.db.execute(sql, params)
            raw_rows = result.mappings().all()
        except Exception:
            return []

        best_by_ref: dict[str, tuple[float, dict]] = {}
        for row in raw_rows:
            rnk = float(row["rnk"] or 0.0)
            ref = str(row["source_ref"])
            merged = dict(row)
            if ref not in best_by_ref or rnk > best_by_ref[ref][0]:
                best_by_ref[ref] = (rnk, merged)

        hits: list[RetrievalHit] = []
        for rnk, data in sorted(best_by_ref.values(), key=lambda x: x[0], reverse=True):
            ia = data.get("indexed_at")
            snippet = (data.get("content_text") or "")[:280]
            sim = min(1.0, 0.15 + min(rnk, 2.0) * 0.4)
            hits.append(
                RetrievalHit(
                    document_code=str(data.get("source_ref") or ""),
                    title=str(data.get("heading") or data.get("source_type") or "chunk")[:200],
                    doc_type=str(data.get("source_type") or ""),
                    source_area=str(data.get("source_module") or ""),
                    snippet=snippet,
                    heading=data.get("heading"),
                    score=round(sim, 4),
                    metadata={
                        "chunk_id": data.get("id"),
                        "source_ref": data.get("source_ref"),
                        "indexed_at": ia.isoformat() if hasattr(ia, "isoformat") else ia,
                    },
                )
            )
        return hits[:top_k]
