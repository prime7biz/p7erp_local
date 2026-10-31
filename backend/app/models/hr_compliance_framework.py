"""BSCI / SEDEX / WRAP / ISO compliance frameworks (Sprint H1)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ComplianceFramework(Base):
    __tablename__ = "hr_compliance_frameworks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # NULL = system template (copied to tenants on activate)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    framework_name: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    version: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ComplianceRequirement(Base):
    __tablename__ = "hr_compliance_requirements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    framework_id: Mapped[int] = mapped_column(
        ForeignKey("hr_compliance_frameworks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requirement_code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="LABOR")
    verification_method: Mapped[str | None] = mapped_column(String(128), nullable=True)
    required_documents: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class EmployeeComplianceRecord(Base):
    __tablename__ = "hr_employee_compliance_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("hr_compliance_requirements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    evidence_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_documents.id", ondelete="SET NULL"), nullable=True
    )
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class EmployeeAgeVerification(Base):
    __tablename__ = "hr_employee_age_verifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    verification_method: Mapped[str] = mapped_column(String(32), nullable=False)
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_documents.id", ondelete="SET NULL"), nullable=True
    )
    date_of_birth: Mapped[date] = mapped_column(Date, nullable=False)
    age_at_verification: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="VERIFIED")
    is_bsci_compliant: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    verified_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class EmployeeMedicalRecord(Base):
    __tablename__ = "hr_employee_medical_records"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    certificate_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    examination_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    doctor_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    doctor_registration: Mapped[str | None] = mapped_column(String(64), nullable=True)
    hospital_clinic: Mapped[str | None] = mapped_column(String(128), nullable=True)
    fitness_status: Mapped[str] = mapped_column(String(32), nullable=False, default="PENDING")
    conditions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    restrictions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_documents.id", ondelete="SET NULL"), nullable=True
    )
    reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrAiAnalysisResult(Base):
    __tablename__ = "hr_ai_analysis_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    subject_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
