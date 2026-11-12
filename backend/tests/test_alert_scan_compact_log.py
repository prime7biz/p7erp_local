"""Compact alert-scan logging (RC-19, tenant flag `alert_scan_compact_log`, default OFF).

Run:
    docker compose exec backend pytest tests/test_alert_scan_compact_log.py -q
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy import func, select, text

from app.common.tenant_feature_keys import ALERT_SCAN_COMPACT_LOG, is_alert_scan_compact_log
from app.models import AlertScanLog
from app.modules.merch import alert_engine
from tests.merch_fixtures import create_merch_tenant_with_user

DEFINITIONS = [
    SimpleNamespace(id=1, rule_key="rule_a", config_json=None),
    SimpleNamespace(id=2, rule_key="rule_b", config_json={}),
    SimpleNamespace(id=3, rule_key="rule_c", config_json={}),
]


def _fake_rules(monkeypatch, failing: set[str]):
    async def fake_run_rule(db_, tenant_id, rule_key, defn_id, config):
        if rule_key in failing:
            await db_.execute(text("SELECT 1/0"))
        await db_.execute(text("SELECT 1"))
        return 2, 1

    monkeypatch.setattr(alert_engine, "RULE_REGISTRY", {d.rule_key: None for d in DEFINITIONS})
    monkeypatch.setattr(alert_engine, "run_rule", fake_run_rule)


async def _logs(db, tenant_id):
    return (
        await db.execute(
            select(AlertScanLog.rule_key, AlertScanLog.status, AlertScanLog.error_message, AlertScanLog.instances_created)
            .where(AlertScanLog.tenant_id == tenant_id)
            .order_by(AlertScanLog.id)
        )
    ).all()


def test_flag_is_off_by_default_and_strict():
    assert is_alert_scan_compact_log(None) is False
    assert is_alert_scan_compact_log({}) is False
    assert is_alert_scan_compact_log({ALERT_SCAN_COMPACT_LOG: "true"}) is False
    assert is_alert_scan_compact_log({ALERT_SCAN_COMPACT_LOG: True}) is True


@pytest.mark.asyncio
async def test_compact_mode_same_results_one_row(db_session_integration, monkeypatch):
    db = db_session_integration
    _fake_rules(monkeypatch, failing=set())
    legacy, _u, _ = await create_merch_tenant_with_user(db)
    compact, _u2, _ = await create_merch_tenant_with_user(db)
    compact.feature_flags = {**(compact.feature_flags or {}), ALERT_SCAN_COMPACT_LOG: True}
    await db.flush()

    legacy_result = await alert_engine._run_definitions(db, legacy.id, DEFINITIONS, "test")
    compact_result = await alert_engine._run_definitions(db, compact.id, DEFINITIONS, "test")

    assert legacy_result == compact_result == (6, 3)
    assert len(await _logs(db, legacy.id)) == 3
    assert [tuple(r) for r in await _logs(db, compact.id)] == [("__scan__", "completed", None, 6)]


@pytest.mark.asyncio
async def test_compact_mode_keeps_failures_visible(db_session_integration, monkeypatch):
    db = db_session_integration
    _fake_rules(monkeypatch, failing={"rule_b"})
    tenant, _u, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), ALERT_SCAN_COMPACT_LOG: True}
    await db.flush()

    created, updated = await alert_engine._run_definitions(db, tenant.id, DEFINITIONS, "test")
    assert (created, updated) == (4, 2)
    [(rule_key, status, error, n)] = [tuple(r) for r in await _logs(db, tenant.id)]
    assert (rule_key, status, n) == ("__scan__", "completed", 4)
    assert error == "1 of 3 rule(s) failed: rule_b"

    _fake_rules(monkeypatch, failing={"rule_a", "rule_b", "rule_c"})
    await alert_engine._run_definitions(db, tenant.id, DEFINITIONS, "test")
    last = (await _logs(db, tenant.id))[-1]
    assert (last.status, last.error_message) == ("failed", "3 of 3 rule(s) failed: rule_a, rule_b, rule_c")


@pytest.mark.asyncio
async def test_compact_mode_writes_nothing_when_no_rule_runs(db_session_integration, monkeypatch):
    db = db_session_integration
    monkeypatch.setattr(alert_engine, "RULE_REGISTRY", {})
    tenant, _u, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), ALERT_SCAN_COMPACT_LOG: True}
    await db.flush()
    assert await alert_engine._run_definitions(db, tenant.id, DEFINITIONS, "test") == (0, 0)
    assert await _logs(db, tenant.id) == []


@pytest.mark.asyncio
async def test_rows_per_scan_drop_by_at_least_80_percent(db_session_integration, monkeypatch):
    """Acceptance: with the real rule count, compact mode writes >= 80% fewer scan-log rows."""
    from app.modules.merch.alert_rules import DEFAULT_DEFINITIONS

    db = db_session_integration
    defs = [SimpleNamespace(id=i, rule_key=d["rule_key"], config_json={}) for i, d in enumerate(DEFAULT_DEFINITIONS, 1)]

    async def fake_run_rule(db_, tenant_id, rule_key, defn_id, config):
        return 0, 0

    monkeypatch.setattr(alert_engine, "RULE_REGISTRY", {d.rule_key: None for d in defs})
    monkeypatch.setattr(alert_engine, "run_rule", fake_run_rule)
    legacy, _u, _ = await create_merch_tenant_with_user(db)
    compact, _u2, _ = await create_merch_tenant_with_user(db)
    compact.feature_flags = {**(compact.feature_flags or {}), ALERT_SCAN_COMPACT_LOG: True}
    await db.flush()
    await alert_engine._run_definitions(db, legacy.id, defs, "test")
    await alert_engine._run_definitions(db, compact.id, defs, "test")

    def count(tid):
        return select(func.count()).select_from(AlertScanLog).where(AlertScanLog.tenant_id == tid)

    n_legacy = (await db.execute(count(legacy.id))).scalar_one()
    n_compact = (await db.execute(count(compact.id))).scalar_one()
    assert n_compact == 1 and n_legacy >= 5
    assert n_compact <= 0.2 * n_legacy
