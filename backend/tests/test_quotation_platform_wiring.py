"""Quotation platform wiring (Phase 4): search, AI tools, timeline, QR verification, customer portal.

Run:
    docker compose exec backend pytest tests/test_quotation_platform_wiring.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.document_history import list_doc_events
from app.common.tenant import require_tenant
from app.database import get_db
from app.external_access.constants import (
    PRINCIPAL_CUSTOMER,
    ROLE_CUSTOMER_COLLABORATOR,
    ROLE_CUSTOMER_VIEWER,
)
from app.external_access.tokens import get_current_external_principal
from app.main import app
from app.models import ExternalCustomerAccess, ExternalPrincipal, ExternalPrincipalRole, ExternalRole, Quotation
from app.models.external_access import ExternalQuotationResponse
from app.models.notification import UserNotification
from app.modules.ai_tool.agent import catalog
from app.modules.ai_tool.agent.catalog import AgentContext
from app.modules.document_verify.schemas import QuotationPublicVerification
from app.modules.document_verify.service import verify_document_publicly
from app.modules.global_search.service import search_records
from tests.merch_fixtures import create_customer, create_garment_style, create_merch_tenant_with_user

API = "/api/v1/quotations"
PORTAL = "/api/external/customer/quotations"
SECRET_NOTE = "INTERNAL-NOTE-DO-NOT-SHOW"


@asynccontextmanager
async def _api(db: AsyncSession, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test", headers={"X-Tenant-Id": str(tenant.id)}
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@asynccontextmanager
async def _portal(db: AsyncSession, principal):
    async def override_db():
        yield db

    async def override_principal():
        return principal

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_external_principal] = override_principal
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_external_principal, None)


async def _quotation(db: AsyncSession, tenant, customer, *, status: str = "DRAFT", **kw) -> Quotation:
    slug = uuid.uuid4().hex[:8]
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QP-{slug}",
        status=status,
        version_no=1,
        currency="USD",
        style_ref=f"STY-{slug}",
        projected_quantity=1000,
        # quoted_price is the order total (same contract as the workspace / convert-to-order).
        quoted_price=Decimal("5250.0000"),
        total_amount=Decimal("5250.0000"),
        material_cost=Decimal("3000.0000"),
        total_cost=Decimal("4500.0000"),
        profit_percentage=Decimal("16.6667"),
        valid_until=date(2030, 1, 31),
        notes=SECRET_NOTE,
        **kw,
    )
    db.add(q)
    await db.flush()
    return q


async def _walk_to_sent(c: AsyncClient, qid: int) -> dict:
    for step in ("submit", "approve", "send"):
        r = await c.post(f"{API}/{qid}/{step}")
        assert r.status_code == 200, (step, r.text)
    return r.json()


# ------------------------------------------------------------------ Phase 4A: global search


@pytest.mark.asyncio
async def test_global_search_finds_current_quotation_not_superseded(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    token = uuid.uuid4().hex[:8]
    old = await _quotation(db, tenant, customer, status="SENT")
    old.quotation_code = f"ZQ{token}-1"
    old.superseded_at = datetime.utcnow()
    cur = await _quotation(db, tenant, customer, status="SENT")
    cur.quotation_code = f"ZQ{token}-2"
    cur.version_no = 2
    await db.flush()
    res = await search_records(db, tenant=tenant, user=user, query=f"ZQ{token}", kinds={"quotation"})
    hits = [h for g in res.groups for h in g.hits]
    assert [h.id for h in hits] == [cur.id]
    assert hits[0].subtitle and "v2" in hits[0].subtitle and "SENT" in hits[0].subtitle
    assert hits[0].href == f"/app/quotations/{cur.id}"


@pytest.mark.asyncio
async def test_global_search_is_tenant_scoped_and_permission_gated(db_session_integration):
    db = db_session_integration
    ta, ua, _ = await create_merch_tenant_with_user(db)
    tb, _ub, _ = await create_merch_tenant_with_user(db)
    token = uuid.uuid4().hex[:8]
    cust_b = await create_customer(db, tb)
    qb = await _quotation(db, tb, cust_b)
    qb.quotation_code = f"XT{token}"
    await db.flush()
    res = await search_records(db, tenant=ta, user=ua, query=f"XT{token}")
    assert res.groups == []  # other tenant's quotation never shows

    # Enforced RBAC without merch.access: the quotation group is skipped.
    t3, u3, _ = await create_merch_tenant_with_user(db, permissions={"inventory.access": True})
    t3.feature_flags = {"rbac_enforcement": "enforce"}
    cust3 = await create_customer(db, t3)
    q3 = await _quotation(db, t3, cust3)
    q3.quotation_code = f"XR{token}"
    await db.flush()
    denied = await search_records(db, tenant=t3, user=u3, query=f"XR{token}")
    assert all(g.kind not in ("quotation", "inquiry") for g in denied.groups)


# ------------------------------------------------------------------ Phase 4A: AI tools


def _ctx(db, tenant, user) -> AgentContext:
    return AgentContext(db=db, tenant=tenant, user=user, session_id=0, message_id=None, request_id="t")


@pytest.mark.asyncio
async def test_ai_quotation_tools_registered_and_cost_gated(db_session_integration):
    db = db_session_integration
    assert {"search_quotations", "get_quotation_summary"} <= set(catalog.AGENT_TOOLS)
    assert {"quotation", "inquiry"} <= set(catalog.SEARCH_KIND_GATES)
    tenant, admin, _ = await create_merch_tenant_with_user(db)  # "*" grants finance too
    customer = await create_customer(db, tenant)
    q = await _quotation(db, tenant, customer, status="SENT")
    limited = await create_merch_tenant_with_user(db, permissions={"merch.access": True, "ai.read": True})
    # Same tenant, limited user: build a second user on a fresh role in this tenant.
    from app.models import Role, User

    role = Role(tenant_id=tenant.id, name="merch_only", display_name="Merch only", permissions={"merch.access": True, "ai.read": True})
    db.add(role)
    await db.flush()
    merch_user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"mo{uuid.uuid4().hex[:6]}",
        email=f"mo{uuid.uuid4().hex[:6]}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(merch_user)
    await db.flush()
    del limited

    full = await catalog._get_quotation_summary(_ctx(db, tenant, admin), {"quotation_id": q.id})
    assert full["data"]["costs_included"] is True and full["data"]["total_cost"] == "4500.0000"

    lean = await catalog._get_quotation_summary(_ctx(db, tenant, merch_user), {"quotation_id": q.id})
    assert lean["data"]["costs_included"] is False
    for key in ("total_cost", "cost_per_piece", "profit_percentage"):
        assert key not in lean["data"]
    assert lean["data"]["quoted_price"] == "5250.0000"  # order total; buyer unit price is derived elsewhere
    assert SECRET_NOTE not in str(lean)

    found = await catalog._search_quotations(_ctx(db, tenant, merch_user), {"query": q.quotation_code})
    assert [i["id"] for i in found["data"]["items"]] == [q.id]
    assert "total_cost" not in found["data"]["items"][0]


@pytest.mark.asyncio
async def test_ai_quotation_tools_are_tenant_scoped_and_bounded(db_session_integration):
    db = db_session_integration
    ta, ua, _ = await create_merch_tenant_with_user(db)
    tb, _ub, _ = await create_merch_tenant_with_user(db)
    cust_b = await create_customer(db, tb)
    qb = await _quotation(db, tb, cust_b)
    miss = await catalog._get_quotation_summary(_ctx(db, ta, ua), {"quotation_id": qb.id})
    assert miss["summary"] == "Quotation not found."
    cust_a = await create_customer(db, ta)
    tag = uuid.uuid4().hex[:6]
    for i in range(14):
        q = await _quotation(db, ta, cust_a)
        q.quotation_code = f"BND{tag}-{i:02d}"
    await db.flush()
    res = await catalog._search_quotations(_ctx(db, ta, ua), {"query": f"BND{tag}"})
    assert len(res["data"]["items"]) == catalog.MAX_QUOTATION_RESULTS == 10
    assert (await catalog._search_quotations(_ctx(db, ta, ua), {"query": "a"}))["data"]["items"] == []


# ------------------------------------------------------------------ Phase 4A: timeline events


@pytest.mark.asyncio
async def test_lifecycle_writes_timeline_events(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    q = await _quotation(db, tenant, customer)
    async with _api(db, tenant, user) as c:
        await _walk_to_sent(c, q.id)
        rev = await c.post(f"{API}/{q.id}/revise")
        assert rev.status_code == 201, rev.text
        new_id = rev.json()["id"]
        d = await c.delete(f"{API}/{new_id}")
        assert d.status_code == 204, d.text
    events = await list_doc_events(db, tenant_id=tenant.id, doc_type="quotation", doc_id=q.id)
    names = {e.get("action") or e.get("event") for e in events}
    flat = " ".join(str(e) for e in events)
    for expected in ("submitted", "approved", "sent", "superseded"):
        assert expected in flat, (expected, flat)
    new_events = " ".join(str(e) for e in await list_doc_events(db, tenant_id=tenant.id, doc_type="quotation", doc_id=new_id))
    assert "revised" in new_events and "deleted" in new_events
    assert names  # events were returned at all


# ------------------------------------------------------------------ Phase 4B: QR


@pytest.mark.asyncio
async def test_verification_id_issued_on_send_and_revoked_on_supersede_and_cancel(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    q = await _quotation(db, tenant, customer)
    assert q.verification_id is None
    async with _api(db, tenant, user) as c:
        await _walk_to_sent(c, q.id)
        await db.refresh(q)
        vid = q.verification_id
        assert vid and vid.startswith("VFY-")
        again = await c.post(f"{API}/{q.id}/send")  # same-status re-send is a no-op
        assert again.status_code == 200
        await db.refresh(q)
        assert q.verification_id == vid  # the printed id never changes on re-send

        rev = await c.post(f"{API}/{q.id}/revise")
        assert rev.status_code == 201, rev.text
    await db.refresh(q)
    assert q.superseded_at is not None and q.verification_id is None  # old printout stops verifying

    # Cancel clears a fresh SENT quotation's id.
    q2 = await _quotation(db, tenant, customer)
    async with _api(db, tenant, user) as c:
        await _walk_to_sent(c, q2.id)
        await db.refresh(q2)
        assert q2.verification_id
        r = await c.patch(f"{API}/{q2.id}", json={"status": "CANCELLED"})
        assert r.status_code == 200, r.text
    await db.refresh(q2)
    assert q2.verification_id is None


@pytest.mark.asyncio
async def test_public_verification_is_buyer_safe(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {"public_document_verification_enabled": True}
    customer = await create_customer(db, tenant)
    q = await _quotation(db, tenant, customer)
    async with _api(db, tenant, user) as c:
        await _walk_to_sent(c, q.id)
    await db.refresh(q)
    result = await verify_document_publicly(db, q.verification_id)
    assert isinstance(result, QuotationPublicVerification)
    assert result.is_valid is True and result.code == q.quotation_code and result.version_no == 1
    # Buyer sees per-piece unit price (order total ÷ qty), never the raw order-total field as a unit.
    assert result.quoted_unit_price == "5.2500" and result.total_amount == "5250.0000"
    assert result.currency == "USD" and result.valid_until == "2030-01-31" and result.quantity == 1000
    dumped = result.model_dump_json()
    for forbidden in (customer.name, SECRET_NOTE, "4500", "3000", "16.6667", "cost", "margin", "profit", "customer"):
        assert forbidden.lower() not in dumped.lower() or forbidden == "customer" and "customer" not in result.model_fields

    # When total_amount is missing, unit price still derives from quoted_price (order total) ÷ qty.
    q.total_amount = None
    await db.flush()
    no_total = await verify_document_publicly(db, q.verification_id)
    assert no_total is not None and no_total.quoted_unit_price == "5.2500" and no_total.total_amount == "5250.0000"
    q.total_amount = Decimal("5250.0000")
    await db.flush()

    # CONVERTED stays verifiable; the public lookup keeps working.
    q.status = "CONVERTED"
    await db.flush()
    converted = await verify_document_publicly(db, q.verification_id)
    assert converted is not None and converted.is_valid is True and converted.status == "CONVERTED"

    # Orphan id on a non-verifiable status: look like "not found" (no commercial leak with is_valid=false).
    orphan_vid = q.verification_id
    q.status = "DRAFT"
    await db.flush()
    assert await verify_document_publicly(db, orphan_vid) is None
    q.status = "CONVERTED"
    await db.flush()

    # Feature flag off for the company: indistinguishable from "not found".
    tenant.feature_flags = {}
    await db.flush()
    assert await verify_document_publicly(db, orphan_vid) is None


# ------------------------------------------------------------------ Phase 4C: customer portal


async def _role(db, code: str) -> ExternalRole:
    role = (await db.execute(select(ExternalRole).where(ExternalRole.code == code))).scalar_one_or_none()
    if role is None:
        role = ExternalRole(code=code, name=code, principal_type=PRINCIPAL_CUSTOMER)
        db.add(role)
        await db.flush()
    return role


async def _principal(db, tenant, customer, *, role_code: str = ROLE_CUSTOMER_COLLABORATOR) -> ExternalPrincipal:
    slug = uuid.uuid4().hex[:8]
    p = ExternalPrincipal(
        tenant_id=tenant.id,
        principal_type=PRINCIPAL_CUSTOMER,
        email=f"buyer.{slug}@example.com",
        password_hash="x",
        full_name="Buyer Person",
        is_active=True,
        accepted_at=datetime.utcnow(),
    )
    db.add(p)
    await db.flush()
    role = await _role(db, role_code)
    db.add(ExternalPrincipalRole(external_principal_id=p.id, role_id=role.id))
    db.add(ExternalCustomerAccess(tenant_id=tenant.id, external_principal_id=p.id, customer_id=customer.id, is_primary=True))
    await db.flush()
    return p


async def _portal_world(db, *, flag: bool = True):
    tenant, staff, _ = await create_merch_tenant_with_user(db, permissions={"merch.access": True})
    tenant.feature_flags = {
        "customer_portal_enabled": True,
        **({"customer_portal_quotations_enabled": True} if flag else {}),
    }
    mine = await create_customer(db, tenant)
    theirs = await create_customer(db, tenant)
    principal = await _principal(db, tenant, mine)
    await db.flush()
    return tenant, staff, mine, theirs, principal


@pytest.mark.asyncio
async def test_portal_lists_only_sent_current_quotations_of_allowed_customers(db_session_integration):
    db = db_session_integration
    tenant, _staff, mine, theirs, principal = await _portal_world(db)
    visible = await _quotation(db, tenant, mine, status="SENT")
    await _quotation(db, tenant, mine, status="DRAFT")
    old = await _quotation(db, tenant, mine, status="SENT")
    old.superseded_at = datetime.utcnow()
    hidden_customer = await _quotation(db, tenant, theirs, status="SENT")
    other_tenant, _u, _ = await create_merch_tenant_with_user(db)
    foreign = await _quotation(db, other_tenant, await create_customer(db, other_tenant), status="SENT")
    await db.flush()
    async with _portal(db, principal) as c:
        r = await c.get(PORTAL)
        ok = await c.get(f"{PORTAL}/{visible.id}")
        miss = [await c.get(f"{PORTAL}/{x.id}") for x in (old, hidden_customer, foreign)]
    assert r.status_code == 200, r.text
    assert [i["id"] for i in r.json()["items"]] == [visible.id] and r.json()["total"] == 1
    assert ok.status_code == 200
    assert [m.status_code for m in miss] == [404, 404, 404]
    body = ok.json()
    assert set(body) == {
        "id", "quotation_code", "version_no", "status", "style_ref", "quantity",
        "quoted_unit_price", "total_amount", "currency", "valid_until", "my_last_response",
    }
    assert SECRET_NOTE not in ok.text and "4500" not in ok.text and "3000" not in ok.text
    assert body["quoted_unit_price"] == "5.2500" and body["total_amount"] == "5250.0000"


@pytest.mark.asyncio
async def test_portal_flag_off_is_denied(db_session_integration):
    db = db_session_integration
    tenant, _staff, mine, _theirs, principal = await _portal_world(db, flag=False)
    q = await _quotation(db, tenant, mine, status="SENT")
    async with _portal(db, principal) as c:
        lst = await c.get(PORTAL)
        post = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "req-flag-off-1"})
    assert lst.status_code == 403 and post.status_code == 403


@pytest.mark.asyncio
async def test_portal_response_is_idempotent_audited_and_notifies_staff(db_session_integration):
    db = db_session_integration
    tenant, staff, mine, _theirs, principal = await _portal_world(db)
    q = await _quotation(db, tenant, mine, status="SENT")
    body = {"response_type": "REQUEST_REVISION", "note": "Please lower the price", "request_id": "req-idem-0001"}
    async with _portal(db, principal) as c:
        first = await c.post(f"{PORTAL}/{q.id}/response", json=body)
        second = await c.post(f"{PORTAL}/{q.id}/response", json=body)
        conflict = await c.post(
            f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "req-idem-0001"}
        )
        shown = await c.get(f"{PORTAL}/{q.id}")
    assert first.status_code == 201 and first.json()["replayed"] is False
    assert second.status_code == 200 and second.json()["replayed"] is True
    assert second.json()["id"] == first.json()["id"]
    assert conflict.status_code == 409
    assert shown.json()["my_last_response"] == "REQUEST_REVISION"
    rows = (
        await db.execute(
            select(func.count(ExternalQuotationResponse.id)).where(ExternalQuotationResponse.quotation_id == q.id)
        )
    ).scalar_one()
    assert rows == 1
    # The quotation itself is untouched by a buyer response.
    await db.refresh(q)
    assert q.status == "SENT"
    # Timeline + staff notification.
    events = " ".join(str(e) for e in await list_doc_events(db, tenant_id=tenant.id, doc_type="quotation", doc_id=q.id))
    assert "buyer_response" in events
    await db.flush()  # notify_user only queues the row; the request's commit persists it
    notes = (
        await db.execute(
            select(UserNotification).where(UserNotification.tenant_id == tenant.id, UserNotification.user_id == staff.id)
        )
    ).scalars().all()
    assert len(notes) == 1 and notes[0].href == f"/app/quotations/{q.id}"


@pytest.mark.asyncio
async def test_portal_response_validation_roles_and_isolation(db_session_integration):
    db = db_session_integration
    tenant, _staff, mine, theirs, principal = await _portal_world(db)
    q = await _quotation(db, tenant, mine, status="SENT")
    other = await _quotation(db, tenant, theirs, status="SENT")
    viewer = await _principal(db, tenant, mine, role_code=ROLE_CUSTOMER_VIEWER)
    async with _portal(db, principal) as c:
        no_note = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "REQUEST_REVISION", "request_id": "req-valid-0001"})
        short_id = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "x"})
        bad_type = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "REJECT", "request_id": "req-valid-0002"})
        other_cust = await c.post(f"{PORTAL}/{other.id}/response", json={"response_type": "ACCEPT", "request_id": "req-valid-0003"})
        accept = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "req-valid-0004"})
        second_accept = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "req-valid-0005"})
    assert no_note.status_code == 422 and short_id.status_code == 422 and bad_type.status_code == 422
    assert other_cust.status_code == 404
    assert accept.status_code == 201
    assert second_accept.status_code == 409
    async with _portal(db, viewer) as c:
        denied = await c.post(f"{PORTAL}/{q.id}/response", json={"response_type": "ACCEPT", "request_id": "req-valid-0006"})
    assert denied.status_code == 403  # viewers read only
