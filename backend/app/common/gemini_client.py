"""Shared Gemini text generation (used by production planning, ai_tool, dashboard, etc.)."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_budget import allow_gemini_call
from app.common.gemini_tenant_budget import allow_gemini_for_tenant, record_gemini_usage
from app.config import get_settings

logger = logging.getLogger(__name__)


def _extract_usage_from_response(resp: Any) -> tuple[int | None, int | None, int | None]:
    u = getattr(resp, "usage_metadata", None)
    if u is None:
        return None, None, None
    pt = getattr(u, "prompt_token_count", None)
    ct = getattr(u, "candidates_token_count", None)
    tt = getattr(u, "total_token_count", None)
    try:
        return (
            int(pt) if pt is not None else None,
            int(ct) if ct is not None else None,
            int(tt) if tt is not None else None,
        )
    except (TypeError, ValueError):
        return None, None, None


def _raw_generate_text_sync(
    prompt: str,
    *,
    model_override: str | None = None,
) -> tuple[str | None, str | None, int | None, int | None, int | None]:
    """Returns (text, model_name, pt, ct, tt). No budget checks."""
    s = get_settings()
    api_key = (s.gemini_api_key or "").strip()
    if not api_key:
        return None, None, None, None, None
    model_name = (model_override or s.gemini_model or "gemini-2.0-flash-lite").strip()
    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        resp = model.generate_content(prompt)
        if not resp or not getattr(resp, "text", None):
            return None, model_name, None, None, None
        pt, ct, tt = _extract_usage_from_response(resp)
        return resp.text.strip(), model_name, pt, ct, tt
    except Exception:
        logger.exception("Gemini generate_content failed (model=%s)", model_name)
        return None, model_name, None, None, None


def generate_text_sync(
    prompt: str,
    *,
    model_override: str | None = None,
    skip_budget: bool = False,
) -> str | None:
    """
    Single Gemini generate_content call. Returns None on failure or when disabled.
    Respects GEMINI_* settings and optional monthly budget unless skip_budget=True.
    """
    s = get_settings()
    if not s.gemini_enabled:
        return None
    api_key = (s.gemini_api_key or "").strip()
    if not api_key:
        return None
    if not skip_budget and not allow_gemini_call():
        return None
    text, _m, _pt, _ct, _tt = _raw_generate_text_sync(prompt, model_override=model_override)
    return text


async def generate_text_for_tenant(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    feature: str | None,
    prompt: str,
    *,
    model_override: str | None = None,
) -> str | None:
    """Async path: per-tenant budget, kill switch, usage logging."""
    s = get_settings()
    if not s.gemini_enabled:
        return None
    if not (s.gemini_api_key or "").strip():
        return None
    if not await allow_gemini_for_tenant(db, tenant_id):
        return None
    text, model_name, pt, ct, tt = _raw_generate_text_sync(prompt, model_override=model_override)
    if text:
        await record_gemini_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            model=model_name,
            feature=feature,
            prompt_tokens=pt,
            completion_tokens=ct,
            total_tokens=tt,
        )
        await db.flush()
    return text


def _raw_multimodal_sync(
    prompt: str,
    file_bytes: bytes,
    mime_type: str,
    *,
    model_override: str | None = None,
) -> tuple[str | None, str | None, int | None, int | None, int | None]:
    s = get_settings()
    api_key = (s.gemini_api_key or "").strip()
    if not api_key:
        return None, None, None, None, None
    model_name = (model_override or s.gemini_model or "gemini-2.0-flash-lite").strip()
    ct = (mime_type or "application/octet-stream").lower().split(";")[0].strip()
    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name)
        resp = model.generate_content([{"mime_type": ct, "data": file_bytes}, prompt])
        if not resp or not getattr(resp, "text", None):
            return None, model_name, None, None, None
        pt, ctk, tt = _extract_usage_from_response(resp)
        return resp.text.strip(), model_name, pt, ctk, tt
    except Exception:
        logger.exception("Gemini multimodal generate_content failed (model=%s)", model_name)
        return None, model_name, None, None, None


def generate_multimodal_sync(
    prompt: str,
    file_bytes: bytes,
    mime_type: str,
    *,
    model_override: str | None = None,
    skip_budget: bool = False,
) -> str | None:
    s = get_settings()
    if not s.gemini_enabled:
        return None
    api_key = (s.gemini_api_key or "").strip()
    if not api_key:
        return None
    if not skip_budget and not allow_gemini_call():
        return None
    text, _m, _pt, _ct, _tt = _raw_multimodal_sync(prompt, file_bytes, mime_type, model_override=model_override)
    return text


async def generate_multimodal_for_tenant(
    db: AsyncSession,
    tenant_id: int,
    user_id: int | None,
    feature: str | None,
    prompt: str,
    file_bytes: bytes,
    mime_type: str,
    *,
    model_override: str | None = None,
) -> str | None:
    s = get_settings()
    if not s.gemini_enabled or not (s.gemini_api_key or "").strip():
        return None
    if not await allow_gemini_for_tenant(db, tenant_id):
        return None
    text, model_name, pt, ct, tt = _raw_multimodal_sync(
        prompt, file_bytes, mime_type, model_override=model_override
    )
    if text:
        await record_gemini_usage(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            model=model_name,
            feature=feature,
            prompt_tokens=pt,
            completion_tokens=ct,
            total_tokens=tt,
        )
        await db.flush()
    return text


def gemini_config_dict() -> dict[str, Any]:
    """Non-secret effective config for debugging."""
    s = get_settings()
    return {
        "enabled": bool(s.gemini_enabled),
        "has_api_key": bool((s.gemini_api_key or "").strip()),
        "model": (s.gemini_model or "gemini-2.0-flash-lite").strip(),
    }
