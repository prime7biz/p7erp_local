"""Request-scoped context for customer AI (correlation id for logs + audit).

Uses shared master_data_ai request context so Supplier AI can reuse the same correlation id pattern later.
"""

from __future__ import annotations

from app.modules.master_data_ai.request_context import (
    get_master_data_ai_request_id,
    master_data_ai_trace_dependency,
)


def get_customer_ai_request_id() -> str | None:
    return get_master_data_ai_request_id()


customer_ai_trace_dependency = master_data_ai_trace_dependency
