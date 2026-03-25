"""Backup and restore helpers (local disk, pg_dump when available)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import tarfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import BackupJob


def backup_root() -> Path:
    p = Path(get_settings().backup_dir or "./backups").resolve()
    p.mkdir(parents=True, exist_ok=True)
    return p


async def run_full_backup_job(db: AsyncSession, job_id: int) -> None:
    job = await db.get(BackupJob, job_id)
    if not job:
        return
    job.status = "running"
    job.started_at = datetime.utcnow()
    await db.flush()
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"full_{ts}.dump"
    out = backup_root() / "full" / fname
    out.parent.mkdir(parents=True, exist_ok=True)
    s = get_settings()
    db_url = s.database_url
    if db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    proc = await asyncio.create_subprocess_exec(
        "pg_dump",
        "--format=custom",
        "--file",
        str(out),
        db_url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        job.status = "failed"
        job.error_message = (stderr or b"").decode("utf-8", errors="replace")[:8000]
        job.completed_at = datetime.utcnow()
        await db.flush()
        return
    job.status = "completed"
    job.file_name = fname
    job.storage_path = str(out.relative_to(backup_root()))
    job.size_bytes = out.stat().st_size
    job.checksum = hashlib.sha256(out.read_bytes()).hexdigest()
    job.completed_at = datetime.utcnow()
    job.expires_at = datetime.utcnow() + timedelta(days=30)
    await db.flush()


async def run_tenant_export_job(db: AsyncSession, job_id: int, tenant_id: int) -> None:
    """Export key tenant-scoped tables to JSONL in a tar.gz (simplified)."""
    job = await db.get(BackupJob, job_id)
    if not job:
        return
    job.status = "running"
    job.started_at = datetime.utcnow()
    await db.flush()
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"tenant_{tenant_id}_{ts}.tar.gz"
    out = backup_root() / "tenant" / fname
    out.parent.mkdir(parents=True, exist_ok=True)
    tables = [
        "users",
        "customers",
        "orders",
        "quotations",
        "inquiries",
    ]
    tmp = out.with_suffix(".tmp_dir")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    try:
        for tbl in tables:
            try:
                r = await db.execute(text(f'SELECT * FROM "{tbl}" WHERE tenant_id = :tid'), {"tid": tenant_id})
                cols = r.keys()
                rows = [dict(zip(cols, row)) for row in r.all()]
                p = tmp / f"{tbl}.json"
                p.write_text(json.dumps(rows, default=str), encoding="utf-8")
            except Exception:
                continue
        meta = {"tenant_id": tenant_id, "exported_at": datetime.utcnow().isoformat(), "tables": tables}
        (tmp / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
        with tarfile.open(out, "w:gz") as tar:
            tar.add(tmp, arcname="export")
        shutil.rmtree(tmp)
        job.status = "completed"
        job.file_name = fname
        job.storage_path = str(out.relative_to(backup_root()))
        job.size_bytes = out.stat().st_size
        job.checksum = hashlib.sha256(out.read_bytes()).hexdigest()
        job.completed_at = datetime.utcnow()
        job.expires_at = datetime.utcnow() + timedelta(days=30)
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:8000]
        job.completed_at = datetime.utcnow()
    await db.flush()


def cleanup_expired_backups() -> int:
    """Delete files past expires_at from DB job records (caller loads jobs)."""
    deleted = 0
    root = backup_root()
    for sub in ("full", "tenant"):
        d = root / sub
        if not d.exists():
            continue
        for p in d.iterdir():
            try:
                if p.is_file() and p.stat().st_mtime < (datetime.utcnow() - timedelta(days=90)).timestamp():
                    p.unlink()
                    deleted += 1
            except OSError:
                pass
    return deleted
