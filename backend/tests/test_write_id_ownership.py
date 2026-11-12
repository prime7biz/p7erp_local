"""Client-supplied ids on write routes are tracked and checked for tenant ownership (RC-15).

`write_id_ownership_manifest.py` lists every related-record id that a POST / PUT / PATCH body accepts,
with how it is validated. A new id field fails this test until someone reviews it (and adds a
cross-tenant test). Regenerate after reviewing:

    docker compose exec backend python scripts/write_id_inventory.py --write-manifest

Run:
    docker compose exec backend pytest tests/test_write_id_ownership.py -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)
from tests.write_id_ownership_manifest import MANIFEST

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import write_id_inventory  # noqa: E402

ALLOWED_STATUS_PREFIXES = ("handler-calls-ensure_owned", "reviewed: ", "not-a-record: ", "unreviewed")


def test_manifest_matches_the_routes():
    actual = {k: sorted(v) for k, v in write_id_inventory.write_id_fields(app.routes).items()}
    listed = {k: sorted(v) for k, v in MANIFEST.items()}
    new = {k: sorted(set(v) - set(listed.get(k, []))) for k, v in actual.items() if set(v) - set(listed.get(k, []))}
    gone = {k: sorted(set(v) - set(actual.get(k, []))) for k, v in listed.items() if set(v) - set(actual.get(k, []))}
    assert not new, f"New write-route ids need a tenant-ownership review (then regenerate the manifest): {new}"
    assert not gone, f"Manifest lists ids that no longer exist (regenerate the manifest): {gone}"


def test_every_status_is_known():
    bad = {
        f"{route}.{field}": status
        for route, fields in MANIFEST.items()
        for field, status in fields.items()
        if not status.startswith(ALLOWED_STATUS_PREFIXES)
    }
    assert not bad, bad


def test_unreviewed_backlog_does_not_grow():
    """RC-15 is closed when both reach 0 (heuristic entries must be verified per field too)."""
    unreviewed = sum(1 for fields in MANIFEST.values() for s in fields.values() if s == "unreviewed")
    heuristic = sum(1 for fields in MANIFEST.values() for s in fields.values() if s == "handler-calls-ensure_owned")
    assert unreviewed <= 574, unreviewed
    assert heuristic <= 193, heuristic


def test_regenerating_never_auto_labels_new_fields():
    """A field missing from the previous manifest comes back as 'unreviewed', never as the heuristic."""
    route, fields = next(
        (r, f) for r, f in MANIFEST.items() if any(s == "handler-calls-ensure_owned" for s in f.values())
    )
    field = next(k for k, s in fields.items() if s == "handler-calls-ensure_owned")
    previous = {r: dict(f) for r, f in MANIFEST.items()}
    del previous[route][field]

    scope: dict = {}
    exec(write_id_inventory.render_manifest(app.routes, previous), scope)  # noqa: S102 - our generated source
    assert scope["MANIFEST"][route][field] == "unreviewed"


def _client(db, tenant, user):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    return AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers={"X-Tenant-Id": str(tenant.id)}
    )


@pytest.fixture
def _clear_overrides():
    yield
    for dep in (get_db, get_current_user, require_tenant):
        app.dependency_overrides.pop(dep, None)


@pytest.mark.asyncio
async def test_orders_refuse_another_tenants_records_on_create_and_update(db_session_integration, _clear_overrides):
    db = db_session_integration
    t_a, u_a, _ = await create_merch_tenant_with_user(db)
    t_b, _u_b, _ = await create_merch_tenant_with_user(db)
    cust_a = await create_customer(db, t_a)
    style_a = await create_garment_style(db, t_a, cust_a)
    cust_b = await create_customer(db, t_b)
    style_b = await create_garment_style(db, t_b, cust_b)
    q_b, _order_b = await create_quotation_and_order(db, t_b, cust_b, style_b)
    _q_a, order_a = await create_quotation_and_order(db, t_a, cust_a, style_a)
    await db.commit()
    ids = {"cust_a": cust_a.id, "cust_b": cust_b.id, "style_b": style_b.id, "q_b": q_b.id, "order_a": order_a.id}

    async with _client(db, t_a, u_a) as ac:
        for body in (
            {"customer_id": ids["cust_b"]},
            {"customer_id": ids["cust_a"], "style_id": ids["style_b"]},
            {"customer_id": ids["cust_a"], "quotation_id": ids["q_b"]},
        ):
            r = await ac.post("/api/v1/orders", json={"order_date": "2026-11-12", "quantity": 10, **body})
            assert r.status_code in (400, 404), (body, r.status_code, r.text)
        r = await ac.patch(f"/api/v1/orders/{ids['order_a']}", json={"style_id": ids["style_b"]})
        assert r.status_code in (400, 404), r.text
