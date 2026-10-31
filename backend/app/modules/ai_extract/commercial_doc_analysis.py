"""Heuristic discrepancy / risk flags for LC and shipping document extraction (Phase 4)."""

from __future__ import annotations

import re
from typing import Any


def _field_val(fields: dict[str, Any], key: str) -> str | None:
    raw = fields.get(key)
    if raw is None:
        return None
    if hasattr(raw, "value"):
        v = getattr(raw, "value", None)
        return str(v).strip() if v is not None and str(v).strip() else None
    if isinstance(raw, dict):
        v = raw.get("value")
        return str(v).strip() if v is not None and str(v).strip() else None
    s = str(raw).strip()
    return s or None


def _to_float(v: str | None) -> float | None:
    if not v:
        return None
    try:
        return float(re.sub(r"[^0-9.\-]", "", v) or 0)
    except (TypeError, ValueError):
        return None


def analyze_lc_fields(fields: dict[str, Any], *, notes_blob: str | None = None) -> list[dict[str, str]]:
    """Return severity-tagged alerts for LC extraction review UI."""
    alerts: list[dict[str, str]] = []
    notes = (notes_blob or _field_val(fields, "notes") or "").lower()
    unmapped_extra = " ".join(
        str(x).lower() for x in (fields.get("_unmapped_text") or []) if x
    ) if isinstance(fields.get("_unmapped_text"), list) else ""
    blob = f"{notes} {unmapped_extra}"

    amount = _to_float(_field_val(fields, "amount"))
    order_value = _to_float(_field_val(fields, "order_value_hint"))
    if amount is not None and order_value is not None and order_value > 0:
        pct = abs(amount - order_value) / order_value * 100.0
        if pct >= 2.0:
            alerts.append(
                {
                    "severity": "critical" if pct >= 5 else "warning",
                    "code": "lc_amount_mismatch",
                    "message": (
                        f"LC amount ({amount:,.2f}) differs from linked order value "
                        f"({order_value:,.2f}) by {pct:.1f}%."
                    ),
                }
            )

    expiry = _field_val(fields, "expiry_date")
    delivery = _field_val(fields, "order_delivery_date_hint") or _field_val(fields, "shipment_date")
    if expiry and delivery and expiry < delivery:
        alerts.append(
            {
                "severity": "critical",
                "code": "lc_expiry_before_delivery",
                "message": f"LC expiry ({expiry}) is before order delivery / shipment date ({delivery}).",
            }
        )

    if re.search(r"3rd\s*party|third[\s\-]?party\s+inspection|sgs|bureau\s+veritas", blob):
        alerts.append(
            {
                "severity": "warning",
                "code": "lc_third_party_inspection",
                "message": "LC appears to require 3rd party inspection — add a TNA action item.",
            }
        )
    trans_field = (_field_val(fields, "transshipment_allowed") or "").upper()
    if trans_field in {"N", "NO", "FALSE", "0"} or (
        re.search(r"transshipment\s+(not\s+)?allowed|no\s+transshipment|transhipment\s+prohibited", blob)
        and re.search(r"not\s+allowed|no\s+trans|prohibited", blob)
    ):
        alerts.append(
            {
                "severity": "warning",
                "code": "lc_no_transshipment",
                "message": "Transshipment not allowed — confirm direct routing with logistics.",
            }
        )

    special = (_field_val(fields, "special_instructions") or "").lower()
    if re.search(r"3rd\s*party|third[\s\-]?party\s+inspection|sgs|bureau\s+veritas", special):
        if not any(a.get("code") == "lc_third_party_inspection" for a in alerts):
            alerts.append(
                {
                    "severity": "warning",
                    "code": "lc_third_party_inspection",
                    "message": "LC appears to require 3rd party inspection — add a TNA action item.",
                }
            )

    partial = _field_val(fields, "partial_shipment_allowed")
    if partial and partial.upper() in {"N", "NO", "FALSE", "0"}:
        alerts.append(
            {
                "severity": "warning",
                "code": "lc_no_partial",
                "message": "Partial shipment not allowed — plan full quantity in one shipment.",
            }
        )

    return alerts


def analyze_packing_list_fields(fields: dict[str, Any]) -> list[dict[str, str]]:
    alerts: list[dict[str, str]] = []
    listed_qty = _to_float(_field_val(fields, "total_quantity") or _field_val(fields, "quantities_total"))
    order_qty = _to_float(_field_val(fields, "order_quantity_hint"))
    if listed_qty is not None and order_qty is not None and order_qty > 0:
        if abs(listed_qty - order_qty) >= 1:
            alerts.append(
                {
                    "severity": "critical" if abs(listed_qty - order_qty) / order_qty > 0.05 else "warning",
                    "code": "packing_qty_mismatch",
                    "message": (
                        f"Packing list shows {listed_qty:g} pcs but order hint is {order_qty:g} pcs."
                    ),
                }
            )
    cartons = _to_float(_field_val(fields, "total_cartons"))
    header_cartons = _to_float(_field_val(fields, "header_cartons_hint"))
    if cartons is not None and header_cartons is not None and cartons != header_cartons:
        alerts.append(
            {
                "severity": "warning",
                "code": "packing_carton_mismatch",
                "message": f"Packing list cartons ({cartons:g}) do not match header ({header_cartons:g}).",
            }
        )
    return alerts


def infer_shipping_document_type(raw: dict[str, Any], preferred: str | None = None) -> str:
    pref = (preferred or "").strip().lower()
    if pref in {"bl", "bl_info", "bill_of_lading"}:
        return "bl_info"
    if pref in {"awb", "awb_info", "air_waybill"}:
        return "awb_info"
    if pref in {"packing_list", "packing_list_info", "pl"}:
        return "packing_list_info"
    blob = " ".join(str(v) for k, v in raw.items() if not str(k).startswith("_") and v).lower()
    if "air waybill" in blob or "awb" in blob or "airline" in blob:
        return "awb_info"
    if "packing list" in blob or "carton" in blob:
        return "packing_list_info"
    return "bl_info" if raw.get("bl_awb") or raw.get("container_number") else "shipping_doc_info"
