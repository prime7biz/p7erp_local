from datetime import date, datetime

from pydantic import BaseModel, Field


class RequisitionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    department_id: int | None = None
    hiring_manager_employee_id: int | None = None
    vacancy_count: int = Field(default=1, ge=1, le=999)
    employment_type: str | None = Field(None, max_length=32)
    location: str | None = Field(None, max_length=255)
    budget_min: float | None = Field(None, ge=0)
    budget_max: float | None = Field(None, ge=0)
    description: str | None = None


class RequisitionStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class RequisitionResponse(BaseModel):
    id: int
    tenant_id: int
    title: str
    department_id: int | None
    requested_by_employee_id: int | None
    hiring_manager_employee_id: int | None
    vacancy_count: int
    employment_type: str | None
    location: str | None
    budget_min: float | None
    budget_max: float | None
    description: str | None
    status: str
    opened_at: date | None
    closed_at: date | None
    created_at: str
    updated_at: str


class CandidateCreate(BaseModel):
    requisition_id: int | None = None
    full_name: str = Field(..., min_length=1, max_length=255)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=32)
    source: str | None = Field(None, max_length=64)
    current_company: str | None = Field(None, max_length=255)
    current_designation: str | None = Field(None, max_length=255)
    expected_salary: float | None = Field(None, ge=0)
    resume_url: str | None = Field(None, max_length=512)
    notes: str | None = None


class CandidateStageUpdate(BaseModel):
    stage: str = Field(..., min_length=1, max_length=32)
    status: str | None = Field(None, min_length=1, max_length=32)


class CandidateResponse(BaseModel):
    id: int
    tenant_id: int
    requisition_id: int | None
    full_name: str
    email: str | None
    phone: str | None
    source: str | None
    current_company: str | None
    current_designation: str | None
    expected_salary: float | None
    resume_url: str | None
    stage: str
    status: str
    assigned_recruiter_user_id: int | None
    notes: str | None
    created_at: str
    updated_at: str


class InterviewCreate(BaseModel):
    candidate_id: int
    requisition_id: int | None = None
    interviewer_employee_id: int | None = None
    scheduled_at: datetime
    mode: str | None = Field(None, max_length=32)
    location: str | None = Field(None, max_length=255)


class InterviewStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    feedback: str | None = None
    rating: float | None = Field(None, ge=0, le=5)


class InterviewResponse(BaseModel):
    id: int
    tenant_id: int
    candidate_id: int
    requisition_id: int | None
    interviewer_employee_id: int | None
    interviewer_user_id: int | None
    scheduled_at: datetime
    mode: str | None
    location: str | None
    feedback: str | None
    rating: float | None
    status: str
    created_at: str
    updated_at: str


class OfferCreate(BaseModel):
    candidate_id: int
    requisition_id: int | None = None
    offered_role: str = Field(..., min_length=1, max_length=255)
    proposed_salary: float | None = Field(None, ge=0)
    currency: str = Field(default="BDT", min_length=1, max_length=8)
    joining_date: date | None = None
    notes: str | None = None


class OfferStatusUpdate(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class OfferResponse(BaseModel):
    id: int
    tenant_id: int
    candidate_id: int
    requisition_id: int | None
    offered_role: str
    proposed_salary: float | None
    currency: str
    joining_date: date | None
    notes: str | None
    status: str
    sent_at: datetime | None
    responded_at: datetime | None
    created_at: str
    updated_at: str
