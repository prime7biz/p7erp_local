"""Multi-word dropdown search + offset paging on master lists.

Typing "senior op" must find "Senior Operator"; `%` and `_` typed by the user match literally;
another tenant's rows never appear; master lists can be paged with `offset` so nothing is cut off.

Run: docker compose exec backend pytest tests/test_multi_word_search.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.search_tokens import escape_like, multi_word_ilike_clause, split_search_tokens
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Department, Designation, Employee, Warehouse
from app.models.costing import ItemCategory
from tests.merch_fixtures import create_merch_tenant_with_user


# ---------- pure helper tests (no database) ----------


def test_split_search_tokens_lowercases_and_caps():
    assert split_search_tokens("  Senior   OP ") == ["senior", "op"]
    assert split_search_tokens(None) == []
    assert split_search_tokens("   ") == []
    assert len(split_search_tokens("a b c d e f g h", max_tokens=6)) == 6
    assert len(split_search_tokens("x" * 500)[0]) == 200


def test_escape_like_makes_wildcards_literal():
    assert escape_like("50%_off\\") == "50\\%\\_off\\\\"


def test_clause_is_none_without_search_text():
    from app.models import Designation as D

    assert multi_word_ilike_clause("", [D.title]) is None
    assert multi_word_ilike_clause("abc", []) is None


# ---------- HTTP tests ----------


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _manager(db):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "manager"
    await db.flush()
    return tenant, user


def _designation(tenant, title: str) -> Designation:
    return Designation(tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:7]}", title=title, is_active=True)


@pytest.mark.asyncio
async def test_designations_multi_word_literal_wildcards_and_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    other_tenant, _other_user = await _manager(db)
    db.add_all(
        [
            _designation(tenant, "Senior Operator"),
            _designation(tenant, "Junior Operator"),
            _designation(tenant, "Cutting Supervisor"),
            _designation(tenant, "Grade 50% Helper"),
            _designation(tenant, "Grade 50X Helper"),
            _designation(other_tenant, "Senior Operator Secret"),
        ]
    )
    await db.commit()

    async with _client(db, tenant, user) as c:
        r = await c.get("/api/v1/hr/designations", params={"search": "operator senior"})
        assert r.status_code == 200, r.text
        assert [d["title"] for d in r.json()] == ["Senior Operator"]  # any order; no other tenant's row

        r = await c.get("/api/v1/hr/designations", params={"search": "50%"})
        assert [d["title"] for d in r.json()] == ["Grade 50% Helper"]  # % is literal, not a wildcard

        r = await c.get("/api/v1/hr/designations", params={"search": "_"})
        assert r.json() == []  # "_" is literal, not "any one character"

        r = await c.get("/api/v1/hr/designations", params={"search": "secret"})
        assert r.json() == []  # another tenant's record looks like "not found"


@pytest.mark.asyncio
async def test_designations_offset_pages_without_gaps(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    db.add_all([_designation(tenant, f"Role {i:03d}") for i in range(130)])
    await db.commit()

    async with _client(db, tenant, user) as c:
        first = (await c.get("/api/v1/hr/designations", params={"limit": 100, "offset": 0})).json()
        second = (await c.get("/api/v1/hr/designations", params={"limit": 100, "offset": 100})).json()
        too_big = await c.get("/api/v1/hr/designations", params={"limit": 501})
    assert len(first) == 100
    assert len(second) == 30
    assert len({d["id"] for d in first} | {d["id"] for d in second}) == 130
    assert too_big.status_code == 422  # server cap of 500 per request is unchanged


@pytest.mark.asyncio
async def test_inventory_item_categories_search_and_offset(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    other_tenant, _ = await _manager(db)
    db.add_all(
        [ItemCategory(tenant_id=tenant.id, category_code=f"C{i:03d}", name=f"Fabric Group {i}") for i in range(60)]
        + [ItemCategory(tenant_id=tenant.id, category_code="TRIM1", name="Sewing Trim")]
        + [ItemCategory(tenant_id=other_tenant.id, category_code="OTHER1", name="Fabric Group Other")]
    )
    await db.commit()

    async with _client(db, tenant, user) as c:
        found = (await c.get("/api/v1/inventory/item-categories", params={"search": "group 59 fabric"})).json()
        assert [row["name"] for row in found] == ["Fabric Group 59"]

        other = (await c.get("/api/v1/inventory/item-categories", params={"search": "other"})).json()
        assert other == []  # other tenant's row is invisible

        page1 = (await c.get("/api/v1/inventory/item-categories", params={"limit": 50, "offset": 0})).json()
        page2 = (await c.get("/api/v1/inventory/item-categories", params={"limit": 50, "offset": 50})).json()
    assert len(page1) == 50
    assert len(page2) == 11  # 60 fabric + 1 trim = 61 in total, none lost
    assert not ({r["id"] for r in page1} & {r["id"] for r in page2})


@pytest.mark.asyncio
async def test_inventory_warehouses_offset(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    db.add_all([Warehouse(tenant_id=tenant.id, warehouse_code=f"W{i:03d}", name=f"Store {i}") for i in range(75)])
    await db.commit()

    async with _client(db, tenant, user) as c:
        page1 = (await c.get("/api/v1/inventory/warehouses", params={"limit": 50, "offset": 0})).json()
        page2 = (await c.get("/api/v1/inventory/warehouses", params={"limit": 50, "offset": 50})).json()
    assert len(page1) == 50
    assert len(page2) == 25


@pytest.mark.asyncio
async def test_employees_and_departments_multi_word_across_columns(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    other_tenant, _ = await _manager(db)
    db.add_all(
        [
            Employee(tenant_id=tenant.id, employee_code="EMP-0101", first_name="Rahima", last_name="Akter"),
            Employee(tenant_id=tenant.id, employee_code="EMP-0102", first_name="Rahim", last_name="Uddin"),
            Employee(tenant_id=other_tenant.id, employee_code="EMP-0103", first_name="Rahima", last_name="Akter"),
            Department(tenant_id=tenant.id, code="CUT", name="Cutting Section", is_active=True),
            Department(tenant_id=tenant.id, code="SEW", name="Sewing Section", is_active=True),
            Department(tenant_id=other_tenant.id, code="CUT", name="Cutting Section", is_active=True),
        ]
    )
    await db.commit()

    async with _client(db, tenant, user) as c:
        # first name and last name are different columns; both words must match the same employee
        r = await c.get("/api/v1/hr/employees", params={"search": "akter rahima"})
        assert r.status_code == 200, r.text
        assert [e["employee_code"] for e in r.json()] == ["EMP-0101"]  # not the other tenant's EMP-0103

        r = await c.get("/api/v1/hr/employees", params={"search": "rahim 0102"})
        assert [e["employee_code"] for e in r.json()] == ["EMP-0102"]

        r = await c.get("/api/v1/hr/departments", params={"search": "section cut"})
        assert [d["code"] for d in r.json()] == ["CUT"]