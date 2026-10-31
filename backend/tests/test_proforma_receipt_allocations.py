"""Phase 1.3: proforma receipt allocations + balance-based payment checks."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import ChartOfAccount, Customer, Order, Tenant, User, Voucher
from app.models.commercial import ProformaInvoice, ProformaInvoiceOrder, ProformaReceiptAllocation
from app.models.finance import AccountGroup
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.commercial.proforma_receipt_service import (
    create_receipt_from_proforma,
    get_proforma_outstanding,
    order_has_fully_paid_proforma,
)
from app.modules.orders.pipeline_service import _has_payment


async def _seed_export_pi(db, *, amount: str = "1000.00", currency: str = "USD"):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"PI Rec {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pr{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"pr{slug}",
        email=f"pr{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name="Buyer")
    db.add(customer)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OR{slug}"[:14],
        status="CONFIRMED",
        pipeline_status="PI_ISSUED",
        quantity=100,
    )
    db.add(order)
    await db.flush()
    pi = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        reference=f"PI-{slug}"[:32],
        status="ISSUED",
        invoice_date=date.today(),
        amount=amount,
        currency=currency,
        verification_token=uuid.uuid4().hex,
    )
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id, sort_order=0))
    await db.flush()

    group = AccountGroup(
        tenant_id=tenant.id,
        name=f"AG-{slug}"[:32],
        code=f"G{slug}"[:8],
        nature="Assets",
    )
    db.add(group)
    await db.flush()
    bank = ChartOfAccount(
        tenant_id=tenant.id,
        group_id=group.id,
        account_number=f"1{slug[:6]}",
        name="Bank",
        normal_balance="debit",
        is_active=True,
        account_type="posting",
    )
    recv = ChartOfAccount(
        tenant_id=tenant.id,
        group_id=group.id,
        account_number=f"2{slug[:6]}",
        name="Trade Receivable",
        normal_balance="debit",
        is_active=True,
        account_type="posting",
    )
    db.add(bank)
    db.add(recv)
    await db.flush()
    return tenant, user, order, pi, bank, recv


@pytest.mark.asyncio
async def test_create_partial_receipts_and_reject_overpayment(db_session_integration):
    db = db_session_integration
    tenant, user, order, pi, bank, recv = await _seed_export_pi(db, amount="1000.00")

    a1, v1, out1, created1 = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("400.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("120"),
        idempotency_key="pay-1",
    )
    assert created1 is True
    assert float(out1.outstanding_for_new) == 600.0
    assert float(a1.allocated_base_amount) == 48000.0
    assert v1.status == "DRAFT"
    assert v1.order_id == order.id
    assert (v1.source_module or "") == "PROFORMA"

    a2, _v2, out2, created2 = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("600.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("120"),
        idempotency_key="pay-2",
    )
    assert created2 is True
    assert float(out2.outstanding_for_new) == 0.0
    assert a2.id != a1.id

    with pytest.raises(Exception) as exc:
        await create_receipt_from_proforma(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            pi=pi,
            amount=Decimal("0.01"),
            receipt_date=date.today(),
            bank_ledger_id=bank.id,
            receivable_ledger_id=recv.id,
            currency="USD",
            exchange_rate_to_base=Decimal("1"),
            idempotency_key="pay-over",
        )
    assert "exceeds outstanding" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_idempotency_same_key_reuses_allocation(db_session_integration):
    db = db_session_integration
    tenant, user, _order, pi, bank, recv = await _seed_export_pi(db, amount="500.00")

    a1, v1, _, created1 = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("100.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("1"),
        idempotency_key="same-key",
    )
    a2, v2, _, created2 = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("100.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("1"),
        idempotency_key="same-key",
    )
    assert created1 is True
    assert created2 is False
    assert a1.id == a2.id
    assert v1.id == v2.id
    outstanding = await get_proforma_outstanding(db, tenant_id=tenant.id, pi=pi)
    assert float(outstanding.allocated_active) == 100.0


@pytest.mark.asyncio
async def test_import_pi_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, _order, pi, bank, recv = await _seed_export_pi(db)
    pi.direction = "IMPORT"
    await db.flush()

    with pytest.raises(Exception) as exc:
        await create_receipt_from_proforma(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            pi=pi,
            amount=Decimal("10"),
            receipt_date=date.today(),
            bank_ledger_id=bank.id,
            receivable_ledger_id=recv.id,
            currency="USD",
            exchange_rate_to_base=Decimal("1"),
            idempotency_key="import-key",
        )
    assert "EXPORT" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_pipeline_advances_only_when_posted_fully_paid(db_session_integration):
    db = db_session_integration
    tenant, user, order, pi, bank, recv = await _seed_export_pi(db, amount="200.00")

    # No allocations yet → PI-linked unpaid
    assert await order_has_fully_paid_proforma(db, tenant_id=tenant.id, order_id=order.id) is False
    assert await _has_payment(db, tenant.id, order.id) is False

    alloc, voucher, _, _ = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("200.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("1"),
        idempotency_key="full-pay",
    )
    # Draft allocation does not clear posted outstanding
    assert await _has_payment(db, tenant.id, order.id) is False

    voucher.status = "POSTED"
    alloc.status = "POSTED"
    alloc.updated_at = datetime.utcnow()
    await db.flush()

    assert await order_has_fully_paid_proforma(db, tenant_id=tenant.id, order_id=order.id) is True
    assert await _has_payment(db, tenant.id, order.id) is True


@pytest.mark.asyncio
async def test_partial_posted_does_not_advance_pipeline(db_session_integration):
    db = db_session_integration
    tenant, user, order, pi, bank, recv = await _seed_export_pi(db, amount="300.00")

    alloc, voucher, _, _ = await create_receipt_from_proforma(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        pi=pi,
        amount=Decimal("100.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=recv.id,
        currency="USD",
        exchange_rate_to_base=Decimal("1"),
        idempotency_key="partial",
    )
    voucher.status = "POSTED"
    alloc.status = "POSTED"
    await db.flush()

    assert await _has_payment(db, tenant.id, order.id) is False


@pytest.mark.asyncio
async def test_create_receipt_http_endpoint_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, _order, pi, bank, recv = await _seed_export_pi(db, amount="50.00")

    other = Tenant(
        name="Other",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ot{uuid.uuid4().hex[:8]}"[:18],
    )
    db.add(other)
    await db.flush()

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            ok = await ac.post(
                f"/api/v1/commercial/proforma-invoices/{pi.id}/create-receipt",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "amount": 25,
                    "bank_ledger_id": bank.id,
                    "receivable_ledger_id": recv.id,
                    "currency": "USD",
                    "exchange_rate_to_base": 1,
                    "idempotency_key": "http-1",
                },
            )
            assert ok.status_code == 200, ok.text
            body = ok.json()
            assert body["was_created"] is True
            assert body["remaining_balance"] == 25

            # Wrong PI id for this tenant
            missing = await ac.post(
                "/api/v1/commercial/proforma-invoices/999999/create-receipt",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "amount": 1,
                    "bank_ledger_id": bank.id,
                    "receivable_ledger_id": recv.id,
                    "currency": "USD",
                    "exchange_rate_to_base": 1,
                    "idempotency_key": "http-missing",
                },
            )
            assert missing.status_code == 404

            summary = await ac.get(
                f"/api/v1/commercial/proforma-invoices/{pi.id}/payment-summary",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert summary.status_code == 200
            assert summary.json()["paid_active"] == 25
            assert len(summary.json()["allocations"]) == 1

            # Ensure allocation rows are tenant-scoped
            rows = list(
                (
                    await db.execute(
                        select(ProformaReceiptAllocation).where(
                            ProformaReceiptAllocation.proforma_invoice_id == pi.id
                        )
                    )
                ).scalars().all()
            )
            assert all(r.tenant_id == tenant.id for r in rows)
            assert other.id != tenant.id
    finally:
        app.dependency_overrides.clear()
