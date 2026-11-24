"""Commercial User Activity: master contract create writes MASTER_CONTRACT_CREATED.

Run:
  docker compose exec backend pytest tests/test_user_activity_commercial.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import AuditLog, Role, Tenant, User
from app.models.tenant import TenantType


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CommAct {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ca{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    pwd = await hash_password("CommActivity123!")
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        first_name="Pat",
        last_name="Admin",
        password_hash=pwd,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return tenant, user, "CommActivity123!"


@pytest.mark.asyncio
async def test_master_contract_create_writes_activity(db_session_integration):
    db = db_session_integration
    tenant, user, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": user.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            assert login.status_code == 200, login.text
            headers = {
                "Authorization": f"Bearer {login.json()['access_token']}",
                "X-Tenant-Id": str(tenant.id),
            }
            ref = f"MSC-{uuid.uuid4().hex[:8].upper()}"
            created = await ac.post(
                "/api/v1/commercial/master-contracts",
                headers=headers,
                json={"reference": ref, "status": "DRAFT", "contract_type": "EXPORT_LC"},
            )
            assert created.status_code == 201, created.text
            contract_id = created.json()["id"]

            rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "MASTER_CONTRACT_CREATED",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert len(rows) >= 1
            assert any(r.resource == f"master_contract:{contract_id}" for r in rows)
            assert any(ref in (r.details or "") for r in rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
