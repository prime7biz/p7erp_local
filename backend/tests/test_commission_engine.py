"""Commission engine: money maths, rate resolution, statements, draft voucher, cancel, guards, isolation."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import COMMISSION_ENGINE_ENABLED
from app.database import get_db
from app.main import app
from app.models import Vendor
from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.models.parties import CustomerIntermediary, Intermediary
from app.modules.commission.service import calculate_amounts

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def test_calculate_amounts_percentage_fixed_and_zero():
    a = calculate_amounts(
        shipped_value=Decimal("10000"), shipped_qty=None, rate_type="PERCENTAGE", rate=Decimal("5"),
        tds_rate_pct=Decimal("10"), vds_rate_pct=Decimal("15"),
    )
    assert (a.gross, a.tds, a.vds, a.net) == (Decimal("500.00"), Decimal("50.00"), Decimal("75.00"), Decimal("375.00"))
    f = calculate_amounts(
        shipped_value=Decimal("10000"), shipped_qty=1200, rate_type="FIXED", rate=Decimal("0.05"),
        tds_rate_pct=Decimal("0"), vds_rate_pct=Decimal("0"),
    )
    assert f.gross == Decimal("60.00") and f.net == Decimal("60.00")
    # Fixed-per-piece without a quantity, or a zero rate, produces no commission.
    assert calculate_amounts(
        shipped_value=Decimal("1"), shipped_qty=None, rate_type="FIXED", rate=Decimal("1"),
        tds_rate_pct=Decimal("0"), vds_rate_pct=Decimal("0"),
    ) is None
    assert calculate_amounts(
        shipped_value=Decimal("1000"), shipped_qty=None, rate_type="PERCENTAGE", rate=Decimal("0"),
        tds_rate_pct=Decimal("0"), vds_rate_pct=Decimal("0"),
    ) is None


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


async def _accounts(db, tenant_id: int) -> dict[str, int]:
    group = AccountGroup(tenant_id=tenant_id, name="Test", code=f"G{uuid.uuid4().hex[:5]}", nature="asset")
    db.add(group)
    await db.flush()
    ids = {}
    for i, name in enumerate(["income", "receivable", "expense", "payable", "tds_receivable", "tds_payable", "vds_receivable", "vds_payable"]):
        acc = ChartOfAccount(tenant_id=tenant_id, account_number=f"9{i}{uuid.uuid4().hex[:4]}", name=name, group_id=group.id)
        db.add(acc)
        await db.flush()
        ids[f"{name}_account_id"] = acc.id
    return ids


@pytest.mark.asyncio
async def test_commission_engine_end_to_end(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    factory = Vendor(tenant_id=tenant.id, vendor_code=f"F{uuid.uuid4().hex[:5]}", name="Shanta Garments", is_active=True)
    agent = Intermediary(tenant_id=tenant.id, code=f"A{uuid.uuid4().hex[:5]}", name="Nordic Agent AB", kind="agent")
    db.add_all([factory, agent])
    await db.flush()
    link = CustomerIntermediary(
        tenant_id=tenant.id, customer_id=customer.id, intermediary_id=agent.id, commission_type="PERCENTAGE", commission_value=2
    )
    db.add(link)
    await db.flush()
    order.customer_intermediary_id = link.id
    order.commission_type = None
    order.commission_value = None
    accounts = await _accounts(db, tenant.id)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    factory_id, order_id = factory.id, order.id

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            _as(db, user, tenant)
            assert (await ac.get("/api/v1/commission/rules")).status_code == 403  # flag off
            assert (await ac.get("/api/v1/commission/settings")).json()["enabled"] is False

            tenant.feature_flags = {**(tenant.feature_flags or {}), COMMISSION_ENGINE_ENABLED: True}
            await db.commit()

            r = await ac.put("/api/v1/commission/settings", json={"tds_rate_pct": "10", "vds_rate_pct": "15", **accounts})
            assert r.status_code == 200, r.text
            r = await ac.post(
                "/api/v1/commission/rules",
                json={"direction": "RECEIVABLE", "scope": "VENDOR", "vendor_id": factory_id, "rate_type": "PERCENTAGE", "rate": "5"},
            )
            assert r.status_code == 201, r.text
            # Scope/direction mismatch and missing target are rejected.
            assert (await ac.post("/api/v1/commission/rules", json={"direction": "PAYABLE", "scope": "VENDOR", "vendor_id": factory_id, "rate": "1"})).status_code == 400
            assert (await ac.post("/api/v1/commission/rules", json={"direction": "RECEIVABLE", "scope": "CUSTOMER", "rate": "1"})).status_code == 400

            ship = {
                "order_id": order_id, "vendor_id": factory_id, "shipment_ref": "INV-001", "shipment_date": date.today().isoformat(),
                "shipped_qty": 5000, "shipped_value": "10000", "currency": "usd", "exchange_rate_to_base": "120",
            }
            r = await ac.post("/api/v1/commission/shipments", json=ship)
            assert r.status_code == 201, r.text
            entries = {e["direction"]: e for e in r.json()["entries"]}
            rec, pay = entries["RECEIVABLE"], entries["PAYABLE"]
            assert rec["counterparty_type"] == "VENDOR" and rec["counterparty_name"] == "Shanta Garments"
            assert Decimal(rec["gross_amount"]) == Decimal("500") and Decimal(rec["net_amount"]) == Decimal("375")
            assert pay["counterparty_type"] == "INTERMEDIARY" and pay["rate_source"] == "customer_intermediary"
            assert Decimal(pay["gross_amount"]) == Decimal("200")
            assert (await ac.post("/api/v1/commission/shipments", json=ship)).status_code == 409

            r = await ac.post(
                "/api/v1/commission/statements",
                json={"direction": "RECEIVABLE", "counterparty_type": "VENDOR", "counterparty_id": factory_id, "currency": "USD"},
            )
            assert r.status_code == 201, r.text
            st = r.json()
            assert st["statement_code"].startswith("CMR-") and st["status"] == "DRAFT"
            assert Decimal(st["base_gross_total"]) == Decimal("60000")
            # Entries already on a statement cannot be statemented twice, and their shipment cannot be deleted.
            assert (await ac.post("/api/v1/commission/statements", json={"direction": "RECEIVABLE", "counterparty_type": "VENDOR", "counterparty_id": factory_id, "currency": "USD"})).status_code == 400
            ship_id = r.json()["entries"][0]["shipment_id"]
            assert (await ac.delete(f"/api/v1/commission/shipments/{ship_id}")).status_code == 409

            r = await ac.post(f"/api/v1/commission/statements/{st['id']}/issue")
            assert r.status_code == 200, r.text
            issued = r.json()
            assert issued["status"] == "ISSUED" and issued["voucher_id"] and issued["warning"] is None
            voucher = await db.get(Voucher, issued["voucher_id"])
            assert voucher.status == "DRAFT" and voucher.source_module == "COMMISSION"
            lines = (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all()
            debit = sum(Decimal(l.amount) for l in lines if l.entry_type == "DEBIT")
            credit = sum(Decimal(l.amount) for l in lines if l.entry_type == "CREDIT")
            assert debit == credit == Decimal("60000")
            assert {Decimal(l.amount) for l in lines} == {Decimal("45000"), Decimal("6000"), Decimal("9000"), Decimal("60000")}
            assert (await ac.post(f"/api/v1/commission/statements/{st['id']}/issue")).status_code == 409

            r = await ac.post(f"/api/v1/commission/statements/{st['id']}/cancel")
            assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
            await db.refresh(voucher)
            assert voucher.status == "CANCELLED"
            pending = (await ac.get("/api/v1/commission/entries", params={"status": "PENDING"})).json()
            assert {e["direction"] for e in pending} == {"RECEIVABLE", "PAYABLE"}

            _as(db, outsider, other_tenant)
            other_tenant.feature_flags = {COMMISSION_ENGINE_ENABLED: True}
            await db.commit()
            assert (await ac.get("/api/v1/commission/shipments")).json() == []
            assert (await ac.get(f"/api/v1/commission/statements/{st['id']}")).status_code == 404
            bad = {**ship, "shipment_ref": "X-1"}
            assert (await ac.post("/api/v1/commission/shipments", json=bad)).status_code == 400
    finally:
        app.dependency_overrides.clear()
