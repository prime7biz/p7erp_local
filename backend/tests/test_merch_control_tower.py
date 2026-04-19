"""Merch control tower summary — tenant-scoped aggregates."""

from __future__ import annotations

import pytest

from app.modules.merch.merch_control_tower_service import build_merch_control_tower_summary
from tests.merch_fixtures import create_merch_tenant_with_user


@pytest.mark.asyncio
async def test_merch_control_tower_summary_tenant_scoped(db_session_integration):
    db = db_session_integration
    t1, _u1, _ = await create_merch_tenant_with_user(db)
    t2, _u2, _ = await create_merch_tenant_with_user(db)
    await db.commit()

    s1 = await build_merch_control_tower_summary(db, tenant_id=t1.id)
    s2 = await build_merch_control_tower_summary(db, tenant_id=t2.id)
    assert s1.inquiries_needing_action.count == 0
    assert s2.inquiries_needing_action.count == 0
    assert s1.generated_at is not None
