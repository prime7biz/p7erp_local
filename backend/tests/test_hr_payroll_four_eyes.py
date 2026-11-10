"""Payroll run controls: bank file only after approval (KI-08) and the optional four-eyes rule (KI-09).

- Bank advice CSV: APPROVED / POSTED only; other statuses 400; another tenant's run 404.
- Tenant flag ``payroll_four_eyes_approval`` (default off): the user who finalized a run (or created it,
  when no finalizer is recorded) cannot approve it, through either approve endpoint. Rejecting stays open.
- Settings -> Configuration refuses to switch the rule on with fewer than 2 admin / manager users, and
  writes an audit entry when it changes.

Run: docker compose exec backend pytest tests/test_hr_payroll_four_eyes.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AuditLog, Employee, PayrollApproval, PayrollPeriod, PayrollRun, PayrollRunLine, User
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

PAY = "/api/v1/hr/payroll"
FLAG = "payroll_four_eyes_approval"


async def _tenant(db, *, flags: dict | None = None, role_name: str = "manager"):
    tenant, maker, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = role_name
    tenant.feature_flags = dict(flags or {})
    checker = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"chk{uuid.uuid4().hex[:8]}",
        email=f"chk{uuid.uuid4().hex[:8]}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(checker)
    await db.commit()
    return tenant, maker, checker, role


async def _run(db, tenant, *, status: str, finalized_by: int | None, created_by: int | None) -> PayrollRun:
    period = PayrollPeriod(
        tenant_id=tenant.id,
        period_code=f"P{uuid.uuid4().hex[:6]}",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 31),
        payment_date=date(2026, 11, 7),
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        run_code=f"R{uuid.uuid4().hex[:6]}",
        run_date=date(2026, 10, 31),
        status=status,
        finalized_by=finalized_by,
        created_by=created_by,
    )
    db.add(run)
    await db.flush()
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker")
    db.add(emp)
    await db.flush()
    db.add(
        PayrollRunLine(
            tenant_id=tenant.id,
            run_id=run.id,
            employee_id=emp.id,
            gross_pay=Decimal("12500.00"),
            deductions=Decimal("0"),
            net_pay=Decimal("12500.00"),
        )
    )
    await db.commit()
    return run


# ---------- KI-08: bank file ----------


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["DRAFT", "CHECKED", "FINALIZED", "REJECTED"])
async def test_bank_file_refused_before_approval(db_session_integration, status):
    db = db_session_integration
    tenant, maker, _checker, _ = await _tenant(db)
    run = await _run(db, tenant, status=status, finalized_by=maker.id, created_by=maker.id)
    async with api_client(db, tenant, maker) as c:
        r = await c.get(f"{PAY}/runs/{run.id}/bank-file")
    assert r.status_code == 400
    assert "after the run is approved" in r.json()["detail"]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["APPROVED", "POSTED"])
async def test_bank_file_allowed_after_approval(db_session_integration, status):
    db = db_session_integration
    tenant, maker, _checker, _ = await _tenant(db)
    run = await _run(db, tenant, status=status, finalized_by=maker.id, created_by=maker.id)
    async with api_client(db, tenant, maker) as c:
        r = await c.get(f"{PAY}/runs/{run.id}/bank-file")
    assert r.status_code == 200
    assert r.text.splitlines()[0] == "employee_code,net_pay,currency"
    _code, net, currency = r.text.splitlines()[1].split(",")
    assert Decimal(net) == Decimal("12500") and currency == "BDT"


@pytest.mark.asyncio
async def test_bank_file_other_tenant_run_is_not_found(db_session_integration):
    db = db_session_integration
    tenant, maker, _checker, _ = await _tenant(db)
    other, other_user, _c, _ = await _tenant(db)
    foreign = await _run(db, other, status="POSTED", finalized_by=other_user.id, created_by=other_user.id)
    async with api_client(db, tenant, maker) as c:
        r = await c.get(f"{PAY}/runs/{foreign.id}/bank-file")
    assert r.status_code == 404


# ---------- KI-09: four-eyes approval ----------


@pytest.mark.asyncio
async def test_flag_off_finalizer_may_still_approve(db_session_integration):
    db = db_session_integration
    tenant, maker, _checker, _ = await _tenant(db)
    run = await _run(db, tenant, status="FINALIZED", finalized_by=maker.id, created_by=maker.id)
    async with api_client(db, tenant, maker) as c:
        r = await c.post(f"{PAY}/runs/{run.id}/approve", json={})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["FINALIZED", "CHECKED"])
async def test_flag_on_finalizer_cannot_approve_but_other_manager_can(db_session_integration, status):
    db = db_session_integration
    tenant, maker, checker, _ = await _tenant(db, flags={FLAG: True})
    run = await _run(db, tenant, status=status, finalized_by=maker.id, created_by=maker.id)
    async with api_client(db, tenant, maker) as c:
        r = await c.post(f"{PAY}/runs/{run.id}/approve", json={})
    assert r.status_code == 403
    assert "Four-eyes" in r.json()["detail"]
    await db.refresh(run)
    assert run.status == status

    async with api_client(db, tenant, checker) as c:
        ok = await c.post(f"{PAY}/runs/{run.id}/approve", json={})
        assert ok.status_code == 200, ok.text
        assert ok.json()["status"] == "APPROVED"
        again = await c.post(f"{PAY}/runs/{run.id}/approve", json={})
        assert again.status_code == 400


@pytest.mark.asyncio
async def test_flag_on_falls_back_to_creator_when_no_finalizer(db_session_integration):
    db = db_session_integration
    tenant, maker, checker, _ = await _tenant(db, flags={FLAG: True})
    run = await _run(db, tenant, status="CHECKED", finalized_by=None, created_by=maker.id)
    async with api_client(db, tenant, maker) as c:
        assert (await c.post(f"{PAY}/runs/{run.id}/approve", json={})).status_code == 403
    async with api_client(db, tenant, checker) as c:
        assert (await c.post(f"{PAY}/runs/{run.id}/approve", json={})).status_code == 200


@pytest.mark.asyncio
async def test_flag_on_no_maker_recorded_does_not_block(db_session_integration):
    db = db_session_integration
    tenant, maker, _checker, _ = await _tenant(db, flags={FLAG: True})
    run = await _run(db, tenant, status="FINALIZED", finalized_by=None, created_by=None)
    async with api_client(db, tenant, maker) as c:
        assert (await c.post(f"{PAY}/runs/{run.id}/approve", json={})).status_code == 200


@pytest.mark.asyncio
async def test_flag_on_blocks_the_approval_decision_endpoint_too(db_session_integration):
    db = db_session_integration
    tenant, maker, checker, _ = await _tenant(db, flags={FLAG: True})
    run = await _run(db, tenant, status="FINALIZED", finalized_by=maker.id, created_by=maker.id)
    approval = PayrollApproval(tenant_id=tenant.id, payroll_run_id=run.id, action="PENDING", action_by=maker.id)
    db.add(approval)
    await db.commit()

    async with api_client(db, tenant, maker) as c:
        r = await c.patch(f"{PAY}/approvals/{approval.id}/decision", json={"decision": "APPROVED"})
        assert r.status_code == 403
        # Sending a run back is not an approval; the finalizer may still reject it.
        rej = await c.patch(f"{PAY}/approvals/{approval.id}/decision", json={"decision": "REJECTED"})
        assert rej.status_code == 200, rej.text
    await db.refresh(run)
    assert run.status == "REJECTED"


@pytest.mark.asyncio
async def test_flag_on_other_tenant_run_is_not_found(db_session_integration):
    db = db_session_integration
    tenant, _maker, checker, _ = await _tenant(db, flags={FLAG: True})
    other, other_user, _c, _ = await _tenant(db, flags={FLAG: True})
    foreign = await _run(db, other, status="FINALIZED", finalized_by=other_user.id, created_by=other_user.id)
    async with api_client(db, tenant, checker) as c:
        assert (await c.post(f"{PAY}/runs/{foreign.id}/approve", json={})).status_code == 404
    await db.refresh(foreign)
    assert foreign.status == "FINALIZED"


# ---------- Settings guard ----------


def _config_body(flags: dict) -> dict:
    return {"company_name": "Four Eyes Co", "tenant_type": "manufacturer", "feature_flags": flags}


@pytest.mark.asyncio
async def test_settings_refuses_four_eyes_with_a_single_approver(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "admin"
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put("/api/v1/settings/config", json=_config_body({FLAG: True}))
    assert r.status_code == 400
    assert "at least 2" in r.json()["detail"]
    await db.refresh(tenant)
    assert (tenant.feature_flags or {}).get(FLAG) is not True


@pytest.mark.asyncio
async def test_settings_saves_four_eyes_with_two_approvers_and_audits(db_session_integration):
    db = db_session_integration
    tenant, admin, _checker, role = await _tenant(db, role_name="admin")
    role.permissions = {"*": True}
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put("/api/v1/settings/config", json=_config_body({FLAG: True}))
        assert r.status_code == 200, r.text
        assert r.json()["feature_flags"][FLAG] is True
        got = await c.get("/api/v1/settings/config")
        assert got.json()["feature_flags"][FLAG] is True
        off = await c.put("/api/v1/settings/config", json=_config_body({FLAG: False}))
        assert off.status_code == 200
    await db.refresh(tenant)
    assert tenant.feature_flags[FLAG] is False
    logs = (
        await db.execute(
            select(AuditLog.details).where(
                AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.payroll_four_eyes_approval"
            )
        )
    ).scalars().all()
    assert any("enabled" in (d or "") for d in logs)
    assert any("disabled" in (d or "") for d in logs)
