"""Pydantic schemas for COA interest APIs."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class CoaInterestRunBody(BaseModel):
    as_of: date | None = None
    account_id: int | None = None


class CoaInterestPreviewBody(BaseModel):
    as_of: date | None = None
    account_id: int | None = None


class CoaInterestAccrualOut(BaseModel):
    id: int
    tenant_id: int
    account_id: int
    period_key: str
    accrual_date: date
    base_balance: str
    proration_factor: str
    interest_amount: str
    journal_voucher_id: int | None
    status: str

    class Config:
        from_attributes = True


class CoaInterestRunOut(BaseModel):
    created: int
    skipped: int
    as_of: str
    details: list[dict] = Field(default_factory=list)
