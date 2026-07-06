"""Celery tasks for platform admin background jobs."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from app.common.celery_app import celery_app
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models import PlatformBackgroundJob, Tenant
from app.models.tenant import TenantType
from app.modules.admin.tenant_provisioning import provision_tenant_row
from app.modules.data_migration.importers import run_import

logger = logging.getLogger(__name__)

from app.common.platform_jobs import JOB_TYPE_BULK_TENANT, JOB_TYPE_DATA_MIGRATION


async def _run_bulk_create(
    job_id: int,
    members: list[dict[str, Any]],
    plan_id: int | None,
    admin_id: int,
    celery_task_id: str | None,
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(PlatformBackgroundJob, job_id)
            if not job:
                return
            job.status = "running"
            job.celery_task_id = celery_task_id
            total = len(members)
            job.progress_json = {"processed": 0, "total": total, "items": []}
            await db.commit()

            created: list[dict[str, Any]] = []
            for i, item in enumerate(members):
                raw_type = item.get("tenant_type") or TenantType.manufacturer.value
                tenant_type = TenantType(raw_type) if isinstance(raw_type, str) else raw_type
                tenant = await provision_tenant_row(
                    db,
                    name=str(item["name"]),
                    tenant_type=tenant_type,
                    domain=None,
                    plan_id=plan_id,
                )
                created.append({"id": tenant.id, "company_code": tenant.company_code, "name": tenant.name})
                job = await db.get(PlatformBackgroundJob, job_id)
                if job:
                    job.progress_json = {"processed": i + 1, "total": total, "items": created}
                    job.updated_at = datetime.utcnow()
                    await db.commit()

            job = await db.get(PlatformBackgroundJob, job_id)
            if job:
                job.status = "completed"
                job.result_json = {"created_count": len(created), "items": created}
                job.progress_json = {"processed": total, "total": total, "items": created}
                job.updated_at = datetime.utcnow()
                await db.commit()
        except Exception as exc:
            await safe_async_session_rollback(db)
            job = await db.get(PlatformBackgroundJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:2000]
                job.updated_at = datetime.utcnow()
                await db.commit()
            logger.exception("bulk_create_tenants job %s failed", job_id)
            raise


async def _run_data_migration_import(
    job_id: int,
    tenant_id: int,
    entity_type: str,
    csv_text: str,
    celery_task_id: str | None,
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            job = await db.get(PlatformBackgroundJob, job_id)
            tenant = await db.get(Tenant, tenant_id)
            if not job or not tenant:
                return
            job.status = "running"
            job.celery_task_id = celery_task_id
            job.tenant_id = tenant_id
            job.progress_json = {"phase": "importing", "entity_type": entity_type}
            await db.commit()

            result = await run_import(db, tenant, entity_type, csv_text, dry_run=False)
            job = await db.get(PlatformBackgroundJob, job_id)
            if job:
                job.status = "completed" if not result.get("errors") else "completed_with_errors"
                job.result_json = result
                job.progress_json = {
                    "phase": "done",
                    "total_rows": result.get("total_rows"),
                    "ok_count": result.get("ok_count"),
                    "error_count": result.get("error_count"),
                }
                job.updated_at = datetime.utcnow()
                await db.commit()
        except Exception as exc:
            await safe_async_session_rollback(db)
            job = await db.get(PlatformBackgroundJob, job_id)
            if job:
                job.status = "failed"
                job.error_message = str(exc)[:2000]
                job.updated_at = datetime.utcnow()
                await db.commit()
            logger.exception("data_migration_import job %s failed", job_id)
            raise


@celery_app.task(name="platform.bulk_create_tenants", bind=True)
def bulk_create_tenants_task(
    self,
    job_id: int,
    members: list[dict[str, Any]],
    plan_id: int | None,
    admin_id: int,
) -> dict[str, Any]:
    asyncio.run(_run_bulk_create(job_id, members, plan_id, admin_id, self.request.id))
    return {"job_id": job_id, "ok": True}


@celery_app.task(name="platform.data_migration_import", bind=True)
def data_migration_import_task(
    self,
    job_id: int,
    tenant_id: int,
    entity_type: str,
    csv_text: str,
) -> dict[str, Any]:
    asyncio.run(_run_data_migration_import(job_id, tenant_id, entity_type, csv_text, self.request.id))
    return {"job_id": job_id, "ok": True}
