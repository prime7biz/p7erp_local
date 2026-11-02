"""Governed AI: exception agents with human confirmation, owner brief, whitelisted metric cards."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import AI_DASHBOARD_CARDS_ENABLED, AI_EXCEPTION_AGENTS_ENABLED
from app.database import get_db
from app.main import app
from app.models import Role, User
from app.models.ai_agents import AiAgentDecision
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.merch import Bom, BomItem, OrderFollowupAction
from app.models.notification import UserNotification
from app.modules.governed_ai.metrics import match_metric
from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


def test_metric_matching_is_whitelisted():
    m, _ = match_metric("How many late orders do we have?")
    assert m and m.id == "late_orders"
    m, _ = match_metric("open orders by buyer")
    assert m and m.id == "open_orders_by_buyer"
    m, _ = match_metric("BTB LC expiring")
    assert m and m.id == "btb_expiring_30d"
    m, sugg = match_metric("drop table users")
    assert m is None and sugg
    # Permission filtering: a metric outside the allowed set is never chosen.
    m, _ = match_metric("vouchers pending approval", allowed_ids={"open_orders"})
    assert m is None


@pytest.fixture
def no_llm(monkeypatch):
    async def _none(*args, **kwargs):
        return None

    monkeypatch.setattr("app.common.gemini_client.generate_text_for_tenant", _none)


@pytest.mark.asyncio
async def test_exception_agents_need_human_confirmation(db_session_integration, no_llm):
    db = db_session_integration
    tenant, admin, wh, vendor, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    today = date.today()
    order.delivery_date = today + timedelta(days=20)
    order.quantity = 1000
    order.status = "CONFIRMED"
    slug = uuid.uuid4().hex[:6]
    clerk_role = Role(tenant_id=tenant.id, name=f"clerk{slug}", display_name="Clerk", permissions={"merch.access": True})
    db.add(clerk_role)
    await db.flush()
    merchandiser = User(
        tenant_id=tenant.id, role_id=clerk_role.id, username=f"m{slug}", email=f"m{slug}@example.com",
        password_hash="unused", is_active=True,
    )
    db.add(merchandiser)
    await db.flush()
    action = OrderFollowupAction(
        tenant_id=tenant.id, order_id=order.id, phase="pre_production", title="Fabric booking",
        planned_date=today - timedelta(days=9), status="pending", assigned_to_id=merchandiser.id,
    )
    bom = Bom(tenant_id=tenant.id, style_id=style.id, order_id=order.id, is_active=True, status="APPROVED", version_no=1)
    db.add_all([action, bom])
    await db.flush()
    db.add(BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC", base_consumption=Decimal("1.2"), wastage_pct=Decimal("5")))
    po = PurchaseOrder(tenant_id=tenant.id, po_code=f"PO-{slug}", vendor_id=vendor.id, supplier_name=vendor.name, status="APPROVED", source_order_id=order.id)
    db.add(po)
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=item.id, quantity=Decimal("500")))
    await db.commit()
    ids = {"admin": admin.id, "merch": merchandiser.id, "action": action.id, "order": order.id}

    _as(db, admin, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/v1/governed-ai/exceptions")
            assert r.status_code == 403

            tenant.feature_flags = {**(tenant.feature_flags or {}), AI_EXCEPTION_AGENTS_ENABLED: True, AI_DASHBOARD_CARDS_ENABLED: True}
            await db.commit()

            r = await client.get("/api/v1/governed-ai/exceptions")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["can_confirm"] is True
            by_agent = {i["agent"]: i for i in body["items"]}
            tna = by_agent["tna_delay"]
            assert tna["key"] == f"tna_action_overdue:action:{ids['action']}"
            assert tna["severity"] == "critical" and tna["suggested_action"]["label"] == "Notify the assignee"
            assert "assignee_user_id" not in tna
            bom_f = by_agent["bom_shortfall"]
            assert bom_f["href"] == f"/app/orders/{ids['order']}" and "500/1,260" in bom_f["detail"]

            # Nothing was sent just by listing.
            n = (await db.execute(select(UserNotification).where(UserNotification.user_id == ids["merch"]))).scalars().all()
            assert n == []

            r = await client.post("/api/v1/governed-ai/exceptions/confirm", json={"key": "tna_action_overdue:action:999999", "decision": "notify"})
            assert r.status_code == 409
            r = await client.post("/api/v1/governed-ai/exceptions/confirm", json={"key": "bogus:1", "decision": "notify"})
            assert r.status_code == 400

            r = await client.post(
                "/api/v1/governed-ai/exceptions/confirm",
                json={"key": tna["key"], "decision": "notify", "note": "Please book by Friday"},
            )
            assert r.status_code == 200, r.text
            assert r.json() == {"ok": True, "decision": "NOTIFIED", "recipients": 1}
            notes = (await db.execute(select(UserNotification).where(UserNotification.user_id == ids["merch"]))).scalars().all()
            assert len(notes) == 1 and notes[0].kind == "ai_agent" and "Friday" in (notes[0].body or "")

            r = await client.post("/api/v1/governed-ai/exceptions/confirm", json={"key": bom_f["key"], "decision": "dismiss"})
            assert r.status_code == 200 and r.json()["decision"] == "DISMISSED"

            r = await client.get("/api/v1/governed-ai/exceptions")
            keys = {i["key"] for i in r.json()["items"]}
            assert tna["key"] not in keys and bom_f["key"] not in keys
            assert r.json()["hidden_recently"] >= 2
            decisions = (await db.execute(select(AiAgentDecision).where(AiAgentDecision.tenant_id == tenant.id))).scalars().all()
            assert {d.decision for d in decisions} == {"NOTIFIED", "DISMISSED"}

            r = await client.get("/api/v1/governed-ai/owner-brief", params={"use_ai": "false"})
            assert r.status_code == 200, r.text
            brief = r.json()
            assert brief["source"] == "rules" and "Open orders" in brief["metrics"]

            r = await client.post("/api/v1/governed-ai/metrics/ask", json={"question": "how many late orders?"})
            assert r.status_code == 200 and r.json()["metric"]["id"] == "late_orders"
            r = await client.post("/api/v1/governed-ai/metrics/ask", json={"question": "what is the meaning of life"})
            assert r.json()["matched"] is False
            r = await client.get("/api/v1/governed-ai/metrics/orders_due_14d")
            assert r.status_code == 200 and isinstance(r.json()["value"], int)
            r = await client.get("/api/v1/governed-ai/metrics/not_a_metric")
            assert r.status_code == 404

        # A non-manager without ai.agents.confirm can view but not confirm.
        _as(db, merchandiser, tenant)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/v1/governed-ai/exceptions")
            assert r.status_code == 200 and r.json()["can_confirm"] is False
            r = await client.post("/api/v1/governed-ai/owner-brief/send", json={"narrative": "Hello managers, all fine."})
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
