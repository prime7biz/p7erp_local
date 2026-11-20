"""Partition recalculation jobs (Phase G/J)."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.kpi_engine import KpiDefinition, KpiRecalculationJob, KpiResult
from app.modules.kpi_engine.compute.service import FORMULA_VERSION, compute_kpi
from app.modules.kpi_engine.compute_base import utcnow


async def enqueue_recalc(
    db: AsyncSession,
    *,
    tenant_id: int,
    date_from: date,
    date_to: date,
    kpi_definition_id: int | None = None,
    reason: str | None = None,
) -> KpiRecalculationJob:
    job = KpiRecalculationJob(
        tenant_id=tenant_id,
        kpi_definition_id=kpi_definition_id,
        date_from=date_from,
        date_to=date_to,
        status="PENDING",
        reason=reason,
        created_at=utcnow(),
    )
    db.add(job)
    await db.flush()
    return job


async def run_job(db: AsyncSession, job: KpiRecalculationJob) -> None:
    job.status = "RUNNING"
    job.started_at = utcnow()
    await db.flush()
    try:
        q = select(KpiDefinition).where(
            KpiDefinition.tenant_id == job.tenant_id,
            KpiDefinition.active.is_(True),
        )
        if job.kpi_definition_id:
            q = q.where(KpiDefinition.id == job.kpi_definition_id)
        defs = list((await db.execute(q)).scalars().all())
        day = job.date_from
        while day <= job.date_to:
            for d in defs:
                value = await compute_kpi(db, job.tenant_id, d, as_of=day)
                existing = (
                    await db.execute(
                        select(KpiResult).where(
                            KpiResult.tenant_id == job.tenant_id,
                            KpiResult.kpi_definition_id == d.id,
                            KpiResult.result_date == day,
                            KpiResult.dim_key == "",
                            KpiResult.computation_version == FORMULA_VERSION,
                        )
                    )
                ).scalar_one_or_none()
                if existing:
                    existing.numerator_value = value.numerator
                    existing.denominator_value = value.denominator
                    existing.metric_value = value.value
                    existing.target_value = value.target_value
                    existing.status = value.status
                    existing.missing_inputs = list(value.missing_inputs)
                    existing.source_event_time = value.source_event_time
                    existing.computed_at = utcnow()
                else:
                    db.add(
                        KpiResult(
                            tenant_id=job.tenant_id,
                            kpi_definition_id=d.id,
                            result_date=day,
                            dim_key="",
                            numerator_value=value.numerator,
                            denominator_value=value.denominator,
                            metric_value=value.value,
                            target_value=value.target_value,
                            status=value.status,
                            missing_inputs=list(value.missing_inputs),
                            source_event_time=value.source_event_time,
                            computed_at=utcnow(),
                            computation_version=FORMULA_VERSION,
                        )
                    )
            day = day + timedelta(days=1)
        job.status = "DONE"
        job.finished_at = utcnow()
        await db.flush()
    except Exception as exc:  # noqa: BLE001 — job must fail closed
        job.status = "FAILED"
        job.error = str(exc)[:2000]
        job.finished_at = utcnow()
        await db.flush()
        raise
