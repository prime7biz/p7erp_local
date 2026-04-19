"""Outbound PII redaction for external LLM calls."""

from __future__ import annotations

from app.modules.ai_tool.llm_provider.prompt_sanitizer import redact_pii_for_external_provider


def test_redacts_email_and_phone() -> None:
    s = redact_pii_for_external_provider("Contact me at user@example.com or 555-123-4567 today.")
    assert "user@example.com" not in s
    assert "[EMAIL_REDACTED]" in s
    assert "[PHONE_REDACTED]" in s
