"""Celery beat tasks for jobs that used to run only as in-process loops in app.main.

Scheduled only when ``INPROCESS_SCHEDULERS_ENABLED=false`` (see celery_app beat schedule),
so the same job is never driven by both schedulers.
"""

from __future__ import annotations


from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common import scheduled_jobs as jobs


@celery_app.task(name="scheduled.merch_alert_scan")
def merch_alert_scan() -> bool:
    return run_async(jobs.run_merch_alert_scan_once())


@celery_app.task(name="scheduled.trade_alert_scan")
def trade_alert_scan() -> bool:
    return run_async(jobs.run_trade_alert_scan_once())


@celery_app.task(name="scheduled.weekly_ai_reports")
def weekly_ai_reports() -> bool:
    # Beat fires this on Sundays via crontab, so skip the weekday guard.
    return run_async(jobs.run_weekly_ai_reports_once(only_on_sunday=False))


@celery_app.task(name="scheduled.platform_maintenance")
def platform_maintenance() -> bool:
    return run_async(jobs.run_platform_maintenance_once())
