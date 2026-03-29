"""Structured LLM calls with timeout, retry, and safe logging (shared by master-data AI modules)."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TypeVar

from pydantic import BaseModel

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider

logger = logging.getLogger("p7erp.master_data_ai")

T = TypeVar("T", bound=BaseModel)


async def invoke_structured_llm(
    provider: BaseLlmProvider,
    *,
    operation: str,
    prompt: str,
    response_model: type[T],
    tenant_id: int,
    request_id: str | None = None,
) -> tuple[T | None, str | None, str]:
    """
    Run generate_structured with timeout + one retry on timeout.
    Returns (model, error_message, provider_class_name).

    Log event names match the historical Customer AI logger for observability parity.
    """
    settings = get_settings()
    timeout_sec = max(5, int(settings.ai_timeout_heavy_seconds))
    retries = max(0, int(settings.customer_ai_llm_retry_count or 0))
    prov_name = type(provider).__name__
    rid = request_id or "—"

    last_err: str | None = None
    for attempt in range(retries + 1):
        t0 = time.perf_counter()
        try:
            async with asyncio.timeout(timeout_sec):
                parsed, err = await provider.generate_structured(prompt, response_model)
            ms = int((time.perf_counter() - t0) * 1000)
            if err:
                logger.info(
                    "customer_ai_llm_result",
                    extra={
                        "operation": operation,
                        "tenant_id": tenant_id,
                        "request_id": rid,
                        "provider": prov_name,
                        "result": "schema_error",
                        "latency_ms": ms,
                        "attempt": attempt,
                    },
                )
                return parsed, err, prov_name
            logger.info(
                "customer_ai_llm_result",
                extra={
                    "operation": operation,
                    "tenant_id": tenant_id,
                    "request_id": rid,
                    "provider": prov_name,
                    "result": "ok" if parsed else "empty",
                    "latency_ms": ms,
                    "attempt": attempt,
                },
            )
            return parsed, None, prov_name
        except TimeoutError:
            last_err = f"AI request timed out after {timeout_sec}s."
            logger.warning(
                "customer_ai_llm_timeout",
                extra={
                    "operation": operation,
                    "tenant_id": tenant_id,
                    "request_id": rid,
                    "provider": prov_name,
                    "attempt": attempt,
                },
            )
        except Exception as exc:
            last_err = f"AI provider error: {type(exc).__name__}"
            logger.warning(
                "customer_ai_llm_exception",
                extra={
                    "operation": operation,
                    "tenant_id": tenant_id,
                    "request_id": rid,
                    "provider": prov_name,
                    "exc_type": type(exc).__name__,
                    "attempt": attempt,
                },
            )
            break

    return None, last_err or "AI request failed.", prov_name
