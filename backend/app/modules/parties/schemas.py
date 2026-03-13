from typing import Literal

from pydantic import BaseModel, Field


class IntermediaryCreate(BaseModel):
  code: str | None = Field(None, max_length=64)
  name: str = Field(..., min_length=1, max_length=255)
  kind: Literal["BUYING_HOUSE", "AGENT"]
  contact_name: str | None = Field(None, max_length=255)
  contact_email: str | None = Field(None, max_length=255)
  contact_phone: str | None = Field(None, max_length=64)
  contact_address: str | None = None
  is_active: bool = True
  notes: str | None = None


class IntermediaryUpdate(BaseModel):
  code: str | None = Field(None, max_length=64)
  name: str | None = Field(None, min_length=1, max_length=255)
  kind: Literal["BUYING_HOUSE", "AGENT"] | None = None
  contact_name: str | None = Field(None, max_length=255)
  contact_email: str | None = Field(None, max_length=255)
  contact_phone: str | None = Field(None, max_length=64)
  contact_address: str | None = None
  is_active: bool | None = None
  notes: str | None = None


class IntermediaryResponse(BaseModel):
  id: int
  tenant_id: int
  code: str
  name: str
  kind: str
  contact_name: str | None
  contact_email: str | None
  contact_phone: str | None
  contact_address: str | None
  is_active: bool
  notes: str | None
  created_at: str
  updated_at: str

  class Config:
    from_attributes = True


class CustomerIntermediaryCreate(BaseModel):
  customer_id: int = Field(..., gt=0)
  intermediary_id: int = Field(..., gt=0)
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  is_primary: bool = False
  notes: str | None = None


class CustomerIntermediaryUpdate(BaseModel):
  customer_id: int | None = Field(None, gt=0)
  intermediary_id: int | None = Field(None, gt=0)
  commission_type: Literal["PERCENTAGE", "FIXED"] | None = None
  commission_value: float | None = None
  is_primary: bool | None = None
  notes: str | None = None


class CustomerIntermediaryResponse(BaseModel):
  id: int
  tenant_id: int
  customer_id: int
  intermediary_id: int
  intermediary_code: str | None
  intermediary_name: str | None
  commission_type: str | None
  commission_value: float | None
  is_primary: bool
  notes: str | None
  created_at: str
  updated_at: str

  class Config:
    from_attributes = True
