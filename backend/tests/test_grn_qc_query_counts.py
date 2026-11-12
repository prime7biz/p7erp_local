"""GRN quality dashboard uses a fixed number of queries, however many inspections (RC-07).

Run:
    docker compose exec backend pytest tests/test_grn_qc_query_counts.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.modules.inventory import grn_qc_router
from tests.test_grn_quality_inspection import _make_grn, _seed
from tests.test_perf_merch_equivalence import count_queries


async def _tenant_with_rejections(db, n: int):
    tenant, vendor, item, whs = await _seed(db)
    for _ in range(n):
        _grn, _line, pending = await _make_grn(db, tenant, vendor, item, whs)
        for insp in pending:
            insp.status = "COMPLETED"
            insp.result = "PARTIAL"
            insp.inspection_date = date.today()
            insp.rejected_qty = Decimal("5")
    await db.commit()
    return tenant, item


@pytest.mark.asyncio
async def test_quality_dashboard_query_count_is_constant(db_session_integration, monkeypatch):
    db = db_session_integration

    async def allow(*_a, **_k):
        return None

    monkeypatch.setattr(grn_qc_router, "assert_soft_permission_allowed", allow)
    monkeypatch.setattr(grn_qc_router, "_ensure_tenant", lambda *_a, **_k: None)

    small_tenant, item_small = await _tenant_with_rejections(db, 1)
    big_tenant, item_big = await _tenant_with_rejections(db, 4)

    with count_queries(db) as small_q:
        small = await grn_qc_router.quality_dashboard(tenant=small_tenant, user=None, db=db)
    with count_queries(db) as big_q:
        big = await grn_qc_router.quality_dashboard(tenant=big_tenant, user=None, db=db)

    [top_small] = small["top_rejected_items"]
    assert (top_small["item_id"], top_small["item_code"], top_small["item_name"]) == (
        item_small.id,
        item_small.item_code,
        item_small.name,
    )
    assert Decimal(top_small["rejected_qty"]) == Decimal("5")
    assert big["top_rejected_items"][0]["item_id"] == item_big.id
    assert Decimal(big["top_rejected_items"][0]["rejected_qty"]) == Decimal("20")
    assert big_q["n"] == small_q["n"], (small_q["n"], big_q["n"])
