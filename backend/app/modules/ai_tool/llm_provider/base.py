from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.modules.ai_tool.llm_provider.json_utils import parse_llm_json_object

T = TypeVar("T", bound=BaseModel)


class BaseLlmProvider(ABC):
    """Phase-2 extension point for enterprise LLM integrations."""

    @abstractmethod
    async def generate(self, prompt: str) -> str:
        raise NotImplementedError

    async def generate_structured(
        self,
        prompt: str,
        response_model: type[T],
        *,
        schema_max_chars: int = 12000,
    ) -> tuple[T | None, str | None]:
        """Ask the model for JSON only; validate with Pydantic. Returns (model, error_message)."""
        try:
            schema = response_model.model_json_schema()
        except Exception:
            schema = {"title": response_model.__name__}
        import json as _json

        schema_str = _json.dumps(schema, default=str)[:schema_max_chars]
        full = (
            f"{prompt.strip()}\n\n"
            "Respond with ONLY a single JSON object (no markdown fences, no commentary) "
            f"that validates against this JSON Schema shape:\n{schema_str}"
        )
        raw = await self.generate(full)
        data = parse_llm_json_object(raw)
        if not data:
            return None, "Model returned no parseable JSON object."
        try:
            return response_model.model_validate(data), None
        except ValidationError as exc:
            return None, f"JSON did not match schema: {exc!s}"[:2000]
