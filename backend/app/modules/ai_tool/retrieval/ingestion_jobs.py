"""Tracked full reindex jobs with checksum (Phase-2)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_tool import AiIngestionJob
from app.modules.ai_tool import repository
from app.modules.ai_tool.forecast.model_store import hash_training_payload
from app.modules.ai_tool.retrieval.index_manager import full_reindex_source_type
from app.modules.ai_tool.retrieval.source_registry import SOURCE_REGISTRY


async def run_full_reindex_tracked(
    db: AsyncSession,
    *,
    tenant_id: int,
    source_type: str,
    trigger: str = "manual",
) -> AiIngestionJob:
    source = SOURCE_REGISTRY.get(source_type)
    records: list = []
    if source:
        records = await source.fetch_fn(db, tenant_id)
    checksum = hash_training_payload({"records": records})

    prev_row = (
        await db.execute(
            select(AiIngestionJob)
            .where(
                AiIngestionJob.tenant_id == tenant_id,
                AiIngestionJob.source_type == source_type,
                AiIngestionJob.status == "completed",
            )
            .order_by(AiIngestionJob.completed_at.desc().nullslast(), AiIngestionJob.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    previous_checksum = prev_row.source_checksum if prev_row else None

    job = await repository.create_ai_ingestion_job(
        db,
        tenant_id=tenant_id,
        source_type=source_type,
        status="running",
        trigger=trigger,
        previous_checksum=previous_checksum,
    )
    job.started_at = datetime.utcnow()
    await db.flush()

    if checksum == previous_checksum and previous_checksum is not None:
        job.status = "completed"
        job.chunks_skipped = 1
        job.source_checksum = checksum
        job.completed_at = datetime.utcnow()
        await db.flush()
        return job

    try:
        n = await full_reindex_source_type(db, tenant_id=tenant_id, source_type=source_type)
        job.chunks_processed = n
        job.source_checksum = checksum
        job.status = "completed"
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        job.error_text = str(exc)
        job.chunks_failed = job.chunks_failed + 1
        job.retry_count = job.retry_count + 1
    job.completed_at = datetime.utcnow()
    await db.flush()
    return job
