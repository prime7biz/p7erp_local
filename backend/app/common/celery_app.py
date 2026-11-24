"""Celery application factory (optional; used when Redis broker is configured)."""

from __future__ import annotations

from celery import Celery

from app.config import get_settings


def make_celery() -> Celery:
    settings = get_settings()
    broker = (getattr(settings, "celery_broker_url", None) or "").strip() or (settings.redis_url or "redis://localhost:6379/0")
    backend = (getattr(settings, "celery_result_backend", None) or "").strip() or broker
    app = Celery(
        "p7erp",
        broker=str(broker),
        backend=str(backend),
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        worker_prefetch_multiplier=max(1, int(settings.celery_worker_prefetch_multiplier)),
        worker_max_tasks_per_child=int(settings.celery_worker_max_tasks_per_child) or None,
        task_soft_time_limit=int(settings.celery_task_soft_time_limit_seconds) or None,
        task_time_limit=int(settings.celery_task_time_limit_seconds) or None,
    )
    return app


celery_app = make_celery()

# Register tasks (decorators need celery_app defined above).
from app.workers import forecast_worker as _forecast_worker  # noqa: E402, F401
from app.workers import platform_worker as _platform_worker  # noqa: E402, F401
from app.workers import task_worker as _task_worker  # noqa: E402, F401
from app.workers import party_ledger_worker as _party_ledger_worker  # noqa: E402, F401
from app.workers import stock_maintenance_worker as _stock_maintenance_worker  # noqa: E402, F401
from app.workers import inventory_analytics_worker as _inventory_analytics_worker  # noqa: E402, F401
from app.workers import gst_reconciliation_worker as _gst_reconciliation_worker  # noqa: E402, F401
from app.workers import advanced_voucher_worker as _advanced_voucher_worker  # noqa: E402, F401
from app.workers import statutory_remittance_worker as _statutory_remittance_worker  # noqa: E402, F401
from app.workers import medical_certificate_expiry_worker as _medical_certificate_expiry_worker  # noqa: E402, F401
from app.workers import mis_report_worker as _mis_report_worker  # noqa: E402, F401
from app.workers import mfg_planning_worker as _mfg_planning_worker  # noqa: E402, F401
from app.workers import mfg_predictive_worker as _mfg_predictive_worker  # noqa: E402, F401
from app.workers import mgmt_performance_worker as _mgmt_performance_worker  # noqa: E402, F401
from app.workers import coa_interest_worker as _coa_interest_worker  # noqa: E402, F401
from app.workers import kpi_daily_worker as _kpi_daily_worker  # noqa: E402, F401
from app.workers import user_activity_worker as _user_activity_worker  # noqa: E402, F401
from app.workers import hr_class_worker as _hr_class_worker  # noqa: E402, F401
from celery.schedules import crontab as _crontab  # noqa: E402

# Optional beat schedule (enabled when a beat worker is running).
celery_app.conf.beat_schedule = {
    **(getattr(celery_app.conf, "beat_schedule", None) or {}),
    "party-ledger-daily-maintenance": {
        "task": "party_ledger.daily_maintenance",
        "schedule": 60 * 60 * 24,
    },
    # COA Asset/Liability interest: creates DRAFT journals only (tenants with flag off are skipped).
    "finance-coa-interest-accrual": {
        "task": "finance.coa_interest_accrual",
        "schedule": 60 * 60 * 24,
    },
    "inventory-daily-stock-maintenance": {
        "task": "inventory.daily_stock_maintenance",
        "schedule": 60 * 60 * 24,
    },
    "inventory-weekly-cycle-count-schedule": {
        "task": "inventory.weekly_cycle_count_schedule",
        "schedule": 60 * 60 * 24 * 7,
    },
    "inventory-monthly-stock-aging-alert": {
        "task": "inventory.monthly_stock_aging_alert",
        "schedule": 60 * 60 * 24 * 30,
    },
    "finance-monthly-gst-reconciliation": {
        "task": "finance.monthly_gst_reconciliation",
        "schedule": 60 * 60 * 24 * 7,  # weekly check of prior month
    },
    "finance-advanced-voucher-daily": {
        "task": "finance.advanced_voucher_daily",
        "schedule": 60 * 60 * 24,
    },
    "hr-monthly-statutory-remittance": {
        "task": "hr.monthly_statutory_remittance",
        "schedule": 60 * 60 * 24,
    },
    "hr-medical-certificate-expiry": {
        "task": "hr.medical_certificate_expiry",
        "schedule": 60 * 60 * 24,
    },
    # HR class authority: shut off ESS / linked login after exit (tenants with authority flag off are skipped).
    "hr-exit-access-shutoff": {
        "task": "hr.exit_access_shutoff",
        "schedule": 60 * 60 * 24,
    },
    # HR reminders: DRAFT CONFIRMATION suggestions only when hr_reminders_v1 is on.
    "hr-reminders-daily": {
        "task": "hr.reminders_daily",
        "schedule": _crontab(minute=15, hour=2),
    },
    "finance-weekly-mis-report": {
        "task": "finance.weekly_mis_report",
        "schedule": 60 * 60 * 24 * 7,
    },
    "mfg-planning-lifecycle-daily": {
        "task": "mfg.planning_lifecycle_daily",
        "schedule": 60 * 60 * 24,
    },
    # Manufacturing Intelligence Phase 4: 19:30 UTC = 01:30 Asia/Dhaka (each tenant is a no-op while its flag is off).
    "mfg-predictive-daily": {
        "task": "mfg.predictive_daily",
        "schedule": _crontab(minute=30, hour=19),
    },
    # Finance > Management Performance: 20:00 UTC = 02:00 Asia/Dhaka (tenants with mgmt_performance_v1 off are skipped).
    "mgmt-budget-exception-scan": {
        "task": "mgmt.budget_exception_scan",
        "schedule": _crontab(minute=0, hour=20),
    },
    # KPI engine daily aggregates: 21:00 UTC (tenants with kpi_engine_v1 off are skipped).
    "kpi-daily-aggregate": {
        "task": "kpi.daily_aggregate",
        "schedule": _crontab(minute=0, hour=21),
    },
    # User Activity: close idle login sessions hourly (no-op while USER_SESSION_TRACKING_ENABLED is false).
    "user-activity-expire-sessions": {
        "task": "user_activity.expire_sessions",
        "schedule": 60 * 60,
    },
    # User Activity: purge old API_REQUEST/API_ERROR rows daily (dry-run until AUDIT_API_PURGE_DRY_RUN=false).
    "user-activity-purge-api-audit": {
        "task": "user_activity.purge_api_audit_logs",
        "schedule": _crontab(minute=20, hour=3),
    },
}

if not get_settings().inprocess_schedulers_enabled:
    from celery.schedules import crontab

    from app.workers import scheduled_jobs_worker as _scheduled_jobs_worker  # noqa: F401

    celery_app.conf.beat_schedule.update(
        {
            "scheduled-merch-alert-scan": {"task": "scheduled.merch_alert_scan", "schedule": 60 * 15},
            "scheduled-trade-alert-scan": {"task": "scheduled.trade_alert_scan", "schedule": crontab(minute=10, hour=0)},
            "scheduled-weekly-ai-reports": {
                "task": "scheduled.weekly_ai_reports",
                "schedule": crontab(minute=0, hour=2, day_of_week="sun"),
            },
            "scheduled-platform-maintenance": {"task": "scheduled.platform_maintenance", "schedule": 60 * 60},
        }
    )
else:
    from app.workers import scheduled_jobs_worker as _scheduled_jobs_worker  # noqa: E402, F401
