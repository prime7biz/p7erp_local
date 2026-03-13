from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class QuotationCreate(BaseModel):
  customer_id: int = Field(..., gt=0)
  inquiry_id: int | None = Field(None, gt=0)
  style_ref: str | None = Field(None, max_length=128)
  style_id: int | None = Field(None, gt=0)
  customer_intermediary_id: int | None = Field(None, gt=0)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  currency: str | None = Field(None, max_length=8)
  total_amount: str | None = Field(None, max_length=32)
  valid_until: date | None = None
  notes: str | None = None


class QuotationUpdate(BaseModel):
  style_ref: str | None = Field(None, max_length=128)
  style_id: int | None = Field(None, gt=0)
  customer_intermediary_id: int | None = Field(None, gt=0)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  currency: str | None = Field(None, max_length=8)
  total_amount: str | None = Field(None, max_length=32)
  valid_until: date | None = None
  status: str | None = Field(None, max_length=32)
  notes: str | None = None


class QuotationResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  inquiry_id: int | None
  quotation_code: str
  style_ref: str | None
  style_id: int | None = None
  customer_intermediary_id: int | None = None
  shipping_term: str | None = None
  commission_mode: str | None = None
  commission_type: str | None = None
  commission_value: float | None = None
  department: str | None = None
  projected_quantity: int | None = None
  currency: str | None
  total_amount: str | None
  material_cost: str | None = None
  manufacturing_cost: str | None = None
  other_cost: str | None = None
  total_cost: str | None = None
  cost_per_piece: str | None = None
  profit_percentage: str | None = None
  quoted_price: str | None = None
  status: str
  version_no: int
  valid_until: date | None
  notes: str | None
  created_at: str
  updated_at: str

  class Config:
    from_attributes = True


# ----- Costing line items (PrimeX parity) -----
class QuotationMaterialLine(BaseModel):
  id: int | None = None
  serial_no: int = 1
  category_id: int | None = None
  item_id: int | None = None
  description: str | None = None
  unit: str | None = None
  consumption_per_dozen: str = "0"
  unit_price: str = "0"
  amount_per_dozen: str = "0"
  total_amount: str = "0"
  currency: str = "USD"
  exchange_rate: str = "1"
  base_amount: str = "0"
  local_amount: str = "0"


class QuotationManufacturingLine(BaseModel):
  id: int | None = None
  serial_no: int = 1
  style_part: str = ""
  machines_required: int = 0
  production_per_hour: str = "0"
  production_per_day: str = "0"
  cost_per_machine: str = "0"
  total_line_cost: str = "0"
  cost_per_dozen: str = "0"
  cm_per_piece: str = "0"
  total_order_cost: str = "0"
  currency: str = "USD"
  exchange_rate: str = "1"
  base_amount: str = "0"
  local_amount: str = "0"


class QuotationOtherCostLine(BaseModel):
  id: int | None = None
  serial_no: int = 1
  cost_head: str = ""
  percentage: str = "0"
  total_amount: str = "0"
  cost_type: str = "fixed"
  value: str = "0"
  based_on: str = "subtotal"
  calculated_amount: str = "0"
  notes: str | None = None
  currency: str = "USD"
  exchange_rate: str = "1"
  base_amount: str = "0"
  local_amount: str = "0"


class QuotationSizeRatioLine(BaseModel):
  id: int | None = None
  serial_no: int = 1
  size: str = ""
  ratio_percentage: str = "0"
  fabric_factor: str = "1.0"
  quantity: int = 0


# Full quotation response with cost breakdown (GET by id)
class QuotationDetailResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  inquiry_id: int | None
  quotation_code: str
  style_ref: str | None
  style_id: int | None
  customer_intermediary_id: int | None
  shipping_term: str | None
  commission_mode: str | None
  commission_type: str | None
  commission_value: float | None
  department: str | None
  projected_quantity: int | None
  projected_delivery_date: date | None
  quotation_date: date | None
  target_price: str | None
  target_price_currency: str | None
  exchange_rate: str | None
  material_cost: str | None
  manufacturing_cost: str | None
  other_cost: str | None
  total_cost: str | None
  cost_per_piece: str | None
  profit_percentage: str | None
  quoted_price: str | None
  currency: str | None
  total_amount: str | None
  status: str
  version_no: int
  valid_until: date | None
  size_ratio_enabled: bool
  pack_ratio: str | None
  pcs_per_carton: int | None
  notes: str | None
  created_at: str
  updated_at: str
  materials: list[QuotationMaterialLine] = []
  manufacturing: list[QuotationManufacturingLine] = []
  other_costs: list[QuotationOtherCostLine] = []
  size_ratios: list[QuotationSizeRatioLine] = []

  class Config:
    from_attributes = True


# Full quotation update body (PUT) – header + replace children
class QuotationFullUpdate(BaseModel):
  style_ref: str | None = None
  style_id: int | None = None
  customer_intermediary_id: int | None = None
  shipping_term: str | None = None
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  department: str | None = None
  projected_quantity: int | None = None
  projected_delivery_date: date | None = None
  quotation_date: date | None = None
  target_price: str | None = None
  target_price_currency: str | None = None
  exchange_rate: str | None = None
  material_cost: str | None = None
  manufacturing_cost: str | None = None
  other_cost: str | None = None
  total_cost: str | None = None
  cost_per_piece: str | None = None
  profit_percentage: str | None = None
  quoted_price: str | None = None
  currency: str | None = None
  total_amount: str | None = None
  status: str | None = None
  valid_until: date | None = None
  size_ratio_enabled: bool | None = None
  pack_ratio: str | None = None
  pcs_per_carton: int | None = None
  notes: str | None = None
  materials: list[QuotationMaterialLine] | None = None
  manufacturing: list[QuotationManufacturingLine] | None = None
  other_costs: list[QuotationOtherCostLine] | None = None
  size_ratios: list[QuotationSizeRatioLine] | None = None

