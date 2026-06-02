import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import ProgrammingError

from app.common.tenant_feature_keys import (
    STOCK_SNAPSHOT_READS,
    is_stock_snapshot_reads_enabled,
)
from app.modules.inventory import stock_snapshot_service


def test_stock_snapshot_reads_default_off() -> None:
    assert is_stock_snapshot_reads_enabled(None) is False
    assert is_stock_snapshot_reads_enabled({}) is False
    assert is_stock_snapshot_reads_enabled({STOCK_SNAPSHOT_READS: False}) is False


def test_stock_snapshot_reads_explicit_true() -> None:
    assert is_stock_snapshot_reads_enabled({STOCK_SNAPSHOT_READS: True}) is True


@pytest.mark.asyncio
async def test_rebuild_snapshot_roundtrip_matches_movements(db_session_integration: AsyncSession) -> None:
    from sqlalchemy import select

    from app.models import Tenant

    row = (await db_session_integration.execute(select(Tenant).limit(1))).scalars().first()
    if row is None:
        pytest.skip("no tenant row in database")
    tid = int(row.id)
    try:
        n = await stock_snapshot_service.rebuild_stock_balance_snapshot(db_session_integration, tid)
    except ProgrammingError as exc:
        # CI/dev DB may lag migrations; this integration assertion requires snapshot table.
        if "inventory_stock_balance_snapshots" in str(exc):
            pytest.skip("snapshot table is missing; run alembic upgrade before integration assertion")
        raise
    assert n >= 0
    diffs = await stock_snapshot_service.compare_snapshot_to_movements(db_session_integration, tid)
    assert diffs == []
