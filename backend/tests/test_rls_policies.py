"""PostgreSQL Row-Level Security (SEC-04): policies from migration 270 + app session context.

The DB tests switch to a throw-away non-owner role inside one transaction
(``CREATE ROLE`` / ``SET LOCAL ROLE`` roll back with it), because Postgres skips policies for
the table owner — the role the suite normally connects as.

Run: docker compose exec backend pytest tests/test_rls_policies.py -q
"""

from __future__ import annotations

import os
import uuid
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.requests import Request

from app.common import rls
from app.config import Settings, get_settings
from app.database import select_runtime_database_url
from app.models import Customer, Role
from tests.merch_fixtures import create_customer, create_merch_tenant_with_user

POLICY = "p7_tenant_isolation"


def _owner_url() -> str | None:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    return raw.replace("postgresql://", "postgresql+asyncpg://", 1) if raw else None


@pytest_asyncio.fixture
async def owner_session(monkeypatch):
    """Session on the owner connection inside one transaction that is always rolled back.

    The app flag is forced off here so policy tests control app.tenant_id / app.rls_bypass
    themselves (the ``rls_flag_on`` fixture turns it back on).
    """
    url = _owner_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run inside the backend container.")
    monkeypatch.setattr(get_settings(), "rls_session_tenant_enabled", False)
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        trans = await conn.begin()
        factory = async_sessionmaker(
            bind=conn,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            join_transaction_mode="create_savepoint",
        )
        async with factory() as session:
            try:
                yield session
            finally:
                await session.close()
        await trans.rollback()
    await engine.dispose()


async def _become_probe_role(db: AsyncSession) -> None:
    """Create a non-owner role for this transaction only and switch to it."""
    can = (
        await db.execute(text("SELECT rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user"))
    ).scalar()
    if not can:
        pytest.skip("Test DB user cannot CREATE ROLE")
    role = f"p7_rls_probe_{uuid.uuid4().hex[:10]}"
    await db.execute(text(f"CREATE ROLE {role} NOLOGIN NOSUPERUSER NOBYPASSRLS"))
    await db.execute(text(f"GRANT USAGE ON SCHEMA public TO {role}"))
    await db.execute(text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}"))
    await db.execute(text(f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO {role}"))
    await db.execute(text(f"SET LOCAL ROLE {role}"))


async def _set_context(db: AsyncSession, *, tenant_id: int | None, bypass: bool) -> None:
    await db.execute(
        text("SELECT set_config('app.tenant_id', :t, true), set_config('app.rls_bypass', :b, true)"),
        {"t": "" if tenant_id is None else str(tenant_id), "b": "on" if bypass else "off"},
    )


async def _visible_customer_ids(db: AsyncSession, ids: list[int]) -> set[int]:
    rows = (await db.execute(select(Customer.id).where(Customer.id.in_(ids)))).scalars().all()
    return set(rows)


async def _two_tenants_with_customers(db: AsyncSession):
    tenant_a, user_a, _ = await create_merch_tenant_with_user(db)
    tenant_b, _, _ = await create_merch_tenant_with_user(db)
    cust_a = await create_customer(db, tenant_a)
    cust_b = await create_customer(db, tenant_b)
    return SimpleNamespace(a=tenant_a, b=tenant_b, user_a=user_a, cust_a=cust_a.id, cust_b=cust_b.id)


@pytest.fixture
def rls_flag_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "rls_session_tenant_enabled", True)


# --- Schema: every tenant table is covered -------------------------------------------------


@pytest.mark.asyncio
async def test_every_tenant_table_has_rls_policy(owner_session):
    rows = (
        await owner_session.execute(
            text(
                """
                SELECT c.table_name,
                       cl.relrowsecurity,
                       cl.relforcerowsecurity,
                       EXISTS (
                         SELECT 1 FROM pg_policies p
                         WHERE p.schemaname = c.table_schema AND p.tablename = c.table_name
                           AND p.policyname = :policy
                       ) AS has_policy
                FROM information_schema.columns c
                JOIN information_schema.tables t
                  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
                JOIN pg_class cl ON cl.relname = c.table_name
                JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
                WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
                  AND c.column_name = 'tenant_id'
                """
            ),
            {"policy": POLICY},
        )
    ).all()
    assert rows, "no tenant tables found — migrations not applied?"
    missing = sorted(r.table_name for r in rows if not (r.relrowsecurity and r.has_policy))
    forced = sorted(r.table_name for r in rows if r.relforcerowsecurity)
    assert not missing, (
        f"tenant_id tables without RLS policy {POLICY} (add it in the table's migration, "
        f"see alembic/versions/270_tenant_rls_policies.py): {missing}"
    )
    assert not forced, f"RLS must not be FORCED (owner/migrations would be filtered): {forced}"


@pytest.mark.asyncio
async def test_every_tenant_policy_uses_the_270_expression(owner_session):
    """Later migrations copy 270's policy; all copies must stay identical (per tenant_id nullability)."""
    rows = (
        await owner_session.execute(
            text(
                """
                SELECT p.tablename, p.cmd, p.permissive, p.qual, p.with_check, c.is_nullable = 'YES' AS nullable
                FROM pg_policies p
                JOIN information_schema.columns c
                  ON c.table_schema = p.schemaname AND c.table_name = p.tablename AND c.column_name = 'tenant_id'
                WHERE p.schemaname = current_schema() AND p.policyname = :policy
                """
            ),
            {"policy": POLICY},
        )
    ).all()
    assert rows
    bad_shape = sorted(r.tablename for r in rows if r.cmd != "ALL" or r.permissive != "PERMISSIVE" or r.qual != r.with_check)
    assert not bad_shape, f"policy must be PERMISSIVE FOR ALL with USING == WITH CHECK: {bad_shape}"
    by_nullability: dict[bool, set[str]] = {}
    for r in rows:
        by_nullability.setdefault(bool(r.nullable), set()).add(r.qual)
    for nullable, quals in by_nullability.items():
        assert len(quals) == 1, f"tenant policies differ (nullable tenant_id={nullable}): {sorted(quals)}"
    for r in rows:
        assert ("tenant_id IS NULL" in r.qual) == bool(r.nullable), r.tablename


# --- Database policies (non-owner role) ------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_is_not_filtered(owner_session):
    data = await _two_tenants_with_customers(owner_session)
    await _set_context(owner_session, tenant_id=data.b.id, bypass=False)
    assert await _visible_customer_ids(owner_session, [data.cust_a, data.cust_b]) == {data.cust_a, data.cust_b}


@pytest.mark.asyncio
async def test_policy_hides_other_tenant_rows(owner_session):
    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)

    await _set_context(owner_session, tenant_id=data.b.id, bypass=False)
    assert await _visible_customer_ids(owner_session, [data.cust_a]) == set()
    assert await _visible_customer_ids(owner_session, [data.cust_a, data.cust_b]) == {data.cust_b}
    updated = await owner_session.execute(
        text("UPDATE customers SET name = 'hijacked' WHERE id = :id"), {"id": data.cust_a}
    )
    assert updated.rowcount == 0
    deleted = await owner_session.execute(text("DELETE FROM customers WHERE id = :id"), {"id": data.cust_a})
    assert deleted.rowcount == 0

    await _set_context(owner_session, tenant_id=data.a.id, bypass=False)
    assert await _visible_customer_ids(owner_session, [data.cust_a, data.cust_b]) == {data.cust_a}


@pytest.mark.asyncio
async def test_policy_fails_closed_without_context_and_bypass_sees_all(owner_session):
    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)
    ids = [data.cust_a, data.cust_b]

    await _set_context(owner_session, tenant_id=None, bypass=False)
    assert await _visible_customer_ids(owner_session, ids) == set()

    await _set_context(owner_session, tenant_id=None, bypass=True)
    assert await _visible_customer_ids(owner_session, ids) == set(ids)


@pytest.mark.asyncio
async def test_policy_rejects_insert_and_update_into_other_tenant(owner_session):
    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)
    await _set_context(owner_session, tenant_id=data.b.id, bypass=False)

    async with owner_session.begin_nested():
        await owner_session.execute(
            text("INSERT INTO customers (tenant_id, customer_code, name, status) VALUES (:t, 'RLSOK', 'ok', 'active')"),
            {"t": data.b.id},
        )

    with pytest.raises(DBAPIError, match="row-level security"):
        async with owner_session.begin_nested():
            await owner_session.execute(
                text(
                    "INSERT INTO customers (tenant_id, customer_code, name, status) "
                    "VALUES (:t, 'RLSBAD', 'bad', 'active')"
                ),
                {"t": data.a.id},
            )

    with pytest.raises(DBAPIError, match="row-level security"):
        async with owner_session.begin_nested():
            await owner_session.execute(
                text("UPDATE customers SET tenant_id = :a WHERE id = :id"), {"a": data.a.id, "id": data.cust_b}
            )


@pytest.mark.asyncio
async def test_nullable_tenant_rows_are_shared(owner_session):
    """Nullable tenant_id (e.g. roles): NULL rows are visible to every tenant, other tenants' are not."""
    data = await _two_tenants_with_customers(owner_session)
    shared = Role(
        tenant_id=None,
        name=f"rls_shared_{uuid.uuid4().hex[:8]}",
        display_name="Shared probe",
        is_system=True,
        permissions={},
    )
    owner_session.add(shared)
    await owner_session.flush()
    shared_id = shared.id
    role_a = data.user_a.role_id
    await _become_probe_role(owner_session)
    await _set_context(owner_session, tenant_id=data.b.id, bypass=False)
    visible = set(
        (await owner_session.execute(text("SELECT id FROM roles WHERE id IN (:s, :a)"), {"s": shared_id, "a": role_a}))
        .scalars()
        .all()
    )
    assert visible == {shared_id}


# --- App session context (RLS_SESSION_TENANT_ENABLED) ---------------------------------------


async def _db_context(db: AsyncSession) -> tuple[str | None, str | None]:
    row = (
        await db.execute(
            text("SELECT current_setting('app.tenant_id', true), current_setting('app.rls_bypass', true)")
        )
    ).one()
    return row[0], row[1]


@pytest.mark.asyncio
async def test_flag_off_helpers_do_nothing(owner_session):
    assert Settings.model_fields["rls_session_tenant_enabled"].default is False
    assert Settings.model_fields["database_url_app"].default == ""
    before = await _db_context(owner_session)
    await rls.bind_session_tenant(owner_session, 123)
    assert rls.session_rls_tenant_id(owner_session) is None
    assert await _db_context(owner_session) == before
    await rls.bind_session_bypass(owner_session)
    await rls.reset_session_context(owner_session)
    assert await _db_context(owner_session) == before


@pytest.mark.asyncio
async def test_flag_on_binding_scopes_orm_queries(owner_session, rls_flag_on):
    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)
    ids = [data.cust_a, data.cust_b]
    await rls.bind_session_bypass(owner_session)
    assert await _visible_customer_ids(owner_session, ids) == set(ids)

    await rls.bind_session_tenant(owner_session, data.a.id)
    assert rls.session_rls_tenant_id(owner_session) == data.a.id
    assert await _db_context(owner_session) == (str(data.a.id), "off")
    assert await _visible_customer_ids(owner_session, ids) == {data.cust_a}

    await rls.bind_session_bypass(owner_session)
    assert await _db_context(owner_session) == ("", "on")
    assert await _visible_customer_ids(owner_session, ids) == set(ids)


@pytest.mark.asyncio
async def test_flag_on_new_transaction_reapplies_tenant(rls_flag_on):
    """after_begin listener: a fresh transaction starts with the session's tenant (or bypass)."""
    url = _owner_url()
    if not url:
        pytest.skip("DATABASE_URL not set")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as db:
            assert await _db_context(db) in {("", "on"), (None, "on")}
            await db.rollback()
            rls_tenant = 987654
            await rls.bind_session_tenant(db, rls_tenant)
            assert await _db_context(db) == (str(rls_tenant), "off")
            await db.commit()
            assert await _db_context(db) == (str(rls_tenant), "off")
            await rls.reset_session_context(db)
            assert await _db_context(db) == ("", "on")
    finally:
        await engine.dispose()


def _request() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})


@pytest.mark.asyncio
async def test_get_current_user_pins_session_to_user_tenant(owner_session, rls_flag_on):
    from app.common.auth import create_access_token, get_current_user

    tenant, user, _ = await create_merch_tenant_with_user(owner_session)
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=int(user.auth_session_version or 0))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    got = await get_current_user(db=owner_session, request=_request(), credentials=creds)
    assert got.id == user.id
    assert rls.session_rls_tenant_id(owner_session) == tenant.id
    assert await _db_context(owner_session) == (str(tenant.id), "off")
    await rls.reset_session_context(owner_session)
    assert await _db_context(owner_session) == ("", "on")


@pytest.mark.asyncio
async def test_authenticated_session_hides_other_tenant_even_without_filter(owner_session, rls_flag_on):
    """The point of RLS: a query that forgets ``WHERE tenant_id = ...`` still only sees the caller's tenant."""
    from app.common.auth import create_access_token, get_current_user

    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)
    await rls.bind_session_bypass(owner_session)  # what a fresh request looks like before auth
    token = create_access_token(
        data.user_a.id, tenant_id=data.a.id, session_version=int(data.user_a.auth_session_version or 0)
    )
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    await get_current_user(db=owner_session, request=_request(), credentials=creds)
    assert await _visible_customer_ids(owner_session, [data.cust_a, data.cust_b]) == {data.cust_a}


@pytest.mark.asyncio
async def test_http_request_pins_tenant_and_resets_after(owner_session, rls_flag_on, monkeypatch):
    """Real app + real auth dependency under the non-owner role; the shared session is unpinned afterwards."""
    from httpx import ASGITransport, AsyncClient

    import app.common.auth as auth_module
    from app.common.auth import create_access_token
    from app.database import get_db
    from app.main import app

    seen_during_request: list[tuple] = []
    real_bind = auth_module.bind_session_tenant

    async def recording_bind(db, tenant_id):
        await real_bind(db, tenant_id)
        seen_during_request.append((tenant_id, await _db_context(db)))

    monkeypatch.setattr(auth_module, "bind_session_tenant", recording_bind)
    data = await _two_tenants_with_customers(owner_session)
    await _become_probe_role(owner_session)
    token = create_access_token(
        data.user_a.id, tenant_id=data.a.id, session_version=int(data.user_a.auth_session_version or 0)
    )

    async def override_db():
        yield owner_session

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(data.a.id)},
            )
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert r.status_code == 200, r.text
    assert seen_during_request == [(data.a.id, (str(data.a.id), "off"))]
    assert rls.session_rls_tenant_id(owner_session) is None
    assert await _db_context(owner_session) == ("", "on")
    assert await _visible_customer_ids(owner_session, [data.cust_a, data.cust_b]) == {data.cust_a, data.cust_b}


def test_app_role_url_used_only_with_flag_on():
    base = dict(
        database_url="postgresql://owner@db/p7",
        database_url_pgbouncer="postgresql://owner@pgb/p7",
        use_pgbouncer=False,
        database_url_app="postgresql://p7erp_app@db/p7",
    )
    assert select_runtime_database_url(SimpleNamespace(**base, rls_session_tenant_enabled=False)) == base["database_url"]
    assert select_runtime_database_url(SimpleNamespace(**base, rls_session_tenant_enabled=True)) == base["database_url_app"]
    no_app = {**base, "database_url_app": "", "use_pgbouncer": True}
    assert (
        select_runtime_database_url(SimpleNamespace(**no_app, rls_session_tenant_enabled=True))
        == base["database_url_pgbouncer"]
    )
