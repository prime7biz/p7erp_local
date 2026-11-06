"""Related-record IDs on payroll accounting config, crew sheets and TDS must belong to the caller's tenant.

Run: docker compose exec backend pytest tests/test_tenant_security_hardening_a.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, time
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    AccountGroup,
    ChartOfAccount,
    Employee,
    LineCrewTemplate,
    PayrollAccountingConfig,
    ProductionShift,
    SewingLine,
)
from app.models.inventory import Vendor
from app.models.party_ledger import PartyLedger
from app.models.tds import TdsDeduction, TdsSection
from app.modules.finance import tds_service
from tests.merch_fixtures import create_merch_tenant_with_user


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


async def _count(db, model, *where) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*where))).scalar() or 0)


async def _account(db, tenant) -> ChartOfAccount:
    grp = AccountGroup(tenant_id=tenant.id, name="Test", code=f"G{uuid.uuid4().hex[:5]}", nature="asset")
    db.add(grp)
    await db.flush()
    acc = ChartOfAccount(tenant_id=tenant.id, account_number=f"9{uuid.uuid4().hex[:6]}", name="Acc", group_id=grp.id)
    db.add(acc)
    await db.flush()
    return acc


async def _employee(db, tenant) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker")
    db.add(emp)
    await db.flush()
    return emp


@pytest.mark.asyncio
async def test_payroll_accounting_config_rejects_foreign_account(db_session_integration):
    db = db_session_integration
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, role_b = await create_merch_tenant_with_user(db)
    role_b.name = "admin"
    acc_a = await _account(db, t_a)
    acc_b = await _account(db, t_b)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.put("/api/v1/hr/payroll/accounting-config", json={"bank_account_id": acc_a.id})
        assert r.status_code == 400, r.text
        assert await _count(db, PayrollAccountingConfig, PayrollAccountingConfig.tenant_id == t_b.id) == 0

        r = await c.put(
            "/api/v1/hr/payroll/accounting-config",
            json={"bank_account_id": acc_b.id, "salary_expense_account_id": None},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["bank_account_id"] == acc_b.id and body["salary_expense_account_id"] is None

        # Fields absent from the request keep their stored value.
        r = await c.put("/api/v1/hr/payroll/accounting-config", json={"cash_account_id": acc_b.id})
        assert r.status_code == 200, r.text
        assert r.json()["bank_account_id"] == acc_b.id


@pytest.mark.asyncio
async def test_crew_template_rejects_foreign_employee(db_session_integration):
    db = db_session_integration
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
    emp_a = await _employee(db, t_a)
    emp_b = await _employee(db, t_b)
    line_b = SewingLine(tenant_id=t_b.id, line_code=f"L{uuid.uuid4().hex[:5]}", name="Line B")
    db.add(line_b)
    await db.commit()
    url = f"/api/v1/production/sewing-lines/{line_b.id}/crew-template"
    async with _client(db, t_b, u_b) as c:
        r = await c.get(url)
        assert r.status_code == 200, r.text
        role_id = r.json()[0]["crew_role_id"]
        r = await c.put(url, json={"rows": [{"crew_role_id": role_id, "default_count": 1, "employee_id": emp_a.id}]})
        assert r.status_code == 400, r.text
        assert (
            await _count(db, LineCrewTemplate, LineCrewTemplate.tenant_id == t_b.id, LineCrewTemplate.employee_id == emp_a.id)
            == 0
        )
        r = await c.put(url, json={"rows": [{"crew_role_id": role_id, "default_count": 1, "employee_id": emp_b.id}]})
        assert r.status_code == 200, r.text
        row = next(x for x in r.json() if x["crew_role_id"] == role_id)
        assert row["employee_id"] == emp_b.id and row["employee_name"]


@pytest.mark.asyncio
async def test_crew_daily_rejects_foreign_shift_and_employee(db_session_integration):
    db = db_session_integration
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
    emp_a = await _employee(db, t_a)
    line_b = SewingLine(tenant_id=t_b.id, line_code=f"L{uuid.uuid4().hex[:5]}", name="Line B")
    shift_a = ProductionShift(tenant_id=t_a.id, shift_code="A", name="A", start_time=time(8), end_time=time(17))
    shift_b = ProductionShift(tenant_id=t_b.id, shift_code="B", name="B", start_time=time(8), end_time=time(17))
    db.add_all([line_b, shift_a, shift_b])
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        roles = (await c.get(f"/api/v1/production/sewing-lines/{line_b.id}/crew-template")).json()
        role_id = next(x["crew_role_id"] for x in roles if not x["is_named"])
        base = {"production_date": date.today().isoformat(), "line_id": line_b.id}
        r = await c.put(
            "/api/v1/production/crew-daily",
            json={**base, "shift_id": shift_a.id, "rows": [{"crew_role_id": role_id, "planned_count": 1}]},
        )
        assert r.status_code == 400, r.text
        r = await c.put(
            "/api/v1/production/crew-daily",
            json={
                **base,
                "shift_id": shift_b.id,
                "rows": [{"crew_role_id": role_id, "planned_count": 1, "employee_id": emp_a.id}],
            },
        )
        assert r.status_code == 400, r.text
        r = await c.post(
            "/api/v1/production/line-crew-sheet/status",
            params={"production_date": date.today().isoformat(), "shift_id": shift_a.id, "line_id": line_b.id},
            json={"action": "submit"},
        )
        assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_tds_deduction_rejects_foreign_links_and_return_is_scoped(db_session_integration):
    db = db_session_integration
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    t_b, _u_b, _ = await create_merch_tenant_with_user(db)
    refs = {}
    for t in (t_a, t_b):
        acc = await _account(db, t)
        vendor = Vendor(tenant_id=t.id, vendor_code=f"V{uuid.uuid4().hex[:8]}", name="Vendor")
        db.add(vendor)
        await db.flush()
        pl = PartyLedger(tenant_id=t.id, party_type="VENDOR", vendor_id=vendor.id, ledger_account_id=acc.id)
        sec = TdsSection(tenant_id=t.id, section_code=f"S{uuid.uuid4().hex[:5]}", tds_rate=Decimal("2"))
        db.add_all([pl, sec])
        await db.flush()
        refs[t.id] = (pl, sec)
    pl_a, sec_a = refs[t_a.id]
    pl_b, sec_b = refs[t_b.id]
    for bad in ({"party_ledger_id": pl_a.id, "tds_section_id": sec_b.id}, {"party_ledger_id": pl_b.id, "tds_section_id": sec_a.id}):
        with pytest.raises(HTTPException) as exc:
            await tds_service.create_tds_deduction_record(
                db, t_b.id, taxable_amount=Decimal("100"), tds_amount=Decimal("2"), **bad
            )
        assert exc.value.status_code == 400
    assert await _count(db, TdsDeduction, TdsDeduction.tenant_id == t_b.id) == 0

    await tds_service.create_tds_deduction_record(
        db, t_b.id, party_ledger_id=pl_b.id, tds_section_id=sec_b.id, taxable_amount=Decimal("100"), tds_amount=Decimal("2")
    )
    # A legacy row linked to another tenant's section must not appear in the return.
    db.add(
        TdsDeduction(
            tenant_id=t_b.id, party_ledger_id=pl_b.id, tds_section_id=sec_a.id, taxable_amount=Decimal("50"),
            tds_amount=Decimal("1"), net_payment=Decimal("49"), status="PENDING", deduction_date=date.today(),
        )
    )
    await db.flush()
    today = date.today()
    ret = await tds_service.generate_tds_return(db, t_b.id, year=today.year, quarter=(today.month - 1) // 3 + 1)
    assert len(ret["rows"]) == 1, ret
