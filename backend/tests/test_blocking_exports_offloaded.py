"""File exports that now build their bytes in a worker thread still return valid files, and the new caps work.

Covers: HR employee Excel export/import (+ 5 MB upload cap), bulk ID-card ZIP, cutting barcode PDF
(+ label cap), consumption-reconciliation Excel exports and the wastage Excel export.

Run: docker compose exec backend pytest tests/test_blocking_exports_offloaded.py -q
"""

from __future__ import annotations

import io
import uuid
import zipfile
from datetime import date

import pytest
from openpyxl import Workbook, load_workbook
from sqlalchemy import select

from app.common.tenant_feature_keys import AUTO_DOCUMENT_GENERATION_ENABLED
from app.models import Department, Designation, Employee, HrSection
from app.models.production import CuttingBundle, CutTicket, LayPlan, MarkerPlan
from app.modules.hr import service as hr_service
from app.modules.production import cutting_router
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.test_perf_round2_ledger_wastage import _seed_wastage_order

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _load_xlsx(content: bytes):
    assert content
    return load_workbook(io.BytesIO(content)).active


async def _seed_hr(db, tenant):
    slug = uuid.uuid4().hex[:6]
    dept = Department(tenant_id=tenant.id, code=f"D{slug}", name="Sewing")
    desig = Designation(tenant_id=tenant.id, code=f"G{slug}", title="Operator")
    db.add_all([dept, desig])
    await db.flush()
    emps = [
        Employee(tenant_id=tenant.id, employee_code=f"E{n}{slug}", first_name=f"Worker{n}", last_name="One",
                 department_id=dept.id if n else None, designation_id=desig.id, date_of_birth=date(1990, 1, 1),
                 joining_date=date(2024, 1, n + 1), is_active=True, blood_group="O+")
        for n in range(3)
    ]
    db.add_all(emps)
    await db.flush()
    return dept, desig, emps


@pytest.mark.asyncio
async def test_employee_export_returns_valid_xlsx(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    dept, desig, emps = await _seed_hr(db, tenant)
    await _seed_hr(db, other)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/hr/employees/export")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith(XLSX)
    ws = _load_xlsx(r.content)
    rows = list(ws.iter_rows(values_only=True))
    assert list(rows[0]) == hr_service.EMPLOYEE_EXCEL_HEADERS
    assert [row[0] for row in rows[1:]] == sorted(e.employee_code for e in emps)
    first = rows[1]
    assert first[1] == "Worker0" and first[5] in (None, "") and first[6] == desig.id
    assert first[9] == "2024-01-01" and first[11] == "Y" and first[12] == "1990-01-01"


def _import_file(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(hr_service.EMPLOYEE_EXCEL_HEADERS)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_employee_import_preloaded_lookups(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    dept, desig, emps = await _seed_hr(db, tenant)
    foreign_dept, _fd, _fe = await _seed_hr(db, other)
    section = HrSection(tenant_id=tenant.id, code=f"S{uuid.uuid4().hex[:6]}", name="Line A")
    db.add(section)
    await db.flush()
    new_code = f"N{uuid.uuid4().hex[:8]}"
    content = _import_file(
        [
            # Update an existing employee: foreign department -> None, valid designation + section kept.
            [emps[1].employee_code, "Renamed", "", "", "", foreign_dept.id, desig.id, section.id, "STAFF",
             "2024-02-01", "FULL_TIME", "Y", "1991-05-05"],
            # New employee with valid lookups.
            [new_code, "Fresh", "Hire", "f@e.com", "", dept.id, 999999999, "", "", "", "", "N", "1990-01-01"],
            # Bad id cell -> row error, nothing else breaks.
            [f"B{new_code}", "Broken", "", "", "", "abc", "", "", "", "", "", "Y", "1990-01-01"],
            [None, "No code"],
            [],
        ]
    )
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/hr/employees/import", files={"file": ("emps.xlsx", content, XLSX)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["created"], body["updated"]) == (1, 1), body
    assert any(e.startswith("Row 4:") for e in body["errors"]), body
    assert any(e.startswith("Row 5:") and "employee_code" in e for e in body["errors"]), body

    updated = (await db.execute(select(Employee).where(Employee.id == emps[1].id))).scalar_one()
    await db.refresh(updated)
    assert updated.first_name == "Renamed"
    assert updated.department_id is None
    assert (updated.designation_id, updated.section_id) == (desig.id, section.id)
    created = (
        await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.employee_code == new_code))
    ).scalar_one()
    assert (created.department_id, created.designation_id, created.is_active) == (dept.id, None, False)


@pytest.mark.asyncio
async def test_employee_import_rejects_oversized_file(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    too_big = b"x" * (hr_service.EMPLOYEE_IMPORT_MAX_BYTES + 1)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/hr/employees/import", files={"file": ("big.xlsx", too_big, XLSX)})
    assert r.status_code == 413, r.text
    assert "too large" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_bulk_id_cards_zip(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {AUTO_DOCUMENT_GENERATION_ENABLED: True}
    other, _ = await seed_tenant_admin(db)
    _dept, _desig, emps = await _seed_hr(db, tenant)
    await _seed_hr(db, other)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/hr/employees/bulk-documents/id-cards")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        names = sorted(zf.namelist())
        assert names == sorted(f"id-card-{e.employee_code}.pdf" for e in emps)
        for name in names:
            assert zf.read(name).startswith(b"%PDF")


async def _seed_bundles(db, tenant, count: int) -> int:
    slug = uuid.uuid4().hex[:6]
    marker = MarkerPlan(tenant_id=tenant.id, marker_code=f"MK{slug}", status="draft")
    db.add(marker)
    await db.flush()
    lay = LayPlan(tenant_id=tenant.id, marker_plan_id=marker.id, lay_code=f"L{slug}")
    db.add(lay)
    await db.flush()
    ticket = CutTicket(tenant_id=tenant.id, lay_plan_id=lay.id, ticket_code=f"CT{slug}")
    db.add(ticket)
    await db.flush()
    db.add_all(
        [
            CuttingBundle(tenant_id=tenant.id, cut_ticket_id=ticket.id, bundle_no=f"B-{n:04d}",
                          barcode=f"{slug}-{n:04d}", qty_in_bundle=10 + n)
            for n in range(count)
        ]
    )
    await db.flush()
    return ticket.id


@pytest.mark.asyncio
async def test_cutting_barcode_pdf_and_label_cap(db_session_integration, monkeypatch):
    pytest.importorskip("barcode")
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    ticket_id = await _seed_bundles(db, tenant, 7)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/production/cutting/bundles/barcode-pdf/{ticket_id}")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF") and len(r.content) > 1000

        monkeypatch.setattr(cutting_router, "MAX_BARCODE_PDF_LABELS", 5)
        r = await ac.get(f"/api/v1/production/cutting/bundles/barcode-pdf/{ticket_id}")
        assert r.status_code == 400, r.text
        assert "limit 5" in r.json()["detail"]

        r = await ac.get("/api/v1/production/cutting/bundles/barcode-pdf/999999999")
        assert r.status_code == 404


def test_barcode_cap_constant():
    assert cutting_router.MAX_BARCODE_PDF_LABELS == 2000


@pytest.mark.asyncio
async def test_consumption_recon_and_wastage_exports(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    order = await _seed_wastage_order(db, tenant, other)
    foreign = await _seed_wastage_order(db, other, tenant)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/merch/consumption-reconciliation/{order.id}/export")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith(XLSX)
        assert order.order_code in r.headers["content-disposition"]
        ws = _load_xlsx(r.content)
        assert ws.title == "Reconciliation"
        assert ws.cell(1, 2).value == order.order_code

        r = await ac.get("/api/v1/merch/consumption-reconciliation/dashboard/export")
        assert r.status_code == 200, r.text
        ws = _load_xlsx(r.content)
        assert ws.title == "Summary"
        assert ws.cell(1, 1).value == "Consumption reconciliation dashboard"

        r = await ac.get("/api/v1/merch/reports/wastage/export", params={"order_id": order.id})
        assert r.status_code == 200, r.text
        ws = _load_xlsx(r.content)
        rows = list(ws.iter_rows(values_only=True))
        assert rows[0][0] == "Order ID"
        assert len(rows) > 1 and all(row[1] == order.order_code for row in rows[1:])

        r = await ac.get(f"/api/v1/merch/consumption-reconciliation/{foreign.id}/export")
        assert r.status_code == 404
