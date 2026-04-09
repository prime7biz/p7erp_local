"""System COA seeding + resolve_system_ledger (needs DATABASE_URL — run in Docker)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import Tenant
from app.modules.finance.system_coa_seeding_service import (
    resolve_system_ledger,
    seed_tenant_system_coa,
)


@pytest.mark.asyncio
async def test_system_coa_seed_is_idempotent(db_session_integration):
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    first = await seed_tenant_system_coa(session, tenant.id)
    await session.flush()
    second = await seed_tenant_system_coa(session, tenant.id)
    await session.flush()

    assert first["created_groups"] >= 0
    assert second["created_groups"] == 0
    assert second["created_ledgers"] == 0
    assert second["created_mappings"] == 0


@pytest.mark.asyncio
async def test_resolve_system_ledger_after_seed(db_session_integration):
    session = db_session_integration
    r = await session.execute(select(Tenant).limit(1))
    tenant = r.scalars().first()
    if tenant is None:
        pytest.skip("No tenant in database")

    await seed_tenant_system_coa(session, tenant.id)
    await session.flush()

    ledger_id = await resolve_system_ledger(session, tenant.id, "BTB_NON_ACCEPTED_LC_LIABILITY")
    assert isinstance(ledger_id, int)
    assert ledger_id > 0
