"""Pydantic schemas for Trade Case module."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class TradeCaseCreate(BaseModel):
    direction: str = Field(default="EXPORT", max_length=16)
    reference: str = Field(..., max_length=64)
    status: str = Field(default="DRAFT", max_length=32)
    current_stage: str = Field(default="DRAFT", max_length=32)
    order_id: int | None = None
    customer_id: int | None = None
    vendor_id: int | None = None
    proforma_invoice_id: int | None = None
    master_contract_id: int | None = None
    btb_lc_id: int | None = None
    etd: date | None = None
    eta: date | None = None
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=10)
    notes: str | None = None


class TradeCaseUpdate(BaseModel):
    direction: str | None = Field(default=None, max_length=16)
    reference: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, max_length=32)
    current_stage: str | None = Field(default=None, max_length=32)
    order_id: int | None = None
    customer_id: int | None = None
    vendor_id: int | None = None
    proforma_invoice_id: int | None = None
    master_contract_id: int | None = None
    btb_lc_id: int | None = None
    etd: date | None = None
    eta: date | None = None
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, max_length=10)


class TradeCaseTransition(BaseModel):
    to_stage: str = Field(..., max_length=32)
    notes: str | None = None


class TradeCaseResponse(BaseModel):
    id: int
    tenant_id: int
    direction: str
    reference: str
    status: str
    current_stage: str
    order_id: int | None = None
    customer_id: int | None = None
    vendor_id: int | None = None
    proforma_invoice_id: int | None = None
    master_contract_id: int | None = None
    btb_lc_id: int | None = None
    etd: str | None = None
    eta: str | None = None
    amount: float | None = None
    currency: str | None = None
    cost_amount: float | None = None
    margin_amount: float | None = None
    margin_pct: float | None = None
    base_currency: str | None = None
    base_currency_margin: float | None = None
    closed_at: str | None = None
    created_at: str
    updated_at: str


class TradeCaseStageLogResponse(BaseModel):
    id: int
    tenant_id: int
    trade_case_id: int
    from_stage: str | None = None
    to_stage: str
    user_id: int | None = None
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TradeCaseStageCreate(BaseModel):
    stage_key: str = Field(..., max_length=32)
    name: str = Field(..., max_length=100)
    sort_order: int = 0
    required_doc_types: list[Any] | None = None
    next_stage_keys: list[Any] | None = None
    is_active: bool = True


class TradeCaseStageResponse(BaseModel):
    id: int
    tenant_id: int
    stage_key: str
    name: str
    sort_order: int
    required_doc_types: list[Any] | None = None
    next_stage_keys: list[Any] | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TradeCaseMarginResponse(BaseModel):
    trade_case_id: int
    amount: float | None = None
    estimated_cost: float | None = None
    margin_amount: float | None = None
    margin_pct: float | None = None
    currency: str | None = None
    base_currency: str | None = None
    base_currency_margin: float | None = None


class TradeCaseDashboardResponse(BaseModel):
    total_cases: int
    open_cases: int
    shipped_cases: int
    settled_cases: int
    missing_docs_cases: int
    overdue_shipments: int
    at_risk_case_ids: list[int]
