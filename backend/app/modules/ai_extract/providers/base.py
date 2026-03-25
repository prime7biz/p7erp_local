from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseExtractionProvider(ABC):
    """Pluggable OCR/LLM extraction. Implementations must not persist uploads."""

    @abstractmethod
    async def extract_customer_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw field dict (string keys, values) plus optional meta keys starting with _."""

    @abstractmethod
    async def extract_inquiry_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw inquiry field dict and optional _items, _unmapped_text, _warnings."""
