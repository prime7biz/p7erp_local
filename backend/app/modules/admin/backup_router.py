"""Platform admin: backup jobs and schedules."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import BackupJob, BackupSchedule
from app.modules.admin.auth import AdminContext, log_admin_action, super_only
from app.modules.admin.backup_service import backup_root, run_full_backup_job, run_tenant_export_job

router = APIRouter(prefix="/backup", tags=["platform-admin-backup"])


@router.post("/full")
async def trigger_full_backup(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    job = BackupJob(backup_type="full", status="queued", initiated_by=ctx.admin.id)
    db.add(job)
    await db.flush()
    await log_admin_action(db, admin_id=ctx.admin.id, action="BACKUP_FULL_QUEUED", resource="backup", details=str(job.id))
    await db.commit()
    await run_full_backup_job(db, job.id)
    await db.commit()
    return {"job_id": job.id, "status": "completed"}


@router.post("/tenant/{tenant_id}")
async def trigger_tenant_backup(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    job = BackupJob(tenant_id=tenant_id, backup_type="tenant", status="queued", initiated_by=ctx.admin.id)
    db.add(job)
    await db.flush()
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="BACKUP_TENANT_QUEUED",
        target_tenant_id=tenant_id,
        resource="backup",
        details=str(job.id),
    )
    await db.commit()
    await run_tenant_export_job(db, job.id, tenant_id)
    await db.commit()
    return {"job_id": job.id, "status": "completed"}


@router.get("/jobs")
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status_filter: str | None = None,
):
    q = select(BackupJob)
    if status_filter:
        q = q.where(BackupJob.status == status_filter)
    q = q.order_by(BackupJob.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": j.id,
                "tenant_id": j.tenant_id,
                "backup_type": j.backup_type,
                "status": j.status,
                "file_name": j.file_name,
                "size_bytes": j.size_bytes,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
                "error_message": j.error_message,
            }
            for j in rows
        ]
    }


@router.get("/jobs/{job_id}/download")
async def download_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    job = await db.get(BackupJob, job_id)
    if not job or not job.storage_path:
        raise HTTPException(status_code=404, detail="Backup file not found")
    path = backup_root() / job.storage_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(path, filename=job.file_name or path.name)


@router.post("/jobs/{job_id}/restore")
async def restore_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    confirm_token: str = "",
):
    """Restore requires matching confirmation token (set in env in production)."""
    _ = confirm_token
    raise HTTPException(
        status_code=501,
        detail="Automated restore is not enabled in this build; restore manually via pg_restore / DBA.",
    )


@router.get("/schedules")
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(select(BackupSchedule).order_by(BackupSchedule.id.desc()))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "id": s.id,
                "tenant_id": s.tenant_id,
                "frequency": s.frequency,
                "is_active": s.is_active,
                "next_run_at": s.next_run_at.isoformat() if s.next_run_at else None,
            }
            for s in rows
        ]
    }


@router.post("/schedules")
async def create_schedule(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    freq = str(body.get("frequency") or "daily")
    tid = body.get("tenant_id")
    sch = BackupSchedule(
        tenant_id=int(tid) if tid is not None else None,
        frequency=freq,
        retention_days=int(body.get("retention_days") or 30),
        is_active=bool(body.get("is_active", True)),
        next_run_at=datetime.utcnow() + timedelta(hours=1),
        created_by=ctx.admin.id,
    )
    db.add(sch)
    await db.commit()
    return {"id": sch.id}


@router.patch("/schedules/{sid}")
async def patch_schedule(
    sid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    sch = await db.get(BackupSchedule, sid)
    if not sch:
        raise HTTPException(status_code=404)
    if "is_active" in body:
        sch.is_active = bool(body["is_active"])
    if "next_run_at" in body and body["next_run_at"]:
        sch.next_run_at = datetime.fromisoformat(str(body["next_run_at"]))
    await db.commit()
    return {"ok": True}


@router.delete("/schedules/{sid}")
async def delete_schedule(
    sid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    sch = await db.get(BackupSchedule, sid)
    if sch:
        await db.delete(sch)
        await db.commit()
    return {"ok": True}
