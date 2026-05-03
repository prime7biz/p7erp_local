"""Generate and persist weekly AI executive reports."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_for_tenant
from app.config import get_settings
from app.models import AiWeeklyReport
from app.modules.dashboard.ai_services import build_executive_kpi_snapshot

logger = logging.getLogger(__name__)

WEEKLY_DELTA_NUMERIC_KEYS = (
    "active_orders",
    "total_customers",
    "pending_approvals_total",
    "orders_past_delivery_open",
    "open_downtime_events",
    "open_trade_cases",
)

GenerateStatus = Literal["created", "exists", "updated", "skipped_no_gemini", "skipped_empty"]


def iso_week_bounds(d: date) -> tuple[date, date]:
    """Monday–Sunday week containing d."""
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _num(x: object) -> float | int | None:
    if x is None:
        return None
    if isinstance(x, bool):
        return None
    if isinstance(x, int) and not isinstance(x, bool):
        return x
    if isinstance(x, float):
        return x
    return None


def compute_kpi_delta(
    current: dict[str, Any] | None,
    previous: dict[str, Any] | None,
) -> dict[str, dict[str, float | int | None]]:
    out: dict[str, dict[str, float | int | None]] = {}
    if not current:
        return out
    for k in WEEKLY_DELTA_NUMERIC_KEYS:
        c = _num(current.get(k))
        p = _num(previous.get(k)) if previous else None
        if c is None and p is None:
            continue
        ch: float | int | None
        if c is not None and p is not None:
            ch = c - p
            if isinstance(c, int) and isinstance(p, int) and not isinstance(ch, bool):
                ch = int(ch)
        else:
            ch = None
        out[k] = {"current": c, "previous": p, "change": ch}
    return out


def build_weekly_prompt(snapshot: dict[str, Any]) -> str:
    return (
        "Write a weekly executive report for a garment factory owner using P7 ERP. "
        "Cover operations, approvals backlog, delivery risk, and one strategic recommendation. "
        "Use markdown-lite bullet sections. Max 400 words.\n\n"
        f"{json.dumps(snapshot, default=str)[:10000]}"
    )


async def build_weekly_kpi_snapshot(
    db: AsyncSession, tenant_id: int, week_start: date, week_end: date
) -> dict[str, Any]:
    snap = await build_executive_kpi_snapshot(db, tenant_id)
    snap["week_label"] = f"{week_start.isoformat()} to {week_end.isoformat()}"
    return snap


async def get_report_by_id(db: AsyncSession, tenant_id: int, report_id: int) -> AiWeeklyReport | None:
    r = await db.execute(
        select(AiWeeklyReport).where(
            AiWeeklyReport.tenant_id == tenant_id,
            AiWeeklyReport.id == report_id,
        )
    )
    return r.scalar_one_or_none()


async def get_report_by_week(
    db: AsyncSession, tenant_id: int, week_start: date,
) -> AiWeeklyReport | None:
    r = await db.execute(
        select(AiWeeklyReport).where(
            AiWeeklyReport.tenant_id == tenant_id,
            AiWeeklyReport.week_start == week_start,
        )
    )
    return r.scalar_one_or_none()


async def _ordered_reports_desc(db: AsyncSession, tenant_id: int, cap: int = 200) -> list[AiWeeklyReport]:
    r = await db.execute(
        select(AiWeeklyReport)
        .where(AiWeeklyReport.tenant_id == tenant_id)
        .order_by(AiWeeklyReport.week_start.desc())
        .limit(cap)
    )
    return list(r.scalars().all())


def _find_immediate_older(ordered_by_week_desc: list[AiWeeklyReport], week_start: date) -> AiWeeklyReport | None:
    for i, row in enumerate(ordered_by_week_desc):
        if row.week_start == week_start and i + 1 < len(ordered_by_week_desc):
            return ordered_by_week_desc[i + 1]
    return None


def delta_for_report(
    ordered_by_week_desc: list[AiWeeklyReport],
    report: AiWeeklyReport,
) -> dict[str, Any] | None:
    prev = _find_immediate_older(ordered_by_week_desc, report.week_start)
    d = compute_kpi_delta(report.kpi_snapshot_json, prev.kpi_snapshot_json if prev else None)
    return d or None


async def get_weekly_report_status(
    db: AsyncSession, tenant_id: int,
) -> dict[str, Any]:
    s = get_settings()
    gemini = bool(s.gemini_enabled and (s.gemini_api_key or "").strip())
    today = date.today()
    week_start, week_end = iso_week_bounds(today)
    current_row = await get_report_by_week(db, tenant_id, week_start)
    last = (
        await db.execute(
            select(AiWeeklyReport)
            .where(AiWeeklyReport.tenant_id == tenant_id)
            .order_by(AiWeeklyReport.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    now_utc = datetime.now(timezone.utc)
    d_utc = now_utc.date()
    w = d_utc.weekday()  # Monday=0, Sunday=6
    if w < 6:
        next_sun = d_utc + timedelta(days=6 - w)
    else:
        next_sun = d_utc + timedelta(days=7)
    next_scheduled_utc = datetime.combine(next_sun, time.min, tzinfo=timezone.utc)
    if next_scheduled_utc <= now_utc:
        next_scheduled_utc = next_scheduled_utc + timedelta(days=7)
    return {
        "gemini_configured": gemini,
        "current_week_start": week_start,
        "current_week_end": week_end,
        "has_current_week_report": current_row is not None,
        "last_report_created_at": last.created_at if last else None,
        "next_scheduled_utc": next_scheduled_utc,
    }


async def list_weekly_reports(db: AsyncSession, tenant_id: int, limit: int = 24) -> list[AiWeeklyReport]:
    r = await db.execute(
        select(AiWeeklyReport)
        .where(AiWeeklyReport.tenant_id == tenant_id)
        .order_by(AiWeeklyReport.week_start.desc())
        .limit(limit)
    )
    return list(r.scalars().all())


async def list_weekly_report_deltas(
    db: AsyncSession, tenant_id: int, rows: list[AiWeeklyReport],
) -> list[dict[str, Any] | None]:
    if not rows:
        return []
    ordered = await _ordered_reports_desc(db, tenant_id, cap=max(200, len(rows) + 2))
    return [delta_for_report(ordered, r) for r in rows]


async def upsert_weekly_report(
    db: AsyncSession,
    tenant_id: int,
    *,
    force: bool = False,
    target_date: date | None = None,
) -> tuple[AiWeeklyReport | None, GenerateStatus]:
    s = get_settings()
    if not s.gemini_enabled or not (s.gemini_api_key or "").strip():
        return None, "skipped_no_gemini"

    ref = target_date or date.today()
    week_start, week_end = iso_week_bounds(ref)
    existing = await get_report_by_week(db, tenant_id, week_start)
    if existing and not force:
        return existing, "exists"

    snapshot = await build_weekly_kpi_snapshot(db, tenant_id, week_start, week_end)
    prompt = build_weekly_prompt(snapshot)
    narrative = await generate_text_for_tenant(db, tenant_id, None, "weekly_report", prompt)
    if not narrative:
        logger.warning("Weekly AI report skipped: Gemini returned empty for tenant %s", tenant_id)
        if existing and force:
            return existing, "skipped_empty"
        return None, "skipped_empty"

    if existing and force:
        existing.narrative = narrative
        existing.kpi_snapshot_json = snapshot
        existing.week_end = week_end
        await db.flush()
        return existing, "updated"

    row = AiWeeklyReport(
        tenant_id=tenant_id,
        week_start=week_start,
        week_end=week_end,
        narrative=narrative,
        kpi_snapshot_json=snapshot,
    )
    db.add(row)
    await db.flush()
    return row, "created"


async def generate_and_store_weekly_report(db: AsyncSession, tenant_id: int) -> AiWeeklyReport | None:
    """Background scheduler: create current week if missing; never overwrites (force=False)."""
    row, status = await upsert_weekly_report(db, tenant_id, force=False, target_date=None)
    if status in ("skipped_no_gemini", "skipped_empty", "exists"):
        return row
    return row


__all__ = [
    "WEEKLY_DELTA_NUMERIC_KEYS",
    "GenerateStatus",
    "iso_week_bounds",
    "compute_kpi_delta",
    "build_weekly_prompt",
    "build_weekly_kpi_snapshot",
    "get_report_by_id",
    "get_report_by_week",
    "get_weekly_report_status",
    "list_weekly_reports",
    "list_weekly_report_deltas",
    "upsert_weekly_report",
    "generate_and_store_weekly_report",
    "delta_for_report",
]
