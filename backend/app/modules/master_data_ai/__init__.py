"""Shared low-level helpers for master-data AI flows (Customer AI, future Supplier AI).

Persistence (suggestion batches) stays per-module; this package only holds runtime utilities.
"""

from app.modules.master_data_ai.gateway import invoke_structured_llm
from app.modules.master_data_ai.request_context import (
    get_master_data_ai_request_id,
    master_data_ai_trace_dependency,
)
from app.modules.master_data_ai.sanitization import sanitize_nl_user_query, sanitize_untrusted_text

__all__ = [
    "get_master_data_ai_request_id",
    "invoke_structured_llm",
    "master_data_ai_trace_dependency",
    "sanitize_nl_user_query",
    "sanitize_untrusted_text",
]
