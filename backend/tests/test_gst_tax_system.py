"""Sprint 3: GST tax ledgers, calculation, returns.

Run:
    docker compose exec backend pytest tests/test_gst_tax_system.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import (
    AUTO_TAX_CALCULATION,
    GST_SETTINGS_KEY,
    GST_SYSTEM_ENABLED,
    get_gst_settings,
    is_auto_tax_calculation,
    is_gst_system_enabled,
)
from app.models.finance import AccountGroup, ChartOfAccount, Voucher, VoucherLine
from app.models.gst_tax import TaxLedger, VoucherTaxLine
from app.models.tenant import Tenant, TenantType
from app.modules.finance.gst_return_service import (
    export_gstr1_portal_json,
    generate_gstr1,
    generate_gstr2,
    generate_gstr3b,
    itc_summary,
)
from app.modules.finance.tax_calculation_service import (
    calculate_tax_on_voucher,
    calculate_tax_preview,
    determine_supply_kind,
    split_components,
)


async def _seed_tenant(db, *, flags: dict | None = None) -> Tenant:
    code = f"GST{uuid.uuid4().hex[:8].upper()}"
    t = Tenant(
        name=f"GST Tenant {code}",
        company_code=code,
        tenant_type=TenantType.manufacturer,
        is_active=True,
        feature_flags=flags
        or {
            GST_SYSTEM_ENABLED: True,
            AUTO_TAX_CALCULATION: True,
            GST_SETTINGS_KEY: {
                "registration_type": "Regular",
                "gstin": "27AAAAA0000A1Z5",
                "state_code": "27",
                "default_gst_rate": "18",
            },
        },
    )
    db.add(t)
    await db.flush()
    return t


async def _coa(db, tenant_id: int, number: str, name: str) -> ChartOfAccount:
    slug = uuid.uuid4().hex[:8]
    grp = AccountGroup(
        tenant_id=tenant_id,
        name=f"G-{number}-{slug}",
        code=f"G{slug}"[:12],
        nature="Liability",
        system_code=f"GST_{slug}",
        default_normal_balance="credit",
        allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id,
        account_number=f"{number}-{slug}"[:32],
        name=name,
        group_id=grp.id,
        account_type="posting",
        normal_balance="credit",
        balance=Decimal("0"),
        is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def _tax_ledgers(db, tenant_id: int) -> dict[str, TaxLedger]:
    out: dict[str, TaxLedger] = {}
    for tax_type, rate, num in [
        ("CGST", Decimal("9"), "CGST9"),
        ("SGST", Decimal("9"), "SGST9"),
        ("IGST", Decimal("18"), "IGST18"),
    ]:
        acct = await _coa(db, tenant_id, num, f"{tax_type} {rate}%")
        tl = TaxLedger(
            tenant_id=tenant_id,
            chart_account_id=acct.id,
            tax_type=tax_type,
            tax_rate=rate,
            gst_type="GOODS",
            is_active=True,
        )
        db.add(tl)
        await db.flush()
        out[tax_type] = tl
    return out


@pytest.mark.asyncio
async def test_feature_flags_default_off():
    assert is_gst_system_enabled({}) is False
    assert is_gst_system_enabled({GST_SYSTEM_ENABLED: True}) is True
    assert is_auto_tax_calculation({GST_SYSTEM_ENABLED: True}) is True
    assert is_auto_tax_calculation({GST_SYSTEM_ENABLED: True, AUTO_TAX_CALCULATION: False}) is False
    assert get_gst_settings({GST_SETTINGS_KEY: {"gstin": "X"}})["gstin"] == "X"


@pytest.mark.asyncio
async def test_intra_vs_inter_components():
    assert determine_supply_kind("27", "27") == "INTRA"
    assert determine_supply_kind("27", "29") == "INTER"
    assert split_components(Decimal("18"), "INTRA") == [("CGST", Decimal("9.00")), ("SGST", Decimal("9.00"))]
    assert split_components(Decimal("18"), "INTER") == [("IGST", Decimal("18.00"))]


@pytest.mark.asyncio
async def test_sales_voucher_cgst_sgst_and_gstr1(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    ledgers = await _tax_ledgers(db, tenant.id)
    party = await _coa(db, tenant.id, "PARTY1", "Customer")
    sales = await _coa(db, tenant.id, "SALES1", "Sales")
    party.normal_balance = "debit"
    await db.flush()

    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="DRAFT",
        description="Sale with HSN",
        currency="INR",
        base_currency="INR",
        exchange_rate="1",
        source_module="COMMERCIAL",
    )
    db.add(voucher)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=party.id,
            entry_type="DEBIT",
            amount="1000",
            notes="Party",
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=sales.id,
            entry_type="CREDIT",
            amount="1000",
            notes="HSN:6109 GST_RATE:18",
        )
    )
    await db.flush()

    preview = await calculate_tax_on_voucher(
        db,
        tenant.id,
        voucher.id,
        feature_flags=tenant.feature_flags,
        place_of_supply_state="27",
        direction="OUTWARD",
        apply=False,
    )
    assert preview["supply_kind"] == "INTRA"
    assert Decimal(preview["tax_total"]) == Decimal("180.0000")
    assert len(preview["lines"]) == 2

    applied = await calculate_tax_on_voucher(
        db,
        tenant.id,
        voucher.id,
        feature_flags=tenant.feature_flags,
        place_of_supply_state="27",
        direction="OUTWARD",
        apply=True,
    )
    assert applied.get("applied") is True
    tax_rows = list(
        (await db.execute(select(VoucherTaxLine).where(VoucherTaxLine.voucher_id == voucher.id))).scalars().all()
    )
    assert len(tax_rows) == 2
    lines = list((await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == voucher.id))).scalars().all())
    debit = sum(Decimal(str(l.amount)) for l in lines if l.entry_type == "DEBIT")
    credit = sum(Decimal(str(l.amount)) for l in lines if l.entry_type == "CREDIT")
    assert debit == credit

    voucher.status = "POSTED"
    await db.flush()
    gstr1 = await generate_gstr1(db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1))
    assert gstr1["summary"]["line_count"] == 2
    portal = await export_gstr1_portal_json(db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1), gstin="27AAAAA0000A1Z5")
    assert portal["gstin"] == "27AAAAA0000A1Z5"
    assert portal["b2b"]
    assert ledgers["CGST"].id


@pytest.mark.asyncio
async def test_purchase_itc_and_gstr2_gstr3b(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    await _tax_ledgers(db, tenant.id)
    vendor = await _coa(db, tenant.id, "VEND1", "Vendor")
    expense = await _coa(db, tenant.id, "EXP1", "Purchase")
    vendor.normal_balance = "credit"

    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="DRAFT",
        description="Purchase",
        currency="INR",
        base_currency="INR",
        exchange_rate="1",
        source_module="VENDOR_BILL",
    )
    db.add(voucher)
    await db.flush()
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=expense.id,
            entry_type="DEBIT",
            amount="500",
            notes="HSN:5208 GST_RATE:18",
        )
    )
    db.add(
        VoucherLine(
            tenant_id=tenant.id,
            voucher_id=voucher.id,
            account_id=vendor.id,
            entry_type="CREDIT",
            amount="500",
            notes="Vendor",
        )
    )
    await db.flush()

    # Inter-state purchase → IGST
    await calculate_tax_on_voucher(
        db,
        tenant.id,
        voucher.id,
        feature_flags=tenant.feature_flags,
        place_of_supply_state="29",
        direction="INWARD",
        apply=True,
    )
    voucher.status = "POSTED"
    await db.flush()

    gstr2 = await generate_gstr2(db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1))
    assert gstr2["summary"]["line_count"] == 1
    assert Decimal(gstr2["summary"]["itc_eligible_total"]) == Decimal("90.0000")
    itc = await itc_summary(db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1))
    assert Decimal(itc["eligible_total"]) == Decimal("90.0000")
    g3 = await generate_gstr3b(db, tenant.id, date.today() - timedelta(days=1), date.today() + timedelta(days=1))
    assert "net_tax_payable" in g3


@pytest.mark.asyncio
async def test_preview_without_ledgers_warns(db_session_integration):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    preview = await calculate_tax_preview(
        db,
        tenant.id,
        taxable_lines=[{"taxable_amount": "100", "gst_rate": "18", "hsn_code": "6109"}],
        company_state="27",
        place_of_supply_state="27",
        direction="OUTWARD",
        feature_flags=tenant.feature_flags,
    )
    assert preview["missing_tax_ledgers"]
    assert preview["warnings"]
