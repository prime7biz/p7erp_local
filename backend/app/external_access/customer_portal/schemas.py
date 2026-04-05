from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class CustomerOrderListItem(BaseModel):
    id: int
    order_code: str
    style_ref: str | None
    status: str
    quantity: int | None
    order_date: date | None
    delivery_date: date | None
    updated_at: datetime
    pending_approval_steps: int = 0
    production_summary: str | None = None


class CustomerOrderListResponse(BaseModel):
    items: list[CustomerOrderListItem]
    total: int


class CustomerOrderDetail(BaseModel):
    id: int
    order_code: str
    style_ref: str | None
    status: str
    quantity: int | None
    order_date: date | None
    delivery_date: date | None
    shipping_term: str | None
    updated_at: datetime


class CustomerApprovalStep(BaseModel):
    id: int
    title: str
    phase: str
    status: str
    approval_status: str | None
    planned_date: date | None
    milestone_type: str | None


class CustomerApprovalWithOrder(CustomerApprovalStep):
    order_id: int
    order_code: str


class CustomerProductionSummary(BaseModel):
    work_orders_tracked: int
    operations_completed: int
    operations_total: int
    status_hint: str


class CustomerShipmentRow(BaseModel):
    id: int
    order_id: int | None
    order_code: str | None
    trade_reference: str | None
    shipment_reference: str
    status: str
    carrier: str | None
    etd: date | None
    eta: date | None


class CustomerNoteItem(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    body: str
    visibility: str
    created_at: datetime
    from_party: str = "customer"


class CustomerNoteListResponse(BaseModel):
    items: list[CustomerNoteItem]
    total: int


class CustomerNoteCreate(BaseModel):
    entity_type: str = Field(..., max_length=64)
    entity_id: int = Field(..., ge=1)
    body: str = Field(..., min_length=1, max_length=8000)


class CustomerDashboardResponse(BaseModel):
    active_orders: int
    pending_approval_steps: int
    in_production_hint: int
    ready_to_ship: int
    delayed_items: int
    next_shipment_eta: date | None
    next_delivery_expected: date | None
    recent_orders: list[CustomerOrderListItem]


class PortalMeta(BaseModel):
    total: int = 0


class CustomerDocumentsResponse(BaseModel):
    items: list[dict]
    total: int
