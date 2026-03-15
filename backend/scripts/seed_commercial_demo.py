"""
Seed demo Export & Import (commercial) data for the Lakhsma tenant.

Prerequisites: Run seed_lakhsma.py and seed_merch_demo.py first so that
the Lakhsma tenant and orders exist.

Creates: ExportCase, ProformaInvoice (with ProformaInvoiceOrder links to orders),
and BtbLc records. Safe to run multiple times (idempotent by reference).

Run from backend dir (e.g. inside Docker backend container):
  python scripts/seed_commercial_demo.py
"""
import asyncio
import secrets
import sys
from pathlib import Path
from datetime import date

from sqlalchemy import select

# Ensure backend app is importable when run as script
backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # type: ignore  # noqa: E402
from app.models import (  # type: ignore  # noqa: E402
    Tenant,
    Order,
    ExportCase,
    ProformaInvoice,
    ProformaInvoiceOrder,
    BtbLc,
)


LAKHSMA_CODE = "LAKHSMA4821"


async def get_lakhsma_tenant(db):
    result = await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise RuntimeError("Lakhsma tenant not found. Run seed_lakhsma.py first.")
    return tenant


async def get_orders_for_tenant(db, tenant_id: int):
    result = await db.execute(select(Order).where(Order.tenant_id == tenant_id).order_by(Order.id))
    return list(result.scalars().all())


async def seed_commercial(db) -> None:
    tenant = await get_lakhsma_tenant(db)
    orders = await get_orders_for_tenant(db, tenant.id)
    if not orders:
        raise RuntimeError(
            "No orders found for Lakhsma tenant. Run seed_merch_demo.py first."
        )
    order1, order2 = orders[0], orders[1] if len(orders) > 1 else orders[0]

    # --- ExportCase: idempotent by reference ---
    existing_ec = await db.execute(
        select(ExportCase).where(ExportCase.tenant_id == tenant.id)
    )
    export_cases = existing_ec.scalars().all()
    if not export_cases:
        ec1 = ExportCase(
            tenant_id=tenant.id,
            reference="EC-001",
            status="DRAFT",
            case_date=date.today(),
            amount=45000.00,
        )
        ec2 = ExportCase(
            tenant_id=tenant.id,
            reference="EC-002",
            status="ISSUED",
            case_date=date.today(),
            amount=69000.00,
        )
        db.add_all([ec1, ec2])
        await db.flush()
        export_cases = [ec1, ec2]

    # --- ProformaInvoice + ProformaInvoiceOrder: idempotent by reference ---
    existing_pi = await db.execute(
        select(ProformaInvoice).where(ProformaInvoice.tenant_id == tenant.id)
    )
    proforma_invoices = existing_pi.scalars().all()
    if not proforma_invoices:
        token1 = secrets.token_urlsafe(32)
        token2 = secrets.token_urlsafe(32)
        pi1 = ProformaInvoice(
            tenant_id=tenant.id,
            reference="PI-001",
            status="DRAFT",
            invoice_date=date.today(),
            amount=45000.00,
            buyer_name="Prime Garments Ltd.",
            buyer_address="123 Export Zone, Dhaka 1000, Bangladesh",
            buyer_bank_details="Bank of Asia, Dhaka. A/C 1234567890.",
            consignee_name="Prime Garments Ltd.",
            consignee_address="123 Export Zone, Dhaka 1000, Bangladesh",
            notify_party_name="Star Buying House",
            notify_party_address="456 Sourcing Ave, Dhaka, Bangladesh",
            beneficiary_name="Prime Garments Ltd.",
            beneficiary_address="123 Export Zone, Dhaka 1000, Bangladesh",
            terms_of_shipping="FOB",
            terms_of_payment="LC",
            currency="USD",
            shipping_country="Bangladesh",
            destination_port_or_airport="Chittagong Port",
            shipment_port="Chittagong",
            documents_to_provide=[
                "Commercial Invoice",
                "Packing List",
                "Bill of Lading",
                "Certificate of Origin",
            ],
            terms_and_conditions=[
                "Goods as per order and sample.",
                "Buyer to open LC within 15 days of PI approval.",
            ],
            shipper_bank_name="Bank of Asia",
            shipper_bank_branch="Dhaka Main",
            shipper_bank_account_number="9876543210",
            shipper_bank_account_name="Prime Garments Ltd.",
            shipper_bank_address="Dhaka 1000, Bangladesh",
            shipper_bank_swift="BOABBDDH",
            verification_token=token1,
        )
        pi2 = ProformaInvoice(
            tenant_id=tenant.id,
            reference="PI-002",
            status="ISSUED",
            invoice_date=date.today(),
            amount=69000.00,
            buyer_name="Star Buying House",
            buyer_address="456 Sourcing Ave, Dhaka, Bangladesh",
            buyer_bank_details="Eastern Bank Ltd. A/C 5555666677.",
            consignee_name="EU Retail Group",
            consignee_address="Berlin Str. 10, 10115 Berlin, Germany",
            notify_party_name="Star Buying House",
            notify_party_address="456 Sourcing Ave, Dhaka, Bangladesh",
            beneficiary_name="Prime Garments Ltd.",
            beneficiary_address="123 Export Zone, Dhaka 1000, Bangladesh",
            terms_of_shipping="CIF",
            terms_of_payment="LC",
            currency="USD",
            shipping_country="Germany",
            destination_port_or_airport="Hamburg Port",
            shipment_port="Chittagong",
            documents_to_provide=[
                "Commercial Invoice",
                "Packing List",
                "Bill of Lading",
                "Certificate of Origin",
                "Inspection Certificate",
            ],
            terms_and_conditions=[
                "Shipment as per agreed schedule.",
                "LC to be opened within 10 working days.",
            ],
            shipper_bank_name="Eastern Bank Ltd.",
            shipper_bank_branch="Gulshan",
            shipper_bank_account_number="1111222233",
            shipper_bank_account_name="Prime Garments Ltd.",
            shipper_bank_address="Gulshan, Dhaka, Bangladesh",
            shipper_bank_swift="EBLBDBDH",
            verification_token=token2,
        )
        db.add_all([pi1, pi2])
        await db.flush()
        # Link each PI to at least one order via ProformaInvoiceOrder
        db.add_all([
            ProformaInvoiceOrder(proforma_invoice_id=pi1.id, order_id=order1.id, sort_order=0),
            ProformaInvoiceOrder(proforma_invoice_id=pi2.id, order_id=order2.id, sort_order=0),
        ])
        proforma_invoices = [pi1, pi2]

    # --- BtbLc: idempotent by reference ---
    existing_lc = await db.execute(
        select(BtbLc).where(BtbLc.tenant_id == tenant.id)
    )
    btb_lcs = existing_lc.scalars().all()
    if not btb_lcs:
        lc1 = BtbLc(
            tenant_id=tenant.id,
            reference="LC-001",
            status="DRAFT",
            lc_date=date.today(),
            amount=45000.00,
        )
        lc2 = BtbLc(
            tenant_id=tenant.id,
            reference="LC-002",
            status="ISSUED",
            lc_date=date.today(),
            amount=69000.00,
        )
        db.add_all([lc1, lc2])
        btb_lcs = [lc1, lc2]

    await db.commit()
    print("Demo commercial (Export & Import) data seeded for Lakhsma tenant.")
    print(f"  ExportCase: {len(export_cases)} records")
    print(f"  ProformaInvoice: {len(proforma_invoices)} records (with order links)")
    print(f"  BtbLc: {len(btb_lcs)} records")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await seed_commercial(db)


if __name__ == "__main__":
    asyncio.run(main())
