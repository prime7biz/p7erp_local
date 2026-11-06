"""Payroll documents: frozen snapshot, department-wise salary sheets with an Unassigned section,
top sheet totals reconciled to the run, wage register, private slips, acknowledgements, privacy,
tenant isolation and invalidation on rejection.

Run: docker compose exec backend pytest tests/test_hr_salary_register.py -q
"""

from __future__ import annotations

import io
import zipfile
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.hr import Department, Employee
from app.models.hr_payroll import PayrollPayslip, PayrollRunLine, PayrollStructure
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

BD = "/api/v1/hr/localization/bd-rmg"
PAY = "/api/v1/hr/payroll"


async def _approved_run(db):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    tenant.feature_flags = {"payroll_auto_calculate_enabled": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{BD}/apply")).status_code == 200
    sewing = Department(tenant_id=tenant.id, code="SEW", name="Sewing")
    cutting = Department(tenant_id=tenant.id, code="CUT", name="Cutting")
    db.add_all([sewing, cutting])
    await db.flush()
    g4 = (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))).scalar_one()
    g2 = (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G2"))).scalar_one()
    people = [("EMP-0000001", sewing.id, g4, "6700"), ("EMP-0000002", sewing.id, g2, "7882"), ("EMP-0000003", cutting.id, g4, "6700"), ("EMP-0000004", None, g4, "6700")]
    emps = []
    for code, dept, st, basic in people:
        e = Employee(tenant_id=tenant.id, employee_code=code, first_name=code[-1], department_id=dept, joining_date=date(2024, 1, 1), is_active=True)
        db.add(e)
        emps.append((e, st, basic))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        for e, st, basic in emps:
            assert (await c.post(f"{PAY}/assignments", json={"employee_id": e.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": basic})).status_code == 201
        period = (await c.post(f"{PAY}/periods", json={"period_code": "2026-10", "start_date": "2026-10-01", "end_date": "2026-10-31", "payment_date": "2026-11-07"})).json()
        run = (await c.post(f"{PAY}/runs", json={"period_id": period["id"], "run_date": "2026-10-31"})).json()
        assert (await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/apply", json={})).status_code == 200
        assert (await c.post(f"{PAY}/runs/{run['id']}/finalize")).status_code == 200
        assert (await c.post(f"{PAY}/runs/{run['id']}/approve", json={})).status_code == 200
    return tenant, user, role, run


@pytest.mark.asyncio
async def test_department_sheets_top_sheet_and_reconciliation(db_session_integration):
    db = db_session_integration
    tenant, user, _role, run = await _approved_run(db)
    async with api_client(db, tenant, user) as c:
        assert (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).status_code == 409  # not frozen yet
        snap = await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")
        assert snap.status_code == 201 and snap.json()["reconciled"] is True and snap.json()["employees"] == 4
        again = await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")
        assert again.json()["id"] == snap.json()["id"]
        body = (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).json()
        names = [s["department"] for s in body["sections"]]
        assert names == ["Cutting", "Sewing", "Unassigned"]
        sewing = body["sections"][1]
        assert sewing["subtotal"]["employees"] == 2
        assert Decimal(sewing["subtotal"]["gross"]) == Decimal("12500") + Decimal("14273")
        assert {"BD-BASIC", "BD-HRENT", "BD-MEDICAL", "BD-TRANSPORT", "BD-FOOD"} <= set(body["earning_codes"])
        grand = body["top_sheet"]["grand_total"]
        assert grand["employees"] == 4
        assert Decimal(grand["net"]) == sum(Decimal(r["net"]) for r in body["top_sheet"]["rows"])
        assert Decimal(grand["net"]) == Decimal("12500") * 3 + Decimal("14273")
        assert Decimal(grand["components"]["BD-FOOD"]) == Decimal("1250") * 4
        only = (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet", params={"department_id": body["sections"][0]["lines"][0]["department_id"]})).json()
        assert [s["department"] for s in only["sections"]] == ["Cutting"]
        pdf = await c.get(f"{PAY}/runs/{run['id']}/salary-sheet", params={"format": "pdf"})
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF") and "no-store" in pdf.headers["cache-control"]
        reg = await c.get(f"{PAY}/runs/{run['id']}/wage-register.pdf")
        assert reg.status_code == 200 and reg.content.startswith(b"%PDF")
        z = await c.get(f"{PAY}/runs/{run['id']}/payslips.zip")
        assert len(zipfile.ZipFile(io.BytesIO(z.content)).namelist()) == 4


@pytest.mark.asyncio
async def test_snapshot_is_immutable_and_invalidated_on_reject(db_session_integration):
    db = db_session_integration
    tenant, user, _role, run = await _approved_run(db)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")
        before = (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).json()["top_sheet"]["grand_total"]["net"]
        line = (await db.execute(select(PayrollRunLine).where(PayrollRunLine.run_id == run["id"]))).scalars().first()
        line.net_pay = Decimal("1")  # simulated edit behind the snapshot
        await db.commit()
        after = (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).json()["top_sheet"]["grand_total"]["net"]
        assert after == before
        assert (await c.post(f"{PAY}/runs/{run['id']}/reject", json={"note": "fix"})).status_code == 200
        assert (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).status_code == 409


@pytest.mark.asyncio
async def test_generate_payslips_freezes_run_and_slip_uses_frozen_copy(db_session_integration):
    db = db_session_integration
    tenant, user, _role, run = await _approved_run(db)
    async with api_client(db, tenant, user) as c:
        assert (await c.get(f"{PAY}/runs/{run['id']}/document-snapshot")).json() is None
        assert (await c.post(f"{PAY}/runs/{run['id']}/generate-payslips")).status_code == 200
        snap = (await c.get(f"{PAY}/runs/{run['id']}/document-snapshot")).json()
        assert snap and snap["reconciled"] is True and snap["employees"] == 4
        slip = (
            await db.execute(
                select(PayrollPayslip).join(PayrollRunLine, PayrollRunLine.id == PayrollPayslip.payroll_run_line_id)
                .where(PayrollRunLine.run_id == run["id"])
            )
        ).scalars().first()
        pdf = await c.get(f"{PAY}/payslips/{slip.id}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_acknowledgements_by_payment_method(db_session_integration):
    db = db_session_integration
    tenant, user, _role, run = await _approved_run(db)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")
        rows = (await c.get(f"{PAY}/runs/{run['id']}/acknowledgements")).json()
        assert rows["pending"] == 4
        lid = rows["rows"][0]["run_line_id"]
        url = f"{PAY}/runs/{run['id']}/acknowledgements"
        assert (await c.post(url, json={"run_line_id": lid, "payment_method": "CASH"})).status_code == 400
        assert (await c.post(url, json={"run_line_id": rows["rows"][1]["run_line_id"], "payment_method": "MFS"})).status_code == 400
        ok = await c.post(url, json={"run_line_id": lid, "payment_method": "CASH", "signature_collected": True})
        assert ok.status_code == 201 and ok.json()["evidence_type"] == "REVENUE_STAMP_SIGNATURE"
        assert (await c.post(url, json={"run_line_id": lid, "payment_method": "CASH", "signature_collected": True})).status_code == 409
        mfs = await c.post(url, json={"run_line_id": rows["rows"][1]["run_line_id"], "payment_method": "MFS", "payment_reference": "BKASH-TRX-1"})
        assert mfs.json()["evidence_type"] == "MFS_REFERENCE"
        assert (await c.get(url)).json()["pending"] == 2


@pytest.mark.asyncio
async def test_salary_privacy_and_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, role, run = await _approved_run(db)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")
    role.name = "clerk"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        for path in ("salary-sheet", "wage-register.pdf", "payslips.zip", "acknowledgements"):
            assert (await c.get(f"{PAY}/runs/{run['id']}/{path}")).status_code == 403, path
    other, other_user, other_role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other_role.name = "manager"
    await db.commit()
    async with api_client(db, other, other_user) as c:
        assert (await c.get(f"{PAY}/runs/{run['id']}/salary-sheet")).status_code == 404
        assert (await c.post(f"{PAY}/runs/{run['id']}/document-snapshot")).status_code == 404
