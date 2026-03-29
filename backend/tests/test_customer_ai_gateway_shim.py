"""Ensure Customer AI gateway/context remain thin aliases to master_data_ai."""

from __future__ import annotations

import app.modules.master_data_ai as mda
from app.modules.customers import customer_ai_gateway as cgw
from app.modules.customers.customer_ai_context import (
    customer_ai_trace_dependency,
    get_customer_ai_request_id,
)
from app.modules.master_data_ai.request_context import (
    get_master_data_ai_request_id,
    master_data_ai_trace_dependency,
)


def test_gateway_reexports_same_callables() -> None:
    assert cgw.sanitize_untrusted_text is mda.sanitize_untrusted_text
    assert cgw.sanitize_nl_user_query is mda.sanitize_nl_user_query
    assert cgw.invoke_structured_llm is mda.invoke_structured_llm


def test_context_aliases_master_data_ai() -> None:
    assert get_customer_ai_request_id is get_master_data_ai_request_id
    assert customer_ai_trace_dependency is master_data_ai_trace_dependency
