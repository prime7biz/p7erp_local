"""Digital approval signatures: My Signature API, voucher stage signers, inventory signature blocks."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.signatories import SIGNATURE_MODULE
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.finance import Voucher
from app.models.user import User
from app.modules.finance.voucher_history import record_voucher_event, voucher_stage_signers
from app.modules.inventory.document_qr_service import inventory_doc_signatories
from tests.go_live_fixtures import create_admin_tenant_with_user

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def media_root(tmp_path, monkeypatch):
    monkeypatch.setattr("app.common.storage.get_media_root", lambda: tmp_path)
    return tmp_path


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


async def _add_user(db, tenant, role, *, first: str, designation: str | None = None) -> User:
    slug = uuid.uuid4().hex[:8]
    u = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"sig{slug}",
        email=f"sig{slug}@example.com",
        password_hash="unused",
        first_name=first,
        designation=designation,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


@pytest.mark.asyncio
async def test_my_signature_designation_upload_isolation_delete(db_session_integration, media_root):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    _as(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.put("/api/v1/me/signature", json={"designation": "  Finance Manager  "})
            assert r.status_code == 200, r.text
            assert r.json()["designation"] == "Finance Manager"
            assert r.json()["signature_image_url"] is None

            r = await client.post(
                "/api/v1/me/signature/image",
                files={"file": ("notes.txt", b"hello", "text/plain")},
            )
            assert r.status_code == 400

            r = await client.post(
                "/api/v1/me/signature/image",
                files={"file": ("sig.png", PNG_BYTES, "image/png")},
            )
            assert r.status_code == 200, r.text
            url = r.json()["signature_image_url"]
            assert url and url.startswith(f"/api/v1/files/{SIGNATURE_MODULE}/")
            filename = url.rsplit("/", 1)[-1]
            stored = media_root / str(tenant.id) / SIGNATURE_MODULE / filename
            assert stored.read_bytes() == PNG_BYTES

            r = await client.get(url)
            assert r.status_code == 200
            assert r.content == PNG_BYTES

            r = await client.get("/api/v1/me/signature")
            assert r.json()["signature_image_url"] == url

            _as(db, outsider, other_tenant)
            r = await client.get(url)
            assert r.status_code == 404  # other tenant cannot read the file

            _as(db, user, tenant)
            r = await client.delete("/api/v1/me/signature/image")
            assert r.status_code == 200
            assert r.json()["signature_image_url"] is None
            assert not stored.exists()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_voucher_print_signatories_follow_current_approval_cycle(db_session_integration, media_root):
    db = db_session_integration
    tenant, preparer, role = await create_admin_tenant_with_user(db)
    first_checker = await _add_user(db, tenant, role, first="First")
    checker = await _add_user(db, tenant, role, first="Karim", designation="Accounts Officer")
    approver = await _add_user(db, tenant, role, first="Rahim", designation="Finance Manager")

    sig_dir = media_root / str(tenant.id) / SIGNATURE_MODULE
    sig_dir.mkdir(parents=True)
    (sig_dir / "approver.png").write_bytes(PNG_BYTES)
    approver.signature_image_name = "approver.png"

    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="POSTED",
        created_by=preparer.id,
    )
    db.add(voucher)
    await db.flush()

    async def ev(user_id, event, to_status, from_status=None):
        await record_voucher_event(
            db,
            tenant_id=tenant.id,
            user_id=user_id,
            voucher_id=voucher.id,
            event=event,
            summary="t",
            from_status=from_status,
            to_status=to_status,
        )

    await ev(preparer.id, "created", "DRAFT")
    await ev(preparer.id, "status", "SUBMITTED")
    await ev(first_checker.id, "status", "CHECKED")
    await ev(first_checker.id, "status", "REJECTED")  # new cycle: first checker's signature is dropped
    await ev(preparer.id, "status", "DRAFT")
    await ev(preparer.id, "status", "SUBMITTED")
    await ev(checker.id, "status", "CHECKED")
    await ev(checker.id, "status", "RECOMMENDED")
    await ev(approver.id, "status", "APPROVED")
    await ev(approver.id, "status", "POSTED")
    await ev(approver.id, "cancel_posting", "APPROVED", from_status="POSTED")
    await ev(approver.id, "status", "POSTED")
    await db.commit()

    signers = await voucher_stage_signers(db, tenant_id=tenant.id, voucher_id=voucher.id)
    assert signers["CHECKED"][0] == checker.id
    assert signers["APPROVED"][0] == approver.id

    _as(db, preparer, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(f"/api/v1/finance/vouchers/{voucher.id}/print")
            assert r.status_code == 200, r.text
            blocks = {b["role_label"]: b for b in r.json()["signatories"]}
    finally:
        app.dependency_overrides.clear()

    assert list(blocks) == ["Prepared By", "Checked By", "Recommended By", "Approved By", "Posted By"]
    assert blocks["Prepared By"]["user_id"] == preparer.id
    assert blocks["Checked By"]["name"] == "Karim"
    assert blocks["Checked By"]["designation"] == "Accounts Officer"
    assert blocks["Checked By"]["signature_image_data_uri"] is None
    assert blocks["Approved By"]["user_id"] == approver.id
    assert blocks["Approved By"]["designation"] == "Finance Manager"
    assert blocks["Approved By"]["signed_at"]
    assert blocks["Approved By"]["signature_image_data_uri"].startswith("data:image/png;base64,")
    assert blocks["Posted By"]["user_id"] == approver.id


@pytest.mark.asyncio
async def test_inventory_doc_signatories_are_tenant_scoped(db_session_integration, media_root):
    db = db_session_integration
    tenant, creator, role = await create_admin_tenant_with_user(db)
    approver = await _add_user(db, tenant, role, first="Selim", designation="Store Manager")
    _other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    signed_at = datetime(2026, 11, 5, 10, 30)
    row = SimpleNamespace(
        created_by_user_id=creator.id,
        created_at=datetime(2026, 11, 4, 9, 0),
        signed_by_user_id=approver.id,
        signed_at=signed_at,
    )
    blocks = await inventory_doc_signatories(db, tenant.id, row)
    assert [b["role_label"] for b in blocks] == ["Prepared", "Checked", "Security", "Approved"]
    assert blocks[0]["user_id"] == creator.id
    assert blocks[1]["user_id"] is None and blocks[2]["user_id"] is None
    assert blocks[3]["name"] == "Selim"
    assert blocks[3]["designation"] == "Store Manager"
    assert blocks[3]["signed_at"] == signed_at.isoformat()

    draft = SimpleNamespace(created_by_user_id=outsider.id, signed_by_user_id=None, signed_at=signed_at)
    blocks = await inventory_doc_signatories(db, tenant.id, draft)
    assert blocks[0]["user_id"] is None  # user from another tenant is never resolved
    assert blocks[3]["user_id"] is None and blocks[3]["signed_at"] is None
