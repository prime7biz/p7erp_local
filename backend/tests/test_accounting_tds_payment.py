"""Auto TDS on payments must reduce the vendor payable once, and undo with the payment.

Run:
docker compose exec backend pytest tests/test_accounting_tds_payment.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.tenant_feature_keys import TDS_SPLIT_IN_PAYMENT, TDS_SYSTEM_ENABLED
from app.main import app
from app.models import Vendor
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.party_ledger import PartyLedger
from app.models.tds import TdsDeduction, TdsSection
from app.modules.finance.tds_service import create_tds_liability_voucher

from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.test_accounting_posting_integrity import _account, _override


async def _seed(db, *, split: bool):
    tenant, user, _ = await create_admin_tenant_with_user(db)
    today = date.today()
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"P{uuid.uuid4().hex[:4]}",
            start_date=today - timedelta(days=60),
            end_date=today + timedelta(days=60),
            is_closed=False,
        )
    )
    ap = await _account(db, tenant.id, "Vendor AP", normal="credit")
    bank = await _account(db, tenant.id, "Bank")
    bank.is_bank_account = True
    tds_payable = await _account(db, tenant.id, "TDS payable", normal="credit")
    section = TdsSection(
        tenant_id=tenant.id,
        section_code="194C",
        description="Contractors",
        threshold_amount=Decimal("1000"),
        tds_rate=Decimal("2"),
        is_active=True,
    )
    db.add(section)
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{uuid.uuid4().hex[:5]}", name="Contractor", is_active=True)
    db.add(vendor)
    await db.flush()
    party = PartyLedger(
        tenant_id=tenant.id,
        party_type="VENDOR",
        vendor_id=vendor.id,
        ledger_account_id=ap.id,
        opening_balance=Decimal("0"),
        opening_balance_type="CR",
        current_balance=Decimal("0"),
        current_balance_type="CR",
        tds_section_id=section.id,
        is_active=True,
    )
    db.add(party)
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        TDS_SYSTEM_ENABLED: True,
        TDS_SPLIT_IN_PAYMENT: split,
        "tds_settings": {"tds_payable_account_id": tds_payable.id},
    }
    payment = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"PV-{uuid.uuid4().hex[:6]}",
        voucher_type="PAYMENT",
        voucher_date=today,
        status="APPROVED",
        description="Contractor bill payment",
        books_applied=False,
        created_by=user.id,
    )
    db.add(payment)
    await db.flush()
    for acct, entry in ((ap, "DEBIT"), (bank, "CREDIT")):
        db.add(
            VoucherLine(
                tenant_id=tenant.id,
                voucher_id=payment.id,
                account_id=acct.id,
                entry_type=entry,
                amount=Decimal("10000"),
                base_amount=Decimal("10000"),
            )
        )
    await db.commit()
    return tenant, user, ap, bank, tds_payable, party, section, payment


async def _bal(db, acct) -> Decimal:
    await db.refresh(acct)
    return Decimal(str(acct.balance))


async def _deductions(db, voucher_id: int) -> list[TdsDeduction]:
    return list((await db.execute(select(TdsDeduction).where(TdsDeduction.voucher_id == voucher_id))).scalars().all())


@pytest.mark.asyncio
async def test_tds_split_inside_payment_and_cancel(db_session_integration):
    db = db_session_integration
    tenant, user, ap, bank, tds_payable, _party, _section, payment = await _seed(db, split=True)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            r = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/post", headers=h, json={})
            assert r.status_code == 200, r.text

            lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == payment.id))).scalars().all())
            by_acct = {(ln.account_id, ln.entry_type): Decimal(str(ln.amount)) for ln in lines}
            assert by_acct[(ap.id, "DEBIT")] == Decimal("10000")
            assert by_acct[(bank.id, "CREDIT")] == Decimal("9800")
            assert by_acct[(tds_payable.id, "CREDIT")] == Decimal("200")
            # Vendor payable reduced once (by the gross), bank by the net, TDS liability booked.
            assert await _bal(db, ap) == Decimal("-10000")
            assert await _bal(db, bank) == Decimal("-9800")
            assert await _bal(db, tds_payable) == Decimal("200")
            deds = await _deductions(db, payment.id)
            assert len(deds) == 1 and Decimal(str(deds[0].tds_amount)) == Decimal("200")
            # No separate TDS journal was created.
            journals = (await db.execute(select(Voucher).where(Voucher.tenant_id == tenant.id, Voucher.source_module == "TDS"))).scalars().all()
            assert journals == []

            c = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/cancel-posting", headers=h)
            assert c.status_code == 200, c.text
            assert await _bal(db, ap) == Decimal("0")
            assert await _bal(db, bank) == Decimal("0")
            assert await _bal(db, tds_payable) == Decimal("0")
            assert await _deductions(db, payment.id) == []

            # Re-post: TDS line already present, deduction recreated, no second split.
            r2 = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/post", headers=h, json={})
            assert r2.status_code == 200, r2.text
            assert await _bal(db, bank) == Decimal("-9800")
            assert await _bal(db, tds_payable) == Decimal("200")
            assert len(await _deductions(db, payment.id)) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_tds_without_split_does_not_double_debit_payable(db_session_integration):
    db = db_session_integration
    tenant, user, ap, bank, tds_payable, _party, _section, payment = await _seed(db, split=False)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/post", headers={"X-Tenant-Id": str(tenant.id)}, json={})
            assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()
    assert await _bal(db, ap) == Decimal("-10000")  # not -10200
    assert await _bal(db, bank) == Decimal("-10000")
    assert await _bal(db, tds_payable) == Decimal("0")
    deds = await _deductions(db, payment.id)
    assert len(deds) == 1
    assert deds[0].tds_liability_voucher_id is None


@pytest.mark.asyncio
async def test_reversing_payment_reverses_legacy_tds_journal(db_session_integration):
    db = db_session_integration
    tenant, user, ap, bank, tds_payable, party, section, payment = await _seed(db, split=False)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            assert (await ac.post(f"/api/v1/finance/vouchers/{payment.id}/post", headers=h, json={})).status_code == 200
            # Simulate the journal older versions created after the payment (Dr AP 200 / Cr TDS 200).
            ded = (await _deductions(db, payment.id))[0]
            journal = await create_tds_liability_voucher(
                db,
                tenant.id,
                deduction=ded,
                vendor_ap_account_id=ap.id,
                tds_payable_account_id=tds_payable.id,
            )
            await db.commit()
            assert await _bal(db, ap) == Decimal("-10200")

            r = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/reverse", headers=h, json={"reason": "wrong vendor"})
            assert r.status_code == 200, r.text
    finally:
        app.dependency_overrides.clear()
    await db.refresh(journal)
    assert journal.status == "CANCELLED"
    assert await _bal(db, ap) == Decimal("0")
    assert await _bal(db, bank) == Decimal("0")
    assert await _bal(db, tds_payable) == Decimal("0")
    assert await _deductions(db, payment.id) == []


@pytest.mark.asyncio
async def test_cancel_blocked_once_tds_deposited(db_session_integration):
    db = db_session_integration
    tenant, user, ap, bank, tds_payable, party, section, payment = await _seed(db, split=True)
    _override(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            assert (await ac.post(f"/api/v1/finance/vouchers/{payment.id}/post", headers=h, json={})).status_code == 200
            ded = (await _deductions(db, payment.id))[0]
            ded.status = "DEPOSITED"
            await db.commit()
            c = await ac.post(f"/api/v1/finance/vouchers/{payment.id}/cancel-posting", headers=h)
            assert c.status_code == 409, c.text
    finally:
        app.dependency_overrides.clear()
