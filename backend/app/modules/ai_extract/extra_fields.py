"""Turn leftover document text into labelled "extra details" with a suggested form field.

Used by the customer and inquiry document imports. Everything here is pure (no database, no AI call):

1. ``collect_extra_candidates`` gathers label / value pairs from the model's ``_extra_fields``, from
   unknown top-level keys and from the loose ``_unmapped_text`` snippets ("Label: value", or a known
   header followed by its value).
2. ``promote_extras_into_raw`` moves a pair into the main field when that field is still empty and the
   label is a known synonym (confidence capped so it is reviewed, never bulk-applied).
3. ``fill_customer_country_code`` sets the phone country code from the billing / shipping country.
4. ``finalize_extras`` removes junk and duplicates, caps sizes, escapes text and builds the response rows.

A suggested field is always taken from the per-form allowlist; anything else becomes ``None``.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Any, Literal

from app.modules.ai_extract.normalizers import (
    normalize_date,
    normalize_email,
    normalize_int,
    normalize_numeric_string,
    normalize_url,
    sanitize_text,
)
from app.modules.ai_extract.schemas import ExtractedField, ExtraExtractedField

FormKind = Literal["customer", "inquiry"]

MAX_EXTRAS = 40
MAX_VALUE_LEN = 1000
MAX_LABEL_LEN = 80
MAX_LIST_ROWS = 30
PROMOTED_CONFIDENCE_CAP = 0.8

CUSTOMER_TARGETS: frozenset[str] = frozenset(
    {
        "legalEntityName",
        "tradeName",
        "taxIdVatNumber",
        "website",
        "primaryContactName",
        "designation",
        "contactEmail",
        "countryCode",
        "contactPhone",
        "billingAddressLine1",
        "billingCity",
        "billingPostalCode",
        "billingCountry",
        "shippingAddressLine1",
        "shippingCity",
        "shippingPostalCode",
        "shippingCountry",
        "preferredCurrency",
        "paymentTerms",
        "defaultIncoterm",
        "typicalLeadTimeDays",
        "industrySegment",
        "complianceLevel",
    }
)

INQUIRY_TARGETS: frozenset[str] = frozenset(
    {
        "customer_name_candidate",
        "customer_code_candidate",
        "style_name_candidate",
        "style_ref",
        "season",
        "department",
        "quantity",
        "target_price",
        "target_price_currency",
        "currency",
        "exchange_rate",
        "expected_delivery_date",
        "shipping_term",
        "intermediary_name",
        "commission_mode",
        "commission_type",
        "commission_value",
        "notes",
    }
)

# Targets that are filled only when the user chooses them (Notes is appended, never replaced).
_NEVER_PROMOTE: frozenset[str] = frozenset({"notes"})

# Labels too vague to fill a main field automatically ("Contact: +46 ...", "Ref: PO-55821",
# "Buyer: Jane"). They are still offered as the suggested field in the panel.
_NO_PROMOTE_LABELS: frozenset[str] = frozenset(
    {
        "contact", "style", "model", "reference", "ref", "ref no", "article", "price", "delivery",
        "buyer", "customer", "client", "brand", "pcs", "name", "title", "role", "mail", "web",
    }
)

# Free-text name fields: a long digit run or an "@" means the value is a phone, number or email.
_NAME_TARGETS: frozenset[str] = frozenset(
    {
        "legalEntityName", "tradeName", "primaryContactName", "designation",
        "customer_name_candidate", "style_name_candidate", "intermediary_name",
    }
)

_CUSTOMER_SYNONYMS: dict[str, tuple[str, ...]] = {
    "legalEntityName": (
        "company", "company name", "legal name", "legal entity name", "registered name", "buyer",
        "buyer name", "bill to", "sold to", "importer", "consignee", "customer", "customer name", "client",
    ),
    "tradeName": ("trade name", "trading name", "brand", "brand name", "dba"),
    "taxIdVatNumber": (
        "vat", "vat no", "vat number", "vat reg no", "vat registration number", "tin", "tin no", "bin",
        "bin no", "eori", "eori no", "eori number", "tax id", "tax no", "tax number", "gst", "gst no",
        "cvr", "org no", "organisation number", "organization number",
    ),
    "website": ("website", "web", "web site", "url", "www", "homepage"),
    "primaryContactName": ("contact", "contact person", "contact name", "attn", "attention"),
    "designation": ("designation", "title", "job title", "position", "role"),
    "contactEmail": ("email", "e mail", "mail", "email address", "e mail address"),
    "contactPhone": (
        "phone", "phone no", "phone number", "tel", "tel no", "telephone", "mobile", "mobile no", "cell",
        "whatsapp", "contact no", "contact number",
    ),
    "countryCode": ("country code", "dial code"),
    "billingAddressLine1": (
        "address", "billing address", "invoice address", "head office", "registered address",
        "office address", "bill to address",
    ),
    "billingCity": ("city", "town", "billing city"),
    "billingPostalCode": ("postal code", "post code", "postcode", "zip", "zip code", "billing postal code"),
    "billingCountry": ("country", "billing country"),
    "shippingAddressLine1": (
        "ship to", "ship to address", "shipping address", "delivery address", "warehouse",
        "warehouse address",
    ),
    "shippingCity": ("shipping city", "delivery city"),
    "shippingPostalCode": ("shipping postal code", "delivery postal code"),
    "shippingCountry": ("shipping country", "delivery country"),
    "preferredCurrency": ("currency", "preferred currency", "buyer currency", "payment currency"),
    "paymentTerms": (
        "payment terms", "payment term", "terms of payment", "lc terms", "credit terms",
    ),
    "defaultIncoterm": (
        "incoterm", "incoterms", "shipping term", "delivery term", "trade term", "fob", "cif", "cfr",
    ),
    "typicalLeadTimeDays": (
        "lead time", "lead time days", "typical lead time", "production lead time", "delivery lead time",
    ),
    "industrySegment": (
        "industry", "industry segment", "segment", "product segment", "knit", "woven", "sweater",
    ),
    "complianceLevel": (
        "compliance", "compliance level", "audit", "bsci", "wrap", "sedex", "oeko-tex", "gots",
    ),
}

_INQUIRY_SYNONYMS: dict[str, tuple[str, ...]] = {
    "style_ref": (
        "article code", "article no", "article number", "article", "style no", "style number", "style code",
        "style ref", "style reference", "style", "item no", "item number", "item code", "model", "model no",
        "reference", "ref", "ref no", "sku",
    ),
    "style_name_candidate": ("article name", "style name", "product name", "item name", "style description"),
    "customer_name_candidate": ("buyer", "buyer name", "brand", "customer", "customer name", "retailer", "client"),
    "customer_code_candidate": ("buyer code", "customer code"),
    "season": ("season", "season code"),
    "department": (
        "department", "dept", "division", "gender", "product group", "product category", "category",
        "product sub category", "sub category", "product type",
    ),
    "quantity": (
        "qty", "quantity", "order qty", "order quantity", "total qty", "total quantity", "total pcs", "pcs",
    ),
    "target_price": ("target price", "fob price", "unit price", "price", "target fob"),
    "currency": ("currency",),
    "expected_delivery_date": (
        "delivery date", "ex factory", "ex factory date", "x factory", "x factory date", "ship date",
        "shipment date", "etd", "delivery",
    ),
    "shipping_term": ("incoterm", "incoterms", "shipping term", "shipping terms", "delivery terms", "trade term"),
    "intermediary_name": ("agent", "buying agent", "buying house", "intermediary"),
    "commission_value": ("commission",),
    "notes": (
        "material", "materials", "fabric", "fabrication", "composition", "colours", "colors", "colour",
        "color", "colourway", "colourways", "colorway", "colorways", "sizes", "size", "size range",
        "size ratio", "size breakdown", "certification", "certifications", "country of origin", "origin",
        "gsm", "weight", "wash", "trims", "accessories", "packing", "packaging", "care", "care label",
        "care instructions", "life cycle stage", "lifecycle stage", "description", "article summary",
        "summary", "remarks", "comments", "comment", "note", "notes", "special instructions",
        "quality", "construction", "print", "embroidery", "label", "labels",
    ),
}

# Document housekeeping: shown, but preselected as "Don't use".
_IGNORE_LABELS: frozenset[str] = frozenset(
    {
        "created on", "created", "created by", "created date", "last modified", "modified", "modified by",
        "last modified by", "modified on", "printed on", "print date", "date printed", "page", "page no",
        "version", "revision", "rev", "status", "doc no", "document no",
    }
)

# Labels whose value is usually a list over several lines (colours, sizes, ...).
_LIST_LABELS: frozenset[str] = frozenset(
    {
        "colours", "colors", "colour", "color", "colourways", "colorways", "colourway", "colorway",
        "sizes", "size", "size range", "size ratio", "size breakdown", "certifications", "certification",
        "materials", "material", "composition", "trims", "accessories",
    }
)

_COUNTRY_DIAL_CODES: dict[str, str] = {
    "bangladesh": "+880",
    "united states": "+1", "united states of america": "+1", "usa": "+1", "us": "+1",
    "canada": "+1",
    "united kingdom": "+44", "uk": "+44", "great britain": "+44", "england": "+44", "scotland": "+44",
    "germany": "+49", "deutschland": "+49",
    "spain": "+34", "espana": "+34",
    "france": "+33",
    "italy": "+39", "italia": "+39",
    "netherlands": "+31", "the netherlands": "+31", "holland": "+31",
    "belgium": "+32",
    "sweden": "+46",
    "denmark": "+45",
    "norway": "+47",
    "finland": "+358",
    "poland": "+48",
    "ireland": "+353",
    "portugal": "+351",
    "switzerland": "+41",
    "austria": "+43",
    "japan": "+81",
    "south korea": "+82", "korea": "+82",
    "australia": "+61",
    "new zealand": "+64",
    "china": "+86",
    "hong kong": "+852",
    "india": "+91",
    "pakistan": "+92",
    "sri lanka": "+94",
    "turkey": "+90", "turkiye": "+90",
    "united arab emirates": "+971", "uae": "+971",
    "saudi arabia": "+966",
    "singapore": "+65",
    "vietnam": "+84", "viet nam": "+84",
    "brazil": "+55",
    "mexico": "+52",
    "south africa": "+27",
}


@dataclass
class ExtraCandidate:
    label: str
    value: str
    ai_suggestion: str | None = None
    confidence: float = 0.5


def normalize_label(label: str) -> str:
    """Lower-case, '&' -> 'and', punctuation -> space, drop a trailing number ("Certification 2")."""
    s = (label or "").lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"(?:\s+\d+)+$", "", s).strip()
    return re.sub(r"\s+", " ", s)


def _targets(form: FormKind) -> frozenset[str]:
    return CUSTOMER_TARGETS if form == "customer" else INQUIRY_TARGETS


def _synonym_index(form: FormKind) -> dict[str, str]:
    table = _CUSTOMER_SYNONYMS if form == "customer" else _INQUIRY_SYNONYMS
    out: dict[str, str] = {}
    for target, phrases in table.items():
        for p in phrases:
            out.setdefault(normalize_label(p), target)
    return out


_SYNONYM_INDEX: dict[str, dict[str, str]] = {
    "customer": _synonym_index("customer"),
    "inquiry": _synonym_index("inquiry"),
}


def synonym_target(label: str, form: FormKind) -> str | None:
    """Form field for a document label, or None when unknown or housekeeping."""
    n = normalize_label(label)
    if not n or n in _IGNORE_LABELS:
        return None
    return _SYNONYM_INDEX[form].get(n)


def is_known_label(text: str, form: FormKind) -> bool:
    n = normalize_label(text)
    if not n:
        return False
    return n in _SYNONYM_INDEX[form] or n in _IGNORE_LABELS or n in _LIST_LABELS


def resolve_suggested_field(label: str, ai_suggestion: str | None, form: FormKind) -> str | None:
    """Synonym table first, then the AI's suggestion; only allowlisted keys survive."""
    n = normalize_label(label)
    if n in _IGNORE_LABELS:
        return None
    allowed = _targets(form)
    hit = _SYNONYM_INDEX[form].get(n)
    if hit and hit in allowed:
        return hit
    s = (ai_suggestion or "").strip()
    return s if s in allowed else None


def _value_to_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        parts = [_value_to_text(v) for v in value]
        joined = "\n".join(p for p in parts if p)
        return joined or None
    if isinstance(value, dict):
        rows = []
        for k, v in value.items():
            t = _value_to_text(v)
            if t:
                rows.append(f"{k}: {t}")
        return "\n".join(rows) or None
    s = str(value).replace("\x00", "").strip()
    return s or None


def _compact_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _humanize_key(key: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", key).replace("_", " ").strip()
    return s[:1].upper() + s[1:] if s else key


_LABEL_VALUE_RE = re.compile(r"^\s*([^:\n]{1,60}?)\s*[:\uff1a]\s*(.+?)\s*$", re.S)


def _split_label_value(snippet: str) -> tuple[str, str] | None:
    m = _LABEL_VALUE_RE.match(snippet)
    if not m:
        return None
    label, value = m.group(1).strip(), m.group(2).strip()
    if not re.search(r"[A-Za-z]", label) or value.startswith("//"):
        return None
    return label, value


def _pair_snippets(snippets: list[str], form: FormKind) -> tuple[list[ExtraCandidate], list[str]]:
    """Turn loose snippets into label / value pairs; return (pairs, still-loose snippets)."""
    pairs: list[ExtraCandidate] = []
    loose: list[str] = []
    i = 0
    n = len(snippets)
    while i < n:
        s = snippets[i]
        split = _split_label_value(s)
        if split:
            pairs.append(ExtraCandidate(label=split[0], value=split[1], confidence=0.55))
            i += 1
            continue
        if is_known_label(s, form):
            take_many = normalize_label(s) in _LIST_LABELS
            values: list[str] = []
            j = i + 1
            while j < n and not is_known_label(snippets[j], form) and not _split_label_value(snippets[j]):
                values.append(snippets[j])
                j += 1
                if not take_many or len(values) >= MAX_LIST_ROWS:
                    break
            if values:
                pairs.append(ExtraCandidate(label=s.strip(), value="\n".join(values), confidence=0.5))
            # A header with no value is noise and is dropped.
            i = j if values else i + 1
            continue
        loose.append(s)
        i += 1
    return pairs, loose


def collect_extra_candidates(raw: dict[str, Any], form: FormKind) -> tuple[list[ExtraCandidate], list[str]]:
    """Gather labelled extras from the model output. Unknown top-level keys are moved out of ``raw``."""
    targets = _targets(form)
    out: list[ExtraCandidate] = []

    for item in raw.get("_extra_fields") or []:
        if not isinstance(item, dict):
            continue
        label = _value_to_text(item.get("label"))
        value = _value_to_text(item.get("value"))
        if not label or not value:
            continue
        sug = item.get("suggested_field")
        try:
            conf = float(item.get("confidence", 0.6))
        except (TypeError, ValueError):
            conf = 0.6
        out.append(
            ExtraCandidate(
                label=label,
                value=value,
                ai_suggestion=str(sug) if isinstance(sug, str) else None,
                confidence=max(0.0, min(1.0, conf)),
            )
        )

    by_compact = {_compact_key(t): t for t in targets}
    confidences = raw.get("_confidences") if isinstance(raw.get("_confidences"), dict) else {}
    for key in [k for k in list(raw.keys()) if not k.startswith("_") and k not in targets]:
        original = raw.pop(key)
        same = by_compact.get(_compact_key(key))
        if same and _is_empty(raw.get(same)) and not _is_empty(original):
            # "contact_email" / "expectedDeliveryDate" are the same field spelled differently.
            raw[same] = original
            if key in confidences and same not in confidences:
                confidences[same] = confidences[key]
            continue
        value = _value_to_text(original)
        if value:
            out.append(ExtraCandidate(label=_humanize_key(key), value=value, confidence=0.55))

    snippets: list[str] = []
    for s in raw.get("_unmapped_text") or []:
        t = _value_to_text(s)
        if t:
            snippets.append(t)
    pairs, loose = _pair_snippets(snippets, form)
    out.extend(pairs)
    return out, loose


def _is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


_COMMA_DECIMAL_RE = re.compile(r"^\d+,\d{1,2}$")
_DOT_THOUSANDS_RE = re.compile(r"^\d{1,3}(?:\.\d{3})+$")


def is_ambiguous_number(value: str) -> bool:
    """True for "4,50" (comma decimal) or "1.200" (dot thousands): the meaning depends on the country."""
    m = re.search(r"\d[\d.,]*", value or "")
    if not m:
        return False
    token = m.group(0).rstrip(".,")
    return bool(_COMMA_DECIMAL_RE.match(token) or _DOT_THOUSANDS_RE.match(token))


def _fits_target(target: str, value: str) -> bool:
    if target in ("quantity", "target_price", "exchange_rate", "commission_value") and is_ambiguous_number(value):
        return False
    if target == "quantity":
        return normalize_int(value) is not None
    if target in ("target_price", "exchange_rate", "commission_value"):
        return normalize_numeric_string(value) is not None
    if target == "expected_delivery_date":
        return normalize_date(value) is not None
    if target == "contactEmail":
        return normalize_email(value)[1]
    if target == "website":
        return normalize_url(value) is not None
    if target == "contactPhone":
        return len(re.sub(r"\D", "", value)) >= 7
    if target == "countryCode":
        return bool(re.fullmatch(r"\+?\d{1,4}", value.strip()))
    if target in ("currency", "target_price_currency"):
        return bool(re.fullmatch(r"[A-Za-z]{3}", value.strip()))
    if target in _NAME_TARGETS and ("@" in value or re.search(r"\d{6,}", re.sub(r"[\s().-]", "", value))):
        return False
    return "\n" not in value.strip() and len(value) <= 255


def promote_extras_into_raw(
    raw: dict[str, Any], extras: list[ExtraCandidate], form: FormKind
) -> list[ExtraCandidate]:
    """Fill empty main fields from extras whose label is a known synonym; return the rest."""
    confidences = raw.get("_confidences")
    if not isinstance(confidences, dict):
        confidences = {}
        raw["_confidences"] = confidences
    remaining: list[ExtraCandidate] = []
    for ex in extras:
        target = synonym_target(ex.label, form)
        if (
            target
            and normalize_label(ex.label) not in _NO_PROMOTE_LABELS
            and target in _targets(form)
            and target not in _NEVER_PROMOTE
            and _is_empty(raw.get(target))
            and _fits_target(target, ex.value)
        ):
            raw[target] = ex.value
            confidences[target] = min(max(ex.confidence, 0.6), PROMOTED_CONFIDENCE_CAP)
            continue
        remaining.append(ex)
    return remaining


def fill_customer_country_code(raw: dict[str, Any]) -> None:
    """Set ``countryCode`` from the billing / shipping country when the phone carries no prefix."""
    if not _is_empty(raw.get("countryCode")):
        return
    phone = str(raw.get("contactPhone") or "").strip()
    if phone.startswith("+") or phone.startswith("00"):
        return
    for key in ("billingCountry", "shippingCountry"):
        country = normalize_label(str(raw.get(key) or ""))
        code = _COUNTRY_DIAL_CODES.get(country)
        if code:
            raw["countryCode"] = code
            confidences = raw.get("_confidences")
            if not isinstance(confidences, dict):
                confidences = {}
                raw["_confidences"] = confidences
            confidences["countryCode"] = 0.6
            return


def _is_junk(value: str) -> bool:
    v = value.strip()
    return len(v) < 2 or not re.search(r"[A-Za-z0-9]", v)


def _cmp(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip().lower()


def finalize_extras(
    extras: list[ExtraCandidate],
    loose: list[str],
    fields: dict[str, ExtractedField],
    form: FormKind,
) -> tuple[list[ExtraExtractedField], list[str]]:
    """Build the response rows and the legacy ``unmapped_text`` list (both HTML-escaped)."""
    used_values = {_cmp(str(f.value)) for f in fields.values() if f.value is not None and str(f.value).strip()}
    seen: set[tuple[str, str]] = set()
    rows: list[ExtraExtractedField] = []

    for ex in extras:
        label = sanitize_text(ex.label, MAX_LABEL_LEN)
        value = sanitize_text(ex.value, MAX_VALUE_LEN)
        if not label or not value or _is_junk(value):
            continue
        if _cmp(value) in used_values:
            continue
        key = (normalize_label(label), _cmp(value))
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            ExtraExtractedField(
                label=html.escape(label, quote=False),
                value=html.escape(value, quote=False),
                suggested_field=resolve_suggested_field(label, ex.ai_suggestion, form),
                confidence=max(0.0, min(1.0, ex.confidence)),
            )
        )
        if len(rows) >= MAX_EXTRAS:
            break

    leftover = [
        s for s in (sanitize_text(x, MAX_VALUE_LEN) for x in loose) if s and not _is_junk(s) and _cmp(s) not in used_values
    ]
    if leftover and len(rows) < MAX_EXTRAS:
        rows.append(
            ExtraExtractedField(
                label="Other text from the document",
                value=html.escape(sanitize_text("\n".join(leftover), MAX_VALUE_LEN) or "", quote=False),
                suggested_field=None,
                confidence=0.3,
            )
        )

    legacy = [f"{r.label}: {r.value}" for r in rows if r.label != "Other text from the document"]
    legacy.extend(html.escape(s, quote=False) for s in leftover)
    return rows, legacy
