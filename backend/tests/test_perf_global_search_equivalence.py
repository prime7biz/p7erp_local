"""Global search: selecting only the needed columns returns exactly the same JSON as loading full ORM rows.

Run: docker compose exec backend pytest tests/test_perf_global_search_equivalence.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import or_, select

from app.models import Customer
from app.models.hr import Employee
from app.models.inventory import PurchaseOrder, Vendor
from app.models.merch import Order
from app.modules.global_search.router import _SOURCES, SearchGroup, _like

from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin


async def _old_search(db, tenant_id: int, q: str, limit: int = 5) -> dict:
    """Pre-rewrite algorithm: full ORM rows per source (RBAC off, so every source is searched)."""
    query = q.strip()
    pattern = _like(query)
    groups = []
    for source in _SOURCES:
        kind, label, _perm, model, cols, order_by, build = source[:7]
        stmt = (
            select(model)
            .where(model.tenant_id == tenant_id, or_(*[c.ilike(pattern, escape="\\") for c in cols(model)]))
            .order_by(order_by)
            .limit(limit)
        )
        rows = (await db.execute(stmt)).scalars().all()
        if rows:
            groups.append(SearchGroup(kind=kind, label=label, hits=[build(r) for r in rows]).model_dump())
    return {"query": query, "groups": groups}


async def _seed(db, tenant, tag: str):
    db.add_all(
        [
            Customer(tenant_id=tenant.id, customer_code=f"C1{tag}", name=f"Alpha {tag} Knit", status="active"),
            Customer(tenant_id=tenant.id, customer_code=f"C2{tag}", name=f"Beta {tag} Wear", status=""),
            Customer(tenant_id=tenant.id, customer_code=f"{tag}C3", name="Gamma by code", status="inactive"),
            Customer(tenant_id=tenant.id, customer_code=f"C4{tag}", name=f"100%_{tag}", status="active"),
            Vendor(tenant_id=tenant.id, vendor_code=f"V1{tag}", name=f"Vendor {tag} One", is_active=True),
            Vendor(tenant_id=tenant.id, vendor_code=f"V2{tag}", name=f"Vendor {tag} Two", is_active=False),
            Employee(tenant_id=tenant.id, employee_code=f"E1{tag}", first_name=f"Nila{tag}", last_name="Khan", is_active=True),
            Employee(tenant_id=tenant.id, employee_code=f"E2{tag}", first_name="Rafi", last_name=f"{tag}", is_active=False),
            Employee(tenant_id=tenant.id, employee_code=f"E3{tag}", first_name="", last_name=None, is_active=True),
        ]
    )
    await db.flush()
    cust = (await db.execute(select(Customer).where(Customer.customer_code == f"C1{tag}", Customer.tenant_id == tenant.id))).scalar_one()
    for n in range(7):
        db.add(Order(tenant_id=tenant.id, customer_id=cust.id, order_code=f"O{n}{tag}", style_ref=f"ST-{tag}" if n % 2 else None, status="NEW"))
        db.add(PurchaseOrder(tenant_id=tenant.id, po_code=f"P{n}{tag}", supplier_name=f"Mill {tag}", status="DRAFT" if n % 2 else "APPROVED",
                             base_total_amount=Decimal("1")))
    await seed_item(db, tenant.id, code=f"IT{tag}", name=f"Yarn {tag}")
    await db.flush()


@pytest.mark.asyncio
async def test_global_search_matches_full_row_algorithm(db_session_integration):
    db = db_session_integration
    tag = uuid.uuid4().hex[:6]
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    await _seed(db, tenant, tag)
    await _seed(db, other, tag)
    await db.commit()

    async with api_client(db, tenant, user) as ac:
        for q, limit in ((tag, 5), (tag, 10), (tag.upper(), 3), (f"  {tag} ", 5), (f"100%_{tag}", 5), ("%_", 5), ("zz-no-hit", 5)):
            r = await ac.get("/api/v1/search", params={"q": q, "limit": limit})
            assert r.status_code == 200, r.text
            assert r.json() == await _old_search(db, tenant.id, q, limit), q

        body = (await ac.get("/api/v1/search", params={"q": tag, "limit": 10})).json()
        kinds = {g["kind"]: g["hits"] for g in body["groups"]}
        assert [h["title"] for h in kinds["customer"]] == ["100%_" + tag, f"Alpha {tag} Knit", f"Beta {tag} Wear", "Gamma by code"]
        assert kinds["customer"][2]["subtitle"] == f"C2{tag}"
        assert [h["title"] for h in kinds["order"]] == [f"O{n}{tag}" for n in range(6, -1, -1)]
        assert len(kinds["purchase_order"]) == 7
        assert kinds["vendor"][1]["subtitle"] == f"V2{tag} · inactive"
        assert {h["title"] for h in kinds["employee"]} == {f"Nila{tag} · Khan", f"Rafi · {tag}", f"E3{tag}"}
        assert kinds["item"][0]["href"].startswith("/app/inventory/items?item=")
        all_ids = {(g["kind"], h["id"]) for g in body["groups"] for h in g["hits"]}
        other_body = await _old_search(db, other.id, tag, 10)
        assert not all_ids & {(g["kind"], h["id"]) for g in other_body["groups"] for h in g["hits"]}
