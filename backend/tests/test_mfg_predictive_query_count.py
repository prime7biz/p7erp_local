"""Phase 4 GETs use a constant number of SQL statements (plan 15 sections 12, 17.19): no N+1.

- line efficiency: 1 line vs 50 lines
- delivery forecast of one order: short vs long history, 1 vs 10 open PO lines
Run: docker compose exec -T backend pytest tests/test_mfg_predictive_query_count.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal as D

import pytest
from sqlalchemy import event

from tests.mfg_alloc_fixtures import add_order_bom, add_po
from tests.mfg_intel_fixtures import add_line, add_order, add_plan, client_for
from tests.mfg_predictive_fixtures import (
    FLAGS_P4,
    PRED,
    TODAY,
    add_late_history,
    add_supply_basics,
    freeze_today,
    new_predictive_tenant,
    seed_history,
)
from tests.query_counting import is_rls_housekeeping


async def _count(db, tenant, user, url: str, params: dict | None = None) -> int:
    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_conn, _cursor, statement, _parameters, _context, _executemany):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        async with client_for(db, tenant, user) as c:
            r = await c.get(url, params=params or {})
            assert r.status_code == 200, r.text
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    return len(statements)


async def _efficiency_tenant(db, lines: int):
    tenant, user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, [D("0.5")] * 3)
    for i in range(lines - 1):
        line = await add_line(db, tenant, f"X{i}")
        await seed_history(db, tenant, fx, [D("0.5")] * 3, line=line)
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_line_efficiency_constant_queries_for_1_vs_50_lines(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    t1, u1 = await _efficiency_tenant(db, 1)
    t50, u50 = await _efficiency_tenant(db, 50)
    one = await _count(db, t1, u1, f"{PRED}/line-efficiency")
    fifty = await _count(db, t50, u50, f"{PRED}/line-efficiency")
    assert one == fifty, (one, fifty)


async def _forecast_tenant(db, history_days: int, po_lines: int):
    tenant, user, fx = await new_predictive_tenant(db, flags={**FLAGS_P4, "mfg_order_bom_readiness_v2": True})
    await seed_history(db, tenant, fx, [D("0.5"), D("0.6")] * (history_days // 2))
    sb = await add_supply_basics(db, tenant)
    await add_late_history(db, tenant, sb, [1, 2, 3, 4, 5][: max(1, min(5, po_lines))])
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=date(2030, 5, 1))
    await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=10), qty="1000", order=order, ob=fx.ob)
    await add_order_bom(db, tenant, order, [(sb.item, "1")])
    per_line = str(1000 // po_lines)  # the open PO lines always cover the 1000 needed, so the same path runs
    for i in range(po_lines):
        await add_po(db, tenant, sb.vendor, sb.item, per_line, status="APPROVED", expected_date=TODAY + timedelta(days=5 + i))
    await db.commit()
    return tenant, user, order


@pytest.mark.asyncio
async def test_delivery_forecast_constant_queries_vs_history_and_po_lines(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    small_t, small_u, small_o = await _forecast_tenant(db, history_days=4, po_lines=1)
    big_t, big_u, big_o = await _forecast_tenant(db, history_days=30, po_lines=10)
    async with client_for(db, big_t, big_u) as c:
        body = (await c.get(f"{PRED}/orders/{big_o.id}/delivery-forecast")).json()
    assert body["material"]["status"] == "DATED" and len(body["material"]["po_lines"]) == 10
    small = await _count(db, small_t, small_u, f"{PRED}/orders/{small_o.id}/delivery-forecast")
    big = await _count(db, big_t, big_u, f"{PRED}/orders/{big_o.id}/delivery-forecast")
    assert small == big, (small, big)
