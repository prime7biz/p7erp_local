"""PaidLlmProvider.generate() must run under the caller's tenant (no default tenant).

Run:
docker compose exec backend pytest -q tests/test_paid_llm_tenant_required.py
"""

from __future__ import annotations

import pytest

from app.modules.ai_tool.llm_provider.paid_provider import PaidLlmProvider


class _RecordingPaidProvider(PaidLlmProvider):
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def generate_with_mcp_loop(self, **kwargs):  # type: ignore[override]
        self.calls.append(kwargs)
        return "ok"


@pytest.mark.asyncio
async def test_generate_without_tenant_raises():
    provider = _RecordingPaidProvider()
    with pytest.raises(ValueError):
        await provider.generate("hello")
    with pytest.raises(ValueError):
        await provider.generate("hello", tenant_id=None)
    with pytest.raises(ValueError):
        await provider.generate("hello", tenant_id=0)
    assert provider.calls == []


@pytest.mark.asyncio
async def test_generate_passes_caller_tenant():
    provider = _RecordingPaidProvider()
    out = await provider.generate("hello", tenant_id=42)
    assert out == "ok"
    assert provider.calls[0]["tenant_id"] == 42
    assert provider.calls[0]["conversation"] == [{"role": "user", "content": "hello"}]
