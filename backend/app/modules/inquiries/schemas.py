from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.common.money_schema import MoneyStrOpt, RateStrOpt

INQUIRY_DEPARTMENT_OPTIONS = (
  "Infant",
  "Kids",
  "Boys",
  "Girls",
  "Men",
  "Ladies",
  "Knit",
  "Fleece",
  "Woven",
  "Denim",
  "Outerwear",
)

InquiryTypeLiteral = Literal[
  "SAMPLE_DEVELOPMENT",
  "SALESMAN_SAMPLE",
  "QUOTATION",
  "REPEAT_ORDER",
]


class TechnicalFileOut(BaseModel):
  id: str
  name: str | None = None
  filename: str
  url: str | None = None
  content_type: str | None = None
  size_bytes: int | None = None
  uploaded_at: str | None = None


class InquiryItemCreate(BaseModel):
  item_name: str | None = Field(None, max_length=255)
  description: str | None = Field(None, max_length=1000)
  quantity: int | None = Field(None, ge=0)
  sort_order: int | None = Field(None, ge=1)


class InquiryItemResponse(BaseModel):
  id: int
  item_name: str | None
  description: str | None
  quantity: int | None
  sort_order: int


class InquiryCreate(BaseModel):
  customer_id: int = Field(..., gt=0)
  style_ref: str | None = Field(None, max_length=128)
  style_id: int = Field(..., gt=0)
  customer_intermediary_id: int | None = Field(None, gt=0)
  season: str | None = Field(None, max_length=64)
  department: str | None = Field(None, max_length=64)
  quantity: int | None = Field(None, ge=0)
  target_price: MoneyStrOpt = Field(None, max_length=32)
  target_price_currency: str | None = Field(None, max_length=10)
  currency: str | None = Field(None, max_length=8)
  exchange_rate: RateStrOpt = Field(None, max_length=32)
  expected_delivery_date: date | None = None
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  notes: str | None = None
  inquiry_type: InquiryTypeLiteral | None = None
  brand: str | None = Field(None, max_length=128)
  season_year: str | None = Field(None, max_length=16)
  material_composition: str | None = None
  size_range: str | None = Field(None, max_length=128)
  color_options: list[str] | None = None
  country_of_origin: str | None = Field(None, max_length=64)
  special_requirements: str | None = None
  contact_person: str | None = Field(None, max_length=128)
  # technical_files are upload-only via POST /inquiries/{id}/technical-files (never from create body)
  items: list[InquiryItemCreate] = Field(default_factory=list)


class InquiryUpdate(BaseModel):
  style_ref: str | None = Field(None, max_length=128)
  style_id: int | None = Field(None, gt=0)
  customer_intermediary_id: int | None = Field(None, gt=0)
  season: str | None = Field(None, max_length=64)
  department: str | None = Field(None, max_length=64)
  quantity: int | None = Field(None, ge=0)
  target_price: MoneyStrOpt = Field(None, max_length=32)
  target_price_currency: str | None = Field(None, max_length=10)
  currency: str | None = Field(None, max_length=8)
  exchange_rate: RateStrOpt = Field(None, max_length=32)
  expected_delivery_date: date | None = None
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  status: str | None = Field(None, max_length=32)
  notes: str | None = None
  inquiry_type: InquiryTypeLiteral | None = None
  brand: str | None = Field(None, max_length=128)
  season_year: str | None = Field(None, max_length=16)
  material_composition: str | None = None
  size_range: str | None = Field(None, max_length=128)
  color_options: list[str] | None = None
  country_of_origin: str | None = Field(None, max_length=64)
  special_requirements: str | None = None
  contact_person: str | None = Field(None, max_length=128)
  items: list[InquiryItemCreate] | None = None


class InquiryAiIndicatorsOut(BaseModel):
  """Rules-based scores for list/detail (no LLM). Optional on list when ai_indicators=1."""

  completeness_score: int = Field(ge=0, le=100, default=0)
  quotation_readiness_score: int = Field(ge=0, le=100, default=0)
  flags: list[str] = Field(default_factory=list)


class InquiryResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  inquiry_code: str
  style_ref: str | None
  style_id: int | None
  style_name: str | None
  style_image_url: str | None
  customer_intermediary_id: int | None
  season: str | None
  department: str | None
  quantity: int | None
  target_price: str | None
  target_price_currency: str | None
  currency: str | None
  exchange_rate: str | None
  expected_delivery_date: str | None
  shipping_term: str | None
  commission_mode: str | None
  commission_type: str | None
  commission_value: float | None
  status: str
  next_status_options: list[str] = Field(default_factory=list)
  is_converted_to_quotation: bool = False
  converted_quotation_id: int | None = None
  notes: str | None
  inquiry_type: str | None = None
  brand: str | None = None
  season_year: str | None = None
  material_composition: str | None = None
  size_range: str | None = None
  color_options: list[str] | None = None
  country_of_origin: str | None = None
  special_requirements: str | None = None
  contact_person: str | None = None
  technical_files: list[TechnicalFileOut] = Field(default_factory=list)
  items: list[InquiryItemResponse] = Field(default_factory=list)
  created_at: str
  updated_at: str
  ai_indicators: InquiryAiIndicatorsOut | None = None
  # Populated on paginated list joins for UI (optional).
  customer_name: str | None = None

  class Config:
    from_attributes = True


class InquiryListPageResponse(BaseModel):
  items: list[InquiryResponse]
  total: int
  page: int
  page_size: int
  total_pages: int


class InquiryRelatedCustomerOut(BaseModel):
  id: int
  name: str
  customer_code: str
  status: str


class InquiryRelatedIntermediaryOut(BaseModel):
  id: int
  name: str | None = None
  label: str | None = None


class InquiryRelatedStyleOut(BaseModel):
  id: int
  style_code: str
  name: str
  style_image_url: str | None = None
  standard_smv: str | None = None
  standard_smv_confidence: str | None = None
  bom_count: int = 0
  latest_bom_id: int | None = None
  latest_bom_status: str | None = None
  estimated_sah: str | None = None


class InquiryRelatedQuotationOut(BaseModel):
  id: int
  quotation_code: str
  version_no: int
  status: str
  quoted_price: str | None = None
  currency: str | None = None


class InquiryRelatedOrderOut(BaseModel):
  id: int
  order_code: str
  status: str
  quantity: int | None = None
  delivery_date: str | None = None
  quotation_id: int | None = None


class InquiryRelatedSampleOut(BaseModel):
  id: int
  sample_code: str
  sample_type: str
  status: str
  target_date: str | None = None


class InquiryRelatedTentativeBookingOut(BaseModel):
  id: int
  line_id: int
  status: str
  start_date: str
  planned_end_date: str | None = None
  planned_qty: str
  confidence_pct: str
  expires_at: str | None = None


class InquiryRelatedTimelineEventOut(BaseModel):
  id: int
  event_type: str
  from_status: str | None = None
  to_status: str | None = None
  notes: str | None = None
  created_at: str


class InquiryRelatedResponse(BaseModel):
  customer: InquiryRelatedCustomerOut | None = None
  intermediary: InquiryRelatedIntermediaryOut | None = None
  style: InquiryRelatedStyleOut | None = None
  quotations: list[InquiryRelatedQuotationOut] = Field(default_factory=list)
  orders: list[InquiryRelatedOrderOut] = Field(default_factory=list)
  samples: list[InquiryRelatedSampleOut] = Field(default_factory=list)
  can_view_tentative_bookings: bool = False
  tentative_bookings: list[InquiryRelatedTentativeBookingOut] = Field(default_factory=list)
  timeline: list[InquiryRelatedTimelineEventOut] = Field(default_factory=list)
