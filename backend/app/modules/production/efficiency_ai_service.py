"""Hourly production aggregates + Gemini efficiency narrative."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_for_tenant
from app.models.production import HourlyProductionEntry, SewingLine


async def build_efficiency_forecast(db: AsyncSession, tenant_id: int) -> dict[str, Any]:
    since = date.today() - timedelta(days=30)
    r = await db.execute(
        select(
            HourlyProductionEntry.line_id,
            func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0.0),
            func.count(HourlyProductionEntry.id),
        )
        .where(
            HourlyProductionEntry.tenant_id == tenant_id,
            HourlyProductionEntry.production_date >= since,
            HourlyProductionEntry.line_id.isnot(None),
        )
        .group_by(HourlyProductionEntry.line_id)
    )
    per_line: list[dict[str, Any]] = []
    for line_id, good_sum, n in r.all():
        lr = await db.execute(select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.id == line_id))
        ln = lr.scalar_one_or_none()
        code = ln.line_code if ln else str(line_id)
        per_line.append(
            {
                "line_id": int(line_id),
                "line_code": code,
                "good_qty_30d": float(good_sum or 0),
                "entry_count_30d": int(n or 0),
            }
        )
    payload = {"period_days": 30, "since": since.isoformat(), "lines": per_line[:40]}
    prompt = (
        "You are a garment sewing floor planner. Given 30-day hourly production aggregates by sewing line (JSON), "
        "predict likely efficiency focus for next week in plain language: which lines may need support and why. "
        "Max 200 words. If lines array is empty, say there is not enough hourly data yet.\n\n"
        f"{json.dumps(payload, default=str)[:12000]}"
    )
    narrative = await generate_text_for_tenant(db, tenant_id, None, "planning", prompt)
    return {
        "forecast_text": narrative or "Efficiency forecast unavailable (add hourly production data or configure Gemini).",
        "lines": per_line,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
