from __future__ import annotations

from abc import ABC, abstractmethod


class BaseLlmProvider(ABC):
    """Phase-2 extension point for enterprise LLM integrations."""

    @abstractmethod
    async def generate(self, prompt: str) -> str:
        raise NotImplementedError
