"""Settings → Backup shows real backup_jobs state; a request or log entry is never reported as success.

Run: docker compose exec backend pytest tests/test_settings_backup_status.py -q
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import BackupJob
from app.modules.settings.backup_status import derive_backup_state
from tests.merch_fixtures import create_merch_tenant_with_user

NOW = datetime(2026, 11, 3, 12, 0, 0)


def _job(status: str, created: datetime, **kw):
    return SimpleNamespace(
        status=status,
        created_at=created,
        started_at=kw.get("started_at", created),
        completed_at=kw.get("completed_at"),
        size_bytes=kw.get("size_bytes"),
        checksum=kw.get("checksum"),
        backup_type=kw.get("backup_type", "full"),
    )


def test_derive_state_unavailable_without_any_backup():
    assert derive_backup_state(None, None, now=NOW).state == "unavailable"


def test_derive_state_requested_until_server_backup_runs():
    req = _job("queued", NOW, backup_type="request")
    old_full = _job("completed", NOW - timedelta(days=2), completed_at=NOW - timedelta(days=2))
    assert derive_backup_state(None, req, now=NOW).state == "requested"
    assert derive_backup_state(old_full, req, now=NOW).state == "requested"


def test_derive_state_running_completed_failed_and_stale():
    assert derive_backup_state(_job("running", NOW - timedelta(minutes=5)), None, now=NOW).state == "running"
    done = derive_backup_state(_job("completed", NOW, completed_at=NOW, size_bytes=10, checksum="ab"), None, now=NOW)
    assert done.state == "completed" and done.size_bytes == 10 and done.checksum_recorded
    assert derive_backup_state(_job("failed", NOW), None, now=NOW).state == "failed"
    stale = derive_backup_state(_job("running", NOW - timedelta(hours=7)), None, now=NOW)
    assert stale.state == "failed"


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


@pytest.mark.asyncio
async def test_backup_request_flow_is_truthful(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await create_merch_tenant_with_user(db)
    role.name = "admin"
    _t2, clerk, _ = await create_merch_tenant_with_user(db, permissions={})
    await db.commit()

    async with _client(db, _t2, clerk) as c:
        r = await c.post("/api/v1/settings/backup/trigger")
        assert r.status_code == 403, r.text

    async with _client(db, tenant, admin) as c:
        r = await c.post("/api/v1/settings/backup/trigger")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["state"] == "requested" and data["last_backup_status"] == "requested"
        assert data["requested_at"] is not None

        r = await c.post("/api/v1/settings/backup/restore/1")
        assert r.status_code == 501, r.text

        db.add(
            BackupJob(
                backup_type="full",
                status="completed",
                created_at=datetime.utcnow() + timedelta(seconds=1),
                completed_at=datetime.utcnow() + timedelta(seconds=2),
                file_name="p7erp_test.dump",
                size_bytes=1234,
                checksum="0" * 64,
            )
        )
        await db.commit()
        r = await c.get("/api/v1/settings/backup/status")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["state"] == "completed" and data["size_bytes"] == 1234 and data["checksum_recorded"] is True

        r = await c.get("/api/v1/settings/backup/history")
        assert r.status_code == 200, r.text
        rows = r.json()
        kinds = {row["kind"] for row in rows}
        assert {"tenant_request", "server_backup"} <= kinds
        req_rows = [row for row in rows if row["kind"] == "tenant_request"]
        assert req_rows and req_rows[0]["status"] == "fulfilled" and req_rows[0]["initiated_by_user_id"] == admin.id
