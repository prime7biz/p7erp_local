"""Register endpoint: first tenant admin must accept legal terms and acceptance is persisted.

Run:
docker compose exec backend pytest tests/test_auth_registration_legal_acceptance.py -q
"""

from __future__ import annotations

import uuid

import pytest
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.models import AuditLog, Role, Tenant
from app.models.tenant import TenantType
from app.modules.auth.legal_acceptance import CURRENT_LEGAL_ACCEPTANCE_VERSION


async def _seed_bootstrap_tenant(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Legal Accept {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"la{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    db.add(Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={}))
    db.add(Role(tenant_id=tenant.id, name="user", display_name="User", permissions={}))
    await db.flush()
    return tenant


@pytest.mark.asyncio
async def test_bootstrap_registration_persists_legal_acceptance(db_session_integration):
    db = db_session_integration
    tenant = await _seed_bootstrap_tenant(db)
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/auth/register",
                json={
                    "tenant_id": tenant.id,
                    "email": f"{tenant.company_code.lower()}@example.com",
                    "username": f"user_{tenant.company_code.lower()}",
                    "password": "StrongPass123!",
                    "accepted_legal_terms": True,
                    "legal_acceptance_version": CURRENT_LEGAL_ACCEPTANCE_VERSION,
                },
            )
        assert response.status_code == 201, response.text

        await db.refresh(tenant)
        assert tenant.legal_acceptance_version == CURRENT_LEGAL_ACCEPTANCE_VERSION
        assert tenant.legal_accepted_at is not None
        assert tenant.legal_accepted_by_email == f"{tenant.company_code.lower()}@example.com"

        logs = (
            await db.execute(
                sa.select(AuditLog).where(
                    AuditLog.tenant_id == tenant.id,
                    AuditLog.action == "TENANT_LEGAL_ACCEPTANCE",
                )
            )
        ).scalars().all()
        assert logs, "Expected legal acceptance audit log"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bootstrap_registration_requires_legal_acceptance(db_session_integration):
    db = db_session_integration
    tenant = await _seed_bootstrap_tenant(db)
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.post(
                "/api/v1/auth/register",
                json={
                    "tenant_id": tenant.id,
                    "email": f"{tenant.company_code.lower()}2@example.com",
                    "username": f"user2_{tenant.company_code.lower()}",
                    "password": "StrongPass123!",
                    "accepted_legal_terms": False,
                },
            )
        assert response.status_code == 400, response.text
        assert "acceptance" in response.text.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)
