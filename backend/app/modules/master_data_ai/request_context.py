"""Request-scoped correlation id for master-data AI (audit + structured logs)."""

from __future__ import annotations

import contextvars
import uuid

from fastapi import Request

_ctx_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "master_data_ai_request_id", default=None
)


def get_master_data_ai_request_id() -> str | None:
    return _ctx_request_id.get()


async def master_data_ai_trace_dependency(request: Request):
    rid = (request.headers.get("X-Request-ID") or "").strip() or str(uuid.uuid4())
    token = _ctx_request_id.set(rid)
    try:
        yield rid
    finally:
        _ctx_request_id.reset(token)
