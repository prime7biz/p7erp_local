"""Pydantic schemas for HR compliance frameworks (Sprint H1)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ComplianceFrameworkResponse(BaseModel):
    id: int
    tenant_id: int | None = None
    framework_name: str
    version: str | None = None
    is_system: bool = False
    is_active: bool = True
    created_at: datetime | None = None
    # For system templates: id of this tenant's activated copy, if any.
    activated_tenant_framework_id: int | None = None

    model_config = {"from_attributes": True}


class ComplianceFrameworkCreate(BaseModel):
    framework_name: str = Field(..., min_length=1, max_length=32)
    version: str | None = Field(None, max_length=16)


class ComplianceRequirementResponse(BaseModel):
    id: int
    tenant_id: int | None = None
    framework_id: int
    requirement_code: str
    title: str
    description: str | None = None
    category: str
    verification_method: str | None = None
    required_documents: list[str] | None = None
    is_active: bool = True

    model_config = {"from_attributes": True}


class EmployeeComplianceRecordCreate(BaseModel):
    employee_id: int
    requirement_id: int
    status: str = "PENDING"
    evidence_document_id: int | None = None
    notes: str | None = None


class EmployeeComplianceRecordUpdate(BaseModel):
    status: str | None = None
    evidence_document_id: int | None = None
    notes: str | None = None


class EmployeeComplianceRecordResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    requirement_id: int
    status: str
    evidence_document_id: int | None = None
    verified_by: int | None = None
    verified_at: datetime | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ComplianceScoreResponse(BaseModel):
    framework_id: int
    framework_name: str
    total_requirements: int
    compliant_count: int
    non_compliant_count: int
    pending_count: int
    score_percent: float
    employee_count: int
    weighted_score_percent: float | None = None


class AuditReadinessGap(BaseModel):
    employee_id: int
    employee_code: str | None = None
    employee_name: str | None = None
    requirement_id: int
    requirement_code: str
    title: str
    status: str
    missing_documents: list[str] = Field(default_factory=list)
    evidence_document_id: int | None = None


class AuditReadinessReport(BaseModel):
    framework_id: int
    framework_name: str
    score_percent: float
    gaps: list[AuditReadinessGap]
    non_compliant_summary: list[dict[str, Any]] = Field(default_factory=list)
    action_plan: list[str] = Field(default_factory=list)


class AgeVerificationCreate(BaseModel):
    verification_method: str = Field(..., min_length=1, max_length=32)
    date_of_birth: date
    document_id: int | None = None
    notes: str | None = None


class AgeVerificationResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    verification_method: str
    document_id: int | None = None
    date_of_birth: date
    age_at_verification: int
    status: str
    is_bsci_compliant: bool
    verified_by: int
    verified_at: datetime
    notes: str | None = None

    model_config = {"from_attributes": True}


class MedicalRecordCreate(BaseModel):
    examination_date: date
    fitness_status: str = "PENDING"
    certificate_number: str | None = None
    expiry_date: date | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    hospital_clinic: str | None = None
    conditions: list[str] | None = None
    restrictions: list[str] | None = None
    document_id: int | None = None


class MedicalRecordUpdate(BaseModel):
    examination_date: date | None = None
    fitness_status: str | None = None
    certificate_number: str | None = None
    expiry_date: date | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    hospital_clinic: str | None = None
    conditions: list[str] | None = None
    restrictions: list[str] | None = None
    document_id: int | None = None


class MedicalRecordResponse(BaseModel):
    id: int
    tenant_id: int
    employee_id: int
    certificate_number: str | None = None
    examination_date: date
    expiry_date: date | None = None
    doctor_name: str | None = None
    doctor_registration: str | None = None
    hospital_clinic: str | None = None
    fitness_status: str
    conditions: list[str] | None = None
    restrictions: list[str] | None = None
    document_id: int | None = None
    reminder_sent: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
