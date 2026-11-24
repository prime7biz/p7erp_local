"""Inbound Job Work (CMT) — flag, tenant isolation, zero-value materials, bill idempotency.

Run: docker compose exec backend pytest tests/test_inbound_job_work.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import create_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import Role, StockMovement, Tenant, User
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.customer import Customer
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.job_work import JobWorkMaterialLedger
from app.models.tenant import TenantType
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

API = "/api/v1/job-work"


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {"inbound_job_work_v1": True} if flag_on else {}
    tenant = Tenant(
        name=f"JobWork {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"JW{slug}"[:18].upper(),
        feature_flags=flags,
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions={"*": True, "production.access": True},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"jw_{slug}@example.com",
        username=f"jw_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()

    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C{slug[:8]}",
        name=f"Principal {slug}",
        status="active",
    )
    db.add(customer)
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug[:6]}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug[:6]}", name="Kg")
    db.add(cat)
    db.add(unit)
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{slug[:8]}",
        name="JW fabric",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("0"),
        avg_cost=Decimal("0"),
    )
    db.add(item)
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name="FY",
            start_date=date(2020, 1, 1),
            end_date=date(2035, 12, 31),
            is_closed=False,
        )
    )
    await seed_tenant_system_coa(db, tenant.id)
    await db.commit()
    return tenant, user, customer, item


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    uid = int(user.id)
    tid = int(tenant.id)
    sv = int(user.auth_session_version or 0)
    token = create_access_token(uid, tenant_id=tid, session_version=sv)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tid)}


@pytest.mark.asyncio
async def test_flag_off_returns_404(db_session_integration):
    db = db_session_integration
    tenant, user, _c, _i = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(f"{API}/contracts", headers=_headers(user, tenant))
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    t1, u1, c1, i1 = await _seed(db, flag_on=True)
    t2, u2, _c2, _i2 = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=_headers(u1, t1),
                json={
                    "customer_id": c1.id,
                    "cm_rate": "25",
                    "do_sewing": True,
                    "deliverables": [{"style_ref": "S1", "qty_ordered": "100"}],
                    "materials": [{"item_id": i1.id, "consumption_per_unit": "0.2", "qty_planned": "20"}],
                },
            )
            assert created.status_code == 201, created.text
            cid = created.json()["id"]
            denied = await client.get(f"{API}/contracts/{cid}", headers=_headers(u2, t2))
            assert denied.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_receive_zero_value_no_stock_movement(db_session_integration):
    db = db_session_integration
    tenant, user, customer, item = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        headers = _headers(user, tenant)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "cm_rate": "10",
                    "do_cutting": True,
                    "deliverables": [{"qty_ordered": "50"}],
                    "materials": [{"item_id": item.id, "consumption_per_unit": "1", "qty_planned": "50"}],
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            cid = body["id"]
            mid = body["materials"][0]["id"]
            assert (await client.post(f"{API}/contracts/{cid}/confirm", headers=headers)).status_code == 200
            recv = await client.post(
                f"{API}/contracts/{cid}/materials/receive",
                headers=headers,
                json={"material_id": mid, "qty": "50"},
            )
            assert recv.status_code == 200, recv.text
            assert recv.json()["materials"][0]["qty_received"] == "50.0000"
            over = await client.post(
                f"{API}/contracts/{cid}/materials/consume",
                headers=headers,
                json={"material_id": mid, "qty": "51"},
            )
            assert over.status_code == 400

        sm = (await db.execute(select(StockMovement).where(StockMovement.tenant_id == tenant.id))).scalars().all()
        assert sm == []
        ledger = (
            await db.execute(
                select(JobWorkMaterialLedger).where(
                    JobWorkMaterialLedger.tenant_id == tenant.id,
                    JobWorkMaterialLedger.contract_id == cid,
                )
            )
        ).scalars().all()
        assert len(ledger) == 1
        assert ledger[0].movement_kind == "RECEIVE"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bill_permission_denied_for_viewer(db_session_integration):
    """job_work.bill is fail-closed: non-admin without explicit true gets 403."""
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"JWView {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"JV{slug}"[:18].upper(),
        feature_flags={"inbound_job_work_v1": True},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="viewer",
        display_name="Viewer",
        permissions={"production.access": True, "job_work.view": True, "job_work.manage": True},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"jv_{slug}@example.com",
        username=f"jv_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C{slug[:8]}",
        name="Principal",
        status="active",
    )
    db.add(customer)
    await db.commit()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        headers = _headers(user, tenant)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "cm_rate": "10",
                    "do_sewing": True,
                    "deliverables": [{"qty_ordered": "1"}],
                },
            )
            assert created.status_code == 201, created.text
            cid = created.json()["id"]
            assert (await client.post(f"{API}/contracts/{cid}/confirm", headers=headers)).status_code == 200
            bill = await client.post(
                f"{API}/contracts/{cid}/bills",
                headers=headers,
                json={"request_id": "denied-1", "qty_billed": "1"},
            )
            assert bill.status_code == 403
            close = await client.post(f"{API}/contracts/{cid}/close", headers=headers)
            assert close.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bill_idempotent_and_close_blocked_by_ar(db_session_integration):
    db = db_session_integration
    tenant, user, customer, item = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        headers = _headers(user, tenant)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "cm_rate": "20",
                    "do_finishing": True,
                    "deliverables": [{"style_ref": "A", "qty_ordered": "10"}],
                    "materials": [{"item_id": item.id, "consumption_per_unit": "0", "qty_planned": "0"}],
                },
            )
            assert created.status_code == 201, created.text
            detail = created.json()
            cid = detail["id"]
            did = detail["deliverables"][0]["id"]
            assert (await client.post(f"{API}/contracts/{cid}/confirm", headers=headers)).status_code == 200
            deliv = await client.post(
                f"{API}/contracts/{cid}/deliveries",
                headers=headers,
                json={"lines": [{"deliverable_id": did, "qty_delivered": "10", "qty_rejected": "1"}]},
            )
            assert deliv.status_code == 201, deliv.text
            assert deliv.json()["qty_accepted"] == "9.0000"

            preview = await client.get(f"{API}/contracts/{cid}/close-preview", headers=headers)
            assert preview.status_code == 200
            assert preview.json()["can_close"] is False

            bill1 = await client.post(
                f"{API}/contracts/{cid}/bills",
                headers=headers,
                json={"request_id": "idem-1", "qty_billed": "9"},
            )
            assert bill1.status_code == 201, bill1.text
            assert bill1.json()["gross_amount"] == "180.00"
            bill2 = await client.post(
                f"{API}/contracts/{cid}/bills",
                headers=headers,
                json={"request_id": "idem-1", "qty_billed": "9"},
            )
            assert bill2.status_code == 201
            assert bill2.json()["id"] == bill1.json()["id"]

            preview2 = await client.get(f"{API}/contracts/{cid}/close-preview", headers=headers)
            assert preview2.json()["can_close"] is False
            assert any("AR" in b or "Open" in b for b in preview2.json()["blockers"])

        vouchers = (
            await db.execute(
                select(Voucher).where(Voucher.tenant_id == tenant.id, Voucher.source_module == "JOB_WORK")
            )
        ).scalars().all()
        assert len(vouchers) == 1
        lines = (
            await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == vouchers[0].id))
        ).scalars().all()
        debits = sum((Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "DEBIT"), Decimal("0"))
        credits = sum((Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "CREDIT"), Decimal("0"))
        assert debits == credits
        assert debits == Decimal("180.00")
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_close_blocked_while_materials_remain(db_session_integration):
    db = db_session_integration
    tenant, user, customer, item = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        transport = ASGITransport(app=app)
        headers = _headers(user, tenant)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                f"{API}/contracts",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "cm_rate": "5",
                    "do_cutting": True,
                    "deliverables": [{"qty_ordered": "10"}],
                    "materials": [{"item_id": item.id, "consumption_per_unit": "1", "qty_planned": "10"}],
                },
            )
            assert created.status_code == 201, created.text
            body = created.json()
            cid = body["id"]
            mid = body["materials"][0]["id"]
            assert (await client.post(f"{API}/contracts/{cid}/confirm", headers=headers)).status_code == 200
            assert (
                await client.post(
                    f"{API}/contracts/{cid}/materials/receive",
                    headers=headers,
                    json={"material_id": mid, "qty": "10"},
                )
            ).status_code == 200
            # Receive only — remaining > 0 must block close
            preview = await client.get(f"{API}/contracts/{cid}/close-preview", headers=headers)
            assert preview.status_code == 200
            assert preview.json()["can_close"] is False
            assert any("material" in b.lower() or "remaining" in b.lower() for b in preview.json()["blockers"])
            close = await client.post(f"{API}/contracts/{cid}/close", headers=headers)
            assert close.status_code in (400, 409)

            # No inventory / finance vouchers from material receive
            vouchers = (await db.execute(select(Voucher).where(Voucher.tenant_id == tenant.id))).scalars().all()
            assert vouchers == []
    finally:
        app.dependency_overrides.pop(get_db, None)
