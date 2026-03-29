"""Stale flags, re-embedding, cleanup for ai_embedding_chunks."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiEmbeddingChunk
from app.modules.ai_tool.retrieval.embeddings import MODEL_NAME, embed_texts
from app.modules.ai_tool.retrieval.ingestion import EmbeddingChunkingAdapter
from app.modules.ai_tool.retrieval.source_registry import SOURCE_REGISTRY


async def mark_stale(
    db: AsyncSession,
    *,
    tenant_id: int,
    source_type: str,
    source_ref: str,
) -> None:
    await db.execute(
        update(AiEmbeddingChunk)
        .where(
            AiEmbeddingChunk.tenant_id == tenant_id,
            AiEmbeddingChunk.source_type == source_type,
            AiEmbeddingChunk.source_ref == source_ref,
        )
        .values(is_stale=True)
    )


async def reindex_stale(db: AsyncSession, *, tenant_id: int, batch_size: int = 100) -> int:
    """Re-embed rows marked stale using existing content_text."""
    q = await db.scalars(
        select(AiEmbeddingChunk)
        .where(AiEmbeddingChunk.tenant_id == tenant_id, AiEmbeddingChunk.is_stale.is_(True))
        .limit(batch_size)
    )
    rows = list(q.all())
    if not rows:
        return 0
    texts = [r.content_text for r in rows]
    vectors = embed_texts(texts)
    now = datetime.utcnow()
    for row, vec in zip(rows, vectors):
        row.embedding = vec
        row.is_stale = False
        row.indexed_at = now
        row.embedding_model = MODEL_NAME
    await db.flush()
    return len(rows)


async def cleanup_orphaned(db: AsyncSession, *, tenant_id: int, older_than_days: int = 90) -> int:
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    res = await db.execute(
        delete(AiEmbeddingChunk).where(
            AiEmbeddingChunk.tenant_id == tenant_id,
            AiEmbeddingChunk.indexed_at < cutoff,
            AiEmbeddingChunk.is_stale.is_(True),
        )
    )
    return int(res.rowcount or 0)


async def full_reindex_source_type(db: AsyncSession, *, tenant_id: int, source_type: str) -> int:
    """Replace all chunks for a source_type from SOURCE_REGISTRY."""
    source = SOURCE_REGISTRY.get(source_type)
    if not source:
        return 0
    await db.execute(
        delete(AiEmbeddingChunk).where(
            AiEmbeddingChunk.tenant_id == tenant_id,
            AiEmbeddingChunk.source_type == source_type,
        )
    )
    records = await source.fetch_fn(db, tenant_id)
    chunker = EmbeddingChunkingAdapter()
    now = datetime.utcnow()
    count = 0
    for rec in records:
        text = rec.get("text") or ""
        if len(text.strip()) < 8:
            continue
        chunks = chunker.chunk(text)
        if not chunks:
            continue
        vectors = embed_texts([c["content_text"] for c in chunks])
        for idx, (ch, vec) in enumerate(zip(chunks, vectors)):
            db.add(
                AiEmbeddingChunk(
                    tenant_id=tenant_id,
                    source_type=source_type,
                    source_ref=str(rec["source_ref"]),
                    source_module=source.source_module,
                    chunk_index=idx,
                    content_text=ch["content_text"],
                    heading=ch.get("heading"),
                    embedding=vec,
                    document_type=rec.get("metadata", {}).get("document_type"),
                    order_id=rec.get("order_id"),
                    style_id=rec.get("style_id"),
                    date_reference=rec.get("date_reference"),
                    metadata_json=rec.get("metadata") or {},
                    token_count=ch.get("token_count"),
                    embedding_model=MODEL_NAME,
                    is_stale=False,
                    indexed_at=now,
                    source_updated_at=now,
                )
            )
            count += 1
    await db.flush()
    return count
