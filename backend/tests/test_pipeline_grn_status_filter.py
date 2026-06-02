from __future__ import annotations

import pytest

from app.modules.orders.pipeline_service import _has_grn


class _ScalarResult:
    def scalar(self):
        return 1


class _FakeDb:
    def __init__(self):
        self.params: dict[str, object] = {}

    async def execute(self, statement):
        compiled = statement.compile()
        self.params = compiled.params
        return _ScalarResult()


@pytest.mark.asyncio
async def test_has_grn_includes_received_status():
    db = _FakeDb()
    ok = await _has_grn(db, tenant_id=1, order_id=99)
    assert ok is True
    status_values = next(
        (v for v in db.params.values() if isinstance(v, (tuple, list)) and "POSTED" in v),
        (),
    )
    assert "RECEIVED" in status_values
