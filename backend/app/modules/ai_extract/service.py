"""Orchestrate extraction, normalization, matching, and duplicate hints."""

from __future__ import annotations

import html
import os
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Vendor
from app.modules.ai_extract.matchers import match_customers, match_styles
from app.modules.ai_extract.normalizers import (
    normalize_date,
    normalize_email,
    normalize_int,
    normalize_numeric_string,
    normalize_url,
    sanitize_text,
    split_phone_for_form,
)
from app.config import get_settings
from app.modules.ai_extract.commercial_doc_analysis import (
    analyze_lc_fields,
    analyze_packing_list_fields,
    infer_shipping_document_type,
)
from app.modules.ai_extract.hr_doc_analysis import (
    analyze_hr_birth_fields,
    analyze_hr_cv_fields,
    analyze_hr_id_fields,
    analyze_hr_medical_fields,
)
from app.modules.ai_extract.providers.base import BaseExtractionProvider
from app.modules.ai_extract.providers.gemini_provider import GeminiExtractionProvider
from app.modules.ai_extract.providers.stub_provider import StubExtractionProvider
from app.modules.ai_extract.schemas import (
    CandidateMatch,
    CustomerExtractionResponse,
    DuplicateWarning,
    ExtractedField,
    HrDocExtractionResponse,
    InquiryExtractionResponse,
    InquiryItemExtracted,
    LcExtractionResponse,
    OrderExtractionResponse,
    ShippingDocExtractionResponse,
    VendorExtractionResponse,
)

def _get_provider() -> BaseExtractionProvider:
    s = get_settings()
    # Keep deterministic stub output only for automated tests.
    # For normal environments, always use Gemini provider (it already
    # returns a clear "unavailable" warning when Gemini is not configured).
    env = (s.app_env or "").strip().lower()
    if env in {"test", "testing"} or os.environ.get("PYTEST_CURRENT_TEST"):
        return StubExtractionProvider()
    return GeminiExtractionProvider()


def _esc(s: str | None) -> str | None:
    if s is None:
        return None
    return html.escape(s, quote=False)


def _to_extracted_field(
    value: Any,
    confidence: float,
    source_text: str | None = None,
    *,
    source: str = "uploaded_document",
) -> ExtractedField:
    st = _esc(sanitize_text(source_text, 2048)) if source_text else None
    if isinstance(value, str):
        value = _esc(sanitize_text(value, 2048))
    src = (source or "uploaded_document").strip()[:64] or "uploaded_document"
    return ExtractedField(
        value=value,
        confidence=max(0.0, min(1.0, confidence)),
        source_text=st,
        source=src,
    )


async def _duplicate_warnings_for_customer(
    db: AsyncSession,
    tenant_id: int,
    fields: dict[str, ExtractedField],
) -> list[DuplicateWarning]:
    out: list[DuplicateWarning] = []
    seen_ids: set[int] = set()
    email_f = fields.get("contactEmail")
    if email_f and email_f.value:
        em = str(email_f.value).strip().lower()
        stmt = select(Customer).where(Customer.tenant_id == tenant_id).where(Customer.contact_email.ilike(em)).limit(5)
        r = await db.execute(stmt)
        for row in r.scalars().all():
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            out.append(
                DuplicateWarning(
                    field="contactEmail",
                    existing_value=row.contact_email or row.email or "",
                    existing_id=row.id,
                )
            )
    legal_f = fields.get("legalEntityName")
    if legal_f and legal_f.value:
        name = str(legal_f.value).strip()
        if len(name) >= 3:
            pattern = f"%{name}%"
            stmt = (
                select(Customer)
                .where(Customer.tenant_id == tenant_id)
                .where(or_(Customer.legal_entity_name.ilike(pattern), Customer.name.ilike(pattern)))
                .limit(5)
            )
            r = await db.execute(stmt)
            for row in r.scalars().all():
                if row.id in seen_ids:
                    continue
                seen_ids.add(row.id)
                out.append(
                    DuplicateWarning(
                        field="legalEntityName",
                        existing_value=row.legal_entity_name or row.name or "",
                        existing_id=row.id,
                    )
                )
    return out[:10]


async def _duplicate_warnings_for_vendor(
    db: AsyncSession,
    tenant_id: int,
    fields: dict[str, ExtractedField],
) -> list[DuplicateWarning]:
    out: list[DuplicateWarning] = []
    seen_ids: set[int] = set()
    email_f = fields.get("email")
    if email_f and email_f.value:
        em = str(email_f.value).strip().lower()
        stmt = select(Vendor).where(Vendor.tenant_id == tenant_id).where(func.lower(Vendor.email) == em).limit(5)
        r = await db.execute(stmt)
        for row in r.scalars().all():
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            out.append(
                DuplicateWarning(field="email", existing_value=row.email or "", existing_id=row.id)
            )
    legal_f = fields.get("legalName")
    if legal_f and legal_f.value:
        name = str(legal_f.value).strip()
        if len(name) >= 3:
            pattern = f"%{name}%"
            stmt = (
                select(Vendor)
                .where(Vendor.tenant_id == tenant_id)
                .where(or_(Vendor.legal_name.ilike(pattern), Vendor.name.ilike(pattern)))
                .limit(5)
            )
            r = await db.execute(stmt)
            for row in r.scalars().all():
                if row.id in seen_ids:
                    continue
                seen_ids.add(row.id)
                out.append(
                    DuplicateWarning(
                        field="legalName",
                        existing_value=row.legal_name or row.name or "",
                        existing_id=row.id,
                    )
                )
    return out[:10]


def _normalize_customer_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.72)
        src = str(val) if val is not None else None

        if key == "contactEmail":
            norm, ok = normalize_email(str(val) if val else None)
            c = base_conf * (1.0 if ok else 0.35)
            fields_out[key] = _to_extracted_field(norm if ok else None, c, src)
            continue
        if key == "website":
            nu = normalize_url(str(val) if val else None)
            c = base_conf * (1.0 if nu else 0.45)
            fields_out[key] = _to_extracted_field(nu, c, src)
            continue
        if key == "contactPhone":
            # may be full string — also fill countryCode if missing in raw
            cc, num = split_phone_for_form(str(val) if val else None)
            fields_out[key] = _to_extracted_field(num, base_conf * 0.95, src)
            if cc and "countryCode" not in raw:
                fields_out["countryCode"] = _to_extracted_field(cc, base_conf * 0.9, src)
            continue
        if key == "countryCode":
            s = sanitize_text(str(val) if val else None, 16)
            if s and not s.startswith("+"):
                s = "+" + s.lstrip("+")
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key in ("legalEntityName", "tradeName", "primaryContactName", "designation"):
            s = sanitize_text(str(val) if val else None, 255)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key == "taxIdVatNumber":
            s = sanitize_text(str(val) if val else None, 128)
            fields_out[key] = _to_extracted_field(s, base_conf * (0.9 if s else 0.2), src)
            continue
        if key == "countryCode":
            s = sanitize_text(str(val) if val else None, 16)
            if s and not s.startswith("+"):
                s = "+" + s.lstrip("+")
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key.startswith("billing") or key.startswith("shipping"):
            s = sanitize_text(str(val) if val else None, 255)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        # fallback
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)

    return fields_out


def _normalize_inquiry_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.7)
        src = str(val) if val is not None else None

        if key == "quantity":
            n = normalize_int(val)
            fields_out[key] = _to_extracted_field(n, base_conf * (1.0 if n is not None else 0.25), src)
            continue
        if key in ("target_price", "exchange_rate", "commission_value"):
            ns = normalize_numeric_string(val)
            fields_out[key] = _to_extracted_field(ns, base_conf * (1.0 if ns else 0.3), src)
            continue
        if key == "expected_delivery_date":
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if key in ("commission_mode", "commission_type"):
            s = sanitize_text(str(val) if val else None, 32)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key in ("shipping_term",):
            s = sanitize_text(str(val) if val else None, 64)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key in ("currency", "target_price_currency"):
            s = sanitize_text(str(val) if val else None, 10)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key == "notes":
            s = sanitize_text(str(val) if val else None, 8000)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)
    return fields_out


def _normalize_vendor_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.72)
        src = str(val) if val is not None else None

        if key == "email":
            norm, ok = normalize_email(str(val) if val else None)
            c = base_conf * (1.0 if ok else 0.35)
            fields_out[key] = _to_extracted_field(norm if ok else None, c, src)
            continue
        if key == "website":
            nu = normalize_url(str(val) if val else None)
            c = base_conf * (1.0 if nu else 0.45)
            fields_out[key] = _to_extracted_field(nu, c, src)
            continue
        if key == "paymentTermsDays":
            n = normalize_int(val)
            fields_out[key] = _to_extracted_field(n, base_conf * (1.0 if n is not None else 0.3), src)
            continue
        if key in (
            "vendorDisplayName",
            "legalName",
            "tradeName",
            "contactPerson",
            "designation",
            "phone",
            "mobile",
            "address",
            "addressLine1",
            "city",
            "stateOrRegion",
            "postalCode",
            "country",
            "taxId",
            "registrationNumber",
            "vendorType",
            "defaultCurrency",
            "paymentTerms",
            "incoterms",
            "shippingTerms",
            "leadTimeNotes",
            "bankName",
            "bankAccountTitle",
            "bankAccountNo",
            "swiftCode",
            "iban",
            "complianceStatus",
            "complianceReferenceNumbers",
            "certificationsSummary",
            "onboardingStatus",
            "remarks",
        ):
            max_len = 8000 if key in ("leadTimeNotes", "remarks", "certificationsSummary") else 512
            s = sanitize_text(str(val) if val else None, max_len)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)
    return fields_out


def _normalize_order_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    skip_meta = frozenset(
        {
            "buyer_po_number",
            "po_number",
            "po_date",
            "ex_factory_date",
        }
    )
    for key, val in raw.items():
        if key.startswith("_") or key in skip_meta:
            continue
        base_conf = confidences.get(key, 0.72)
        src = str(val) if val is not None else None

        if key == "quantity":
            n = normalize_int(val)
            fields_out[key] = _to_extracted_field(n, base_conf * (1.0 if n is not None else 0.25), src)
            continue
        if key in ("commission_value",):
            ns = normalize_numeric_string(val)
            fields_out[key] = _to_extracted_field(ns, base_conf * (1.0 if ns else 0.3), src)
            continue
        if key in ("order_date", "delivery_date"):
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if key in ("commission_mode", "commission_type"):
            s = sanitize_text(str(val) if val else None, 32)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key == "shipping_term":
            s = sanitize_text(str(val) if val else None, 64)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key == "remarks":
            s = sanitize_text(str(val) if val else None, 8000)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)

    po = raw.get("buyer_po_number") or raw.get("po_number")
    po_d = raw.get("po_date")
    extra_lines: list[str] = []
    if po:
        extra_lines.append(f"Buyer PO: {sanitize_text(str(po), 128) or ''}".strip())
    if po_d:
        nd = normalize_date(str(po_d) if po_d else None)
        if nd:
            extra_lines.append(f"PO date: {nd}")
    if extra_lines:
        base = fields_out.get("remarks")
        cur = (str(base.value).strip() if base and base.value is not None else "") or ""
        add = "\n".join(extra_lines)
        merged = f"{cur}\n{add}".strip() if cur else add
        po_conf = (
            confidences.get("buyer_po_number", 0.65)
            + confidences.get("po_date", 0.55)
            + confidences.get("po_number", 0.0)
        ) / (2.0 if not confidences.get("po_number") else 3.0)
        fields_out["remarks"] = _to_extracted_field(
            sanitize_text(merged, 8000),
            max(0.0, min(1.0, float(po_conf) if po_conf else 0.7)),
            add,
        )

    return fields_out


async def extract_customer_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> CustomerExtractionResponse:
    provider = _get_provider()
    raw = await provider.extract_customer_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_customer_map(raw)
    dups = await _duplicate_warnings_for_customer(db, tenant_id, fields)
    success = bool(fields)
    return CustomerExtractionResponse(
        success=success,
        document_type="customer_info",
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
        duplicate_warnings=dups,
    )


async def extract_vendor_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> VendorExtractionResponse:
    provider = _get_provider()
    raw = await provider.extract_vendor_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_vendor_map(raw)
    dups = await _duplicate_warnings_for_vendor(db, tenant_id, fields)
    success = bool(fields)
    return VendorExtractionResponse(
        success=success,
        document_type="vendor_info",
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
        duplicate_warnings=dups,
    )


async def extract_inquiry_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> InquiryExtractionResponse:
    provider = _get_provider()
    raw = await provider.extract_inquiry_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    items_raw = raw.get("_items") or []
    fields = _normalize_inquiry_map(raw)

    items: list[InquiryItemExtracted] = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        items.append(
            InquiryItemExtracted(
                item_name=sanitize_text(it.get("item_name"), 255) or "",
                description=sanitize_text(it.get("description"), 1000) or "",
                quantity=normalize_int(it.get("quantity")),
                confidence=float(it.get("confidence", 0.5)),
            )
        )

    cand: dict[str, list[CandidateMatch]] = {}
    cust_name = None
    cust_code = None
    if fields.get("customer_name_candidate") and fields["customer_name_candidate"].value:
        cust_name = str(fields["customer_name_candidate"].value)
    if fields.get("customer_code_candidate") and fields["customer_code_candidate"].value:
        cust_code = str(fields["customer_code_candidate"].value)
    style_name = None
    style_ref = None
    if fields.get("style_name_candidate") and fields["style_name_candidate"].value:
        style_name = str(fields["style_name_candidate"].value)
    if fields.get("style_ref") and fields["style_ref"].value:
        style_ref = str(fields["style_ref"].value)

    q_customer = cust_code or cust_name
    if q_customer:
        rows = await match_customers(db, tenant_id, q_customer)
        cand["customer"] = [CandidateMatch(id=r["id"], name=r["name"], score=r["score"]) for r in rows]

    q_style = style_ref or style_name
    if q_style:
        rows = await match_styles(db, tenant_id, q_style)
        cand["style"] = [CandidateMatch(id=r["id"], name=r["name"], score=r["score"]) for r in rows]

    success = bool(fields) or bool(items)
    return InquiryExtractionResponse(
        success=success,
        document_type="inquiry_info",
        fields=fields,
        items=items,
        candidate_matches=cand,
        unmapped_text=unmapped,
        warnings=warnings,
    )


async def extract_order_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> OrderExtractionResponse:
    del db
    del tenant_id
    provider = _get_provider()
    raw = await provider.extract_order_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_order_map(raw)
    success = bool(fields)
    return OrderExtractionResponse(
        success=success,
        document_type="order_info",
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
    )


_LC_DATE_KEYS = frozenset({"issue_date", "expiry_date", "contract_date", "shipment_date", "order_delivery_date_hint"})
_LC_AMOUNT_KEYS = frozenset({"amount", "order_value_hint"})
_SHIPPING_DATE_KEYS = frozenset({"etd", "eta"})


def _normalize_lc_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.7)
        src = str(val) if val is not None else None
        if key in _LC_DATE_KEYS:
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if key in _LC_AMOUNT_KEYS:
            ns = normalize_numeric_string(val)
            fields_out[key] = _to_extracted_field(ns, base_conf * (1.0 if ns else 0.3), src)
            continue
        if key == "currency":
            s = sanitize_text(str(val) if val else None, 10)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key == "contract_type":
            s = sanitize_text(str(val) if val else None, 32)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key in {"notes", "special_instructions", "documents_required"}:
            s = sanitize_text(str(val) if val else None, 8000)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)

    # Prefer reference from lc_number when reference empty
    ref = fields_out.get("reference")
    lc_num = fields_out.get("lc_number")
    if (not ref or not ref.value) and lc_num and lc_num.value:
        fields_out["reference"] = _to_extracted_field(
            str(lc_num.value),
            float(lc_num.confidence),
            lc_num.source_text,
        )
    if (not fields_out.get("buyer_name") or not fields_out["buyer_name"].value) and fields_out.get("applicant"):
        app = fields_out["applicant"]
        if app.value:
            fields_out["buyer_name"] = _to_extracted_field(str(app.value), float(app.confidence), app.source_text)
    if (not fields_out.get("bank_name") or not fields_out["bank_name"].value) and fields_out.get("issuing_bank"):
        bank = fields_out["issuing_bank"]
        if bank.value:
            fields_out["bank_name"] = _to_extracted_field(str(bank.value), float(bank.confidence), bank.source_text)
    if (not fields_out.get("contract_date") or not fields_out["contract_date"].value) and fields_out.get("issue_date"):
        iss = fields_out["issue_date"]
        if iss.value:
            fields_out["contract_date"] = _to_extracted_field(str(iss.value), float(iss.confidence), iss.source_text)
    return fields_out


def _normalize_shipping_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.7)
        src = str(val) if val is not None else None
        if key in _SHIPPING_DATE_KEYS:
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if key == "notes":
            s = sanitize_text(str(val) if val else None, 8000)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)

    # Alias BL / AWB / ports for form mapping
    if (not fields_out.get("bl_awb") or not fields_out["bl_awb"].value):
        for alt in ("bl_number", "awb_number"):
            alt_f = fields_out.get(alt)
            if alt_f and alt_f.value:
                fields_out["bl_awb"] = _to_extracted_field(str(alt_f.value), float(alt_f.confidence), alt_f.source_text)
                break
    if (not fields_out.get("origin_port") or not fields_out["origin_port"].value) and fields_out.get("port_of_loading"):
        pol = fields_out["port_of_loading"]
        if pol.value:
            fields_out["origin_port"] = _to_extracted_field(str(pol.value), float(pol.confidence), pol.source_text)
    if (not fields_out.get("dest_port") or not fields_out["dest_port"].value):
        for alt in ("port_of_discharge", "destination"):
            alt_f = fields_out.get(alt)
            if alt_f and alt_f.value:
                fields_out["dest_port"] = _to_extracted_field(str(alt_f.value), float(alt_f.confidence), alt_f.source_text)
                break
    if (not fields_out.get("carrier") or not fields_out["carrier"].value):
        for alt in ("shipping_line", "airline"):
            alt_f = fields_out.get(alt)
            if alt_f and alt_f.value:
                fields_out["carrier"] = _to_extracted_field(str(alt_f.value), float(alt_f.confidence), alt_f.source_text)
                break
    return fields_out


async def _match_shipment_for_shipping(
    db: AsyncSession,
    tenant_id: int,
    fields: dict[str, ExtractedField],
) -> tuple[int | None, str | None, str | None]:
    """Soft-match a tenant shipment by BL/AWB or container number (read-only)."""
    from app.models import Shipment, ShipmentContainer

    bl = None
    for key in ("bl_awb", "bl_number", "awb_number"):
        f = fields.get(key)
        if f and f.value:
            bl = str(f.value).strip()
            break
    container = None
    cf = fields.get("container_number")
    if cf and cf.value:
        container = str(cf.value).strip()

    try:
        if bl:
            row = (
                await db.execute(
                    select(Shipment).where(
                        Shipment.tenant_id == tenant_id,
                        Shipment.bl_awb == bl,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if row:
                return int(row.id), str(row.reference), f"Matched shipment by BL/AWB {bl}."
        if container:
            cont = (
                await db.execute(
                    select(ShipmentContainer).where(
                        ShipmentContainer.tenant_id == tenant_id,
                        ShipmentContainer.container_number == container,
                    ).limit(1)
                )
            ).scalar_one_or_none()
            if cont:
                ship = await db.get(Shipment, cont.shipment_id)
                if ship and ship.tenant_id == tenant_id:
                    return (
                        int(ship.id),
                        str(ship.reference),
                        f"Matched shipment by container {container}.",
                    )
    except Exception:
        from app.database import safe_async_session_rollback

        await safe_async_session_rollback(db)
    return None, None, None


async def extract_lc_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> LcExtractionResponse:
    del db
    del tenant_id
    provider = _get_provider()
    raw = await provider.extract_lc_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_lc_map(raw)
    alerts = analyze_lc_fields(fields, notes_blob=str(raw.get("notes") or ""))
    if alerts:
        warnings.extend(a["message"] for a in alerts if a.get("message"))
    success = any(f.value is not None and str(f.value).strip() for f in fields.values())
    return LcExtractionResponse(
        success=success or bool(warnings),
        document_type="lc_info",
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
        alerts=alerts,
        suggest_create_master_contract=True,
    )


async def extract_shipping_doc_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
    *,
    doc_type: str | None = None,
) -> ShippingDocExtractionResponse:
    provider = _get_provider()
    preferred = (doc_type or "").strip().lower() or None
    if preferred in {"packing_list", "packing_list_info", "pl"}:
        raw = await provider.extract_packing_list_fields(file_bytes, content_type)
    else:
        raw = await provider.extract_shipping_doc_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_shipping_map(raw)
    document_type = infer_shipping_document_type(raw, preferred)
    alerts: list[dict[str, str]] = []
    if document_type == "packing_list_info":
        alerts = analyze_packing_list_fields(fields)
    if alerts:
        warnings.extend(a["message"] for a in alerts if a.get("message"))
    matched_id, matched_ref, match_hint = await _match_shipment_for_shipping(db, tenant_id, fields)
    if match_hint:
        warnings.append(match_hint)
    success = any(f.value is not None and str(f.value).strip() for f in fields.values())
    suggested_status = None if document_type == "packing_list_info" else "IN_TRANSIT"
    return ShippingDocExtractionResponse(
        success=success or bool(warnings),
        document_type=document_type,
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
        alerts=alerts,
        suggested_status=suggested_status,
        matched_shipment_id=matched_id,
        matched_shipment_reference=matched_ref,
        match_hint=match_hint,
    )


_HR_DATE_KEYS = frozenset(
    {"date_of_birth", "examination_date", "expiry_date", "issue_date", "from_date", "to_date"}
)


def _normalize_hr_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.7)
        src = str(val) if val is not None else None
        if key in _HR_DATE_KEYS:
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if isinstance(val, (list, dict)):
            fields_out[key] = _to_extracted_field(val, base_conf, src)
            continue
        if key in {"height_cm", "weight_kg"}:
            fields_out[key] = _to_extracted_field(normalize_numeric_string(val), base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 2000)
        fields_out[key] = _to_extracted_field(s, base_conf, src)
    # Split full_name into first/last when missing
    full = fields_out.get("full_name") or fields_out.get("name")
    if full and full.value and not (fields_out.get("first_name") and fields_out["first_name"].value):
        parts = str(full.value).strip().split(None, 1)
        fields_out["first_name"] = _to_extracted_field(parts[0], full.confidence, full.source_text)
        if len(parts) > 1:
            fields_out["last_name"] = _to_extracted_field(parts[1], full.confidence * 0.9, full.source_text)
    return fields_out


async def extract_hr_cv_form(
    db: AsyncSession, tenant_id: int, file_bytes: bytes, content_type: str
) -> HrDocExtractionResponse:
    del db, tenant_id
    raw = await _get_provider().extract_hr_cv_fields(file_bytes, content_type)
    fields = _normalize_hr_map(raw)
    alerts = analyze_hr_cv_fields(fields)
    warnings = list(raw.get("_warnings") or [])
    warnings.extend(a["message"] for a in alerts if a.get("message"))
    success = any(f.value is not None and str(f.value).strip() for f in fields.values() if not isinstance(f.value, (list, dict)))
    return HrDocExtractionResponse(
        success=success or bool(warnings),
        document_type="hr_cv",
        fields=fields,
        unmapped_text=[html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])],
        warnings=warnings,
        alerts=alerts,
    )


async def extract_hr_national_id_form(
    db: AsyncSession, tenant_id: int, file_bytes: bytes, content_type: str
) -> HrDocExtractionResponse:
    del db, tenant_id
    raw = await _get_provider().extract_hr_national_id_fields(file_bytes, content_type)
    fields = _normalize_hr_map(raw)
    alerts = analyze_hr_id_fields(fields)
    warnings = list(raw.get("_warnings") or [])
    warnings.extend(a["message"] for a in alerts if a.get("message"))
    success = any(f.value is not None and str(f.value).strip() for f in fields.values())
    return HrDocExtractionResponse(
        success=success or bool(warnings),
        document_type="hr_national_id",
        fields=fields,
        unmapped_text=[html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])],
        warnings=warnings,
        alerts=alerts,
    )


async def extract_hr_medical_form(
    db: AsyncSession, tenant_id: int, file_bytes: bytes, content_type: str
) -> HrDocExtractionResponse:
    del db, tenant_id
    raw = await _get_provider().extract_hr_medical_fields(file_bytes, content_type)
    fields = _normalize_hr_map(raw)
    alerts = analyze_hr_medical_fields(fields)
    warnings = list(raw.get("_warnings") or [])
    warnings.extend(a["message"] for a in alerts if a.get("message"))
    success = any(f.value is not None and str(f.value).strip() for f in fields.values() if not isinstance(f.value, (list, dict)))
    return HrDocExtractionResponse(
        success=success or bool(warnings),
        document_type="hr_medical_certificate",
        fields=fields,
        unmapped_text=[html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])],
        warnings=warnings,
        alerts=alerts,
    )


async def extract_hr_birth_certificate_form(
    db: AsyncSession, tenant_id: int, file_bytes: bytes, content_type: str
) -> HrDocExtractionResponse:
    del db, tenant_id
    raw = await _get_provider().extract_hr_birth_certificate_fields(file_bytes, content_type)
    fields = _normalize_hr_map(raw)
    alerts = analyze_hr_birth_fields(fields)
    warnings = list(raw.get("_warnings") or [])
    warnings.extend(a["message"] for a in alerts if a.get("message"))
    success = any(f.value is not None and str(f.value).strip() for f in fields.values())
    return HrDocExtractionResponse(
        success=success or bool(warnings),
        document_type="hr_birth_certificate",
        fields=fields,
        unmapped_text=[html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])],
        warnings=warnings,
        alerts=alerts,
    )
