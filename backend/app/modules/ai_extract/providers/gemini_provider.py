"""Gemini multimodal extraction for customer / inquiry forms."""

from __future__ import annotations

import json
import re
from typing import Any

from app.common.gemini_client import generate_multimodal_sync
from app.modules.ai_extract.providers.base import BaseExtractionProvider


def _parse_json_object(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    t = text.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)```$", t)
    if fence:
        t = fence.group(1).strip()
    try:
        out = json.loads(t)
        return out if isinstance(out, dict) else None
    except json.JSONDecodeError:
        pass
    for m in re.finditer(r"\{[\s\S]*\}", t):
        try:
            out = json.loads(m.group(0))
            if isinstance(out, dict):
                return out
        except json.JSONDecodeError:
            continue
    return None


_CUSTOMER_PROMPT = """You extract data for a garment ERP (P7) customer registration form from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these string keys where applicable (use null if unknown):
legalEntityName, tradeName, taxIdVatNumber, website, primaryContactName, designation,
contactEmail, countryCode (e.g. "+880"), contactPhone (local number digits only),
billingAddressLine1, billingCity, billingPostalCode, billingCountry,
shippingAddressLine1, shippingCity, shippingPostalCode, shippingCountry,
_confidences: object mapping each filled field name to a number 0.0-1.0,
_unmapped_text: array of short text snippets you could not map,
_warnings: array of short notes (e.g. illegible areas).
Do not invent data; leave fields null if not visible."""

_INQUIRY_PROMPT = """You extract data for a garment ERP sales inquiry from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with:
customer_name_candidate, customer_code_candidate, style_name_candidate, style_ref, season, department,
quantity (number), target_price (string), target_price_currency, currency, exchange_rate (string),
expected_delivery_date (YYYY-MM-DD), shipping_term, intermediary_name,
commission_mode, commission_type, commission_value (string), notes,
_confidences: object field->0.0-1.0,
_items: array of {item_name, description, quantity, confidence},
_unmapped_text: array of strings,
_warnings: array of strings.
Do not invent data; use null where unknown."""


def _extraction_unavailable_raw(*, inquiry: bool) -> dict[str, Any]:
    """
    Return empty extraction when Gemini produced no text, the response was not valid JSON,
    or the model returned an empty object. Never use StubExtractionProvider here — that would
    surface demo data as if it were extracted from the user's document.
    """
    msg = (
        "We could not extract data from this document. The AI service may be unavailable, "
        "the monthly budget may be exhausted, or the response could not be read. "
        "Confirm Gemini is enabled and your API key is set, then try again, or enter details manually."
    )
    out: dict[str, Any] = {
        "_warnings": [msg],
        "_confidences": {},
        "_unmapped_text": [],
    }
    if inquiry:
        out["_items"] = []
    return out


class GeminiExtractionProvider(BaseExtractionProvider):
    async def extract_customer_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        text = generate_multimodal_sync(_CUSTOMER_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            return parsed
        return _extraction_unavailable_raw(inquiry=False)

    async def extract_inquiry_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        text = generate_multimodal_sync(_INQUIRY_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            return parsed
        return _extraction_unavailable_raw(inquiry=True)
