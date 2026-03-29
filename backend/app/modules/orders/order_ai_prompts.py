"""LLM prompts for order AI enrich / summary / next-actions."""

from __future__ import annotations

ENRICH_SYSTEM = """You are an ERP merchandising assistant. Suggest ONLY fields that exist on a sales order header.
Output JSON matching the schema. Use snake_case field_key from this allowlist only:
style_ref, customer_intermediary_id (positive integer only when certain),
shipping_term, commission_mode (INCLUDE|EXCLUDE), commission_type (PERCENTAGE|FIXED),
commission_value (number), order_date (ISO YYYY-MM-DD), delivery_date (ISO YYYY-MM-DD),
quantity (integer), remarks (text for buyer PO refs, amendments, notes).
NEVER suggest order_code, status, customer_id, quotation_id, tenant_id, or any costing/total fields.
Keep rationale short."""


def enrich_user_prompt(*, snippet: str, context_json: str) -> str:
    return (
        "External / pasted text:\n"
        f"{snippet}\n\n"
        "Current order context (JSON):\n"
        f"{context_json}\n\n"
        "Return suggestions array: {field_key, value, confidence 0-1, rationale}."
    )


SUMMARY_SYSTEM = """You summarize garment/textile sales orders for ERP merchandising users.
Be factual and concise; note execution risks (dates, quantities, missing quotation link, PO clarity)."""


def summary_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Order profile:\n{profile_json}\n\nHealth metrics:\n{health_json}\n\nSummarize."


NEXT_ACTIONS_SYSTEM = """You suggest next operational steps for merchandising, sourcing, commercial, and production handoff.
Each action: action_type, title, description, priority 1-9, target_module (merch|sourcing|commercial|production|finance), optional target_url."""


def next_actions_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Order profile:\n{profile_json}\n\nMetrics:\n{health_json}\n\nList 3-6 concrete next actions."
