"""Pydantic schemas for inbound job work."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class DeliverableIn(BaseModel):
    style_ref: str | None = None
    color: str | None = None
    size: str | None = None
    style_id: int | None = None
    colorway_id: int | None = None
    order_id: int | None = None
    qty_ordered: str = "0"
    notes: str | None = None


class MaterialIn(BaseModel):
    item_id: int
    style_id: int | None = None
    colorway_id: int | None = None
    consumption_per_unit: str = "0"
    qty_planned: str = "0"
    notes: str | None = None


class ContractCreate(BaseModel):
    customer_id: int
    final_customer_id: int | None = None
    final_customer_name: str | None = None
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    principal_ud_ref: str | None = None
    cm_rate: str
    currency: str = "BDT"
    exchange_rate_default: str = "1"
    vat_rate_pct: str = "0"
    do_cutting: bool = False
    do_sewing: bool = False
    do_finishing: bool = False
    location_label: str | None = None
    contract_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    deliverables: list[DeliverableIn] = Field(default_factory=list)
    materials: list[MaterialIn] = Field(default_factory=list)


class ContractUpdate(BaseModel):
    final_customer_id: int | None = None
    final_customer_name: str | None = None
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    principal_ud_ref: str | None = None
    cm_rate: str | None = None
    currency: str | None = None
    exchange_rate_default: str | None = None
    vat_rate_pct: str | None = None
    do_cutting: bool | None = None
    do_sewing: bool | None = None
    do_finishing: bool | None = None
    location_label: str | None = None
    contract_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    deliverables: list[DeliverableIn] | None = None
    materials: list[MaterialIn] | None = None


class DeliverableOut(BaseModel):
    id: int
    style_ref: str | None
    color: str | None
    size: str | None
    style_id: int | None = None
    colorway_id: int | None = None
    order_id: int | None = None
    qty_ordered: str
    qty_produced: str
    qty_delivered: str
    qty_rejected: str
    notes: str | None

    model_config = {"from_attributes": True}


class MaterialOut(BaseModel):
    id: int
    item_id: int
    style_id: int | None = None
    colorway_id: int | None = None
    consumption_per_unit: str
    qty_planned: str
    qty_received: str
    qty_consumed: str
    qty_returned: str
    qty_remaining: str
    notes: str | None

    model_config = {"from_attributes": True}


class ContractListItem(BaseModel):
    id: int
    contract_no: str
    customer_id: int
    customer_name: str | None = None
    status: str
    cm_rate: str
    currency: str
    do_cutting: bool
    do_sewing: bool
    do_finishing: bool
    qty_ordered_total: str
    qty_produced_total: str
    qty_delivered_accepted: str
    qty_billed: str
    amount_billed: str
    amount_received: str
    contract_date: date | None
    created_at: datetime


class ContractDetail(BaseModel):
    id: int
    contract_no: str
    customer_id: int
    customer_name: str | None = None
    final_customer_id: int | None = None
    final_customer_name: str | None = None
    master_contract_id: int | None = None
    proforma_invoice_id: int | None = None
    principal_ud_ref: str | None = None
    status: str
    cm_rate: str
    currency: str
    exchange_rate_default: str
    vat_rate_pct: str
    do_cutting: bool
    do_sewing: bool
    do_finishing: bool
    location_label: str | None
    contract_date: date | None
    due_date: date | None
    notes: str | None
    qty_ordered_total: str
    qty_produced_total: str
    qty_delivered_accepted: str
    qty_rejected_total: str
    qty_billed: str
    amount_billed: str
    amount_received: str
    billable_qty: str
    deliverables: list[DeliverableOut]
    materials: list[MaterialOut]
    created_at: datetime
    updated_at: datetime


class MaterialMovementIn(BaseModel):
    material_id: int
    qty: str
    movement_date: date | None = None
    doc_no: str | None = None
    note: str | None = None


class LedgerOut(BaseModel):
    id: int
    material_id: int
    movement_kind: str
    qty: str
    doc_no: str | None
    movement_date: date
    note: str | None
    created_at: datetime


class ProduceLineIn(BaseModel):
    deliverable_id: int
    qty_produced: str


class ProduceIn(BaseModel):
    lines: list[ProduceLineIn]


class DeliveryLineIn(BaseModel):
    deliverable_id: int | None = None
    style_ref: str | None = None
    color: str | None = None
    size: str | None = None
    qty_delivered: str
    qty_rejected: str = "0"


class DeliveryCreate(BaseModel):
    delivery_date: date | None = None
    reference_doc: str | None = None
    notes: str | None = None
    lines: list[DeliveryLineIn]


class DeliveryLineOut(BaseModel):
    id: int
    deliverable_id: int | None
    style_ref: str | None
    color: str | None
    size: str | None
    qty_delivered: str
    qty_rejected: str


class DeliveryOut(BaseModel):
    id: int
    delivery_no: str
    delivery_date: date
    reference_doc: str | None
    notes: str | None
    qty_delivered: str
    qty_rejected: str
    qty_accepted: str
    lines: list[DeliveryLineOut]
    created_at: datetime


class BillCreate(BaseModel):
    qty_billed: str | None = None  # default = remaining billable
    bill_date: date | None = None
    exchange_rate: str | None = None
    vat_rate_pct: str | None = None
    notes: str | None = None
    request_id: str | None = Field(default=None, max_length=64)


class BillOut(BaseModel):
    id: int
    bill_no: str
    bill_date: date
    qty_billed: str
    cm_rate: str
    currency: str
    exchange_rate: str
    vat_rate_pct: str
    vat_amount: str
    net_amount: str
    gross_amount: str
    amount_received: str
    status: str
    voucher_id: int | None
    outstanding_bill_id: int | None
    notes: str | None
    created_at: datetime


class ReceiptCreate(BaseModel):
    bill_id: int
    amount: str
    cash_or_bank_account_id: int
    receipt_date: date | None = None
    exchange_rate: str | None = None
    notes: str | None = None
    request_id: str | None = Field(default=None, max_length=64)


class ReceiptOut(BaseModel):
    id: int
    bill_id: int
    receipt_no: str
    receipt_date: date
    amount: str
    currency: str
    exchange_rate: str
    cash_or_bank_account_id: int
    status: str
    voucher_id: int | None
    notes: str | None
    created_at: datetime


class CloseReport(BaseModel):
    can_close: bool
    blockers: list[str]
    warnings: list[str]
    materials_remaining: str
    open_ar: str
    variance_notes: list[str]


ContractStatus = Literal["DRAFT", "CONFIRMED", "IN_PROGRESS", "DELIVERED", "BILLED", "CLOSED"]
