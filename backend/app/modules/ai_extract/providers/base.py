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

    @abstractmethod
    async def extract_vendor_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw vendor/supplier master field dict plus _unmapped_text, _warnings, _confidences."""

    @abstractmethod
    async def extract_order_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw order/PO field dict plus _unmapped_text, _warnings, _confidences."""

    @abstractmethod
    async def extract_lc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw LC / master-contract field dict plus _unmapped_text, _warnings, _confidences."""

    @abstractmethod
    async def extract_shipping_doc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Return raw shipping-doc field dict plus _unmapped_text, _warnings, _confidences."""

    async def extract_packing_list_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Optional packing-list extract; default reuses shipping-doc extract."""
        return await self.extract_shipping_doc_fields(file_bytes, content_type)

    async def extract_hr_cv_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Extract CV / resume / biodata fields."""
        raise NotImplementedError

    async def extract_hr_national_id_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Extract Bangladesh NID / smart card fields."""
        raise NotImplementedError

    async def extract_hr_medical_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Extract medical certificate fields."""
        raise NotImplementedError

    async def extract_hr_birth_certificate_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        """Extract birth certificate fields."""
        raise NotImplementedError
