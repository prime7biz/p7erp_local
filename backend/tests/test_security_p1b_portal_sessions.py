"""P1b: single-use portal reset links, session_version revocation, id-prefixed invites.

Run:
docker compose exec backend pytest tests/test_security_p1b_portal_sessions.py -q
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.common.auth import hash_password
from app.database import get_db
from app.external_access.auth.service import (
    _find_pending_invitation,
    issue_tokens_for_principal,
    request_password_reset,
    reset_password_with_token,
)
from app.external_access.constants import FF_CUSTOMER_PORTAL_ENABLED, PRINCIPAL_CUSTOMER
from app.main import app
from app.models import ExternalInvitation, ExternalPrincipal, Tenant
from app.models.tenant import TenantType


async def _seed_customer_principal(db):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"P1b {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"p1b{slug}"[:18],
        feature_flags={FF_CUSTOMER_PORTAL_ENABLED: True},
    )
    db.add(tenant)
    await db.flush()
    principal = ExternalPrincipal(
        tenant_id=tenant.id,
        principal_type=PRINCIPAL_CUSTOMER,
        email=f"buyer_{slug}@example.com",
        password_hash=await hash_password("OldPass123!"),
        full_name="Buyer",
        is_active=True,
    )
    db.add(principal)
    await db.flush()
    await db.commit()
    return tenant, principal


@pytest.mark.asyncio
async def test_reset_link_is_single_use_and_revokes_sessions(db_session_integration):
    db = db_session_integration
    tenant, principal = await _seed_customer_principal(db)
    old_access, _ = await issue_tokens_for_principal(principal)

    token = await request_password_reset(
        db, tenant=tenant, email=principal.email, principal_type=PRINCIPAL_CUSTOMER
    )
    assert token
    await reset_password_with_token(db, token=token, new_password="NewPass123!")
    assert principal.session_version == 1

    with pytest.raises(HTTPException) as exc:
        await reset_password_with_token(db, token=token, new_password="Another123!")
    assert exc.value.status_code == 400

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/external/auth/me", headers={"Authorization": f"Bearer {old_access}"})
        assert r.status_code == 401, r.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_only_latest_reset_link_works(db_session_integration):
    db = db_session_integration
    tenant, principal = await _seed_customer_principal(db)
    first = await request_password_reset(db, tenant=tenant, email=principal.email, principal_type=PRINCIPAL_CUSTOMER)
    second = await request_password_reset(db, tenant=tenant, email=principal.email, principal_type=PRINCIPAL_CUSTOMER)
    with pytest.raises(HTTPException):
        await reset_password_with_token(db, token=first, new_password="NewPass123!")
    await reset_password_with_token(db, token=second, new_password="NewPass123!")


@pytest.mark.asyncio
async def test_id_prefixed_invite_lookup(db_session_integration):
    db = db_session_integration
    tenant, _ = await _seed_customer_principal(db)
    from app.common.db_datetime import utc_naive_plus

    secret = "s" * 40
    inv = ExternalInvitation(
        tenant_id=tenant.id,
        principal_type=PRINCIPAL_CUSTOMER,
        email=f"new_{uuid.uuid4().hex[:6]}@example.com",
        token_hash=await hash_password(secret),
        expires_at=utc_naive_plus(days=1),
        payload_json={},
    )
    db.add(inv)
    await db.flush()

    assert (await _find_pending_invitation(db, f"{inv.id}.{secret}")).id == inv.id
    assert await _find_pending_invitation(db, f"{inv.id}.wrong-secret-value") is None
    # Legacy (pre-prefix) links still resolve.
    assert (await _find_pending_invitation(db, secret)).id == inv.id
