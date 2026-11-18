"""Request / response shapes for HR Manpower Control."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

DepartmentGroupKey = Literal["SEWING", "CUTTING", "FINISHING", "OTHER"]


class SanctionedUpsert(BaseModel):
    department_id: int
    designation_id: int
    approved_quota: int = Field(..., ge=0)
    effective_from: date
    effective_to: date | None = None
    notes: str | None = Field(None, max_length=2000)


class SanctionedRowOut(BaseModel):
    id: int
    department_id: int
    designation_id: int
    department_name: str | None = None
    designation_title: str | None = None
    approved_quota: int
    present_active: int
    variance: int
    effective_from: date
    effective_to: date | None
    notes: str | None
    updated_at: datetime


class StandingSummaryOut(BaseModel):
    rows: list[SanctionedRowOut]
    total_quota: int
    total_present: int
    cells_over: int
    cells_under: int
    cells_exact: int


class ManpowerTargetsIn(BaseModel):
    operator_to_helper: str | None = Field(None, max_length=32)
    sewing_cutting_finishing: str | None = Field(None, max_length=64)
    staff_to_workers: str | None = Field(None, max_length=32)
    management_staff_workers: str | None = Field(None, max_length=64)
    running_machines_per_operator: str | None = Field(None, max_length=32)


class ManpowerSettingsOut(BaseModel):
    targets: dict[str, Any]
    allow_unmapped_hire: bool
    updated_at: datetime | None = None


class ManpowerSettingsUpdate(BaseModel):
    targets: ManpowerTargetsIn | None = None
    allow_unmapped_hire: bool | None = None


class DepartmentGroupUpsert(BaseModel):
    department_id: int
    group_key: DepartmentGroupKey


class DepartmentGroupOut(BaseModel):
    id: int
    department_id: int
    department_name: str | None = None
    group_key: DepartmentGroupKey


class SeedFromCurrentOut(BaseModel):
    created: int
    skipped_existing: int
    cells_seen: int


class ExceptionCreate(BaseModel):
    department_id: int
    designation_id: int
    extra_slots: int = Field(..., ge=1, le=500)
    reason: str = Field(..., min_length=1, max_length=2000)
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")
    expires_on: date | None = None


class ExceptionDecision(BaseModel):
    decision: Literal["APPROVE", "REJECT"]
    note: str | None = Field(None, max_length=2000)
