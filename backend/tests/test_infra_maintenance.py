"""Infra/maintenance helpers: alert_scan_log retention, daily guard, COA seed pre-check, weekly slot.

Run:
    docker compose exec backend pytest tests/test_infra_maintenance.py -q
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.main import _seconds_until_weekly
from app.models import AlertScanLog, TenantUsageDaily
from app.modules.admin.tasks import daily_work_done_for
from app.modules.finance.system_coa_seeding_service import (
    _tenant_ids_fully_seeded,
    seed_tenant_system_coa,
)
from app.modules.merch import alert_scan_retention
from app.modules.merch.alert_scan_retention import purge_old_alert_scan_logs
from tests.merch_fixtures import create_merch_tenant_with_user


def test_seconds_until_weekly_is_fixed_wall_clock_slot():
    # Wednesday 2026-11-04 10:00 UTC -> Sunday 2026-11-08 02:00 UTC
    now = datetime(2026, 11, 4, 10, 0, tzinfo=timezone.utc)
    assert _seconds_until_weekly(6, 2, now=now) == (datetime(2026, 11, 8, 2, 0, tzinfo=timezone.utc) - now).total_seconds()
    # Sunday after the slot -> next Sunday
    now = datetime(2026, 11, 8, 3, 0, tzinfo=timezone.utc)
    assert _seconds_until_weekly(6, 2, now=now) == timedelta(days=6, hours=23).total_seconds()
    # Sunday before the slot -> same day
    now = datetime(2026, 11, 8, 1, 0, tzinfo=timezone.utc)
    assert _seconds_until_weekly(6, 2, now=now) == 3600


@pytest.mark.asyncio
async def test_purge_old_alert_scan_logs_keeps_recent_rows(db_session_integration, monkeypatch):
    # The DB may already hold many old rows; lift the per-run cap so ours are reached.
    monkeypatch.setattr(alert_scan_retention, "MAX_BATCHES_PER_RUN", 1_000_000)
    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)
    now = datetime.now(timezone.utc)
    old_rows = [
        AlertScanLog(tenant_id=tenant.id, rule_key="r", trigger="t", status="completed", started_at=now - timedelta(days=40))
        for _ in range(5)
    ]
    recent = AlertScanLog(tenant_id=tenant.id, rule_key="r", trigger="t", status="completed", started_at=now - timedelta(days=1))
    db.add_all([*old_rows, recent])
    await db.flush()

    deleted = await purge_old_alert_scan_logs(db, retention_days=30, batch_size=5000, now=now)

    assert deleted >= 5
    remaining = (
        await db.execute(select(AlertScanLog.id).where(AlertScanLog.tenant_id == tenant.id))
    ).scalars().all()
    assert remaining == [recent.id]


@pytest.mark.asyncio
async def test_purge_disabled_when_retention_is_zero(db_session_integration):
    assert await purge_old_alert_scan_logs(db_session_integration, retention_days=0) == 0


@pytest.mark.asyncio
async def test_daily_work_guard_uses_yesterday_usage_rows(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await create_merch_tenant_with_user(db)
    # A day far in the past so other data in the DB cannot interfere.
    day = date(2001, 1, 2)
    assert await daily_work_done_for(db, day) is False
    db.add(TenantUsageDaily(tenant_id=tenant.id, date=day - timedelta(days=1)))
    await db.flush()
    assert await daily_work_done_for(db, day) is True


@pytest.mark.asyncio
async def test_coa_precheck_skips_only_fully_seeded_tenants(db_session_integration):
    db = db_session_integration
    seeded, _u1, _ = await create_merch_tenant_with_user(db)
    fresh, _u2, _ = await create_merch_tenant_with_user(db)
    await seed_tenant_system_coa(db, seeded.id)
    await db.flush()

    done = await db.run_sync(lambda s: _tenant_ids_fully_seeded(s, [seeded.id, fresh.id]))

    assert seeded.id in done
    assert fresh.id not in done
