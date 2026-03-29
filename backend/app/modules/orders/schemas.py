from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field


class OrderCreate(BaseModel):
  customer_id: int = Field(..., gt=0)
  quotation_id: int | None = Field(None, gt=0)
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


class OrderResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  quotation_id: int | None
  order_code: str
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
  remarks: str | None
  created_at: str
  updated_at: str
  ai_indicators: Any | None = None

  class Config:
    from_attributes = True


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

