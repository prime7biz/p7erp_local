from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class OrderCreate(BaseModel):
  customer_id: int = Field(..., gt=0)
  quotation_id: int | None = Field(None, gt=0)
  style_id: int | None = Field(None, gt=0)
  style_ref: str | None = Field(None, max_length=128)
  customer_intermediary_id: int | None = Field(None, gt=0)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  order_date: date | None = None
  delivery_date: date | None = None
  quantity: int | None = Field(None, ge=0)
  status: str | None = Field(None, max_length=32)
  remarks: str | None = None


class OrderUpdate(BaseModel):
  style_id: int | None = Field(None, gt=0)
  style_ref: str | None = Field(None, max_length=128)
  customer_intermediary_id: int | None = Field(None, gt=0)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  order_date: date | None = None
  delivery_date: date | None = None
  quantity: int | None = Field(None, ge=0)
  status: str | None = Field(None, max_length=32)
  remarks: str | None = None


class OrderFinancialStatusOut(BaseModel):
  pi_issued: bool = False
  buyer_document_received: bool = False
  master_contract_type: str | None = None
  bank_facility_linked: bool = False
  btb_utilization_pct: float | None = None
  btb_lc_count: int = 0
  btb_lc_opened_count: int = 0
  in_production: bool = False
  shipped: bool = False


class OrderSewingLineAllocationOut(BaseModel):
  line_id: int
  line_code: str
  reservation_status: str
  start_date: str | None = None
  planned_end_date: str | None = None
  actual_end_date: str | None = None
  booked_at: str | None = None


class OrderSewingLineSummaryOut(BaseModel):
  allocations: list[OrderSewingLineAllocationOut] = Field(default_factory=list)
  primary_line_code: str | None = None
  primary_planned_end_date: str | None = None
  primary_booked_at: str | None = None
  delivery_on_track: Literal["yes", "no", "unknown"] = "unknown"
  extra_allocation_count: int = 0


class OrderResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  quotation_id: int | None
  order_code: str
  style_id: int | None = None
  style_ref: str | None
  customer_intermediary_id: int | None
  shipping_term: str | None
  commission_mode: str | None
  commission_type: str | None
  commission_value: float | None
  order_date: str | None  # ISO date string for JSON
  delivery_date: str | None  # ISO date string for JSON
  quantity: int | None
  status: str
  pipeline_status: str | None = None
  pipeline_na_steps: list[str] | None = None
  order_type: str | None = None
  master_contract_id: int | None = None
  rm_inhouse_pct: float | None = None
  remarks: str | None
  created_at: str
  updated_at: str
  ai_indicators: Any | None = None
  # Frozen quotation commercial header at conversion (nullable for legacy orders).
  commercial_snapshot: dict[str, Any] | None = None
  commercial_book_currency: str | None = None
  # Populated on paginated list / joins for UI (optional).
  customer_name: str | None = None
  quotation_code: str | None = None
  financial_status: OrderFinancialStatusOut | None = None
  sewing_line_summary: OrderSewingLineSummaryOut | None = None

  class Config:
    from_attributes = True


class OrderListPageResponse(BaseModel):
  items: list[OrderResponse]
  total: int
  page: int
  page_size: int
  total_pages: int


class OrderCommercialAlignmentOut(BaseModel):
  """Read-only quotation↔order commercial comparison for governance UI."""

  commercial_book_currency: str | None = None
  costing_numeraire_description: str = ""
  frozen_at_conversion: dict[str, Any] | None = None
  live_quotation: dict[str, Any] | None = None
  order_execution: dict[str, Any] = Field(default_factory=dict)
  discrepancies: list[dict[str, str]] = Field(default_factory=list)
  quotation_commercially_locked: bool = False
  quotation_status: str | None = None


class PromiseCheckLine(BaseModel):
  item_id: int
  item_code: str
  required_qty: float
  available_qty: float
  shortage_qty: float


class PromiseCheckOut(BaseModel):
  order_id: int
  atp_ok: bool
  ctp_ok: bool
  reasons: list[str]
  lines: list[PromiseCheckLine]


class OrderMilestoneStepOut(BaseModel):
  name: str
  status: str
  timestamp: str | None = None
  linked_ids: list[int] = Field(default_factory=list)
  rm_pct: float | None = None


class OrderMilestonesOut(BaseModel):
  pipeline_status: str
  rm_inhouse_pct: float
  steps: list[OrderMilestoneStepOut]
  tna_warnings: list[str] = Field(default_factory=list)
  pipeline_na_steps: list[str] = Field(default_factory=list)
  order_type: str | None = None


class OrderPipelineSettingsPatch(BaseModel):
  na_steps: list[str] | None = None
  order_type: str | None = Field(None, max_length=16)

