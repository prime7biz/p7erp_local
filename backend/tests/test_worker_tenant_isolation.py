"""Background jobs: one failing tenant (or alert rule) must not stop the rest.

Run:
    docker compose exec backend pytest tests/test_worker_tenant_isolation.py -q
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import AlertScanLog
from app.modules.merch import alert_engine
from app.workers import party_ledger_worker
from tests.bd_hr_fixtures import real_db  # noqa: F401  (pytest fixture)
from tests.conftest import _async_database_url
from tests.merch_fixtures import create_merch_tenant_with_user


@pytest.mark.asyncio
async def test_party_ledger_worker_continues_after_tenant_db_error(monkeypatch):
    url = _async_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")
    engine = create_async_engine(url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    seen: list[int] = []

    async def fake_tenant_rows(db):
        return [(101, {}), (102, {})]

    async def fake_maintenance(db, tenant_id, feature_flags=None):
        seen.append(tenant_id)
        if tenant_id == 101:
            # Real DB error: leaves the transaction aborted until rollback.
            await db.execute(text("SELECT 1/0"))
        await db.execute(text("SELECT 1"))
        return {"overdue_marked": 0}

    monkeypatch.setattr(party_ledger_worker, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(party_ledger_worker, "active_tenant_rows", fake_tenant_rows)
    monkeypatch.setattr(party_ledger_worker, "daily_party_ledger_maintenance", fake_maintenance)
    try:
        out = await party_ledger_worker._run_all_tenants()
    finally:
        await engine.dispose()

    assert seen == [101, 102]
    assert out["results"] == [
        {"tenant_id": 101, "error": True},
        {"tenant_id": 102, "overdue_marked": 0},
    ]


@pytest.mark.asyncio
async def test_active_tenant_rows_returns_plain_values(db_session_integration):
    from app.workers.tenant_rows import active_tenant_rows

    tenant, _user, _ = await create_merch_tenant_with_user(db_session_integration)
    rows = await active_tenant_rows(db_session_integration)
    match = [r for r in rows if r[0] == tenant.id]
    assert len(match) == 1
    assert isinstance(match[0][0], int)


@pytest.mark.asyncio
async def test_alert_scan_failing_rule_keeps_other_rule_results(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)

    async def fake_run_rule(db_, tenant_id, rule_key, defn_id, config):
        if rule_key == "bad_rule":
            await db_.execute(text("SELECT 1/0"))
        await db_.execute(text("SELECT 1"))
        return 2, 1

    monkeypatch.setattr(alert_engine, "RULE_REGISTRY", {"bad_rule": None, "good_rule": None})
    monkeypatch.setattr(alert_engine, "run_rule", fake_run_rule)
    definitions = [
        SimpleNamespace(id=1, rule_key="bad_rule", config_json=None),
        SimpleNamespace(id=2, rule_key="good_rule", config_json={}),
    ]

    created, updated = await alert_engine._run_definitions(db, tenant.id, definitions, "test")
    assert (created, updated) == (2, 1)

    logs = (
        await db.execute(
            select(AlertScanLog.rule_key, AlertScanLog.status)
            .where(AlertScanLog.tenant_id == tenant.id)
            .order_by(AlertScanLog.id)
        )
    ).all()
    assert [tuple(r) for r in logs] == [("bad_rule", "failed"), ("good_rule", "completed")]


async def _migration_job(factory, register) -> tuple[int, int]:
    from app.common.platform_jobs import JOB_TYPE_DATA_MIGRATION
    from app.models import PlatformBackgroundJob

    async with factory() as db:
        tenant, _user, _ = await create_merch_tenant_with_user(db)
        job = PlatformBackgroundJob(job_type=JOB_TYPE_DATA_MIGRATION, status="queued")
        db.add(job)
        await db.commit()
        register(tenant.id)
        return tenant.id, job.id


async def _job_status(factory, job_id: int) -> str:
    from app.models import PlatformBackgroundJob

    async with factory() as db:
        return (await db.get(PlatformBackgroundJob, job_id)).status


async def _drop_job(factory, job_id: int) -> None:
    async with factory() as db:
        await db.execute(text("DELETE FROM platform_background_jobs WHERE id = :i"), {"i": job_id})
        await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize("fail", [False, True])
async def test_data_migration_import_runs_pinned_to_its_tenant(real_db, monkeypatch, fail):
    """RC-09: with RLS on, the import may only touch its own tenant; job bookkeeping stays platform-level."""
    from app.common import rls
    from app.workers import platform_worker

    factory, register = real_db
    tenant_id, job_id = await _migration_job(factory, register)
    seen: dict[str, int | None] = {}

    async def fake_import(db, tenant, entity_type, csv_text, dry_run):
        seen["pinned_to"] = rls.session_rls_tenant_id(db)
        seen["tenant"] = tenant.id
        if fail:
            raise RuntimeError("bad csv")
        return {"total_rows": 0, "ok_count": 0, "error_count": 0, "errors": []}

    monkeypatch.setattr(rls, "rls_session_enabled", lambda: True)
    monkeypatch.setattr(platform_worker, "AsyncSessionLocal", factory)
    monkeypatch.setattr(platform_worker, "run_import", fake_import)
    try:
        if fail:
            with pytest.raises(RuntimeError):
                await platform_worker._run_data_migration_import(job_id, tenant_id, "customers", "", None)
        else:
            await platform_worker._run_data_migration_import(job_id, tenant_id, "customers", "", None)
        assert seen == {"pinned_to": tenant_id, "tenant": tenant_id}
        assert await _job_status(factory, job_id) == ("failed" if fail else "completed")
    finally:
        await _drop_job(factory, job_id)
