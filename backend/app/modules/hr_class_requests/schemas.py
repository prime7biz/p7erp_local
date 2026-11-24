"""Pydantic schemas for HR class requests."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

HrClassKind = Literal[
    "NEW_EMPLOYEE",
    "LEAVE",
    "INCREMENT",
    "PROMOTION",
    "CORRECTION",
    "RESIGNATION",
    "DISCONTINUE",
    "WARNING",
    "BULK_INCREMENT",
    "CONFIRMATION",
]

HrClassSource = Literal["HR_ENTRY", "ESS"]


class HrClassRequestCreate(BaseModel):
    kind: HrClassKind
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")
    employee_id: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field("", max_length=2000)
    source: HrClassSource = "HR_ENTRY"
    lines: list[dict[str, Any]] | None = None  # BULK_INCREMENT


class HrClassRequestUpdate(BaseModel):
    payload: dict[str, Any] | None = None
    reason: str | None = Field(None, max_length=2000)
    employee_id: int | None = None
    lines: list[dict[str, Any]] | None = None


class HrClassActionBody(BaseModel):
    note: str | None = Field(None, max_length=2000)


class HrClassPreviewBody(BaseModel):
    kind: HrClassKind
    employee_id: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class HrClassLetterBody(BaseModel):
    document_type: str = Field(..., max_length=64)
    request_id: str | None = Field(None, pattern=r"^[A-Za-z0-9_-]{8,64}$")


class DelegationCreate(BaseModel):
    delegate_user_id: int
    step: Literal["RECOMMEND", "APPROVE"]
    starts_at: str
    ends_at: str
    reason: str = Field(..., min_length=1, max_length=2000)


class ClearanceWaiveBody(BaseModel):
    note: str = Field(..., min_length=3, max_length=2000)


class EssLeaveSubmit(BaseModel):
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")
    leave_type_id: int
    from_date: str
    to_date: str
    days_requested: str | float | int
    reason: str = Field("", max_length=2000)


class EssCorrectionSubmit(BaseModel):
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")
    payload: dict[str, Any]
    reason: str = Field(..., min_length=1, max_length=2000)


class EssResignationSubmit(BaseModel):
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")
    last_working_date: str
    effective_date: str
    reason: str = Field(..., min_length=1, max_length=2000)
