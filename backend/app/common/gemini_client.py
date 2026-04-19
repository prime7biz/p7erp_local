"""Shared Gemini text generation (used by production planning, ai_tool, dashboard, etc.)."""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.gemini_budget import allow_gemini_call
from app.common.gemini_tenant_budget import (
    allow_gemini_for_tenant,
    allow_openrouter_tenant_text,
    record_gemini_usage,
)
from app.config import get_settings

logger = logging.getLogger(__name__)


def _normalize_gemini_model(model_name: str | None) -> str:
    """Map deprecated model aliases to a currently available default."""
    candidate = (model_name or "").strip()
    if not candidate:
        return "gemini-2.5-flash"
    if candidate in {"gemini-2.0-flash-lite", "gemini-2.0-flash"}:
        return "gemini-2.5-flash"
    return candidate


def _candidate_gemini_models(model_name: str | None) -> list[str]:
    preferred = _normalize_gemini_model(model_name)
    fallbacks = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
    seen: set[str] = set()
    ordered: list[str] = []
    for name in [preferred, *fallbacks]:
        if name and name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def _is_model_not_available_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "no longer available to new users" in msg
        or ("statuscode.not_found" in msg)
        or ("not found" in msg and "model" in msg)
    )


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
    model_candidates = _candidate_gemini_models(model_override or s.gemini_model)
    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        last_err: Exception | None = None
        for model_name in model_candidates:
            try:
                model = genai.GenerativeModel(model_name)
                resp = model.generate_content(prompt)
                if not resp or not getattr(resp, "text", None):
                    return None, model_name, None, None, None
                pt, ct, tt = _extract_usage_from_response(resp)
                return resp.text.strip(), model_name, pt, ct, tt
            except Exception as exc:
                last_err = exc
                if _is_model_not_available_error(exc):
                    logger.warning("Gemini model unavailable, trying fallback (model=%s)", model_name)
                    continue
                logger.exception("Gemini generate_content failed (model=%s)", model_name)
                return None, model_name, None, None, None
        if last_err is not None:
            logger.error(
                "Gemini generate_content failed after trying all fallback models",
                exc_info=last_err,
            )
        return None, model_candidates[0] if model_candidates else None, None, None, None
    except Exception:
        model_name = model_candidates[0] if model_candidates else None
        logger.exception("Gemini generate_content setup failed (model=%s)", model_name)
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
    """Async path: per-tenant budget, kill switch, usage logging.

    When ``OPENROUTER_TENANT_TEXT_ENABLED=true`` and OpenRouter is configured, tries OpenRouter first
    (same tenant token/cost budgets as Gemini), then falls back to Gemini if enabled.
    """
    s = get_settings()
    if getattr(s, "openrouter_tenant_text_enabled", False) and await allow_openrouter_tenant_text(db, tenant_id):
        from app.modules.ai_tool.llm_provider.openrouter_client import openrouter_generate_text

        or_res = await openrouter_generate_text(prompt, log_feature=feature)
        if or_res.text and len(or_res.text.strip()) > 5:
            await record_gemini_usage(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                model=or_res.model,
                feature=feature,
                prompt_tokens=or_res.prompt_tokens,
                completion_tokens=or_res.completion_tokens,
                total_tokens=or_res.total_tokens,
                provider="openrouter",
            )
            await db.flush()
            return or_res.text.strip()
        logger.info(
            "openrouter_tenant_text_skipped_fallback",
            extra={"feature": feature, "tenant_id": tenant_id, "reason": or_res.error or "empty"},
        )

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
    model_candidates = _candidate_gemini_models(model_override or s.gemini_model)
    ct = (mime_type or "application/octet-stream").lower().split(";")[0].strip()
    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        last_err: Exception | None = None
        for model_name in model_candidates:
            try:
                model = genai.GenerativeModel(model_name)
                resp = model.generate_content([{"mime_type": ct, "data": file_bytes}, prompt])
                if not resp or not getattr(resp, "text", None):
                    return None, model_name, None, None, None
                pt, ctk, tt = _extract_usage_from_response(resp)
                return resp.text.strip(), model_name, pt, ctk, tt
            except Exception as exc:
                last_err = exc
                if _is_model_not_available_error(exc):
                    logger.warning("Gemini multimodal model unavailable, trying fallback (model=%s)", model_name)
                    continue
                logger.exception("Gemini multimodal generate_content failed (model=%s)", model_name)
                return None, model_name, None, None, None
        if last_err is not None:
            logger.error(
                "Gemini multimodal generate_content failed after trying fallback models",
                exc_info=last_err,
            )
        return None, model_candidates[0] if model_candidates else None, None, None, None
    except Exception:
        model_name = model_candidates[0] if model_candidates else None
        logger.exception("Gemini multimodal generate_content setup failed (model=%s)", model_name)
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
        "model": _normalize_gemini_model(s.gemini_model),
    }
