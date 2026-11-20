"""Regression: employee import stops on quota without losing prior rows; exception decide is race-safe.

Run: docker compose exec -T backend pytest tests/test_hr_manpower_import_and_exception_concurrency.py -q
"""

from __future__ import annotations

import asyncio
import uuid
from io import BytesIO

import pytest
from fastapi import UploadFile
from openpyxl import Workbook
from sqlalchemy import select

from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_manpower import HrManpowerQuotaException
from app.modules.hr.service import import_employees_excel
from app.modules.hr_manpower import exception_service
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.test_hr_manpower_quota_enforcement import APPROVE, _set_quota, _setup, _user

MP = "/api/v1/hr/manpower"


def _xlsx(rows: list[list]) -> UploadFile:
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "employee_code",
            "first_name",
            "last_name",
            "email",
            "phone",
            "department_id",
            "designation_id",
            "section_id",
            "employee_category",
            "joining_date",
            "employment_type",
            "is_active",
            "date_of_birth",
        ]
    )
    for row in rows:
        ws.append(row)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return UploadFile(filename="emps.xlsx", file=buf)


@pytest.mark.asyncio
async def test_import_stops_on_quota_and_keeps_prior_rows(db_session_integration):
    db = db_session_integration
    tenant, maker, _approver, dept, desig = await _setup(db)
    dept_id, desig_id = dept.id, desig.id

    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, dept_id, desig_id, 1)

    await db.refresh(tenant)
    await db.refresh(maker)

    codes = [f"B1{uuid.uuid4().hex[:6]}{i}" for i in range(3)]
    upload = _xlsx(
        [
            [codes[0], "First", "", "", "", dept_id, desig_id, "", "WORKER", "", "", "Y", ""],
            [codes[1], "Second", "", "", "", dept_id, desig_id, "", "WORKER", "", "", "Y", ""],
            [codes[2], "Third", "", "", "", dept_id, desig_id, "", "WORKER", "", "", "Y", ""],
        ]
    )
    result = await import_employees_excel(db, tenant, maker, upload)

    found = {}
    for code in codes:
        emp = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant.id, Employee.employee_code == code)
            )
        ).scalar_one_or_none()
        found[code] = emp is not None

    assert found[codes[0]] is True
    assert found[codes[1]] is False
    assert found[codes[2]] is False
    assert any("import stopped" in e for e in result["errors"])
    assert result["created"] == 1


@pytest.mark.asyncio
async def test_concurrent_exception_decide_only_one_wins(real_db):
    factory, track = real_db

    async with factory() as db:
        tenant, maker, approver, dept, desig = await _setup(db)
        track(tenant.id)
        approver2 = await _user(
            db,
            tenant,
            "approver2",
            {"hr.access": True, "hr.manpower.read": True, APPROVE: True},
        )
        await db.commit()
        tenant_id = tenant.id
        maker_id = maker.id
        approver_id = approver.id
        approver2_id = approver2.id
        dept_id, desig_id = dept.id, desig.id

    async with factory() as db:
        tenant = await db.get(Tenant, tenant_id)
        maker = await db.get(User, maker_id)
        assert tenant is not None and maker is not None
        async with api_client(db, tenant, maker) as c:
            await _set_quota(c, dept_id, desig_id, 0)
            exc = await c.post(
                f"{MP}/exceptions",
                json={
                    "department_id": dept_id,
                    "designation_id": desig_id,
                    "extra_slots": 1,
                    "reason": "concurrent decide regression",
                    "request_id": f"req-{uuid.uuid4().hex[:12]}",
                },
            )
            assert exc.status_code == 201, exc.text
            exc_id = exc.json()["id"]

    async def _decide(user_id: int, decision: str) -> dict:
        async with factory() as s:
            user = await s.get(User, user_id)
            assert user is not None
            try:
                out = await exception_service.decide_exception(
                    s,
                    tenant_id=tenant_id,
                    user=user,
                    exception_id=exc_id,
                    decision=decision,
                    note=f"{decision}-by-{user_id}",
                )
                return {"ok": True, "status": out["status"], "user_id": user_id}
            except Exception as e:  # noqa: BLE001
                return {
                    "ok": False,
                    "error": type(e).__name__,
                    "detail": str(getattr(e, "detail", e))[:200],
                    "user_id": user_id,
                }

    r1, r2 = await asyncio.gather(
        _decide(approver_id, "APPROVE"),
        _decide(approver2_id, "REJECT"),
    )

    async with factory() as s:
        final = await s.get(HrManpowerQuotaException, exc_id)
        assert final is not None
        final_status = final.status

    assert bool(r1.get("ok")) != bool(r2.get("ok")), f"expected one win / one 409: {r1} {r2}"
    loser = r2 if r1.get("ok") else r1
    assert loser.get("error") == "HTTPException"
    assert "already" in str(loser.get("detail", "")).lower()
    assert final_status in ("APPROVED", "REJECTED")
