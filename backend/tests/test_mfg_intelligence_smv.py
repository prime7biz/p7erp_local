"""A9: SMV per piece comes from the operation bulletin `total_smv` (per piece), never divided by quantity.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_smv.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_line,
    add_ob,
    add_plan,
    add_settings,
    add_shift,
    add_style_with_ob,
    client_for,
    new_tenant,
)

DAY = {"date_from": "2030-03-04", "date_to": "2030-03-04"}


async def _base(db):
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    await add_settings(db, tenant)
    await add_shift(db, tenant)
    line = await add_line(db, tenant)
    return tenant, user, line


@pytest.mark.asyncio
async def test_smv_is_ob_total_per_piece_not_divided_by_quantity(db_session_integration):
    db = db_session_integration
    tenant, user, line = await _base(db)
    _c, _s, ob = await add_style_with_ob(db, tenant, smv="12.5")
    row = await add_plan(db, tenant, line, start=MONDAY, end=MONDAY, qty="1000", ob=ob)
    got = (await resolve_smv_for_rows(db, tenant.id, [row]))[row.id]
    assert got.value == Decimal("12.5000") and got.source == "OB" and got.confidence == "high"
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{API}/line-loading", params=DAY)).json()
    item = body["rows"][0]
    assert item["smv_per_piece"] == "12.5000" and item["smv_source"] == "OB"
    assert item["total_load_minutes"] == "12500.00"  # 1000 pieces x 12.5, not 12.5 / 1000 and not x 12


@pytest.mark.asyncio
async def test_smv_hierarchy_ob_then_style_approved_then_plan_row_then_unknown(db_session_integration):
    db = db_session_integration
    tenant, _user, line = await _base(db)
    _c, style_ob, ob = await add_style_with_ob(db, tenant, smv="10")  # linked OB
    _c2, style_only, _ = await add_style_with_ob(db, tenant, smv=None)
    await add_ob(db, tenant, style_only, smv="20", status="approved", version=1)
    await add_ob(db, tenant, style_only, smv="22", status="approved", version=3)  # highest approved version wins
    await add_ob(db, tenant, style_only, smv="99", status="draft", version=5)  # draft never used
    _c3, style_draft, _ = await add_style_with_ob(db, tenant, smv=None)
    await add_ob(db, tenant, style_draft, smv="77", status="draft", version=1)

    r_ob = await add_plan(db, tenant, line, start=MONDAY, qty="10", ob=ob, style=style_only, smv_row="5")
    r_style = await add_plan(db, tenant, line, start=MONDAY, qty="10", style=style_only, smv_row="5")
    r_plan = await add_plan(db, tenant, line, start=MONDAY, qty="10", style=style_draft, smv_row="6.5")
    r_none = await add_plan(db, tenant, line, start=MONDAY, qty="10", style=style_draft)
    r_zero = await add_plan(db, tenant, line, start=MONDAY, qty="10", smv_row="0")

    got = await resolve_smv_for_rows(db, tenant.id, [r_ob, r_style, r_plan, r_none, r_zero])
    assert (got[r_ob.id].value, got[r_ob.id].source) == (Decimal("10"), "OB")
    assert (got[r_style.id].value, got[r_style.id].source) == (Decimal("22"), "STYLE_APPROVED_OB")
    assert got[r_plan.id].value == Decimal("6.5") and got[r_plan.id].source == "PLAN_ROW"
    assert got[r_plan.id].confidence == "low" and "SMV_FROM_PLAN_ROW" in got[r_plan.id].reason_codes
    # No source at all: UNKNOWN, never a default such as 12.
    assert got[r_none.id].value is None and got[r_none.id].reason_codes == ["SMV_UNKNOWN"]
    assert got[r_zero.id].value is None


@pytest.mark.asyncio
async def test_other_tenants_ob_is_never_used(db_session_integration):
    db = db_session_integration
    tenant, _user, line = await _base(db)
    other, _ou, _r = await new_tenant(db, flags=FLAGS_ON)
    _c, other_style, other_ob = await add_style_with_ob(db, other, smv="31")
    row = await add_plan(db, tenant, line, start=MONDAY, qty="10")
    row.ob_id = other_ob.id  # a stale / forged reference to another tenant's OB
    row.style_id = other_style.id
    await db.flush()
    got = (await resolve_smv_for_rows(db, tenant.id, [row]))[row.id]
    assert got.value is None
