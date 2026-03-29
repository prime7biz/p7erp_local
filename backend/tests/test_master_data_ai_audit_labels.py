"""Unit tests for shared Customer AI audit labels (master_data_ai)."""

from __future__ import annotations

from app.modules.master_data_ai.audit_labels import customer_ai_event_label


def test_customer_ai_event_label_extract_batch() -> None:
    label = customer_ai_event_label(
        "CUSTOMER_AI_SUGGESTION_BATCH",
        {"phase": "generated", "action_type": "extract"},
    )
    assert "Extract" in label


def test_customer_ai_event_label_validate_trace() -> None:
    label = customer_ai_event_label(
        "CUSTOMER_AI_SUGGESTION_BATCH",
        {"phase": "trace_result", "action_type": "validate"},
    )
    assert "Validation" in label


def test_customer_ai_event_label_unknown_action_fallback() -> None:
    label = customer_ai_event_label("CUSTOMER_AI_CUSTOM_UNKNOWN", {})
    assert label == "Customer Ai Custom Unknown"
