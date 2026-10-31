"""
Phase 1.5 idempotent demo seed: Order → POSTED challan → CI draft → packing list
→ payroll structure assignment (preview-ready).

Marker: packing list number P1-DEMO-PL-01 (or commercial invoice CI with notes containing P1-DEMO).

Prerequisites: Lakhsma interconnected demo (or any tenant with customers/orders/items/warehouses).

Run:
  docker compose exec backend alembic upgrade head
  docker compose exec backend python scripts/seed_phase1_sales_ready_demo.py --company-code LAKH806201
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    CommercialInvoice,
    Customer,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    Item,
    Order,
    PackingList,
    Tenant,
    Warehouse,
)
from app.models.hr import Employee  # noqa: E402
from app.models.hr_payroll import (  # noqa: E402
    PayrollEmployeeStructureAssignment,
    PayrollStructure,
)
from app.modules.commercial.commercial_invoice_service import (  # noqa: E402
    create_invoices_from_delivery_challan,
)

DEFAULT_COMPANY_CODE = "LAKH806201"
MARKER_PL = "P1-DEMO-PL-01"
MARKER_CHALLAN = "P1-DEMO-DC-01"


async def _get_tenant(db, company_code: str) -> Tenant:
    row = (
        await db.execute(select(Tenant).where(Tenant.company_code == company_code))
    ).scalar_one_or_none()
    if not row:
        raise SystemExit(f"Tenant with company_code={company_code} not found")
    return row


async def seed(company_code: str) -> None:
    async with AsyncSessionLocal() as db:
        tenant = await _get_tenant(db, company_code)
        tid = tenant.id

        existing_pl = (
            await db.execute(
                select(PackingList).where(
                    PackingList.tenant_id == tid,
                    PackingList.packing_list_number == MARKER_PL,
                )
            )
        ).scalar_one_or_none()
        if existing_pl:
            print(f"Marker {MARKER_PL} exists — Phase 1.5 demo already seeded (idempotent skip).")
            return

        order = (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tid)
                .order_by(Order.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if not order:
            raise SystemExit("No orders found — run Lakhsma interconnected demo first")

        snap = dict(order.commercial_snapshot_json or {})
        if not snap.get("quoted_price"):
            snap["quoted_price"] = "10.00"
            snap["document_currency"] = snap.get("document_currency") or "USD"
            order.commercial_snapshot_json = snap
            await db.flush()

        item = (
            await db.execute(select(Item).where(Item.tenant_id == tid).limit(1))
        ).scalar_one_or_none()
        wh = (
            await db.execute(select(Warehouse).where(Warehouse.tenant_id == tid).limit(1))
        ).scalar_one_or_none()
        if not item or not wh:
            raise SystemExit("Need at least 1 item and 1 warehouse")

        challan = (
            await db.execute(
                select(DeliveryChallan).where(
                    DeliveryChallan.tenant_id == tid,
                    DeliveryChallan.challan_code == MARKER_CHALLAN,
                )
            )
        ).scalar_one_or_none()
        if not challan:
            customer = await db.get(Customer, order.customer_id)
            challan = DeliveryChallan(
                tenant_id=tid,
                challan_code=MARKER_CHALLAN,
                customer_name=(customer.name if customer else "Buyer")[:128],
                delivery_date=date.today(),
                status="POSTED",
                notes="P1-DEMO Phase 1.5 seed",
            )
            db.add(challan)
            await db.flush()
            db.add(
                DeliveryChallanItem(
                    tenant_id=tid,
                    challan_id=challan.id,
                    item_id=item.id,
                    warehouse_id=wh.id,
                    quantity=Decimal("10"),
                )
            )
            db.add(
                DeliveryChallanOrder(
                    tenant_id=tid,
                    delivery_challan_id=challan.id,
                    order_id=order.id,
                )
            )
            await db.flush()
            print(f"Created POSTED challan {MARKER_CHALLAN}")

        # Commercial invoice from challan (draft)
        try:
            invoices, created = await create_invoices_from_delivery_challan(
                db,
                tenant_id=tid,
                user_id=None,
                challan_id=challan.id,
                idempotency_key="p1-demo-ci",
                exchange_rate_to_base=Decimal("1"),
            )
            if created and invoices:
                invoices[0].notes = (invoices[0].notes or "") + " | P1-DEMO"
                print(f"Created CI draft {invoices[0].invoice_code}")
            else:
                print("CI already present for challan (idempotent)")
        except Exception as exc:
            print(f"CI create skipped: {exc}")

        pl = PackingList(
            tenant_id=tid,
            packing_list_number=MARKER_PL,
            order_id=order.id,
            delivery_challan_id=challan.id,
            packing_date=date.today(),
            total_cartons=5,
            gross_weight=Decimal("50"),
            net_weight=Decimal("45"),
            status="DRAFT",
            notes="P1-DEMO Phase 1.5",
        )
        db.add(pl)
        print(f"Created packing list {MARKER_PL}")

        structure = (
            await db.execute(
                select(PayrollStructure)
                .where(PayrollStructure.tenant_id == tid, PayrollStructure.is_active.is_(True))
                .limit(1)
            )
        ).scalar_one_or_none()
        employee = (
            await db.execute(select(Employee).where(Employee.tenant_id == tid).limit(1))
        ).scalar_one_or_none()
        if structure and employee:
            existing_asgn = (
                await db.execute(
                    select(PayrollEmployeeStructureAssignment).where(
                        PayrollEmployeeStructureAssignment.tenant_id == tid,
                        PayrollEmployeeStructureAssignment.employee_id == employee.id,
                        PayrollEmployeeStructureAssignment.structure_id == structure.id,
                    )
                )
            ).scalar_one_or_none()
            if not existing_asgn:
                db.add(
                    PayrollEmployeeStructureAssignment(
                        tenant_id=tid,
                        employee_id=employee.id,
                        structure_id=structure.id,
                        effective_from=date.today().replace(day=1),
                        base_salary=Decimal("15000"),
                    )
                )
                print(f"Assigned structure {structure.code} to employee {employee.id}")
            else:
                print("Payroll assignment already exists")
        else:
            print("Skipped payroll assignment (no structure or employee)")

        # Enable payroll auto-calc flag for demo tenant (opt-in for preview/apply demos)
        flags = dict(tenant.feature_flags or {})
        flags["payroll_auto_calculate_enabled"] = True
        tenant.feature_flags = flags

        await db.commit()
        print("Phase 1.5 demo seed complete.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company-code", default=DEFAULT_COMPANY_CODE)
    args = parser.parse_args()
    asyncio.run(seed(args.company_code))


if __name__ == "__main__":
    main()
