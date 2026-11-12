"""The shared integration session must never leave data behind in the dev database.

`db_session_integration` wraps each test in an outer transaction. A `commit()` inside the test (or inside
app code under test) must stay inside it, and a `rollback()` after a caught error must only undo work
since the last commit, not the test's own earlier setup.

Run:
    docker compose exec backend pytest tests/test_db_session_isolation.py -q
"""

from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

from app.models import Tenant
from tests.conftest import _async_database_url

pytestmark = pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="needs DATABASE_URL (run in the backend container)")


async def _visible_from_other_connection(code: str) -> bool:
    engine = create_async_engine(_async_database_url())
    try:
        async with engine.connect() as conn:
            found = (await conn.execute(text("SELECT 1 FROM tenants WHERE company_code = :c"), {"c": code})).first()
            return found is not None
    finally:
        await engine.dispose()


def test_query_counters_skip_only_savepoint_and_rls_housekeeping():
    from tests.query_counting import is_rls_housekeeping

    assert is_rls_housekeeping("SAVEPOINT sa_savepoint_1")
    assert is_rls_housekeeping("RELEASE SAVEPOINT sa_savepoint_1")
    assert is_rls_housekeeping("ROLLBACK TO SAVEPOINT sa_savepoint_1")
    assert not is_rls_housekeeping("SELECT savepoint_name FROM t")
    assert not is_rls_housekeeping("SELECT 1")


def _tenant(code: str) -> Tenant:
    return Tenant(name=f"Isolation {code}", company_code=code, tenant_type="manufacturer", is_active=True)


@pytest.mark.asyncio
async def test_commit_inside_test_is_not_visible_outside(db_session_integration):
    code = f"ISO{uuid.uuid4().hex[:8].upper()}"
    db_session_integration.add(_tenant(code))
    await db_session_integration.commit()

    same_session = (await db_session_integration.execute(select(Tenant.id).where(Tenant.company_code == code))).first()
    assert same_session is not None
    assert not await _visible_from_other_connection(code)


@pytest.mark.asyncio
async def test_rollback_after_error_keeps_earlier_committed_setup(db_session_integration):
    code = f"ISO{uuid.uuid4().hex[:8].upper()}"
    db_session_integration.add(_tenant(code))
    await db_session_integration.commit()

    db_session_integration.add(_tenant(code))  # duplicate company_code -> unique violation
    with pytest.raises(IntegrityError):
        await db_session_integration.flush()
    await db_session_integration.rollback()

    still_there = (await db_session_integration.execute(select(Tenant.id).where(Tenant.company_code == code))).first()
    assert still_there is not None, "rollback() undid the test's own committed setup"
