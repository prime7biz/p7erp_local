from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


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
  target_price: str | None = Field(None, max_length=32)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  notes: str | None = None
  items: list[InquiryItemCreate] = Field(default_factory=list)


class InquiryUpdate(BaseModel):
  style_ref: str | None = Field(None, max_length=128)
  style_id: int | None = Field(None, gt=0)
  customer_intermediary_id: int | None = Field(None, gt=0)
  season: str | None = Field(None, max_length=64)
  department: str | None = Field(None, max_length=64)
  quantity: int | None = Field(None, ge=0)
  target_price: str | None = Field(None, max_length=32)
  shipping_term: str | None = Field(None, max_length=64)
  commission_mode: Literal["INCLUDE", "EXCLUDE"] | None = None
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  status: str | None = Field(None, max_length=32)
  notes: str | None = None
  items: list[InquiryItemCreate] | None = None


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
  shipping_term: str | None
  commission_mode: str | None
  commission_type: str | None
  commission_value: float | None
  status: str
  notes: str | None
  items: list[InquiryItemResponse] = Field(default_factory=list)
  created_at: str
  updated_at: str

  class Config:
    from_attributes = True

