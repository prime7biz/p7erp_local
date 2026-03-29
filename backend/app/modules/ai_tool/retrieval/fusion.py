"""Reciprocal rank fusion (RRF) and freshness weighting for hybrid retrieval."""

from __future__ import annotations

from datetime import datetime, timezone
from app.modules.ai_tool.retrieval.base import RetrievalHit

RRF_K = 60


def _hit_key(hit: RetrievalHit) -> str:
    """Stable key for RRF and dedup: same logic for every code path."""
    meta = hit.metadata or {}
    return (
        (hit.document_code or "").strip()
        or str(meta.get("source_ref") or "").strip()
        or (hit.snippet[:60] if hit.snippet else "")
        or f"unknown:{id(hit)}"
    )


def _indexed_at_from_hit(hit: RetrievalHit) -> datetime | None:
    raw = (hit.metadata or {}).get("indexed_at")
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def freshness_multiplier(indexed_at: datetime | None) -> float:
    """Boost recently indexed chunks; damp older ones."""
    if indexed_at is None:
        return 0.85
    now = datetime.now(timezone.utc)
    if indexed_at.tzinfo is None:
        indexed_at = indexed_at.replace(tzinfo=timezone.utc)
    days = max(0.0, (now - indexed_at).total_seconds() / 86400.0)
    if days < 7:
        return 1.0
    if days < 30:
        return 0.9
    if days < 90:
        return 0.7
    return 0.5


def reciprocal_rank_fusion(
    ranked_lists: list[list[RetrievalHit]],
    *,
    k: int = RRF_K,
) -> dict[str, float]:
    """Map stable key (source_ref|document_code) -> RRF score."""
    scores: dict[str, float] = {}
    for lst in ranked_lists:
        for rank, hit in enumerate(lst, start=1):
            key = hit.document_code or hit.metadata.get("source_ref") or f"id:{id(hit)}"
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank)
    return scores


def merge_hybrid_hits(
    *,
    vector_hits: list[RetrievalHit],
    bm25_hits: list[RetrievalHit],
    top_k: int,
) -> tuple[list[RetrievalHit], str]:
    """
    Fuse vector + BM25 lists with RRF, dedupe by document_code, apply freshness.
    Returns (hits, retrieval_method).
    """
    rrf_scores = reciprocal_rank_fusion([vector_hits, bm25_hits])
    by_key: dict[str, RetrievalHit] = {}

    def ingest(lst: list[RetrievalHit]) -> None:
        for h in lst:
            key = _hit_key(h)
            if key not in by_key:
                by_key[key] = h

    ingest(vector_hits)
    ingest(bm25_hits)

    fused: list[tuple[float, RetrievalHit]] = []
    for key, hit in by_key.items():
        base = rrf_scores.get(key, 0.0)
        mult = freshness_multiplier(_indexed_at_from_hit(hit))
        fused.append((base * mult, hit))

    fused.sort(key=lambda x: x[0], reverse=True)
    out: list[RetrievalHit] = []
    for score, hit in fused[:top_k]:
        meta = dict(hit.metadata or {})
        meta["rrf_score"] = round(score, 6)
        out.append(
            RetrievalHit(
                document_code=hit.document_code,
                title=hit.title,
                doc_type=hit.doc_type,
                source_area=hit.source_area,
                snippet=hit.snippet,
                heading=hit.heading,
                score=round(min(1.0, score * 10), 4),
                metadata=meta,
            )
        )
    method = "hybrid_rrf"
    if vector_hits and not bm25_hits:
        method = "vector"
    elif bm25_hits and not vector_hits:
        method = "bm25"
    return out, method
