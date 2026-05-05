"""Knitting-related automatic finance posting on knitting process orders."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import Customer, OutstandingBill, ProcessOrder, Tenant, Vendor
from app.modules.finance.auto_posting_service import AutoPostingLine, create_system_voucher
from app.services.inventory_account_resolver import resolve_inventory_accounts


def _money_to_decimal(amount: float) -> Decimal:
    return Decimal(str(round(float(amount), 2)))


async def maybe_post_knitting_subcontract_accrual_before_receive_gl(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    po: ProcessOrder,
    knitting_charge_amount: float,
    movement_date: date,
) -> None:
    """Subcontract knitting: debit WIP, credit AP (before FG receipt clears WIP at full cost)."""
    if (po.process_type or "").strip().lower() != "knitting":
        return
    method = (po.process_method or "in_house").strip().lower()
    if method != "subcontract":
        return
    if po.knitting_service_voucher_id is not None:
        return
    if knitting_charge_amount <= 0:
        return
    if po.vendor_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subcontract knitting requires vendor_id on the process order before receive.",
        )

    tenant_r = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_r.scalars().first()
    if tenant is None:
        return
    base_currency = (tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"

    acc_map = await resolve_inventory_accounts(db, tenant_id, po.output_item_id)
    wip_acc = acc_map.get("wip")
    if not wip_acc:
        raise HTTPException(status_code=400, detail="Output item missing WIP account mapping for subcontract knitting charge.")

    amt = _money_to_decimal(knitting_charge_amount)
    narration = f"Knitting subcontract accrual {po.process_number}"
    v = await create_system_voucher(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_type="JOURNAL",
        voucher_date=movement_date or date.today(),
        lines=[
            AutoPostingLine(entry_type="DEBIT", amount=amt, account_id=int(wip_acc), notes=narration),
            AutoPostingLine(
                entry_type="CREDIT",
                amount=amt,
                system_code="ACCOUNTS_PAYABLE_TRADE",
                notes=narration,
            ),
        ],
        description=narration,
        reference=po.process_number,
        source_module="KNITTING_PROCESS_ORDER",
        source_module_ref=f"PROCESS_ORDER_SUBCONTRACT_CHARGE:{po.id}",
        currency=base_currency,
        auto_post=True,
    )
    po.knitting_service_voucher_id = v.id
    await db.flush()

    vr = await db.execute(select(Vendor).where(Vendor.id == po.vendor_id))
    vendor = vr.scalars().first()
    party_name = vendor.name.strip() if vendor and vendor.name else f"VENDOR-{po.vendor_id}"
    prefix = "AP-"
    bill_code = await next_tenant_code(
        db,
        model=OutstandingBill,
        tenant_id=tenant_id,
        prefix=prefix,
        width=4,
    )
    due = (movement_date or date.today()) + timedelta(days=30)
    bill = OutstandingBill(
        tenant_id=tenant_id,
        bill_no=bill_code,
        party_name=party_name,
        bill_type="PAYABLE",
        bill_date=movement_date or date.today(),
        due_date=due,
        amount=str(round(float(knitting_charge_amount), 2)),
        paid_amount="0",
        currency=base_currency,
        status="OPEN",
        notes=f"Knitting subcontract | {po.process_number} | voucher:{v.voucher_number}",
    )
    db.add(bill)
    await db.flush()


async def maybe_post_knitting_jobwork_revenue_after_receive_gl(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    po: ProcessOrder,
    knitting_charge_amount: float,
    movement_date: date,
) -> None:
    """Customer job knitting: debit AR / credit Service revenue after greige receipt (charge excluded from stock value)."""
    if (po.process_type or "").strip().lower() != "knitting":
        return
    method = (po.process_method or "in_house").strip().lower()
    if method != "jobwork_customer":
        return
    if po.knitting_service_voucher_id is not None:
        return
    if knitting_charge_amount <= 0:
        return
    if po.customer_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer knitting job-work requires customer_id on the process order before receive.",
        )

    tenant_r = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_r.scalars().first()
    if tenant is None:
        return
    base_currency = (tenant.base_currency or "BDT").strip().upper()[:10] or "BDT"

    amt = _money_to_decimal(knitting_charge_amount)
    narration = f"Knitting jobwork revenue {po.process_number}"
    v = await create_system_voucher(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        voucher_type="JOURNAL",
        voucher_date=movement_date or date.today(),
        lines=[
            AutoPostingLine(entry_type="DEBIT", amount=amt, system_code="ACCOUNTS_RECEIVABLE_TRADE", notes=narration),
            AutoPostingLine(entry_type="CREDIT", amount=amt, system_code="SERVICE_REVENUE", notes=narration),
        ],
        description=narration,
        reference=po.process_number,
        source_module="KNITTING_PROCESS_ORDER",
        source_module_ref=f"PROCESS_ORDER_JOBWORK_CHARGE:{po.id}",
        currency=base_currency,
        auto_post=True,
    )
    po.knitting_service_voucher_id = v.id
    await db.flush()

    cr = await db.execute(select(Customer).where(Customer.id == po.customer_id))
    customer = cr.scalars().first()
    party_name = customer.name.strip() if customer and customer.name else f"CUSTOMER-{po.customer_id}"

    bill_code = await next_tenant_code(db, model=OutstandingBill, tenant_id=tenant_id, prefix="AR-", width=4)
    due = (movement_date or date.today()) + timedelta(days=30)
    # Keep bill currency aligned with voucher currency. No FX conversion is applied here.
    currency = base_currency
    bill = OutstandingBill(
        tenant_id=tenant_id,
        bill_no=bill_code,
        party_name=party_name,
        bill_type="RECEIVABLE",
        bill_date=movement_date or date.today(),
        due_date=due,
        amount=str(round(float(knitting_charge_amount), 2)),
        paid_amount="0",
        currency=currency,
        status="OPEN",
        notes=f"Knitting jobwork | {po.process_number} | voucher:{v.voucher_number}",
    )
    db.add(bill)
    await db.flush()
