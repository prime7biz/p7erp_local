"""Generate and persist weekly AI executive reports."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_for_tenant
from app.config import get_settings
from app.models import AiWeeklyReport
from app.modules.dashboard.ai_services import build_executive_kpi_snapshot

logger = logging.getLogger(__name__)


def _iso_week_bounds(d: date) -> tuple[date, date]:
    """Monday–Sunday week containing d."""
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


async def generate_and_store_weekly_report(db: AsyncSession, tenant_id: int) -> AiWeeklyReport | None:
    s = get_settings()
    if not s.gemini_enabled or not (s.gemini_api_key or "").strip():
        return None

    today = date.today()
    week_start, week_end = _iso_week_bounds(today)
    existing = (
        await db.execute(
            select(AiWeeklyReport).where(AiWeeklyReport.tenant_id == tenant_id, AiWeeklyReport.week_start == week_start)
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    snapshot = await build_executive_kpi_snapshot(db, tenant_id)
    snapshot["week_label"] = f"{week_start.isoformat()} to {week_end.isoformat()}"
    prompt = (
        "Write a weekly executive report for a garment factory owner using P7 ERP. "
        "Cover operations, approvals backlog, delivery risk, and one strategic recommendation. "
        "Use markdown-lite bullet sections. Max 400 words.\n\n"
        f"{json.dumps(snapshot, default=str)[:10000]}"
    )
    narrative = await generate_text_for_tenant(db, tenant_id, None, "weekly_report", prompt)
    if not narrative:
        logger.warning("Weekly AI report skipped: Gemini returned empty for tenant %s", tenant_id)
        return None

    row = AiWeeklyReport(
        tenant_id=tenant_id,
        week_start=week_start,
        week_end=week_end,
        narrative=narrative,
        kpi_snapshot_json=snapshot,
    )
    db.add(row)
    await db.flush()
    return row


async def list_weekly_reports(db: AsyncSession, tenant_id: int, limit: int = 24) -> list[AiWeeklyReport]:
    r = await db.execute(
        select(AiWeeklyReport)
        .where(AiWeeklyReport.tenant_id == tenant_id)
        .order_by(AiWeeklyReport.week_start.desc())
        .limit(limit)
    )
    return list(r.scalars().all())
