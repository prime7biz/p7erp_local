"""Phase 2B: UD material utilization events — flag, idempotency, cross-tenant.

Run: docker compose exec -T backend pytest tests/test_ud_material_events.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.mfg_alloc_fixtures import add_po

API = "/api/v1/material-control"


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_ud_event_refuses_another_tenants_po(db_session_integration):
    """Cross-tenant denial: a PO / PO line of another tenant looks like 'not found'."""
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    other_tenant, _other_user, other_wh, other_vendor, other_item = await seed_inventory_chain(db)
    other_po, other_line = await add_po(db, other_tenant, other_vendor, other_item, "20")
    other_po_id, other_line_id = other_po.id, other_line.id
    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            for body in (
                {"source_document_id": other_po_id, "source_line_id": None},
                {"source_document_id": other_po_id, "source_line_id": other_line_id},
            ):
                res = await ac.post(
                    f"{API}/ud-events",
                    json={
                        "source_document_type": "PO",
                        "source_stage_key": "order",
                        "event_kind": "ORDERED",
                        "qty_normalized": "5",
                        **body,
                    },
                )
                assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_ud_event_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags.pop("material_alloc_ud_v1", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/ud-events",
                json={
                    "source_document_type": "PO",
                    "source_document_id": 1,
                    "source_line_id": 1,
                    "source_stage_key": "main",
                    "event_kind": "ORDERED",
                    "qty_normalized": "10",
                },
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_ud_event_happy_path_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    # Source PO + line must be real rows of this tenant (ud-events refuse unknown / foreign ids).
    po, po_line = await add_po(db, tenant, vendor, item, "20")
    po_id, po_line_id = po.id, po_line.id
    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    payload = {
        "source_document_type": "PO",
        "source_document_id": po_id,
        "source_line_id": po_line_id,
        "source_stage_key": "order",
        "event_kind": "ORDERED",
        "qty_normalized": "12.5",
    }
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(f"{API}/ud-events", json=payload)
            assert res.status_code == 200, res.text
            first = res.json()
            assert first["event_kind"] == "ORDERED"
            assert first["qty_normalized"] == "12.5"

            again = await ac.post(f"{API}/ud-events", json=payload)
            assert again.status_code == 200, again.text
            assert again.json()["id"] == first["id"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_ud_event_cross_tenant_entitlement(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_alloc_ud_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    other, other_user, _ = await create_admin_tenant_with_user(db)
    oflags = dict(other.feature_flags or {})
    oflags["material_alloc_ud_v1"] = True
    other.feature_flags = oflags
    await db.commit()

    # Fake entitlement id that cannot belong to other tenant
    try:
        async with await _api_client(db, other, other_user) as ac:
            res = await ac.post(
                f"{API}/ud-events",
                json={
                    "source_document_type": "PO",
                    "source_document_id": 1,
                    "source_line_id": 1,
                    "source_stage_key": "x",
                    "event_kind": "RECEIVED",
                    "qty_normalized": "1",
                    "ud_entitlement_id": 999999999,
                },
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()
