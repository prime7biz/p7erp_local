"""Gemini-based production planning insights (cheapest Flash-lite model)."""
from __future__ import annotations

import asyncio
import json
import re
import time
from collections import defaultdict
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_client import generate_text_for_tenant
from app.config import get_settings

# Simple per-process rate limit (tenant_id -> list of timestamps)
_rate_buckets: dict[int, list[float]] = defaultdict(list)


def _current_rate_count(tenant_id: int, window_sec: int) -> int:
    now = time.monotonic()
    bucket = _rate_buckets[tenant_id]
    cutoff = now - window_sec
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    return len(bucket)


def get_ai_status(tenant_id: int, tenant_ai_config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return effective AI status for UI/debugging (no secrets)."""
    enabled, api_key, model = _gemini_config(tenant_ai_config)
    s = get_settings()
    rate_limited = enabled and api_key is not None and _current_rate_count(tenant_id, s.ai_rate_limit_window_seconds) >= s.ai_rate_limit_heavy_per_window
    reason = "ok"
    if not enabled:
        reason = "disabled"
    elif not api_key:
        reason = "missing_api_key"
    elif rate_limited:
        reason = "rate_limited"
    return {
        "enabled": bool(enabled),
        "has_api_key": bool(api_key),
        "model": model,
        "rate_limited": bool(rate_limited),
        "reason": reason,
    }


def _rate_ok(tenant_id: int) -> bool:
    s = get_settings()
    window_sec = s.ai_rate_limit_window_seconds
    max_per_window = s.ai_rate_limit_heavy_per_window
    now = time.monotonic()
    bucket = _rate_buckets[tenant_id]
    cutoff = now - window_sec
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= max_per_window:
        return False
    bucket.append(now)
    return True


def _gemini_config(
    tenant_ai_config: dict[str, Any] | None,
) -> tuple[bool, str | None, str]:
    """Returns (enabled, api_key, model)."""
    s = get_settings()
    enabled = s.gemini_enabled
    api_key = (s.gemini_api_key or "").strip()
    model = (s.gemini_model or "gemini-2.0-flash-lite").strip()
    if tenant_ai_config:
        if "enabled" in tenant_ai_config:
            enabled = bool(tenant_ai_config["enabled"])
        if tenant_ai_config.get("model"):
            model = str(tenant_ai_config["model"]).strip()
    return enabled, api_key or None, model


async def _generate_text(
    db: AsyncSession,
    tenant_id: int,
    prompt: str,
    tenant_ai_config: dict[str, Any] | None = None,
) -> str | None:
    enabled, api_key, model = _gemini_config(tenant_ai_config)
    if not enabled or not api_key:
        return None
    if not _rate_ok(tenant_id):
        return None
    s = get_settings()
    timeout = float(s.ai_timeout_heavy_seconds)
    try:
        return await asyncio.wait_for(
            generate_text_for_tenant(
                db,
                tenant_id,
                None,
                "planning",
                prompt,
                model_override=model,
            ),
            timeout=timeout,
        )
    except (TimeoutError, asyncio.CancelledError):
        return None


def _extract_json_array_or_object(text: str) -> Any | None:
    if not text:
        return None
    t = text.strip()
    # Strip markdown fences
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)```$", t)
    if fence:
        t = fence.group(1).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        pass
    # Find first {...} or [...]
    for m in re.finditer(r"(\{[\s\S]*\}|\[[\s\S]*\])", t):
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
    return None


async def analyze_pipeline(
    db: AsyncSession,
    tenant_id: int,
    pipeline_payload: dict[str, Any],
    tenant_ai_config: dict[str, Any] | None = None,
) -> str | None:
    """Natural-language summary of pipeline state."""
    prompt = (
        "You are a garment production planning assistant. Given the following JSON data about orders, "
        "styles, material readiness, TNA approvals, and line allocations, write a short actionable summary "
        "(max 8 bullet points or 120 words). Focus on risks, blockers, and what to do next.\n\n"
        f"DATA:\n{json.dumps(pipeline_payload, default=str)[:12000]}"
    )
    return await _generate_text(db, tenant_id, prompt, tenant_ai_config)


async def suggest_allocation(
    db: AsyncSession,
    tenant_id: int,
    order_data: dict[str, Any],
    lines_load: list[dict[str, Any]],
    calendar_hint: dict[str, Any] | None,
    tenant_ai_config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Recommend line + start date for one order."""
    payload = {
        "order": order_data,
        "lines_load": lines_load,
        "calendar": calendar_hint or {},
    }
    prompt = (
        "You are a garment sewing line planner. Recommend the best sewing line and a start date (ISO YYYY-MM-DD) "
        "for this order. Respond with ONLY valid JSON: "
        '{"recommended_line_id": <int or null>, "recommended_line_code": <string>, '
        '"recommended_start_date": "YYYY-MM-DD", "reason": "<short string>"}\n\n'
        f"CONTEXT:\n{json.dumps(payload, default=str)[:8000]}"
    )
    text = await _generate_text(db, tenant_id, prompt, tenant_ai_config)
    if not text:
        return None
    parsed = _extract_json_array_or_object(text)
    if isinstance(parsed, dict):
        return parsed
    return None


async def predict_move_consequences(
    db: AsyncSession,
    tenant_id: int,
    board_snapshot: dict[str, Any],
    proposed_move: dict[str, Any],
    tenant_ai_config: dict[str, Any] | None = None,
) -> str | None:
    """Short narrative on ripple effects of moving a plan block."""
    prompt = (
        "You are a garment production planner. Describe consequences (2-5 sentences) if we apply this move: "
        "capacity impact, delivery risk, and any conflict with materials or approvals.\n\n"
        f"CURRENT_BOARD:\n{json.dumps(board_snapshot, default=str)[:6000]}\n\n"
        f"PROPOSED_MOVE:\n{json.dumps(proposed_move, default=str)[:2000]}"
    )
    return await _generate_text(db, tenant_id, prompt, tenant_ai_config)


async def generate_risk_alerts(
    db: AsyncSession,
    tenant_id: int,
    assignments_with_readiness: list[dict[str, Any]],
    tenant_ai_config: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Return structured risk alerts."""
    prompt = (
        "You are a garment production risk assistant. Given sewing line assignments with readiness flags, "
        "output ONLY a JSON array of alerts. Each alert: "
        '{"severity": "info"|"warning"|"critical", "title": "...", "detail": "...", '
        '"order_id": <int or null>, "line_id": <int or null>} '
        "Max 12 alerts. Focus on: starting production without materials, upcoming delivery with pending approvals.\n\n"
        f"DATA:\n{json.dumps(assignments_with_readiness, default=str)[:10000]}"
    )
    text = await _generate_text(db, tenant_id, prompt, tenant_ai_config)
    if not text:
        return None
    parsed = _extract_json_array_or_object(text)
    if isinstance(parsed, list):
        return [x for x in parsed if isinstance(x, dict)]
    return None


async def optimize_board(
    db: AsyncSession,
    tenant_id: int,
    board_snapshot: dict[str, Any],
    tenant_ai_config: dict[str, Any] | None = None,
) -> list[dict[str, Any]] | None:
    """Suggest rearrangements as list of moves."""
    prompt = (
        "You optimize sewing line Gantt assignments. Given the board snapshot, respond with ONLY a JSON array of "
        'suggested moves: [{"config_id": <int>, "line_id": <int>, "start_date": "YYYY-MM-DD", "reason": "..."}, ...] '
        "Max 20 moves. Improve utilization and on-time delivery.\n\n"
        f"BOARD:\n{json.dumps(board_snapshot, default=str)[:10000]}"
    )
    text = await _generate_text(db, tenant_id, prompt, tenant_ai_config)
    if not text:
        return None
    parsed = _extract_json_array_or_object(text)
    if isinstance(parsed, list):
        return [x for x in parsed if isinstance(x, dict)]
    return None
