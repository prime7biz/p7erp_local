"""Pydantic schemas for Sprint I1 MRP / IDT / process loss APIs."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.common.orm_numeric import decimal_money_passthrough


class MRPRunBody(BaseModel):
    order_ids: list[int] | None = None
    item_ids: list[int] | None = None
    horizon_days: int = 90
    as_of_date: date | None = None


class MRPExceptionOut(BaseModel):
    severity: str
    code: str
    message: str
    item_id: int | None = None
    order_id: int | None = None


class PlannedOrderOut(BaseModel):
    id: int
    planned_order_number: str
    source_type: str
    source_order_id: int | None = None
    source_bom_id: int | None = None
    item_id: int
    required_qty: str
    planned_qty: str
    requirement_date: date
    release_date: date
    action: str
    status: str
    generated_po_id: int | None = None
    generated_mo_id: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

    _qty = field_validator("required_qty", "planned_qty", mode="before")(decimal_money_passthrough)


class BOMExplosionLineOut(BaseModel):
    level: int
    item_id: int
    item_code: str | None = None
    parent_item_id: int | None = None
    qty_per: str
    required_qty: str
    bom_id: int | None = None
    source_order_id: int | None = None


class MRPRunResultOut(BaseModel):
    planned_orders: list[PlannedOrderOut]
    exceptions: list[MRPExceptionOut]
    explosion: list[BOMExplosionLineOut] = Field(default_factory=list)


class ReleaseResultOut(BaseModel):
    planned_order: PlannedOrderOut
    generated_po_id: int | None = None
    generated_mo_id: int | None = None
    document_type: str | None = None
    document_number: str | None = None


class ReorderSuggestionOut(BaseModel):
    id: int
    item_id: int
    warehouse_id: int | None = None
    current_stock: str
    reorder_level: str
    suggested_qty: str
    preferred_vendor_id: int | None = None
    estimated_cost: str | None = None
    status: str
    generated_po_id: int | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}

    _amounts = field_validator(
        "current_stock", "reorder_level", "suggested_qty", "estimated_cost", mode="before"
    )(decimal_money_passthrough)


class ReorderCheckResultOut(BaseModel):
    suggestions_created: int
    items_checked: int
    suggestions: list[ReorderSuggestionOut]


class BulkConvertBody(BaseModel):
    suggestion_ids: list[int]


class ConvertResultOut(BaseModel):
    suggestion: ReorderSuggestionOut
    purchase_order_id: int
    po_code: str | None = None


class IDTLineIn(BaseModel):
    source_item_id: int
    source_qty: Decimal
    source_batch_id: int | None = None
    source_unit_cost: Decimal | None = None


class IDTCreateBody(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    process_name: str
    source_item_id: int
    source_qty: Decimal
    source_qty_unit: str = "kg"
    target_item_id: int
    target_qty_expected: Decimal
    target_qty_unit: str = "kg"
    idt_date: date | None = None
    source_batch_id: int | None = None
    is_job_work: bool = False
    job_work_vendor_id: int | None = None
    job_work_cost_per_unit: Decimal | None = None
    transport_cost: Decimal | None = None
    other_charges: Decimal | None = None
    linked_order_id: int | None = None
    narration: str | None = None
    lines: list[IDTLineIn] | None = None


class IDTReceiveBody(BaseModel):
    target_qty_received: Decimal
    target_batch_number: str | None = None
    notes: str | None = None


class IDTLineOut(BaseModel):
    id: int
    source_item_id: int
    source_qty: str
    source_batch_id: int | None = None
    source_unit_cost: str | None = None


class IDTOut(BaseModel):
    id: int
    idt_number: str
    idt_date: date
    from_warehouse_id: int
    to_warehouse_id: int
    process_name: str
    source_item_id: int
    source_qty_issued: str
    source_qty_unit: str
    source_batch_id: int | None = None
    target_item_id: int
    target_qty_expected: str
    target_qty_received: str | None = None
    target_qty_unit: str
    process_loss_qty: str | None = None
    process_loss_percent: str | None = None
    standard_process_loss_percent: str | None = None
    loss_exception: bool = False
    is_job_work: bool = False
    job_work_vendor_id: int | None = None
    job_work_cost_per_unit: str | None = None
    job_work_total_cost: str | None = None
    transport_cost: str = "0"
    other_charges: str = "0"
    status: str
    source_item_cost: str | None = None
    target_item_value: str | None = None
    linked_order_id: int | None = None
    narration: str | None = None
    lines: list[IDTLineOut] = Field(default_factory=list)
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProcessLossStandardIn(BaseModel):
    process_name: str
    standard_loss_percent: Decimal
    warning_threshold_percent: Decimal = Decimal("5.00")
    item_category_id: int | None = None
    is_active: bool = True


class ProcessLossStandardOut(BaseModel):
    id: int
    process_name: str
    standard_loss_percent: str
    warning_threshold_percent: str
    item_category_id: int | None = None
    is_active: bool

    model_config = {"from_attributes": True}

    _pct = field_validator("standard_loss_percent", "warning_threshold_percent", mode="before")(
        decimal_money_passthrough
    )


class ProcessLossReportRowOut(BaseModel):
    process_name: str
    total_issued: str
    total_received: str
    total_loss: str
    loss_percent: str
    standard_percent: str
    variance_percent: str
    status: str
    exception_count: int = 0


class ProcessLossReportOut(BaseModel):
    from_date: date
    to_date: date
    rows: list[ProcessLossReportRowOut]


class PostCostingStageOut(BaseModel):
    stage: str
    input_qty: str | None = None
    output_qty: str | None = None
    loss_percent: str | None = None
    input_cost: str | None = None
    job_work: str | None = None
    output_cost_per_unit: str | None = None
    idt_id: int | None = None
    loss_exception: bool = False


class PostCostingReportOut(BaseModel):
    order_id: int
    order_code: str | None = None
    order_qty: int | None = None
    stages: list[PostCostingStageOut]
    final_unit_cost: str | None = None
    standard_unit_cost: str | None = None
    cost_variance: str | None = None
    cost_variance_pct: str | None = None
    variance_drivers: list[str] = Field(default_factory=list)
