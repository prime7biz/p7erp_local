"""
Seed 10 linked Export/Import workflow records for Trade + Commercial tables.

Creates (idempotent by deterministic reference prefixes):
- master_contracts (with cost centers)
- proforma_invoices (+ proforma_invoice_orders when orders exist)
- btb_lcs
- btb_lc_accounting
- trade_cases
- shipments
- trade_documents
- export_cases

Run from backend dir (preferably inside Docker backend container):
  python scripts/seed_trade_import_export_workflow_demo.py
"""

from __future__ import annotations

import asyncio
import secrets
import sys
import argparse
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # type: ignore  # noqa: E402
from app.models import (  # type: ignore  # noqa: E402
    BtbLc,
    BtbLcAccounting,
    CostCenter,
    Customer,
    ExportCase,
    MasterContract,
    Order,
    ProformaInvoice,
    ProformaInvoiceOrder,
    Shipment,
    Tenant,
    TradeCase,
    TradeDocument,
    Vendor,
)


MASTER_PREFIX = "MCWF-2026-"
PI_EXPORT_PREFIX = "PIWF-EXP-"
PI_IMPORT_PREFIX = "PIWF-IMP-"
BTB_PREFIX = "BTBWF-2026-"
TRADE_PREFIX = "TCWF-2026-"
SHIP_PREFIX = "SHPWF-2026-"
EXP_CASE_PREFIX = "ECWF-2026-"
COST_CENTER_PREFIX = "CCWF-2026-"
TOTAL_SAMPLES = 10


def _fmt(i: int) -> str:
    return f"{i:03d}"


async def _pick_tenant(db, preferred_company_code: str | None = None) -> Tenant:
    if preferred_company_code:
        row = await db.execute(select(Tenant).where(Tenant.company_code == preferred_company_code))
        tenant = row.scalar_one_or_none()
        if not tenant:
            raise RuntimeError(f"Tenant not found for company code: {preferred_company_code}")
        return tenant

    preferred_codes = ("LAKHSMA4821", "DEMO", "P7")
    for code in preferred_codes:
        row = await db.execute(select(Tenant).where(Tenant.company_code == code))
        tenant = row.scalar_one_or_none()
        if tenant:
            return tenant
    row = await db.execute(select(Tenant).order_by(Tenant.id))
    tenant = row.scalars().first()
    if not tenant:
        raise RuntimeError("No tenant found. Create a tenant first.")
    return tenant


async def _ensure_customer(db, tenant_id: int) -> Customer:
    row = await db.execute(
        select(Customer).where(Customer.tenant_id == tenant_id).order_by(Customer.id)
    )
    existing = row.scalars().first()
    if existing:
        return existing
    customer = Customer(
        tenant_id=tenant_id,
        customer_code="CUST-WF-001",
        name="Workflow Demo Customer",
        address="Demo Export Zone",
        country="Bangladesh",
        status="active",
    )
    db.add(customer)
    await db.flush()
    return customer


async def _ensure_vendor(db, tenant_id: int) -> Vendor:
    row = await db.execute(
        select(Vendor).where(Vendor.tenant_id == tenant_id).order_by(Vendor.id)
    )
    existing = row.scalars().first()
    if existing:
        return existing
    vendor = Vendor(
        tenant_id=tenant_id,
        vendor_code="VEND-WF-001",
        name="Workflow Demo Vendor",
        email="vendor.workflow@example.com",
        phone="+8801000000000",
        vendor_type="foreign",
        country="China",
        city="Shanghai",
        is_active=True,
    )
    db.add(vendor)
    await db.flush()
    return vendor


async def _ensure_order(db, tenant_id: int, customer_id: int) -> Order:
    row = await db.execute(select(Order).where(Order.tenant_id == tenant_id).order_by(Order.id))
    existing = row.scalars().first()
    if existing:
        return existing
    order = Order(
        tenant_id=tenant_id,
        customer_id=customer_id,
        order_code="ORD-WF-001",
        style_ref="WF-STYLE-01",
        shipping_term="FOB",
        order_date=date.today(),
        delivery_date=date.today() + timedelta(days=90),
        quantity=10000,
        status="CONFIRMED",
        remarks="Auto-created order for trade workflow seed.",
    )
    db.add(order)
    await db.flush()
    return order


async def seed_trade_import_export_workflow(preferred_company_code: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _pick_tenant(db, preferred_company_code)
        customer = await _ensure_customer(db, tenant.id)
        vendor = await _ensure_vendor(db, tenant.id)
        order = await _ensure_order(db, tenant.id, customer.id)

        created_counts = {
            "cost_centers": 0,
            "master_contracts": 0,
            "proforma_invoices": 0,
            "proforma_invoice_orders": 0,
            "btb_lcs": 0,
            "btb_lc_accounting": 0,
            "trade_cases": 0,
            "shipments": 0,
            "trade_documents": 0,
            "export_cases": 0,
        }

        for i in range(1, TOTAL_SAMPLES + 1):
            idx = _fmt(i)
            is_export = i % 2 == 1

            # Cost center
            cc_code = f"{COST_CENTER_PREFIX}{idx}"
            cc_row = await db.execute(
                select(CostCenter).where(
                    CostCenter.tenant_id == tenant.id, CostCenter.center_code == cc_code
                )
            )
            cc = cc_row.scalar_one_or_none()
            if not cc:
                cc = CostCenter(
                    tenant_id=tenant.id,
                    center_code=cc_code,
                    name=f"Workflow Contract Cost Center {idx}",
                    department="Trade",
                    is_active=True,
                )
                db.add(cc)
                await db.flush()
                created_counts["cost_centers"] += 1

            # Master contract
            master_ref = f"{MASTER_PREFIX}{idx}"
            master_row = await db.execute(
                select(MasterContract).where(
                    MasterContract.tenant_id == tenant.id, MasterContract.reference == master_ref
                )
            )
            master = master_row.scalar_one_or_none()
            if not master:
                master = MasterContract(
                    tenant_id=tenant.id,
                    cost_center_id=cc.id,
                    contract_type="EXPORT_LC" if is_export else "SALES_CONTRACT",
                    reference=master_ref,
                    status="ACTIVE",
                    contract_date=date.today() - timedelta(days=5 * i),
                    amount=100000 + (i * 7000),
                    currency="USD",
                    buyer_name=f"Buyer {idx}",
                    bank_name="Demo Trade Bank",
                    expiry_date=date.today() + timedelta(days=120 + i),
                )
                db.add(master)
                await db.flush()
                created_counts["master_contracts"] += 1
            elif master.cost_center_id is None:
                master.cost_center_id = cc.id

            # Proforma invoices
            pi_ref = f"{PI_EXPORT_PREFIX if is_export else PI_IMPORT_PREFIX}{idx}"
            pi_row = await db.execute(
                select(ProformaInvoice).where(
                    ProformaInvoice.tenant_id == tenant.id, ProformaInvoice.reference == pi_ref
                )
            )
            pi = pi_row.scalar_one_or_none()
            if not pi:
                pi = ProformaInvoice(
                    tenant_id=tenant.id,
                    direction="EXPORT" if is_export else "IMPORT",
                    vendor_id=None if is_export else vendor.id,
                    master_contract_id=master.id,
                    reference=pi_ref,
                    status="ISSUED" if i > 2 else "DRAFT",
                    invoice_date=date.today() - timedelta(days=2 * i),
                    amount=35000 + (i * 2500),
                    buyer_name=f"Buyer {idx}",
                    buyer_address="Buyer Address",
                    buyer_bank_details="Buyer Bank Details",
                    consignee_name=f"Consignee {idx}",
                    consignee_address="Consignee Address",
                    notify_party_name=f"Notify {idx}",
                    notify_party_address="Notify Address",
                    beneficiary_name="Workflow Beneficiary",
                    beneficiary_address="Beneficiary Address",
                    terms_of_shipping="FOB" if is_export else "CIF",
                    terms_of_payment="LC",
                    currency="USD",
                    shipping_country="Bangladesh" if is_export else "China",
                    destination_port_or_airport="Chittagong Port",
                    shipment_port="Chittagong",
                    documents_to_provide=["Invoice", "Packing List", "BL"],
                    terms_and_conditions=["Demo workflow seed"],
                    shipper_bank_name="Demo Trade Bank",
                    shipper_bank_branch="Main Branch",
                    shipper_bank_account_number=f"ACCT-{idx}",
                    shipper_bank_account_name="Workflow Beneficiary",
                    shipper_bank_address="Dhaka",
                    shipper_bank_swift="DEMOBDDH",
                    verification_token=secrets.token_urlsafe(24),
                )
                db.add(pi)
                await db.flush()
                created_counts["proforma_invoices"] += 1

            # ProformaInvoiceOrder link for workflow traceability (10 links total)
            pio_row = await db.execute(
                select(ProformaInvoiceOrder).where(
                    ProformaInvoiceOrder.proforma_invoice_id == pi.id,
                    ProformaInvoiceOrder.order_id == order.id,
                )
            )
            pio = pio_row.scalar_one_or_none()
            if not pio:
                pio = ProformaInvoiceOrder(
                    proforma_invoice_id=pi.id,
                    order_id=order.id,
                    sort_order=0,
                )
                db.add(pio)
                created_counts["proforma_invoice_orders"] += 1

            # BTB LC
            btb_ref = f"{BTB_PREFIX}{idx}"
            btb_row = await db.execute(
                select(BtbLc).where(BtbLc.tenant_id == tenant.id, BtbLc.reference == btb_ref)
            )
            btb = btb_row.scalar_one_or_none()
            btb_amount = 25000 + (i * 1200)
            if not btb:
                btb = BtbLc(
                    tenant_id=tenant.id,
                    reference=btb_ref,
                    status="OPEN" if i <= 7 else "CLOSED",
                    lc_date=date.today() - timedelta(days=i),
                    amount=btb_amount,
                    master_contract_id=master.id,
                    proforma_invoice_id=pi.id if is_export else None,
                    vendor_proforma_invoice_id=pi.id if not is_export else None,
                    vendor_id=vendor.id,
                    currency="USD",
                    open_date=date.today() - timedelta(days=max(i - 1, 0)),
                    expiry_date=date.today() + timedelta(days=60 + i),
                    maturity_date=date.today() + timedelta(days=(i - 6) * 5),
                    maturity_amount=btb_amount,
                    exchange_rate_to_base=110.0,
                    base_currency_amount=btb_amount * 110.0,
                )
                db.add(btb)
                await db.flush()
                created_counts["btb_lcs"] += 1

            # BTB LC accounting lifecycle row
            acc_row = await db.execute(
                select(BtbLcAccounting).where(
                    BtbLcAccounting.tenant_id == tenant.id,
                    BtbLcAccounting.btb_lc_id == btb.id,
                )
            )
            acc = acc_row.scalar_one_or_none()
            status = "OPEN"
            if i >= 4:
                status = "DOCUMENTS_ACCEPTED"
            if i >= 8:
                status = "REALIZED"
            if not acc:
                acc = BtbLcAccounting(
                    tenant_id=tenant.id,
                    btb_lc_id=btb.id,
                    maturity_date=btb.maturity_date,
                    status=status,
                )
                db.add(acc)
                created_counts["btb_lc_accounting"] += 1
            else:
                acc.maturity_date = btb.maturity_date
                acc.status = status

            # Trade case
            trade_ref = f"{TRADE_PREFIX}{idx}"
            trade_row = await db.execute(
                select(TradeCase).where(
                    TradeCase.tenant_id == tenant.id, TradeCase.reference == trade_ref
                )
            )
            trade_case = trade_row.scalar_one_or_none()
            if not trade_case:
                trade_case = TradeCase(
                    tenant_id=tenant.id,
                    direction="EXPORT" if is_export else "IMPORT",
                    reference=trade_ref,
                    status="OPEN",
                    current_stage="DOCS" if i >= 6 else "COMMERCIAL",
                    order_id=order.id if is_export else None,
                    customer_id=customer.id if is_export else None,
                    vendor_id=vendor.id if not is_export else None,
                    proforma_invoice_id=pi.id,
                    master_contract_id=master.id,
                    btb_lc_id=btb.id,
                    etd=date.today() + timedelta(days=7 + i),
                    eta=date.today() + timedelta(days=20 + i),
                    amount=55000 + (i * 3000),
                    currency="USD",
                    cost_amount=40000 + (i * 2200),
                    margin_amount=15000 + (i * 800),
                    margin_pct=25.0,
                    base_currency="BDT",
                    base_currency_margin=(15000 + (i * 800)) * 110.0,
                )
                db.add(trade_case)
                await db.flush()
                created_counts["trade_cases"] += 1
            else:
                expected_vendor_id = vendor.id if not is_export else None
                if trade_case.vendor_id != expected_vendor_id:
                    trade_case.vendor_id = expected_vendor_id

            # Shipment
            ship_ref = f"{SHIP_PREFIX}{idx}"
            ship_row = await db.execute(
                select(Shipment).where(
                    Shipment.tenant_id == tenant.id, Shipment.reference == ship_ref
                )
            )
            shipment = ship_row.scalar_one_or_none()
            if not shipment:
                shipment = Shipment(
                    tenant_id=tenant.id,
                    trade_case_id=trade_case.id,
                    reference=ship_ref,
                    status="DELIVERED" if i >= 8 else ("IN_TRANSIT" if i >= 4 else "PLANNED"),
                    carrier="Workflow Logistics",
                    booking_ref=f"BOOK-{idx}",
                    bl_awb=f"BLAWB-{idx}",
                    etd=trade_case.etd,
                    eta=trade_case.eta,
                    origin_port="Chittagong",
                    dest_port="Hamburg",
                    notes="Auto seeded shipment",
                )
                db.add(shipment)
                await db.flush()
                created_counts["shipments"] += 1

            # Trade document (one per trade case so we keep exactly 10)
            doc_name = f"workflow_invoice_{idx}.pdf"
            doc_row = await db.execute(
                select(TradeDocument).where(
                    TradeDocument.tenant_id == tenant.id,
                    TradeDocument.trade_case_id == trade_case.id,
                    TradeDocument.file_name == doc_name,
                )
            )
            doc = doc_row.scalar_one_or_none()
            if not doc:
                doc = TradeDocument(
                    tenant_id=tenant.id,
                    trade_case_id=trade_case.id,
                    shipment_id=shipment.id,
                    document_type="INVOICE",
                    file_name=doc_name,
                    storage_path=f"seed/trade_docs/{doc_name}",
                    version=1,
                    linked_entity_type="trade_case",
                    linked_entity_id=trade_case.id,
                    uploaded_by_id=None,
                )
                db.add(doc)
                created_counts["trade_documents"] += 1

            # Export case
            ec_ref = f"{EXP_CASE_PREFIX}{idx}"
            ec_row = await db.execute(
                select(ExportCase).where(
                    ExportCase.tenant_id == tenant.id, ExportCase.reference == ec_ref
                )
            )
            export_case = ec_row.scalar_one_or_none()
            if not export_case:
                export_case = ExportCase(
                    tenant_id=tenant.id,
                    reference=ec_ref,
                    status="OPEN" if is_export else "DRAFT",
                    case_date=date.today() - timedelta(days=i),
                    amount=65000 + (i * 1800),
                    trade_case_id=trade_case.id,
                )
                db.add(export_case)
                created_counts["export_cases"] += 1

        # Recompute utilized amount on seeded master contracts
        seeded_refs = [f"{MASTER_PREFIX}{_fmt(i)}" for i in range(1, TOTAL_SAMPLES + 1)]
        masters = (
            await db.execute(
                select(MasterContract).where(
                    MasterContract.tenant_id == tenant.id,
                    MasterContract.reference.in_(seeded_refs),
                )
            )
        ).scalars().all()
        for master in masters:
            total = await db.execute(
                select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
                    BtbLc.tenant_id == tenant.id,
                    BtbLc.master_contract_id == master.id,
                )
            )
            master.btb_utilized_amount = total.scalar() or 0

        await db.commit()

        print(f"Tenant: {tenant.name} ({tenant.company_code})")
        print("Seed complete for Trade/Commercial workflow.")
        for key, value in created_counts.items():
            print(f"  {key}: +{value}")
        print(f"  target_workflow_records_per_table: {TOTAL_SAMPLES}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed 10 linked export/import workflow records for a tenant."
    )
    parser.add_argument(
        "--tenant-code",
        dest="tenant_code",
        default=None,
        help="Company code of tenant to seed (example: LAKHSMA4821).",
    )
    args = parser.parse_args()
    asyncio.run(seed_trade_import_export_workflow(args.tenant_code))
