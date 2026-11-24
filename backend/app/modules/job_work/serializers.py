"""Response builders for inbound job work."""

from __future__ import annotations

from app.models.customer import Customer
from app.models.job_work import (
    JobWorkBill,
    JobWorkContract,
    JobWorkDeliverable,
    JobWorkDelivery,
    JobWorkDeliveryLine,
    JobWorkMaterial,
    JobWorkMaterialLedger,
    JobWorkReceipt,
)
from app.modules.job_work.money import ZERO, d, q4, s4
from app.modules.job_work.schemas import (
    BillOut,
    ContractDetail,
    ContractListItem,
    DeliverableOut,
    DeliveryLineOut,
    DeliveryOut,
    LedgerOut,
    MaterialOut,
    ReceiptOut,
)


def material_remaining(m: JobWorkMaterial) -> str:
    rem = q4(m.qty_received) - q4(m.qty_consumed) - q4(m.qty_returned)
    if rem < ZERO:
        rem = ZERO
    return s4(rem)


def billable_qty(contract: JobWorkContract) -> str:
    rem = q4(contract.qty_delivered_accepted) - q4(contract.qty_billed)
    if rem < ZERO:
        rem = ZERO
    return s4(rem)


def deliverable_out(row: JobWorkDeliverable) -> DeliverableOut:
    return DeliverableOut(
        id=row.id,
        style_ref=row.style_ref,
        color=row.color,
        size=row.size,
        qty_ordered=row.qty_ordered,
        qty_produced=row.qty_produced,
        qty_delivered=row.qty_delivered,
        qty_rejected=row.qty_rejected,
        notes=row.notes,
    )


def material_out(row: JobWorkMaterial) -> MaterialOut:
    return MaterialOut(
        id=row.id,
        item_id=row.item_id,
        consumption_per_unit=row.consumption_per_unit,
        qty_planned=row.qty_planned,
        qty_received=row.qty_received,
        qty_consumed=row.qty_consumed,
        qty_returned=row.qty_returned,
        qty_remaining=material_remaining(row),
        notes=row.notes,
    )


def list_item(contract: JobWorkContract, customer: Customer | None) -> ContractListItem:
    return ContractListItem(
        id=contract.id,
        contract_no=contract.contract_no,
        customer_id=contract.customer_id,
        customer_name=customer.name if customer else None,
        status=contract.status,
        cm_rate=contract.cm_rate,
        currency=contract.currency,
        do_cutting=bool(contract.do_cutting),
        do_sewing=bool(contract.do_sewing),
        do_finishing=bool(contract.do_finishing),
        qty_ordered_total=contract.qty_ordered_total,
        qty_produced_total=contract.qty_produced_total,
        qty_delivered_accepted=contract.qty_delivered_accepted,
        qty_billed=contract.qty_billed,
        amount_billed=contract.amount_billed,
        amount_received=contract.amount_received,
        contract_date=contract.contract_date,
        created_at=contract.created_at,
    )


def detail_out(
    contract: JobWorkContract,
    *,
    customer: Customer | None,
    deliverables: list[JobWorkDeliverable],
    materials: list[JobWorkMaterial],
) -> ContractDetail:
    return ContractDetail(
        id=contract.id,
        contract_no=contract.contract_no,
        customer_id=contract.customer_id,
        customer_name=customer.name if customer else None,
        status=contract.status,
        cm_rate=contract.cm_rate,
        currency=contract.currency,
        exchange_rate_default=contract.exchange_rate_default,
        vat_rate_pct=contract.vat_rate_pct,
        do_cutting=bool(contract.do_cutting),
        do_sewing=bool(contract.do_sewing),
        do_finishing=bool(contract.do_finishing),
        location_label=contract.location_label,
        contract_date=contract.contract_date,
        due_date=contract.due_date,
        notes=contract.notes,
        qty_ordered_total=contract.qty_ordered_total,
        qty_produced_total=contract.qty_produced_total,
        qty_delivered_accepted=contract.qty_delivered_accepted,
        qty_rejected_total=contract.qty_rejected_total,
        qty_billed=contract.qty_billed,
        amount_billed=contract.amount_billed,
        amount_received=contract.amount_received,
        billable_qty=billable_qty(contract),
        deliverables=[deliverable_out(x) for x in deliverables],
        materials=[material_out(x) for x in materials],
        created_at=contract.created_at,
        updated_at=contract.updated_at,
    )


def ledger_out(row: JobWorkMaterialLedger) -> LedgerOut:
    return LedgerOut(
        id=row.id,
        material_id=row.material_id,
        movement_kind=row.movement_kind,
        qty=s4(d(row.qty)),
        doc_no=row.doc_no,
        movement_date=row.movement_date,
        note=row.note,
        created_at=row.created_at,
    )


def delivery_out(row: JobWorkDelivery, lines: list[JobWorkDeliveryLine]) -> DeliveryOut:
    return DeliveryOut(
        id=row.id,
        delivery_no=row.delivery_no,
        delivery_date=row.delivery_date,
        reference_doc=row.reference_doc,
        notes=row.notes,
        qty_delivered=row.qty_delivered,
        qty_rejected=row.qty_rejected,
        qty_accepted=row.qty_accepted,
        lines=[
            DeliveryLineOut(
                id=ln.id,
                deliverable_id=ln.deliverable_id,
                style_ref=ln.style_ref,
                color=ln.color,
                size=ln.size,
                qty_delivered=ln.qty_delivered,
                qty_rejected=ln.qty_rejected,
            )
            for ln in lines
        ],
        created_at=row.created_at,
    )


def bill_out(row: JobWorkBill) -> BillOut:
    return BillOut(
        id=row.id,
        bill_no=row.bill_no,
        bill_date=row.bill_date,
        qty_billed=row.qty_billed,
        cm_rate=row.cm_rate,
        currency=row.currency,
        exchange_rate=row.exchange_rate,
        vat_rate_pct=row.vat_rate_pct,
        vat_amount=row.vat_amount,
        net_amount=row.net_amount,
        gross_amount=row.gross_amount,
        amount_received=row.amount_received,
        status=row.status,
        voucher_id=row.voucher_id,
        outstanding_bill_id=row.outstanding_bill_id,
        notes=row.notes,
        created_at=row.created_at,
    )


def receipt_out(row: JobWorkReceipt) -> ReceiptOut:
    return ReceiptOut(
        id=row.id,
        bill_id=row.bill_id,
        receipt_no=row.receipt_no,
        receipt_date=row.receipt_date,
        amount=row.amount,
        currency=row.currency,
        exchange_rate=row.exchange_rate,
        cash_or_bank_account_id=row.cash_or_bank_account_id,
        status=row.status,
        voucher_id=row.voucher_id,
        notes=row.notes,
        created_at=row.created_at,
    )
