"""HR employee onboarding (migration 289): saga run, checklist tasks, immutable generated documents.

* ``HrEmployeeOnboardingRun`` - one durable row per onboarding request (unique per tenant + request id)
  so an interrupted onboarding can be resumed step by step.
* ``HrEmployeeOnboardingTask`` - truthful checklist task; COMPLETED needs a source row, WAIVED needs a reason.
* ``HrGeneratedEmployeeDocument`` - versioned content snapshot of an appointment letter / job description.
  Once ``signed_at`` is set the database trigger created in migration 289 rejects UPDATE and DELETE, so
  never edit a signed row: a reissue is a new ``document_version`` with a new ``verification_id``.

``snapshot_schema_version`` 1 means the allowlisted snapshot shape ``hr-document-v1``.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

RUN_STATUSES = ("PENDING", "IN_PROGRESS", "COMPLETED", "FAILED")
RUN_STEP_STATUSES = ("PENDING", "COMPLETED", "FAILED", "SKIPPED")
TASK_TYPES = (
    "PHOTO_CONSENT",
    "FINGERPRINT_CONSENT",
    "FACE_CONSENT",
    "IDENTITY_DOCUMENT_CONSENT",
    "CV_CONSENT",
    "MEDICAL_EXAM",
    "REQUIRED_DOCUMENTS",
    "EMPLOYEE_PHOTO",
)
TASK_STATUSES = ("DUE", "COMPLETED", "WAIVED")
GENERATED_DOCUMENT_TYPES = ("APPOINTMENT_LETTER", "JOB_DESCRIPTION")


def _in_list(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({','.join(repr(v) for v in values)})"


class HrEmployeeOnboardingRun(Base):
    __tablename__ = "hr_employee_onboarding_runs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "request_id", name="uq_hr_onboarding_run_request"),
        CheckConstraint(_in_list("status", RUN_STATUSES), name="ck_hr_onboarding_run_status"),
        CheckConstraint(_in_list("employee_step_status", RUN_STEP_STATUSES), name="ck_hr_onboarding_run_employee_step"),
        CheckConstraint(_in_list("payroll_step_status", RUN_STEP_STATUSES), name="ck_hr_onboarding_run_payroll_step"),
        CheckConstraint(
            _in_list("gate_pass_step_status", RUN_STEP_STATUSES), name="ck_hr_onboarding_run_gate_pass_step"
        ),
        CheckConstraint(
            _in_list("checklist_step_status", RUN_STEP_STATUSES), name="ck_hr_onboarding_run_checklist_step"
        ),
        CheckConstraint("length(btrim(request_id)) > 0", name="ck_hr_onboarding_run_request_id"),
        Index("ix_hr_onboarding_run_tenant_status", "tenant_id", "status"),
        Index("ix_hr_onboarding_run_tenant_employee", "tenant_id", "employee_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    employee_step_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    payroll_step_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    gate_pass_step_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    checklist_step_status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    payroll_assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_payroll_employee_structure_assignments.id", ondelete="SET NULL"), nullable=True
    )
    wage_assignment_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_bd_employee_wage_assignments.id", ondelete="SET NULL"), nullable=True
    )
    gate_pass_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_gate_passes.id", ondelete="SET NULL"), nullable=True
    )
    # Safe, user-displayable error metadata only (never stack traces or secrets).
    last_error_step: Mapped[str | None] = mapped_column(String(24), nullable=True)
    last_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrEmployeeOnboardingTask(Base):
    __tablename__ = "hr_employee_onboarding_tasks"
    __table_args__ = (
        UniqueConstraint("employee_id", "task_type", name="uq_hr_onboarding_task_employee_type"),
        CheckConstraint(_in_list("task_type", TASK_TYPES), name="ck_hr_onboarding_task_type"),
        CheckConstraint(_in_list("status", TASK_STATUSES), name="ck_hr_onboarding_task_status"),
        CheckConstraint("(source_table IS NULL) = (source_id IS NULL)", name="ck_hr_onboarding_task_source_pair"),
        CheckConstraint(
            "status <> 'COMPLETED' OR (completed_at IS NOT NULL AND source_table IS NOT NULL "
            "AND source_id IS NOT NULL)",
            name="ck_hr_onboarding_task_completed_evidence",
        ),
        CheckConstraint(
            "status <> 'WAIVED' OR (waived_at IS NOT NULL AND waive_reason IS NOT NULL "
            "AND length(btrim(waive_reason)) > 0)",
            name="ck_hr_onboarding_task_waived_reason",
        ),
        Index("ix_hr_onboarding_task_tenant_employee", "tenant_id", "employee_id"),
        Index("ix_hr_onboarding_task_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False)
    task_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DUE")
    # Evidence row proving completion, e.g. ("hr_employee_privacy_consents", 12). Set together or not at all.
    source_table: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    waived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    waived_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    waive_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class HrGeneratedEmployeeDocument(Base):
    """Authoritative, versioned snapshot behind a generated appointment letter / job description.

    Immutable after signing (database trigger). ``signature_hash`` and ``signed_at`` are set together,
    normally through ``app.common.document_signature.apply_document_signature``.
    """

    __tablename__ = "hr_generated_employee_documents"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_id", "document_type", "document_version", name="uq_hr_generated_doc_version"
        ),
        UniqueConstraint("tenant_id", "generation_request_id", name="uq_hr_generated_doc_request"),
        CheckConstraint(_in_list("document_type", GENERATED_DOCUMENT_TYPES), name="ck_hr_generated_doc_type"),
        CheckConstraint("document_version >= 1", name="ck_hr_generated_doc_version"),
        CheckConstraint("snapshot_schema_version >= 1", name="ck_hr_generated_doc_schema_version"),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="ck_hr_generated_doc_snapshot_object"),
        CheckConstraint("(signed_at IS NULL) = (signature_hash IS NULL)", name="ck_hr_generated_doc_signature_pair"),
        CheckConstraint("length(btrim(generation_request_id)) > 0", name="ck_hr_generated_doc_request_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(String(32), nullable=False)
    document_version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generation_request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    verification_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    signature_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
