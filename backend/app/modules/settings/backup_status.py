"""Truthful backup status for Settings → Backup & Restore.

Status comes only from real `backup_jobs` rows:
- `full` rows are written by the server backup tooling (scripts/db_backup.sh / .ps1) or the platform
  admin backup job, with size + checksum on success.
- `request` rows are created when a tenant admin asks for a backup; the platform operator fulfils them.

States: requested | running | completed | failed | unavailable. A log entry is never treated as a backup.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import desc, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BackupJob

BACKUP_TYPE_FULL = "full"
BACKUP_TYPE_REQUEST = "request"
STALE_RUNNING_AFTER = timedelta(hours=6)
DEFAULT_RETENTION_DAYS = 14

STATE_REQUESTED = "requested"
STATE_RUNNING = "running"
STATE_COMPLETED = "completed"
STATE_FAILED = "failed"
STATE_UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class BackupState:
    state: str
    at: datetime | None
    note: str
    requested_at: datetime | None = None
    size_bytes: int | None = None
    checksum_recorded: bool = False


def _job_state(job: BackupJob, now: datetime) -> str:
    status = (job.status or "").lower()
    if status == "completed":
        return STATE_COMPLETED
    if status == "failed":
        return STATE_FAILED
    if status == "running":
        started = job.started_at or job.created_at
        if started and now - started > STALE_RUNNING_AFTER:
            return STATE_FAILED
        return STATE_RUNNING
    if status == "queued":
        return STATE_REQUESTED
    return STATE_UNAVAILABLE


def derive_backup_state(
    latest_full: BackupJob | None,
    open_request: BackupJob | None,
    *,
    now: datetime | None = None,
) -> BackupState:
    """Pure function: combine the latest server backup with this tenant's open request."""
    now = now or datetime.utcnow()
    requested_at = open_request.created_at if open_request else None

    if latest_full is not None:
        st = _job_state(latest_full, now)
        if st == STATE_RUNNING:
            return BackupState(STATE_RUNNING, latest_full.started_at or latest_full.created_at,
                               "A server backup is in progress.", requested_at)
        if open_request is not None and (latest_full.created_at or now) < open_request.created_at:
            return BackupState(STATE_REQUESTED, requested_at,
                               "Backup requested. Waiting for the platform operator to run it.", requested_at)
        if st == STATE_COMPLETED:
            return BackupState(
                STATE_COMPLETED,
                latest_full.completed_at or latest_full.created_at,
                "Last server backup completed and its archive was verified.",
                requested_at,
                size_bytes=latest_full.size_bytes,
                checksum_recorded=bool(latest_full.checksum),
            )
        if st == STATE_FAILED:
            stale = (latest_full.status or "").lower() == "running"
            note = (
                "The last server backup did not finish (no completion recorded)."
                if stale
                else "The last server backup failed. The platform operator has been asked to investigate."
            )
            return BackupState(STATE_FAILED, latest_full.completed_at or latest_full.created_at, note, requested_at)

    if open_request is not None:
        return BackupState(STATE_REQUESTED, requested_at,
                           "Backup requested. Waiting for the platform operator to run it.", requested_at)
    return BackupState(
        STATE_UNAVAILABLE,
        None,
        "No server backup has been recorded. Backups are run by the platform operator; "
        "you can request one here.",
    )


async def latest_full_backup(db: AsyncSession) -> BackupJob | None:
    return (
        await db.execute(
            select(BackupJob)
            .where(BackupJob.backup_type == BACKUP_TYPE_FULL)
            .order_by(desc(BackupJob.created_at), desc(BackupJob.id))
            .limit(1)
        )
    ).scalar_one_or_none()


async def open_backup_request(db: AsyncSession, tenant_id: int, latest_full: BackupJob | None) -> BackupJob | None:
    """Newest request from this tenant that has not been followed by a newer server backup."""
    req = (
        await db.execute(
            select(BackupJob)
            .where(BackupJob.backup_type == BACKUP_TYPE_REQUEST, BackupJob.tenant_id == tenant_id)
            .order_by(desc(BackupJob.created_at), desc(BackupJob.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    if req is None:
        return None
    if latest_full is not None and latest_full.created_at and latest_full.created_at >= req.created_at:
        return None
    return req


async def tenant_backup_history(db: AsyncSession, tenant_id: int, limit: int) -> list[BackupJob]:
    return list(
        (
            await db.execute(
                select(BackupJob)
                .where(
                    or_(
                        BackupJob.backup_type == BACKUP_TYPE_FULL,
                        (BackupJob.backup_type == BACKUP_TYPE_REQUEST) & (BackupJob.tenant_id == tenant_id),
                    )
                )
                .order_by(desc(BackupJob.created_at), desc(BackupJob.id))
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )


def history_row_state(job: BackupJob, fulls: list[BackupJob], now: datetime | None = None) -> str:
    now = now or datetime.utcnow()
    if job.backup_type == BACKUP_TYPE_REQUEST:
        fulfilled = any(
            f.created_at and job.created_at and f.created_at >= job.created_at and (f.status or "") == "completed"
            for f in fulls
        )
        return "fulfilled" if fulfilled else STATE_REQUESTED
    return _job_state(job, now)
