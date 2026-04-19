"""Unit tests for OpenRouter response parsing helpers."""

from __future__ import annotations

from app.modules.ai_tool.llm_provider.openrouter_client import (
    message_text_from_chat_response,
    parse_openai_compatible_usage,
)


def test_parse_openai_compatible_usage() -> None:
    pt, ct, tt = parse_openai_compatible_usage(
        {"usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}
    )
    assert pt == 10 and ct == 20 and tt == 30


def test_message_text_from_chat_response() -> None:
    text = message_text_from_chat_response(
        {"choices": [{"message": {"role": "assistant", "content": "  hello  "}}]}
    )
    assert text == "hello"
