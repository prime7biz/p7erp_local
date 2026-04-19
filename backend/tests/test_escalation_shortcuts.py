import pytest

from app.modules.ai_tool.escalation_shortcuts import (
    is_system_settings_escalation_tool,
    maybe_lightweight_paid_escalation,
    summarize_critical_application_settings,
)


def test_system_setup_tool_aliases():
    assert is_system_settings_escalation_tool("system_setup")
    assert is_system_settings_escalation_tool("system-setup")
    assert not is_system_settings_escalation_tool("create_sales_inquiry")


def test_summarize_settings_contains_quota_key():
    text = summarize_critical_application_settings()
    assert "AI_MAX_REQUESTS_PER_TENANT_PER_DAY" in text
    assert "OPENROUTER_MODEL" in text


@pytest.mark.asyncio
async def test_maybe_lightweight_system_setup():
    out = await maybe_lightweight_paid_escalation("system_setup")
    assert out is not None
    assert "APP_ENV" in out
