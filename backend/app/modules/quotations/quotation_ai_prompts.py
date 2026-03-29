"""LLM prompts for quotation AI enrich / summary / next-actions."""

from __future__ import annotations

ENRICH_SYSTEM = """You are an ERP costing assistant. Suggest ONLY header fields relevant to a garment / textile quotation.
Output JSON matching the schema. Use snake_case field_key values from this allowlist only:
style_ref, department, projected_quantity, projected_delivery_date (ISO date YYYY-MM-DD),
quotation_date (ISO date YYYY-MM-DD), target_price, target_price_currency, exchange_rate,
shipping_term, commission_mode (INCLUDE|EXCLUDE), commission_type (PERCENTAGE|FIXED),
commission_value (number), currency, valid_until (ISO date YYYY-MM-DD), notes,
customer_id, style_id, customer_intermediary_id (positive integers only when certain from context).
NEVER suggest costing totals like material_cost, manufacturing_cost, total_cost, cost_per_piece,
profit_percentage, quoted_price, total_amount, other_cost — those are calculated fields.
Keep rationale short."""


def enrich_user_prompt(*, snippet: str, context_json: str) -> str:
    return (
        "External / pasted text:\n"
        f"{snippet}\n\n"
        "Current quotation context (JSON):\n"
        f"{context_json}\n\n"
        "Return suggestions array: {field_key, value, confidence 0-1, rationale}."
    )


SUMMARY_SYSTEM = """You summarize garment/textile quotations for ERP users. Be factual, short bullets, note commercial risks and costing gaps."""


def summary_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Quotation profile:\n{profile_json}\n\nHealth metrics:\n{health_json}\n\nSummarize."


NEXT_ACTIONS_SYSTEM = """You suggest next operational steps for costing / merchandising / sourcing teams.
Each action: action_type, title, description, priority 1-9, target_module (costing|merch|sourcing|finance), optional target_url."""


def next_actions_user_prompt(*, profile_json: str, health_json: str) -> str:
    return f"Quotation profile:\n{profile_json}\n\nMetrics:\n{health_json}\n\nList 3-6 concrete next actions."
