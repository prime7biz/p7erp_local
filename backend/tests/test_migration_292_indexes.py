"""Migration 292 (RC-16) is additive, concurrent and matches real tables.

Run:
    docker compose exec backend pytest tests/test_migration_292_indexes.py -q
"""

from __future__ import annotations

import importlib.util
import inspect
from pathlib import Path

import pytest
from sqlalchemy import text

PATH = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "292_tenant_and_hot_query_indexes.py"


def _module():
    spec = importlib.util.spec_from_file_location("migration_292", PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_revision_chain_and_names():
    mod = _module()
    assert (mod.revision, mod.down_revision) == ("292", "291")
    names = [n for n, _ in mod.INDEXES]
    assert len(names) == len(set(names)) == 14
    assert all(len(n) <= 63 for n in names), "Postgres truncates identifiers longer than 63 characters"


def test_only_concurrent_additive_statements():
    mod = _module()
    up, down = inspect.getsource(mod.upgrade), inspect.getsource(mod.downgrade)
    assert "autocommit_block" in up and "autocommit_block" in down
    src = PATH.read_text(encoding="utf-8")
    assert "CREATE INDEX CONCURRENTLY IF NOT EXISTS" in src
    assert "DROP TABLE" not in src and "DROP COLUMN" not in src and "ALTER TABLE" not in src


@pytest.mark.asyncio
async def test_every_target_column_exists(db_session_integration):
    mod = _module()
    for _name, target in mod.INDEXES:
        table, cols = target.split(" ", 1)
        for col in cols.strip("()").split(","):
            found = (
                await db_session_integration.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
                    ),
                    {"t": table, "c": col.strip()},
                )
            ).first()
            assert found, f"{table}.{col.strip()} does not exist"
