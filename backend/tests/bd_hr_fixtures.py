"""Shared helpers for Bangladesh HR tests: an HTTP client with stubbed auth and real-commit sessions."""

from __future__ import annotations

from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from tests.conftest import _async_database_url


@asynccontextmanager
async def api_client(db, tenant, user):
    async def o_db():
        yield db

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


# Rows that block "DELETE FROM tenants" through ON DELETE RESTRICT links, children first.
RESTRICT_CHILD_TABLES = (
    "hr_allowance_entries",
    "hr_production_bonus_entries",
    "hr_bonus_allocation_lines",
    "hr_bd_festival_work_entries",
    "hr_final_settlements",
    "hr_clearance_items",
    "hr_separations",
    "hr_employee_cases",
    "hr_payroll_acknowledgements",
    "hr_payroll_document_snapshots",
    "hr_payroll_run_lines",
    "hr_payroll_runs",
    "hr_payroll_periods",
    "hr_payroll_structure_lines",
    "hr_payroll_employee_structure_assignments",
    "hr_bd_employee_wage_assignments",
    "hr_bd_maternity_cases",
    "hr_bd_service_benefit_cases",
    "hr_bd_leave_accrual_entries",
    "hr_bd_wage_schedule_rates",
    "hr_bd_rule_sets",
    "hr_employee_gate_events",
    "hr_leave_requests",
)


async def purge_tenant(engine, tenant_id: int) -> None:
    async with engine.begin() as conn:
        for table in RESTRICT_CHILD_TABLES:
            exists = (await conn.execute(text("SELECT to_regclass(:t)"), {"t": table})).scalar()
            if exists:
                await conn.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id})
        await conn.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})


@pytest_asyncio.fixture
async def real_db():
    url = _async_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")
    engine = create_async_engine(url, pool_size=6)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    tenant_ids: list[int] = []
    try:
        yield factory, tenant_ids.append
    finally:
        for tid in tenant_ids:
            await purge_tenant(engine, tid)
        await engine.dispose()

