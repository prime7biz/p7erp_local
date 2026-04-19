"""Merch alert engine: evidence_json persistence and API wiring.

Run: docker compose exec backend pytest tests/test_merch_alert_evidence_integration.py -q
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AlertInstance, Followup
from app.modules.merch.alert_engine import run_scan

from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


@pytest.mark.asyncio
async def test_run_scan_persists_evidence_json_followup_overdue(db_session_integration):
    db = db_session_integration
    t, _u, _ = await create_merch_tenant_with_user(db)
    c = await create_customer(db, t)
    s = await create_garment_style(db, t, c)
    _q, o = await create_quotation_and_order(db, t, c, s)
    fu = Followup(
        tenant_id=t.id,
        order_id=o.id,
        title="Overdue follow-up",
        due_date=date.today() - timedelta(days=3),
        status="OPEN",
    )
    db.add(fu)
    await db.flush()

    await run_scan(db, t.id, trigger="test")
    await db.commit()

    r = await db.execute(
        select(AlertInstance).where(
            AlertInstance.tenant_id == t.id,
            AlertInstance.alert_type == "followup_overdue",
            AlertInstance.natural_key == f"followup_overdue:followup:{fu.id}",
        )
    )
    inst = r.scalar_one_or_none()
    assert inst is not None
    assert inst.evidence_json is not None
    assert inst.evidence_json.get("schema_version") == 1
    assert inst.evidence_json.get("rule_key") == "followup_overdue"
    facts = inst.evidence_json.get("facts") or {}
    assert facts.get("followup_id") == fu.id
    assert facts.get("order_id") == o.id


@pytest.mark.asyncio
async def test_merch_alerts_api_evidence_and_tenant_isolation(db_session_integration):
    db = db_session_integration
    t_a, u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
    c = await create_customer(db, t_a)
    s = await create_garment_style(db, t_a, c)
    _q, o = await create_quotation_and_order(db, t_a, c, s)
    fu = Followup(
        tenant_id=t_a.id,
        order_id=o.id,
        title="Overdue follow-up",
        due_date=date.today() - timedelta(days=2),
        status="OPEN",
    )
    db.add(fu)
    await db.flush()
    await run_scan(db, t_a.id, trigger="test")
    await db.commit()

    async def override_db():
        yield db

    async def override_user_a():
        return u_a

    async def override_user_b():
        return u_b

    async def override_tenant_a():
        return t_a

    async def override_tenant_b():
        return t_b

    transport = ASGITransport(app=app)
    app.dependency_overrides[get_db] = override_db
    try:
        app.dependency_overrides[get_current_user] = override_user_a
        app.dependency_overrides[require_tenant] = override_tenant_a
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/merch/alerts",
                params={"page": 1, "page_size": 20},
                headers={"X-Tenant-Id": str(t_a.id)},
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("total", 0) >= 1
            match = next((it for it in data["items"] if it.get("alert_type") == "followup_overdue"), None)
            assert match is not None
            assert match.get("evidence_json") is not None
            assert match["evidence_json"].get("facts", {}).get("followup_id") == fu.id

            rs = await ac.get(
                "/api/v1/merch/alerts/summary",
                headers={"X-Tenant-Id": str(t_a.id)},
            )
            assert rs.status_code == 200
            summ = rs.json()
            assert "last_completed_scan_at" in summ

        app.dependency_overrides[get_current_user] = override_user_b
        app.dependency_overrides[require_tenant] = override_tenant_b
        async with AsyncClient(transport=transport, base_url="http://test") as ac_b:
            r2 = await ac_b.get(
                "/api/v1/merch/alerts",
                params={"page": 1, "page_size": 20},
                headers={"X-Tenant-Id": str(t_b.id)},
            )
        assert r2.status_code == 200
        data2 = r2.json()
        t_a_ids = {it["id"] for it in data["items"]}
        t_b_ids = {it["id"] for it in data2["items"]}
        assert not (t_a_ids & t_b_ids)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
