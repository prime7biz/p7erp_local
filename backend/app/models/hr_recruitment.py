from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JobRequisition(Base):
    __tablename__ = "hr_recruitment_requisitions"
    __table_args__ = (
        Index("ix_hr_req_department_id", "department_id"),
        Index("ix_hr_req_hiring_manager", "hiring_manager_employee_id"),
        Index("ix_hr_req_requested_by", "requested_by_employee_id"),
        Index("ix_hr_req_status", "status"),
        Index("ix_hr_req_tenant_id", "tenant_id"),
        Index("ix_hr_req_title", "title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_departments.id", ondelete="SET NULL"), nullable=True
    )
    requested_by_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    hiring_manager_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    vacancy_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    employment_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    budget_min: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    budget_max: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    opened_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    closed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Candidate(Base):
    __tablename__ = "hr_recruitment_candidates"
    __table_args__ = (
        Index("ix_hr_candidate_assigned_recruiter_user_id", "assigned_recruiter_user_id"),
        Index("ix_hr_candidate_email", "email"),
        Index("ix_hr_candidate_full_name", "full_name"),
        Index("ix_hr_candidate_requisition_id", "requisition_id"),
        Index("ix_hr_candidate_stage", "stage"),
        Index("ix_hr_candidate_status", "status"),
        Index("ix_hr_candidate_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    requisition_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_recruitment_requisitions.id", ondelete="SET NULL"), nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_designation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expected_salary: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default="applied")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    assigned_recruiter_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Interview(Base):
    __tablename__ = "hr_recruitment_interviews"
    __table_args__ = (
        Index("ix_hr_interview_candidate_id", "candidate_id"),
        Index("ix_hr_interview_interviewer_employee_id", "interviewer_employee_id"),
        Index("ix_hr_interview_interviewer_user_id", "interviewer_user_id"),
        Index("ix_hr_interview_requisition_id", "requisition_id"),
        Index("ix_hr_interview_scheduled_at", "scheduled_at"),
        Index("ix_hr_interview_status", "status"),
        Index("ix_hr_interview_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("hr_recruitment_candidates.id", ondelete="CASCADE"), nullable=False
    )
    requisition_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_recruitment_requisitions.id", ondelete="SET NULL"), nullable=True
    )
    interviewer_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    interviewer_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="scheduled")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Offer(Base):
    __tablename__ = "hr_recruitment_offers"
    __table_args__ = (
        Index("ix_hr_offer_candidate_id", "candidate_id"),
        Index("ix_hr_offer_requisition_id", "requisition_id"),
        Index("ix_hr_offer_status", "status"),
        Index("ix_hr_offer_tenant_id", "tenant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[int] = mapped_column(
        ForeignKey("hr_recruitment_candidates.id", ondelete="CASCADE"), nullable=False
    )
    requisition_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_recruitment_requisitions.id", ondelete="SET NULL"), nullable=True
    )
    offered_role: Mapped[str] = mapped_column(String(255), nullable=False)
    proposed_salary: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="BDT")
    joining_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
