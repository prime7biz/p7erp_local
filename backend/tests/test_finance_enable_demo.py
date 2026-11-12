"""scripts/finance_enable_demo.py: switches on the five finance flags for one tenant, development only.

Run: docker compose exec -T backend pytest tests/test_finance_enable_demo.py -q
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from app.common import demo_credentials
from tests.benchmark_fixtures import seed_tenant_admin


def _script():
    path = Path(__file__).resolve().parents[1] / "scripts" / "finance_enable_demo.py"
    spec = importlib.util.spec_from_file_location("finance_enable_demo", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.asyncio
async def test_refuses_outside_development_before_touching_the_database(monkeypatch, capsys):
    mod = _script()
    monkeypatch.setattr(demo_credentials, "is_development_env", lambda: False)

    def _no_db():
        raise AssertionError("must not open a database session outside development")

    monkeypatch.setattr(mod, "AsyncSessionLocal", _no_db)
    assert await mod.main("LAKH806201") == 1
    assert "Refusing to run" in capsys.readouterr().out
    assert mod.refuse_outside_development() is not None


@pytest.mark.asyncio
async def test_sets_the_five_flags_strictly_true_and_keeps_other_keys(db_session_integration, monkeypatch):
    db = db_session_integration
    mod = _script()
    monkeypatch.setattr(demo_credentials, "is_development_env", lambda: True)
    assert mod.refuse_outside_development() is None
    tenant, _user = await seed_tenant_admin(db)
    other, _ou = await seed_tenant_admin(db)
    tenant.feature_flags = {"party_ledger_enabled": True, "finance_hubs_v2": False}
    other.feature_flags = {"keep": 1}
    await db.flush()

    flags = await mod.enable_finance_demo(db, tenant.company_code)
    assert flags == {key: True for key in mod.FINANCE_DEMO_FLAGS} and len(flags) == 5
    await db.refresh(tenant)
    assert tenant.feature_flags["party_ledger_enabled"] is True
    assert all(tenant.feature_flags[key] is True for key in mod.FINANCE_DEMO_FLAGS)
    await db.refresh(other)
    assert other.feature_flags == {"keep": 1}
    assert await mod.enable_finance_demo(db, "NO-SUCH-CODE") is None
