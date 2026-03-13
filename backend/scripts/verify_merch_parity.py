"""
Quick verification checks for merchandising parity data linkage.

Run inside backend container:
  python scripts/verify_merch_parity.py
"""
import asyncio
import sys
from pathlib import Path
from sqlalchemy import select, func

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    Tenant,
    Inquiry,
    Quotation,
    Order,
    GarmentStyle,
    Bom,
    BomItem,
    StyleComponent,
    StyleColorway,
    StyleSizeScale,
    ConsumptionPlan,
    ConsumptionPlanItem,
    Followup,
    OrderAmendment,
    InquiryEvent,
)

LAKHSMA_CODE = "LAKHSMA4821"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
        ).scalar_one_or_none()
        if not tenant:
            raise RuntimeError("Lakhsma tenant not found.")

        counts = {}
        for label, model in [
            ("inquiries", Inquiry),
            ("quotations", Quotation),
            ("orders", Order),
            ("styles", GarmentStyle),
            ("boms", Bom),
            ("bom_items", BomItem),
            ("style_components", StyleComponent),
            ("style_colorways", StyleColorway),
            ("style_size_scales", StyleSizeScale),
            ("consumption_plans", ConsumptionPlan),
            ("consumption_plan_items", ConsumptionPlanItem),
            ("followups", Followup),
            ("order_amendments", OrderAmendment),
            ("inquiry_events", InquiryEvent),
        ]:
            counts[label] = (
                await db.execute(
                    select(func.count()).select_from(model).where(model.tenant_id == tenant.id)
                )
            ).scalar() or 0

        linkage = (
            await db.execute(
                select(func.count())
                .select_from(Order)
                .where(Order.tenant_id == tenant.id, Order.quotation_id.is_not(None))
            )
        ).scalar() or 0
        print("Merch parity verification")
        print(f"Tenant: {tenant.id} ({tenant.company_code})")
        for k in sorted(counts.keys()):
            print(f"- {k}: {counts[k]}")
        print(f"- orders linked to quotation: {linkage}")
        print("OK")


if __name__ == "__main__":
    asyncio.run(main())
