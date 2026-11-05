"""Roadmap item 10: Excel (.xlsx) import for masters (data migration) and chart of accounts.

Run: docker compose exec backend pytest tests/test_benchmark_excel_import.py -q
"""

from __future__ import annotations

import io

import pytest
from openpyxl import Workbook
from sqlalchemy import select

from app.common.spreadsheet_upload import upload_to_csv_text
from app.models.inventory import Vendor
from tests.benchmark_fixtures import api_client, seed_tenant_admin


def _xlsx(rows: list[list[object]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_xlsx_converted_to_csv_text():
    raw = _xlsx([["code", "name", "qty"], ["V-1", "Alpha Mills", 12.0], [None, None, None], ["V-2", "Beta, Ltd", 3.5]])
    text = upload_to_csv_text("vendors.xlsx", raw)
    assert text.splitlines() == ["code,name,qty", "V-1,Alpha Mills,12", 'V-2,"Beta, Ltd",3.5']


def test_csv_still_passes_through():
    assert upload_to_csv_text("x.csv", "\ufeffcode,name\nA,B\n".encode("utf-8")) == "code,name\nA,B\n"


def test_broken_xlsx_is_a_clear_400():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        upload_to_csv_text("bad.xlsx", b"PK\x03\x04 not really a workbook")
    assert e.value.status_code == 400


@pytest.mark.asyncio
async def test_vendor_master_imported_from_excel(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    await db.commit()
    raw = _xlsx([["code", "name"], ["XL-V1", "Excel Mills"], ["XL-V2", "Sheet Trims"]])
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(
            "/api/v1/data-migration/import",
            data={"entity_type": "vendors", "dry_run": "false"},
            files={"file": ("vendors.xlsx", raw, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
    assert r.status_code in (200, 202), r.text
    if r.status_code == 200:
        assert not r.json().get("errors"), r.json()
        codes = {v.vendor_code for v in (await db.execute(select(Vendor).where(Vendor.tenant_id == tenant.id))).scalars()}
        assert {"XL-V1", "XL-V2"} <= codes
