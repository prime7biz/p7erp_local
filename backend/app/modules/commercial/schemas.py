"""Pydantic schemas for Commercial module."""

from datetime import date

from pydantic import BaseModel, Field


# ----- Export cases -----
class ExportCaseCreate(BaseModel):
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    case_date: date | None = None
    amount: float | None = Field(None, ge=0)


class ExportCaseResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    case_date: str | None
    amount: float | None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ----- Proforma invoices -----
class ProformaInvoiceCreate(BaseModel):
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    invoice_date: date | None = None
    amount: float | None = Field(None, ge=0)


class ProformaInvoiceResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    invoice_date: str | None
    amount: float | None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ----- BTB LCs -----
class BtbLcCreate(BaseModel):
    reference: str = Field(..., max_length=64)
    status: str | None = Field(default="DRAFT", max_length=32)
    lc_date: date | None = None
    amount: float | None = Field(None, ge=0)


class BtbLcResponse(BaseModel):
    id: int
    tenant_id: int
    reference: str
    status: str
    lc_date: str | None
    amount: float | None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
