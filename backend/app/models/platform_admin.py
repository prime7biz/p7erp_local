"""Platform (super admin) tables: admins, audit, impersonation, backup, AI budgets, billing, support."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlatformAdmin(Base):
    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="super_admin")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PlatformAdminAuditLog(Base):
    __tablename__ = "platform_admin_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    target_tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resource: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ImpersonationSession(Base):
    __tablename__ = "impersonation_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class BackupJob(Base):
    __tablename__ = "backup_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    backup_type: Mapped[str] = mapped_column(String(16), nullable=False, default="full")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued", index=True)
    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    storage_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    initiated_by: Mapped[int | None] = mapped_column(ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class BackupSchedule(Base):
    __tablename__ = "backup_schedules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="daily")
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AiUsageLog(Base):
    __tablename__ = "ai_usage_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="gemini")
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    feature: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class TenantAiBudget(Base):
    __tablename__ = "tenant_ai_budgets"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    monthly_token_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    monthly_cost_limit_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    current_month_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_month_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    is_throttled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    throttled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    alert_threshold_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    reset_day: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gemini_kill_switch: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PlatformPlan(Base):
    __tablename__ = "platform_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_storage_gb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_ai_tokens_monthly: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Module toggles; merged with tenant.feature_flags for effective entitlements.
    features_included: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    support_level: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")
    optional_addons: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    overage_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    price_monthly_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    price_yearly_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Lemon Squeezy variant IDs (stringified) — map one platform plan row to checkout variants.
    lemonsqueezy_variant_id_monthly: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lemonsqueezy_variant_id_yearly: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TenantSubscription(Base):
    __tablename__ = "tenant_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan_id: Mapped[int] = mapped_column(ForeignKey("platform_plans.id", ondelete="RESTRICT"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", index=True)
    lemonsqueezy_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    lemonsqueezy_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lemonsqueezy_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="trial")
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    billing_cycle: Mapped[str] = mapped_column(String(16), nullable=False, default="monthly")
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LemonsqueezyWebhookEvent(Base):
    """Idempotency + audit for Lemon Squeezy webhook deliveries (retries reuse the same body)."""

    __tablename__ = "lemonsqueezy_webhook_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    event_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    signature_ok: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenant_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    invoice_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    line_items: Mapped[list | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class BillingPayment(Base):
    __tablename__ = "billing_payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("billing_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(32), nullable=False, default="bank_transfer")
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class TenantNote(Base):
    __tablename__ = "tenant_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("platform_admins.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PlatformAnnouncement(Base):
    __tablename__ = "platform_announcements"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="info")
    target: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    target_tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class TenantRateLimit(Base):
    __tablename__ = "tenant_rate_limits"

    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    requests_per_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    requests_per_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=10000)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TenantUsageDaily(Base):
    __tablename__ = "tenant_usage_daily"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    api_calls_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    api_errors_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_users_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    login_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_bytes_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    ai_calls_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ai_tokens_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("tenant_id", "date", name="uq_tenant_usage_daily_tenant_date"),)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True)
    submitted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False, default="general")
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open", index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="admin_created")
    sla_first_response_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    escalation_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SupportTicketMessage(Base):
    __tablename__ = "support_ticket_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    author_type: Mapped[str] = mapped_column(String(16), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PlatformBackgroundJob(Base):
    """Async platform jobs (bulk tenant onboarding, CSV import, etc.)."""

    __tablename__ = "platform_background_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    admin_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True, index=True
    )
    progress_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
