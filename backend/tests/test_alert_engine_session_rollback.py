"""Contract-command alert helper must not leave AsyncSession in aborted-transaction state."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_contract_command_alerts_rollbacks_after_list_contracts_summary_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.external_access.financier_portal import alert_engine

    db = AsyncMock()
    db.rollback = AsyncMock()

    async def boom(*_a, **_k):
        raise RuntimeError("simulated DB failure mid-contract-summary")

    import app.external_access.financier_portal.contract_command.service as cc_svc

    monkeypatch.setattr(cc_svc, "list_contracts_summary", boom)

    out = await alert_engine.contract_command_alerts_for_party(db, tenant_id=1, party_id=1)
    assert out == []
    db.rollback.assert_awaited_once()
