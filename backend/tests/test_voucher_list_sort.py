"""GET /finance/vouchers ?sort=: default stays newest-created first; sort=date uses voucher_date (index-friendly).

Run in Docker: docker compose exec backend pytest tests/test_voucher_list_sort.py -q
"""

from __future__ import annotations

from datetime import date

import pytest

from app.models import Voucher
from tests.benchmark_fixtures import api_client, seed_tenant_admin


@pytest.mark.asyncio
async def test_voucher_list_sort_param(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    # Created in this order (ids ascending) but with dates out of order.
    dates = [date(2026, 3, 1), date(2026, 1, 15), date(2026, 3, 1), date(2026, 2, 10)]
    rows = [
        Voucher(tenant_id=tenant.id, voucher_number=f"SV-{n}", voucher_type="JOURNAL", voucher_date=d, status="DRAFT")
        for n, d in enumerate(dates)
    ]
    for row in rows:
        db.add(row)
        await db.flush()
    ids = [r.id for r in rows]

    async with api_client(db, tenant, user) as ac:
        default = await ac.get("/api/v1/finance/vouchers")
        by_id = await ac.get("/api/v1/finance/vouchers", params={"sort": "id"})
        by_date = await ac.get("/api/v1/finance/vouchers", params={"sort": "date", "limit": 2, "offset": 1})
        bad = await ac.get("/api/v1/finance/vouchers", params={"sort": "amount"})

    assert default.status_code == 200, default.text
    assert [v["id"] for v in default.json()] == list(reversed(ids))
    assert [v["id"] for v in by_id.json()] == list(reversed(ids))
    # Date order: 03-01 (newer id first), 03-01, 02-10, 01-15 -> page offset 1, limit 2.
    assert [v["id"] for v in by_date.json()] == [ids[0], ids[3]]
    assert by_date.headers["X-Total-Count"] == "4"
    assert bad.status_code == 422
