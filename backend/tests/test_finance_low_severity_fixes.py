"""Small correctness fixes: bill / invoice numbering, PT slabs, GSTR-1 totals, downtime times,
signature upload cleanup, trade case margin in base currency.

Run in Docker: docker compose exec backend pytest tests/test_finance_low_severity_fixes.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.costing import CurrencyExchangeRate
from app.models.finance import AccountGroup, ChartOfAccount
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.models.platform_admin import BillingInvoice
from app.models.trade import TradeCase
from app.models.inventory import Vendor
from app.modules.admin.billing_router import _next_invoice_number, _optional_date
from app.modules.finance import gst_return_service
from app.modules.finance.party_ledger_bill_service import _next_bill_number
from app.modules.hr_payroll.statutory_calculation_service import calculate_pt
from app.modules.manufacturing.execution_router import _utc_naive
from tests.benchmark_fixtures import api_client, seed_tenant_admin


# --- Party ledger bill numbers -------------------------------------------------------------


@pytest.mark.asyncio
async def test_next_bill_number_uses_numeric_max(db_session_integration):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    slug = uuid.uuid4().hex[:6]
    grp = AccountGroup(tenant_id=tenant.id, name=f"AP {slug}", code=f"AP{slug}", nature="Liability")
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant.id, account_number=f"AP-{slug}", name="Supplier", group_id=grp.id,
                          normal_balance="credit")
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:10], name=f"Supplier {slug}")
    db.add_all([acct, vendor])
    await db.flush()
    pl = PartyLedger(tenant_id=tenant.id, party_type="VENDOR", vendor_id=vendor.id, ledger_account_id=acct.id)
    db.add(pl)
    await db.flush()
    for number in ("PB-9999", "PB-10000", "PB-0042", "PB-OLD"):
        db.add(PartyLedgerBill(tenant_id=tenant.id, party_ledger_id=pl.id, bill_number=number,
                               bill_date=date(2026, 1, 1), bill_type="PURCHASE", original_amount=Decimal("1"),
                               amount_type="CR", pending_amount=Decimal("1")))
    await db.flush()
    assert await _next_bill_number(db, tenant.id, "PB-") == "PB-10001"
    assert await _next_bill_number(db, tenant.id, "NEW-") == "NEW-0001"


# --- Platform billing invoices -------------------------------------------------------------


@pytest.mark.asyncio
async def test_billing_invoice_numbers_are_sequential_per_year(db_session_integration):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    year = 2099  # far-future year so real invoices never collide with the test
    first = await _next_invoice_number(db, date(year, 3, 1))
    db.add(BillingInvoice(tenant_id=tenant.id, invoice_number=first, total=Decimal("10")))
    await db.flush()
    second = await _next_invoice_number(db, date(year, 12, 31))
    assert first.startswith(f"INV-{year}-")
    assert int(second.rsplit("-", 1)[1]) == int(first.rsplit("-", 1)[1]) + 1
    assert (await _next_invoice_number(db, date(year + 1, 1, 1))).startswith(f"INV-{year + 1}-")


def test_billing_optional_date_parsing():
    assert _optional_date({"due_date": "2026-11-30"}, "due_date") == date(2026, 11, 30)
    assert _optional_date({"due_date": ""}, "due_date") is None
    assert _optional_date({}, "due_date") is None
    with pytest.raises(HTTPException) as exc:
        _optional_date({"due_date": "30/11/2026"}, "due_date")
    assert exc.value.status_code == 400


# --- Professional tax slabs ----------------------------------------------------------------


def test_professional_tax_slabs_have_no_gaps():
    assert calculate_pt(Decimal("7500")) == Decimal("0")
    assert calculate_pt(Decimal("7500.50")) == Decimal("175")
    assert calculate_pt(Decimal("10000")) == Decimal("175")
    assert calculate_pt(Decimal("10000.50")) == Decimal("200")
    assert calculate_pt(Decimal("50000")) == Decimal("200")
    capped = [{"from": 0, "to": 100, "amount": 1}, {"from": 101, "to": 200, "amount": 2}]
    assert calculate_pt(Decimal("100"), capped) == Decimal("1")
    assert calculate_pt(Decimal("100.5"), capped) == Decimal("2")
    assert calculate_pt(Decimal("250"), capped) == Decimal("0")


# --- GSTR-1 --------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gstr1_taxable_total_counts_igst_in_full(monkeypatch):
    def row(vid, tax_type, taxable, tax):
        return (
            SimpleNamespace(taxable_amount=Decimal(taxable), tax_amount=Decimal(tax), hsn_code="6109",
                            is_itc_eligible=False, direction="OUTWARD"),
            SimpleNamespace(id=vid, voucher_number=f"S-{vid}", voucher_date=date(2026, 5, 1), voucher_type="SALES"),
            SimpleNamespace(tax_type=tax_type, tax_rate=Decimal("9") if tax_type != "IGST" else Decimal("18")),
        )

    async def fake_rows(*_args, **_kwargs):
        return [
            row(1, "CGST", "1000", "90"), row(1, "SGST", "1000", "90"),  # intra-state sale, base 1000
            row(2, "IGST", "500", "90"),  # inter-state sale, base 500
        ]

    monkeypatch.setattr(gst_return_service, "_tax_rows_in_period", fake_rows)
    out = await gst_return_service.generate_gstr1(None, 1, date(2026, 5, 1), date(2026, 5, 31))
    assert Decimal(out["summary"]["taxable_total"]) == Decimal("1500")
    assert Decimal(out["hsn_summary"][0]["taxable_amount"]) == Decimal("1500")
    assert Decimal(out["summary"]["tax_total"]) == Decimal("270")


# --- Downtime times ------------------------------------------------------------------------


def test_downtime_times_are_normalised_to_naive_utc():
    aware = datetime(2026, 11, 6, 8, 30, tzinfo=timezone(timedelta(hours=6)))
    assert _utc_naive(aware) == datetime(2026, 11, 6, 2, 30)
    naive = datetime(2026, 11, 6, 2, 30)
    assert _utc_naive(naive) is naive
    assert _utc_naive(None) is None
    assert _utc_naive(aware) > datetime(2026, 11, 6, 2, 0)  # comparable with utcnow-style values


# --- Signature upload failure cleanup ------------------------------------------------------


@pytest.mark.asyncio
async def test_signature_upload_failure_deletes_new_file(monkeypatch):
    from app.modules.profile import router as profile_router

    class ExpiringUser:
        """Mimics an ORM row: after rollback every attribute read would need the database."""

        def __init__(self):
            self.__dict__["_data"] = {"id": 7, "tenant_id": 3, "signature_image_name": None,
                                      "designation": None, "username": "u"}
            self.__dict__["_expired"] = False

        def __getattr__(self, name):
            if self.__dict__["_expired"]:
                raise RuntimeError("MissingGreenlet: attribute refresh needs the database")
            return self.__dict__["_data"][name]

        def __setattr__(self, name, value):
            self.__dict__["_data"][name] = value

    row = ExpiringUser()

    class FakeDb:
        async def get(self, _model, _id):
            return row

        async def commit(self):
            raise RuntimeError("disk full")

        async def rollback(self):
            row.__dict__["_expired"] = True

    deleted: list[tuple[int, str, str]] = []

    async def fake_save(_file, tenant_id, module):
        return "sig-new.png", "/u", "/p"

    monkeypatch.setattr(profile_router.FileStorageService, "save_file", fake_save)
    monkeypatch.setattr(profile_router.FileStorageService, "delete_file",
                        lambda tenant_id, module, name: deleted.append((tenant_id, module, name)))
    user = SimpleNamespace(id=7, tenant_id=3)
    with pytest.raises(HTTPException) as exc:
        await profile_router.upload_my_signature_image(file=None, user=user, db=FakeDb())
    assert exc.value.status_code == 500
    assert deleted == [(3, profile_router.SIGNATURE_MODULE, "sig-new.png")]


# --- Trade case margin ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_trade_case_margin_converts_revenue_to_base_currency(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    slug = uuid.uuid4().hex[:6]
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:10], name=f"Mill {slug}")
    db.add(vendor)
    await db.flush()
    tc = TradeCase(tenant_id=tenant.id, reference=f"TC-{slug}", amount=Decimal("1000"),
                   currency="USD", base_currency="BDT", vendor_id=vendor.id)
    db.add(tc)
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        no_rate = await ac.get(f"/api/v1/trade-cases/{tc.id}/margin")
        db.add(CurrencyExchangeRate(tenant_id=tenant.id, from_currency="USD", to_currency="BDT",
                                    exchange_rate=Decimal("120"), effective_date=date(2020, 1, 1), is_active=True))
        await db.flush()
        with_rate = await ac.get(f"/api/v1/trade-cases/{tc.id}/margin")
    assert no_rate.status_code == 200, no_rate.text
    assert no_rate.json()["margin_amount"] is None
    assert "exchange rate" in no_rate.json()["margin_note"]
    assert with_rate.status_code == 200, with_rate.text
    body = with_rate.json()
    assert body["amount"] == 1000.0  # still in the case currency
    assert body["amount_base"] == 120000.0
    assert body["fx_rate_to_base"] == 120.0
    assert body["margin_currency"] == "BDT"
    assert body["estimated_cost"] == 0.0  # no approved purchase orders for this vendor
    assert body["margin_amount"] == 120000.0
    assert body["margin_pct"] == 100.0
