from datetime import date, datetime

from pydantic import BaseModel, Field


class PerformanceCycleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = None
    start_date: date
    end_date: date


class PerformanceCycleStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class PerformanceCycleResponse(BaseModel):
    id: int
    tenant_id: int
    name: str
    description: str | None
    start_date: date
    end_date: date
    status: str
    created_by_user_id: int | None
    created_at: str
    updated_at: str


class PerformanceGoalCreate(BaseModel):
    cycle_id: int
    employee_id: int
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    weight: float | None = Field(None, ge=0, le=100)
    target_value: str | None = Field(None, max_length=255)


class PerformanceGoalSubmit(BaseModel):
    manager_comment: str | None = None


class PerformanceGoalResponse(BaseModel):
    id: int
    tenant_id: int
    cycle_id: int
    employee_id: int
    title: str
    description: str | None
    weight: float | None
    target_value: str | None
    status: str
    manager_comment: str | None
    submitted_at: datetime | None
    created_by_user_id: int | None
    created_at: str
    updated_at: str


class PerformanceReviewCreate(BaseModel):
    cycle_id: int
    employee_id: int
    reviewer_employee_id: int | None = None
    review_type: str = Field(default="manager", min_length=1, max_length=32)
    self_rating: float | None = Field(None, ge=0, le=5)
    manager_rating: float | None = Field(None, ge=0, le=5)
    final_rating: float | None = Field(None, ge=0, le=5)
    employee_comment: str | None = None
    manager_comment: str | None = None


class PerformanceReviewSubmit(BaseModel):
    manager_rating: float | None = Field(None, ge=0, le=5)
    final_rating: float | None = Field(None, ge=0, le=5)
    manager_comment: str | None = None


class PerformanceReviewResponse(BaseModel):
    id: int
    tenant_id: int
    cycle_id: int
    employee_id: int
    reviewer_employee_id: int | None
    reviewer_user_id: int | None
    review_type: str
    self_rating: float | None
    manager_rating: float | None
    final_rating: float | None
    employee_comment: str | None
    manager_comment: str | None
    status: str
    submitted_at: datetime | None
    created_at: str
    updated_at: str
