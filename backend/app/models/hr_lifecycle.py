"""Employee lifecycle records for Bangladesh factories.

- Privacy consents and biometric enrollment *references* (migration 284). Prime7 never stores
  fingerprint templates, fingerprint images or face embeddings; matching stays on the terminal.
- Temporary gate passes and gate scan events (migration 285).
- Notices / memos / absence and disciplinary cases, separations, clearance, final settlements,
  payroll document snapshots and wage acknowledgements (migration 286).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

MONEY = Numeric(18, 4)


# --- Privacy and biometrics (Personal Data Protection Act 2026) -----------------------------------


class HrEmployeePrivacyConsent(Base):
    __tablename__ = "hr_employee_privacy_consents"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('PHOTO','BIOMETRIC_FINGERPRINT','BIOMETRIC_FACE','IDENTITY_DOCUMENT','CV')",
            name="ck_hr_privacy_consent_purpose",
        ),
        CheckConstraint("lawful_basis IN ('CONSENT','EMPLOYMENT_LAW')", name="ck_hr_privacy_consent_basis"),
        Index(
            "uq_hr_privacy_consent_active",
            "tenant_id",
            "employee_id",
            "purpose",
            unique=True,
            postgresql_where=text("withdrawn_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    notice_version: Mapped[str] = mapped_column(String(32), nullable=False)
    lawful_basis: Mapped[str] = mapped_column(String(24), nullable=False)
    purpose_text: Mapped[str] = mapped_column(Text, nullable=False)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    transfer_disclosure: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    captured_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    withdrawn_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class HrEmployeeBiometricEnrollment(Base):
    __tablename__ = "hr_employee_biometric_enrollments"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "employee_id", "device_id", "modality",
            name="uq_hr_biometric_enrollment", postgresql_nulls_not_distinct=True,
        ),
        CheckConstraint("modality IN ('FINGERPRINT','FACE')", name="ck_hr_biometric_modality"),
        CheckConstraint(
            "status IN ('PENDING','ENROLLED','DELETION_PENDING','DELETED')", name="ck_hr_biometric_status"
        ),
        CheckConstraint("lawful_basis IN ('CONSENT','EMPLOYMENT_LAW')", name="ck_hr_biometric_basis"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_attendance_devices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    modality: Mapped[str] = mapped_column(String(16), nullable=False)
    device_user_ref: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    privacy_notice_version: Mapped[str] = mapped_column(String(32), nullable=False)
    lawful_basis: Mapped[str] = mapped_column(String(24), nullable=False)
    purpose_text: Mapped[str] = mapped_column(Text, nullable=False)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    device_transfer_disclosure: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_captured_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    consent_captured_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    consent_withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consent_withdrawn_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    enrolled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    enrolled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    test_punch_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deletion_requested_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deletion_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deletion_confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# --- Temporary gate passes ------------------------------------------------------------------------


class HrEmployeeGatePass(Base):
    __tablename__ = "hr_employee_gate_passes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "pass_code", name="uq_hr_gate_pass_code"),
        UniqueConstraint("qr_token_hash", name="uq_hr_gate_pass_token"),
        CheckConstraint("status IN ('DRAFT','ACTIVE','EXPIRED','REVOKED')", name="ck_hr_gate_pass_status"),
        CheckConstraint("valid_to > valid_from", name="ck_hr_gate_pass_window"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    pass_code: Mapped[str] = mapped_column(String(32), nullable=False)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    person_name: Mapped[str] = mapped_column(String(128), nullable=False)
    mobile: Mapped[str] = mapped_column(String(32), nullable=False)
    identity_ref: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sponsor_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    permitted_zones: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    valid_from: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    qr_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    issued_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrEmployeeGateEvent(Base):
    __tablename__ = "hr_employee_gate_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_hr_gate_event_idempotency"),
        CheckConstraint("direction IN ('IN','OUT')", name="ck_hr_gate_event_direction"),
        CheckConstraint("result IN ('ALLOWED','DENIED')", name="ck_hr_gate_event_result"),
        Index("ix_hr_gate_events_pass_time", "tenant_id", "gate_pass_id", "event_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    gate_pass_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_gate_passes.id", ondelete="RESTRICT"), nullable=True
    )
    event_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    gate: Mapped[str] = mapped_column(String(64), nullable=False)
    guard_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


# --- Notices, memos, absence and disciplinary cases ------------------------------------------------

CASE_TYPES = ("NOTICE", "SHOW_CAUSE", "WARNING", "MEMO", "ABSENCE", "DISCIPLINARY")
CASE_STATUSES = ("DRAFT", "ISSUED", "RESPONDED", "DEFENCE_NOTICE", "HEARING", "DECIDED", "CLOSED", "CANCELLED")
CASE_EVENT_TYPES = (
    "ISSUED", "DELIVERY_ATTEMPT", "DELIVERED", "RESPONSE", "REJOINED", "DEFENCE_NOTICE_ISSUED",
    "HEARING", "EXTENSION", "DECISION", "CANCELLED",
)


class HrEmployeeCase(Base):
    __tablename__ = "hr_employee_cases"
    __table_args__ = (
        UniqueConstraint("tenant_id", "case_no", name="uq_hr_employee_case_no"),
        CheckConstraint(
            "case_type IN ('NOTICE','SHOW_CAUSE','WARNING','MEMO','ABSENCE','DISCIPLINARY')", name="ck_hr_case_type"
        ),
        CheckConstraint(
            "status IN ('DRAFT','ISSUED','RESPONDED','DEFENCE_NOTICE','HEARING','DECIDED','CLOSED','CANCELLED')",
            name="ck_hr_case_status",
        ),
        CheckConstraint("case_type <> 'ABSENCE' OR first_absent_date IS NOT NULL", name="ck_hr_case_absence_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    case_no: Mapped[str] = mapped_column(String(32), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    case_type: Mapped[str] = mapped_column(String(16), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    body_bn: Mapped[str | None] = mapped_column(Text, nullable=True)
    allegation: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_absent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reply_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    defence_notice_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    defence_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hearing_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    issued_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrEmployeeCaseEvent(Base):
    """Append-only history of a case (no update or delete endpoint)."""

    __tablename__ = "hr_employee_case_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('ISSUED','DELIVERY_ATTEMPT','DELIVERED','RESPONSE','REJOINED','DEFENCE_NOTICE_ISSUED',"
            "'HEARING','EXTENSION','DECISION','CANCELLED')",
            name="ck_hr_case_event_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("hr_employee_cases.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


# --- Separation, clearance, final settlement ------------------------------------------------------


class HrSeparation(Base):
    __tablename__ = "hr_separations"
    __table_args__ = (
        CheckConstraint(
            "separation_type IN ('RESIGNATION','DEEMED_RESIGNATION','TERMINATION','RETRENCHMENT','DISMISSAL','RETIREMENT','DEATH')",
            name="ck_hr_separation_type",
        ),
        CheckConstraint("status IN ('DRAFT','APPROVED','SETTLED','CANCELLED')", name="ck_hr_separation_status"),
        CheckConstraint("effective_date >= last_working_date OR separation_type = 'DEEMED_RESIGNATION'", name="ck_hr_separation_dates"),
        Index(
            "uq_hr_separation_one_open",
            "tenant_id",
            "employee_id",
            unique=True,
            postgresql_where=text("status IN ('DRAFT','APPROVED')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    separation_type: Mapped[str] = mapped_column(String(24), nullable=False)
    request_date: Mapped[date] = mapped_column(Date, nullable=False)
    last_working_date: Mapped[date] = mapped_column(Date, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    notice_days_required: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_days_served: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    permanent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    monthly_rated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    misconduct_no_compensation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    death_at_work: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rule_set_id: Mapped[int | None] = mapped_column(ForeignKey("hr_bd_rule_sets.id", ondelete="RESTRICT"), nullable=True)
    absence_case_id: Mapped[int | None] = mapped_column(
        ForeignKey("hr_employee_cases.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class HrClearanceItem(Base):
    __tablename__ = "hr_clearance_items"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING','CLEARED','WAIVED')", name="ck_hr_clearance_status"),
        CheckConstraint("amount_recoverable >= 0", name="ck_hr_clearance_amount"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    separation_id: Mapped[int] = mapped_column(ForeignKey("hr_separations.id", ondelete="CASCADE"), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(64), nullable=False)
    item: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    amount_recoverable: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    evidence_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_off_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class HrFinalSettlement(Base):
    __tablename__ = "hr_final_settlements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "separation_id", name="uq_hr_final_settlement_separation"),
        CheckConstraint("status IN ('DRAFT','APPROVED','POSTED','PAID','REVERSED')", name="ck_hr_settlement_status"),
        CheckConstraint("net_amount = gross_amount - deduction_amount", name="ck_hr_settlement_net"),
        CheckConstraint("gross_amount >= 0 AND deduction_amount >= 0", name="ck_hr_settlement_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    separation_id: Mapped[int] = mapped_column(ForeignKey("hr_separations.id", ondelete="RESTRICT"), nullable=False)
    employee_id: Mapped[int] = mapped_column(ForeignKey("hr_employees.id", ondelete="RESTRICT"), nullable=False, index=True)
    salary_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    salary_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    salary_days: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False, default=Decimal("0"))
    salary_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    overtime_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    allowances_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    leave_encashment_days: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False, default=Decimal("0"))
    leave_encashment_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    service_benefit_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    notice_pay_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    notice_recovery_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    advance_recovery_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    other_deductions_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    gross_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    deduction_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    net_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=Decimal("0"))
    calculation_trace: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True, unique=True)
    reversal_voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="RESTRICT"), nullable=True)
    posted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# --- Payroll documents and wage acknowledgements --------------------------------------------------


class HrPayrollDocumentSnapshot(Base):
    """Frozen copy of an approved run used for wage slips / registers so later edits cannot change them."""

    __tablename__ = "hr_payroll_document_snapshots"
    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE','INVALIDATED')", name="ck_hr_payroll_snapshot_status"),
        Index(
            "uq_hr_payroll_snapshot_active",
            "tenant_id",
            "payroll_run_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("hr_payroll_runs.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    invalidated_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)


class HrPayrollAcknowledgement(Base):
    __tablename__ = "hr_payroll_acknowledgements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payroll_run_line_id", name="uq_hr_payroll_ack_line"),
        CheckConstraint("payment_method IN ('CASH','BANK_TRANSFER','MFS')", name="ck_hr_payroll_ack_method"),
        CheckConstraint(
            "(payment_method = 'CASH' AND evidence_type = 'REVENUE_STAMP_SIGNATURE') OR "
            "(payment_method = 'BANK_TRANSFER' AND evidence_type = 'BANK_REFERENCE') OR "
            "(payment_method = 'MFS' AND evidence_type = 'MFS_REFERENCE')",
            name="ck_hr_payroll_ack_evidence",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_line_id: Mapped[int] = mapped_column(
        ForeignKey("hr_payroll_run_lines.id", ondelete="RESTRICT"), nullable=False
    )
    payment_method: Mapped[str] = mapped_column(String(16), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    payment_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evidence_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    recorded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
