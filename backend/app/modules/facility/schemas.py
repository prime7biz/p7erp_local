"""Pydantic schemas for facility APIs."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class FacilityCreateBody(BaseModel):
    facility_type: str
    financier_party_id: int | None = None
    financier_name: str | None = None
    linked_master_contract_id: int | None = None
    linked_btb_lc_id: int | None = None
    sanctioned_amount: float | None = None
    currency: str | None = Field(default="BDT", max_length=10)
    exchange_rate_to_base: float | None = None
    rate_source: str | None = None
    manual_rate_override_reason: str | None = None
    sanction_date: date | None = None
    expiry_date: date | None = None
    interest_rate: float | None = None
    interest_type: str | None = None
    penalty_interest_rate: float | None = None
    penalty_method: str | None = None
    gl_liability_account_id: int | None = None
    gl_interest_expense_account_id: int | None = None
    gl_interest_payable_account_id: int | None = None
    gl_penalty_expense_account_id: int | None = None
    linked_bank_account_id: int | None = None
    repayment_source_account_id: int | None = None
    notes: str | None = None


class FacilityPatchBody(BaseModel):
    financier_name: str | None = None
    sanctioned_amount: float | None = None
    currency: str | None = None
    exchange_rate_to_base: float | None = None
    rate_source: str | None = None
    manual_rate_override_reason: str | None = None
    sanction_date: date | None = None
    expiry_date: date | None = None
    interest_rate: float | None = None
    interest_type: str | None = None
    penalty_interest_rate: float | None = None
    penalty_method: str | None = None
    status: str | None = None
    gl_liability_account_id: int | None = None
    gl_interest_expense_account_id: int | None = None
    gl_interest_payable_account_id: int | None = None
    gl_penalty_expense_account_id: int | None = None
    linked_bank_account_id: int | None = None
    repayment_source_account_id: int | None = None
    notes: str | None = None


class UtilizationCreateBody(BaseModel):
    utilization_type: str = "drawdown"
    principal_amount: float
    currency: str | None = Field(default="BDT", max_length=10)
    exchange_rate_to_base: float | None = None
    rate_source: str | None = None
    manual_rate_override_reason: str | None = None
    disbursement_date: date | None = None
    first_accrual_date: date | None = None
    first_repayment_date: date | None = None
    maturity_date: date | None = None
    moratorium_months: int = 0
    grace_days: int = 0
    interest_rate: float | None = None
    interest_type: str | None = None
    repayment_policy: str = "emi_reducing"
    installment_frequency: str = "monthly"
    num_installments: int | None = None
    linked_btb_lc_id: int | None = None
    linked_purchase_order_id: int | None = None
    manual_schedule_json: list[Any] | dict[str, Any] | None = None
    notes: str | None = None


class UtilizationPatchBody(BaseModel):
    first_repayment_date: date | None = None
    maturity_date: date | None = None
    moratorium_months: int | None = None
    grace_days: int | None = None
    notes: str | None = None


class CalculateEmiBody(BaseModel):
    principal: float
    annual_interest_rate_percent: float = 0
    repayment_policy: str = "emi_reducing"
    num_installments: int | None = None
    installment_frequency: str = "monthly"
    moratorium_months: int = 0
    interest_type: str | None = "reducing_balance"


class AccrualRunBody(BaseModel):
    accrual_month: str = Field(..., description="YYYY-MM")
    accrual_date: date | None = None


class ReverseAccrualBody(BaseModel):
    reason: str = Field(..., min_length=1, max_length=4000)


class RegenerateScheduleBody(BaseModel):
    grace_days: int | None = None


class SnapshotGenerateBody(BaseModel):
    snapshot_month: str = Field(..., description="YYYY-MM")
    facility_id: int | None = Field(default=None, description="If omitted, all facilities for tenant")
