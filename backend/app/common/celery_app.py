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

# Optional beat schedule (enabled when a beat worker is running).
celery_app.conf.beat_schedule = {
    **(getattr(celery_app.conf, "beat_schedule", None) or {}),
    "party-ledger-daily-maintenance": {
        "task": "party_ledger.daily_maintenance",
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
    "finance-weekly-mis-report": {
        "task": "finance.weekly_mis_report",
        "schedule": 60 * 60 * 24 * 7,
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
