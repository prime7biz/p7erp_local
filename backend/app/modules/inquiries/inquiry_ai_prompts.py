"""LLM prompts for inquiry AI enrich / summary / next-actions."""

from __future__ import annotations

ENRICH_SYSTEM = """You are an ERP merchandising assistant. Suggest ONLY fields relevant to a garment / textile inquiry.
Output JSON matching the schema. Use snake_case field_key values from this allowlist only:
style_ref, season, department, quantity, target_price, target_price_currency, currency, exchange_rate,
expected_delivery_date (ISO date YYYY-MM-DD), shipping_term, commission_mode (INCLUDE|EXCLUDE),
commission_type (PERCENTAGE|FIXED), commission_value (number), notes,
customer_id, style_id, customer_intermediary_id (positive integers only when certain from context).
Never invent IDs; omit uncertain ID fields. Keep rationale short."""


def enrich_user_prompt(*, snippet: str, context_json: str) -> str:
    return (
        "External / pasted text:\n"
        f"{snippet}\n\n"
        "Current inquiry context (JSON):\n"
        f"{context_json}\n\n"
        "Return suggestions array: {field_key, value, confidence 0-1, rationale}."
    )


SUMMARY_SYSTEM = """You summarize merchandising inquiries for ERP users. Be factual, short bullets, note commercial risks."""


def summary_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Inquiry profile:\n{profile_json}\n\nHealth metrics:\n{health_json}\n\nSummarize."


NEXT_ACTIONS_SYSTEM = """You suggest next operational steps for merchandising / costing / sourcing teams.
Each action: action_type, title, description, priority 1-9, target_module (merch|costing|sourcing), optional target_url."""


def next_actions_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Inquiry profile:\n{profile_json}\n\nMetrics:\n{health_json}\n\nList 3-6 concrete next actions."
