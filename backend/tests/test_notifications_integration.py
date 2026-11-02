"""Bell inbox: voucher rejection notifies its creator; list/read endpoints stay per-user and per-tenant."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import User
from app.models.finance import Voucher

from tests.go_live_fixtures import create_admin_tenant_with_user


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


@pytest.mark.asyncio
async def test_voucher_rejection_notifies_creator(db_session_integration):
    db = db_session_integration
    tenant, approver, role = await create_admin_tenant_with_user(db)
    slug = uuid.uuid4().hex[:8]
    creator = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"cr{slug}",
        email=f"cr{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(creator)
    await db.flush()
    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{slug[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="SUBMITTED",
        created_by=creator.id,
    )
    own = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-O{slug[:5]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="SUBMITTED",
        created_by=approver.id,
    )
    db.add_all([voucher, own])
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            _as(db, approver, tenant)
            r = await ac.post(f"/api/v1/finance/vouchers/{voucher.id}/status", json={"status": "REJECTED"})
            assert r.status_code == 200, r.text
            # Acting on your own voucher does not notify yourself.
            r = await ac.post(f"/api/v1/finance/vouchers/{own.id}/status", json={"status": "REJECTED"})
            assert r.status_code == 200, r.text
            r = await ac.get("/api/v1/notifications")
            assert r.json()["unread_count"] == 0

            _as(db, creator, tenant)
            r = await ac.get("/api/v1/notifications")
            body = r.json()
            assert body["unread_count"] == 1
            note = body["items"][0]
            assert note["kind"] == "finance.voucher.rejected"
            assert note["href"] == f"/app/accounts/vouchers/{voucher.id}"
            assert voucher.voucher_number in note["title"]

            _as(db, outsider, other_tenant)
            assert (await ac.post(f"/api/v1/notifications/{note['id']}/read")).status_code == 404
            assert (await ac.get("/api/v1/notifications")).json()["items"] == []

            _as(db, creator, tenant)
            assert (await ac.post(f"/api/v1/notifications/{note['id']}/read")).status_code == 204
            r = await ac.get("/api/v1/notifications", params={"unread_only": True})
            assert r.json() == {"items": [], "unread_count": 0}
            assert (await ac.post("/api/v1/notifications/read-all")).status_code == 204
    finally:
        app.dependency_overrides.clear()
