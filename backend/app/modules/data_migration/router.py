"""Data migration HTTP API (CSV dry-run and commit)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import ensure_user_is_tenant_admin
from app.common.celery_app import celery_app
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db, safe_async_session_rollback
from app.models import PlatformBackgroundJob, Tenant, User
from app.modules.data_migration.importers import REQUIRED_COLUMNS, run_import
from app.common.platform_jobs import JOB_TYPE_DATA_MIGRATION

router = APIRouter(prefix="/data-migration", tags=["data-migration"])


@router.get("/templates")
async def list_import_templates(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    return {
        "entities": [
            {"entity_type": k, "required_columns": v}
            for k, v in REQUIRED_COLUMNS.items()
        ]
        + [{"entity_type": "chart_of_accounts", "required_columns": ["account_number", "name", "group_name"]}],
    }


@router.post("/import")
async def import_csv(
    entity_type: str = Form(...),
    dry_run: bool = Form(True),
    file: UploadFile = File(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    try:
        raw = await file.read()
        text = raw.decode("utf-8-sig", errors="replace")
        entity = entity_type.strip().lower()

        settings = get_settings()
        if not dry_run and settings.data_migration_async_enabled:
            job = PlatformBackgroundJob(
                job_type=JOB_TYPE_DATA_MIGRATION,
                status="pending",
                tenant_id=tenant.id,
                progress_json={"phase": "queued", "entity_type": entity},
            )
            db.add(job)
            await db.flush()
            task = celery_app.send_task(
                "platform.data_migration_import",
                args=[job.id, tenant.id, entity, text],
            )
            job.celery_task_id = task.id
            await db.commit()
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content={"job_id": job.id, "status": "pending", "entity_type": entity},
            )

        return await run_import(db, tenant, entity, text, dry_run=dry_run)
    except Exception as exc:
        await safe_async_session_rollback(db)
        return {"entity_type": entity_type, "dry_run": dry_run, "errors": [str(exc)]}


@router.get("/import-status/{job_id}")
async def import_job_status(
    job_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_is_tenant_admin(db, user, tenant.id)
    job = await db.get(PlatformBackgroundJob, job_id)
    if not job or job.job_type != JOB_TYPE_DATA_MIGRATION:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this job")
    return {
        "job_id": job.id,
        "job_type": job.job_type,
        "status": job.status,
        "celery_task_id": job.celery_task_id,
        "progress": job.progress_json,
        "result": job.result_json,
        "error_message": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
    }
