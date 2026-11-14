"""Gemini multimodal extraction for customer / inquiry forms."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from typing import Any

import httpx

from app.common.gemini_client import generate_multimodal_sync
from app.config import get_settings
from app.modules.ai_extract.providers.base import BaseExtractionProvider

logger = logging.getLogger(__name__)


_URL_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+.-]*://\S+")


def _log_provider_failure(provider: str, exc: Exception) -> None:
    """Why a provider gave no answer. Never logs the document, the prompt, URLs (they may carry credentials) or keys."""
    if isinstance(exc, httpx.HTTPStatusError):
        detail = f"status={exc.response.status_code}"
    else:
        detail = " ".join(_URL_RE.sub("<url>", str(exc)).split())[:200]
    logger.warning("ai_extract_provider_failed provider=%s error=%s detail=%s", provider, type(exc).__name__, detail)


def _hr_unavailable(document: str) -> dict[str, Any]:
    return {
        "_confidences": {},
        "_unmapped_text": [],
        "_warnings": [
            f"The AI service could not read this {document}, so nothing was filled. "
            "Try again in a minute, or type the details yourself."
        ],
    }


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


_CUSTOMER_PROMPT = """You extract data for a garment ERP (P7) customer (buyer) registration form from the attached image or PDF.
The document may be a business card, letterhead, company profile, registration form, email signature,
buyer PO header, invoice or tech pack header. The customer is the BUYER / brand / importer, never the
garment factory, supplier or agent that issued the document to the buyer.

Return ONLY a single JSON object (no markdown fences) with these string keys where applicable (use null if unknown):
legalEntityName, tradeName, taxIdVatNumber, website, primaryContactName, designation,
contactEmail, countryCode (e.g. "+880"), contactPhone (local number digits only),
billingAddressLine1, billingCity, billingPostalCode, billingCountry,
shippingAddressLine1, shippingCity, shippingPostalCode, shippingCountry,
_confidences: object mapping each filled field name to a number 0.0-1.0,
_extra_fields: array of {"label": "...", "value": "...", "suggested_field": "<one key above or null>"}
  for every other useful labelled detail (e.g. registration number, DUNS, fax, second contact, bank, notes),
_unmapped_text: array of text you could not label at all (keep it short; prefer _extra_fields),
_warnings: array of short notes about real problems only (e.g. illegible areas, cut-off pages).

How to read common labels:
- "Company", "Buyer", "Bill to", "Sold to", "Importer", "Consignee", "Customer" -> legalEntityName
  (the full name with Ltd / GmbH / Inc / AB / S.L.); a shorter brand or trading name -> tradeName.
- "VAT", "VAT No", "TIN", "BIN", "EORI", "Tax ID", "GST", "CVR", "Org. no" -> taxIdVatNumber.
- "Tel", "Phone", "Mobile", "Cell", "WhatsApp" -> contactPhone; put the international prefix in countryCode.
- "Contact", "Attn", "Attention" -> primaryContactName; job titles ("Merchandiser", "Buyer", "Manager") -> designation.
- "Ship to", "Delivery address", "Warehouse" -> shipping* fields; "Address", "Head office", "Invoice address" -> billing* fields.
- Split an address into line 1, city, postal code and country. Use the full English country name.
- If only the country is known and the phone has no prefix, set countryCode from the country (e.g. Bangladesh +880, Sweden +46).

Rules: keep each label together with its value (never return a label alone or a value alone).
Do not invent data; leave fields null if not visible."""

_VENDOR_PROMPT = """You extract supplier/vendor master data for a garment ERP (P7) from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these string keys where applicable (use null if unknown):
vendorDisplayName (trading / display name), legalName, tradeName, contactPerson, designation,
email, phone, mobile, website,
address (free-text block if needed), addressLine1, city, stateOrRegion, postalCode, country,
taxId, registrationNumber, vendorType (local or foreign), defaultCurrency (3-letter), paymentTermsDays (integer),
paymentTerms (text), incoterms, shippingTerms, leadTimeNotes,
bankName, bankAccountTitle, bankAccountNo, swiftCode, iban,
complianceStatus, complianceReferenceNumbers, certificationsSummary, onboardingStatus, remarks,
_confidences: object mapping each filled field name to a number 0.0-1.0,
_unmapped_text: array of short snippets you could not map,
_warnings: array of short notes.
Do not invent data; leave fields null if not visible. Never output vendor_code or internal identifiers."""

_INQUIRY_PROMPT = """You extract data for a garment ERP (P7) sales inquiry from the attached image or PDF.
The document may be a buyer inquiry email, request for quotation, tech pack, article / product sheet,
buyer PO, costing sheet or line sheet.

Return ONLY a single JSON object (no markdown fences) with:
customer_name_candidate, customer_code_candidate, style_name_candidate, style_ref, season, department,
quantity (number), target_price (string), target_price_currency, currency, exchange_rate (string),
expected_delivery_date (YYYY-MM-DD), shipping_term, intermediary_name,
commission_mode (INCLUDE or EXCLUDE), commission_type (PERCENTAGE or FIXED), commission_value (string), notes,
_confidences: object field->0.0-1.0,
_items: array of {item_name, description, quantity, confidence} for each product / garment line,
_extra_fields: array of {"label": "...", "value": "...", "suggested_field": "<one key above, or notes, or null>"}
  for every other useful labelled detail (e.g. material / fabric, composition, GSM, colours, sizes,
  size ratio, certifications, country of origin, brand, product group, lifecycle stage, version, wash, trims),
_unmapped_text: array of text you could not label at all (keep it short; prefer _extra_fields),
_warnings: array of short notes about real problems only (e.g. illegible areas, cut-off pages).

How to read common labels:
- "Article Code", "Article No", "Style No", "Style #", "Item No", "Model", "Reference" -> style_ref.
- "Article Name", "Style Name", "Product Name", "Item Description" -> style_name_candidate.
- "Buyer", "Brand", "Customer", "Retailer" -> customer_name_candidate; a buyer / vendor code -> customer_code_candidate.
- "Season" (SS26, AW25, Spring 2026, ...) -> season.
- "Department", "Gender", "Division", "Product Group", "Category" -> department (prefer Department, then Gender + Product Group).
- "Qty", "Order Qty", "Total Pcs", "Quantity" -> quantity (whole number only).
- "Target Price", "FOB Price", "Unit Price" -> target_price, with its currency in target_price_currency.
- "Ex-factory", "Ship Date", "Delivery", "ETD", "In-store date minus transit" -> expected_delivery_date.
- "Incoterm", "FOB", "CIF", "CFR", "DDP", "EXW" -> shipping_term.
- "Agent", "Buying House", "Intermediary" -> intermediary_name.
- Material, composition, colours, sizes, certifications, packing and quality notes -> _extra_fields with suggested_field "notes".

Rules: keep each label together with its value (never return a label alone or a value alone).
Keep a table or list (for example all colours with their Pantone / CMYK, or all sizes) together as ONE
_extra_fields entry whose value has one line per row.
Do not invent data; use null where unknown."""

_ORDER_PROMPT = """You extract sales order / buyer purchase order data for a garment ERP (P7) from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these keys where applicable (null if unknown):
style_ref, quantity (integer), order_date (YYYY-MM-DD), delivery_date or ex_factory_date (YYYY-MM-DD),
shipping_term / incoterm (short code like FOB, CIF),
commission_mode (INCLUDE or EXCLUDE), commission_type (PERCENTAGE or FIXED), commission_value (string number),
remarks (buyer comments, amendments, free text),
buyer_po_number, po_date (YYYY-MM-DD),
_confidences: object mapping each filled field name to 0.0-1.0,
_unmapped_text: array of short snippets you could not map,
_warnings: array of short notes.
Do not invent internal order numbers or system IDs. Never output tenant_id, order_code, or database IDs."""

_LC_PROMPT = """You extract Letter of Credit / master export LC / sales contract data for a garment ERP (P7) from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these keys where applicable (null if unknown):
reference (LC / contract reference), lc_number, issuing_bank, contract_type (EXPORT_LC or SALES_CONTRACT),
amount (string number), currency (3-letter), buyer_name, bank_name (issuing bank),
issue_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD), shipment_date (YYYY-MM-DD),
applicant, beneficiary, port_of_loading, port_of_discharge,
partial_shipment_allowed (YES/NO), transshipment_allowed (YES/NO),
documents_required (string or list joined by comma), special_instructions, incoterms, notes,
_confidences: object mapping each filled field name to 0.0-1.0,
_unmapped_text: array of short snippets you could not map,
_warnings: array of short notes.
Do not invent internal IDs. Leave unknown fields null."""

_SHIPPING_DOC_PROMPT = """You extract shipping document data (BL, AWB, booking note) for a garment ERP (P7) from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these keys where applicable (null if unknown):
reference, carrier, shipping_line, booking_ref, bl_awb, bl_number, awb_number, vessel_name,
airline, flight_number, etd (YYYY-MM-DD), eta (YYYY-MM-DD),
origin_port, dest_port, port_of_loading, port_of_discharge, destination, container_number,
freight_terms (PREPAID or COLLECT), notify_party, consignee, shipper, weight_kg, charges, notes,
_confidences: object mapping each filled field name to 0.0-1.0,
_unmapped_text: array of short snippets you could not map,
_warnings: array of short notes.
Do not invent internal shipment IDs. Leave unknown fields null."""

_PACKING_LIST_PROMPT = """You extract packing list data for a garment ERP (P7) from the attached image or PDF.
Return ONLY a single JSON object (no markdown fences) with these keys where applicable (null if unknown):
reference, carton_numbers, total_cartons, quantities_per_carton, total_quantity,
style_breakdown, net_weight_kg, gross_weight_kg, dimensions_cm, notes,
_confidences: object mapping each filled field name to 0.0-1.0,
_unmapped_text: array of short snippets you could not map,
_warnings: array of short notes.
Do not invent internal order IDs. Leave unknown fields null."""

_HR_CV_PROMPT = """Extract structured employee information from this CV/resume/biodata for a garment ERP (P7).
Return ONLY JSON with keys: full_name, first_name, last_name, date_of_birth (YYYY-MM-DD), gender (MALE|FEMALE|OTHER),
national_id, passport_number, phone, email, address_line, city, country,
education (array of {degree, institution, year, grade}),
work_experience (array of {company, position, from_date, to_date, responsibilities}),
skills (array), languages (array),
_confidences, _unmapped_text, _warnings. Use null if unknown."""

_HR_NID_PROMPT = """Extract Bangladesh National ID / Smart Card data for a garment ERP (P7).
Return ONLY JSON: name, name_bangla, father_name, mother_name, date_of_birth (YYYY-MM-DD),
national_id, address, blood_group, issue_date (YYYY-MM-DD),
_confidences, _unmapped_text, _warnings. Use null if unknown."""

_HR_MEDICAL_PROMPT = """Extract medical fitness certificate data for a garment ERP (P7).
Return ONLY JSON: employee_name, examination_date (YYYY-MM-DD), expiry_date (YYYY-MM-DD),
fitness_status (FIT|FIT_WITH_RESTRICTIONS|UNFIT|PENDING), conditions (array), restrictions (array),
doctor_name, doctor_registration, hospital_clinic, height_cm, weight_kg, blood_pressure, vision, hearing,
_confidences, _unmapped_text, _warnings. Use null if unknown."""

_HR_BIRTH_PROMPT = """Extract birth certificate data for a garment ERP (P7).
Return ONLY JSON: name, date_of_birth (YYYY-MM-DD), father_name, mother_name,
birth_registration_number, place_of_birth, issue_date (YYYY-MM-DD),
_confidences, _unmapped_text, _warnings. Use null if unknown."""


def _soft_stub_lc_raw() -> dict[str, Any]:
    """Schema-compatible soft stub when multimodal AI is unavailable (Phase 4 MVP)."""
    return {
        "reference": None,
        "lc_number": None,
        "contract_type": "EXPORT_LC",
        "amount": None,
        "currency": "USD",
        "buyer_name": None,
        "bank_name": None,
        "issue_date": None,
        "expiry_date": None,
        "applicant": None,
        "beneficiary": None,
        "incoterms": None,
        "notes": None,
        "_confidences": {"currency": 0.4, "contract_type": 0.4},
        "_unmapped_text": [],
        "_warnings": [
            "AI multimodal extraction unavailable. Soft stub returned — enter LC fields manually or retry when Gemini/OpenRouter is configured.",
        ],
    }


def _soft_stub_shipping_raw() -> dict[str, Any]:
    return {
        "reference": None,
        "carrier": None,
        "booking_ref": None,
        "bl_awb": None,
        "etd": None,
        "eta": None,
        "origin_port": None,
        "dest_port": None,
        "container_number": None,
        "notes": None,
        "_confidences": {},
        "_unmapped_text": [],
        "_warnings": [
            "AI multimodal extraction unavailable. Soft stub returned — enter shipping fields manually or retry when Gemini/OpenRouter is configured.",
        ],
    }


def _openrouter_message_text(data: dict[str, Any]) -> str | None:
    try:
        choices = data.get("choices") or []
        if not choices:
            return None
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if content is None:
            return None
        if isinstance(content, str):
            out = content.strip()
            return out or None
        if isinstance(content, list):
            parts: list[str] = []
            for row in content:
                if isinstance(row, dict) and row.get("type") == "text":
                    txt = str(row.get("text") or "").strip()
                    if txt:
                        parts.append(txt)
            out = "\n".join(parts).strip()
            return out or None
        return str(content).strip() or None
    except Exception:
        return None


def _ollama_multimodal_sync(prompt: str, file_bytes: bytes, mime_type: str) -> str | None:
    s = get_settings()
    if not s.ollama_enabled:
        return None
    base_url = (s.ollama_url or "").strip().rstrip("/")
    model = (s.ollama_model or "").strip()
    if not base_url or not model:
        return None
    ct = (mime_type or "").lower().split(";")[0].strip()
    if not ct.startswith("image/"):
        return None
    try:
        payload = {
            "model": model,
            "stream": False,
            "prompt": prompt,
            "images": [base64.b64encode(file_bytes).decode("ascii")],
        }
        timeout = float(max(20, s.ai_timeout_heavy_seconds + 15))
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(f"{base_url}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
        txt = str(data.get("response") or "").strip()
        return txt or None
    except Exception as exc:
        _log_provider_failure("ollama", exc)
        return None


def _openrouter_file_content_part(file_bytes: bytes, mime_type: str) -> dict[str, Any] | None:
    """Build OpenRouter multimodal content part for images or PDFs."""
    ct = (mime_type or "").lower().split(";")[0].strip()
    if ct.startswith("image/"):
        data_url = f"data:{ct};base64,{base64.b64encode(file_bytes).decode('ascii')}"
        return {"type": "image_url", "image_url": {"url": data_url}}
    if ct == "application/pdf":
        data_url = f"data:application/pdf;base64,{base64.b64encode(file_bytes).decode('ascii')}"
        return {
            "type": "file",
            "file": {
                "filename": "document.pdf",
                "file_data": data_url,
            },
        }
    return None


def _openrouter_multimodal_sync(prompt: str, file_bytes: bytes, mime_type: str) -> str | None:
    s = get_settings()
    if not s.openrouter_enabled:
        return None
    api_key = (s.openrouter_api_key or "").strip()
    model = (s.openrouter_model or "").strip()
    if not api_key or not model:
        return None
    file_part = _openrouter_file_content_part(file_bytes, mime_type)
    if file_part is None:
        return None
    base = (s.openrouter_base_url or "https://openrouter.ai/api/v1").strip().rstrip("/")
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    site = (s.openrouter_site_url or s.frontend_url or "").strip()
    if site:
        headers["HTTP-Referer"] = site
    title = (s.openrouter_app_name or "P7 ERP").strip()
    if title:
        headers["X-Title"] = title
    body: dict[str, Any] = {
        "model": model,
        "temperature": 0.0,
        "max_tokens": 2500,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    file_part,
                ],
            }
        ],
    }
    try:
        timeout = float(max(20, s.ai_timeout_heavy_seconds + 20))
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(f"{base}/chat/completions", json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        return _openrouter_message_text(data)
    except Exception as exc:
        _log_provider_failure("openrouter", exc)
        return None


def _tiered_multimodal_sync(prompt: str, file_bytes: bytes, mime_type: str) -> str | None:
    s = get_settings()
    ct = (mime_type or "").lower().split(";")[0].strip()
    is_pdf = ct == "application/pdf"
    prefer_openrouter = bool(s.openrouter_tier1_preferred)

    # Ollama vision does not accept PDF; OpenRouter + direct Gemini do.
    if is_pdf:
        txt = _openrouter_multimodal_sync(prompt, file_bytes, mime_type)
        if txt:
            return txt
        return generate_multimodal_sync(prompt, file_bytes, mime_type)

    if prefer_openrouter:
        txt = _openrouter_multimodal_sync(prompt, file_bytes, mime_type)
        if txt:
            return txt
        txt = _ollama_multimodal_sync(prompt, file_bytes, mime_type)
        if txt:
            return txt
    else:
        txt = _ollama_multimodal_sync(prompt, file_bytes, mime_type)
        if txt:
            return txt
        txt = _openrouter_multimodal_sync(prompt, file_bytes, mime_type)
        if txt:
            return txt
    return generate_multimodal_sync(prompt, file_bytes, mime_type)


async def _tiered_multimodal(prompt: str, file_bytes: bytes, mime_type: str) -> str | None:
    """Blocking provider chain (httpx.Client / Gemini SDK, up to ~20s+) kept off the event loop."""
    return await asyncio.to_thread(_tiered_multimodal_sync, prompt, file_bytes, mime_type)


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
        text = await _tiered_multimodal(_CUSTOMER_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            return parsed
        return _extraction_unavailable_raw(inquiry=False)

    async def extract_inquiry_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        text = await _tiered_multimodal(_INQUIRY_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            return parsed
        return _extraction_unavailable_raw(inquiry=True)

    async def extract_vendor_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        text = await _tiered_multimodal(_VENDOR_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            return parsed
        return _extraction_unavailable_raw(inquiry=False)

    async def extract_order_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        text = await _tiered_multimodal(_ORDER_PROMPT, file_bytes, ct)
        parsed = _parse_json_object(text or "") if text else None
        if isinstance(parsed, dict) and parsed:
            # Normalize ex_factory_date → delivery_date for downstream allowlist
            if parsed.get("delivery_date") is None and parsed.get("ex_factory_date"):
                parsed["delivery_date"] = parsed.get("ex_factory_date")
            return parsed
        return _extraction_unavailable_raw(inquiry=False)

    async def extract_lc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_LC_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception:
            pass
        return _soft_stub_lc_raw()

    async def extract_shipping_doc_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_SHIPPING_DOC_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception:
            pass
        return _soft_stub_shipping_raw()

    async def extract_packing_list_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_PACKING_LIST_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception:
            pass
        return {
            "reference": None,
            "carton_numbers": None,
            "total_cartons": None,
            "quantities_per_carton": None,
            "total_quantity": None,
            "style_breakdown": None,
            "net_weight_kg": None,
            "gross_weight_kg": None,
            "dimensions_cm": None,
            "notes": None,
            "_confidences": {},
            "_unmapped_text": [],
            "_warnings": [
                "AI packing-list extraction unavailable — enter fields manually or retry when multimodal AI is configured.",
            ],
        }

    async def extract_hr_cv_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_HR_CV_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception as exc:
            _log_provider_failure("hr_cv", exc)
        return _hr_unavailable("CV")

    async def extract_hr_national_id_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_HR_NID_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception as exc:
            _log_provider_failure("hr_national_id", exc)
        return _hr_unavailable("National ID")

    async def extract_hr_medical_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_HR_MEDICAL_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception as exc:
            _log_provider_failure("hr_medical", exc)
        return _hr_unavailable("medical certificate")

    async def extract_hr_birth_certificate_fields(self, file_bytes: bytes, content_type: str) -> dict[str, Any]:
        ct = (content_type or "application/octet-stream").lower().split(";")[0].strip()
        try:
            text = await _tiered_multimodal(_HR_BIRTH_PROMPT, file_bytes, ct)
            parsed = _parse_json_object(text or "") if text else None
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception as exc:
            _log_provider_failure("hr_birth_certificate", exc)
        return _hr_unavailable("birth certificate")
