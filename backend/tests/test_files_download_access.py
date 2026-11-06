"""File downloads: signatures only for their owner (or managers), HR documents need HR access.

Run:
    docker compose exec backend pytest tests/test_files_download_access.py -q
"""

from __future__ import annotations

import shutil
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.storage import get_media_root
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture
def client_db(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        yield db_session_integration
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _user(db, tenant: Tenant, role_name: str, permissions: dict | None = None, signature: str | None = None) -> User:
    role = Role(tenant_id=tenant.id, name=role_name, display_name=role_name, permissions=permissions or {})
    db.add(role)
    await db.flush()
    slug = uuid.uuid4().hex[:8]
    u = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{role_name}_{slug}@example.com",
        username=f"{role_name}_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        signature_image_name=signature,
    )
    db.add(u)
    await db.flush()
    return u


def _write(tenant_id: int, module: str, name: str) -> None:
    d = get_media_root() / str(tenant_id) / module
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_bytes(PNG)


def _h(user: User) -> dict[str, str]:
    tok = create_access_token(subject=user.id, tenant_id=user.tenant_id, session_version=0)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-Id": str(user.tenant_id)}


@pytest.mark.asyncio
async def test_signature_and_hr_document_download_rules(client_db):
    db = client_db
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(name=f"Files {slug}", tenant_type=TenantType.both, is_active=True, company_code=f"FL{slug}"[:18].upper())
    db.add(tenant)
    await db.flush()
    sig = f"{uuid.uuid4().hex}.png"
    hr_doc = f"{uuid.uuid4().hex}.png"
    owner = await _user(db, tenant, "clerk", signature=sig)
    other = await _user(db, tenant, "staff")
    manager = await _user(db, tenant, "manager")
    hr_user = await _user(db, tenant, "hrofficer", permissions={"hr.documents.view": True})
    _write(tenant.id, "user_signatures", sig)
    _write(tenant.id, "hr_documents", hr_doc)

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            sig_url = f"/api/v1/files/user_signatures/{sig}"
            assert (await ac.get(sig_url, headers=_h(owner))).status_code == 200
            assert (await ac.get(sig_url, headers=_h(other))).status_code == 404
            assert (await ac.get(sig_url, headers=_h(manager))).status_code == 200

            hr_url = f"/api/v1/files/hr_documents/{hr_doc}"
            assert (await ac.get(hr_url, headers=_h(other))).status_code == 403
            assert (await ac.get(hr_url, headers=_h(hr_user))).status_code == 200
            assert (await ac.get(hr_url, headers=_h(manager))).status_code == 200
    finally:
        shutil.rmtree(get_media_root() / str(tenant.id), ignore_errors=True)
