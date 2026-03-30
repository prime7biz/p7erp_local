"""Central thresholds and weights for deterministic quotation costing intelligence (Phase 1).

All business heuristics for the read-only costing bundle live here — avoid magic numbers in logic.
"""

from __future__ import annotations

from decimal import Decimal

# ----- Header vs line roll-up drift -----
HEADER_LINE_DRIFT_MIN_ABS = Decimal("1")
HEADER_LINE_DRIFT_RELATIVE = Decimal("0.05")  # 5% of header bucket

# ----- Margin pressure bands (factory margin % = (quoted - total_cost) / quoted * 100) -----
MARGIN_PRESSURE_HIGH_BELOW_PCT = Decimal("3")
MARGIN_PRESSURE_MEDIUM_BELOW_PCT = Decimal("10")

# ----- Size ratio sum band (percent points) -----
SIZE_RATIO_SUM_LOW = Decimal("99.5")
SIZE_RATIO_SUM_HIGH = Decimal("100.5")

# ----- Cost completeness score (equal weight per prerequisite) -----
COMPLETENESS_PREREQ_TOTAL = 6

# ----- Costing confidence penalties (capped) -----
CONFIDENCE_PENALTY_PER_HIGH_ANOMALY = 15
CONFIDENCE_PENALTY_PER_MEDIUM_ANOMALY = 8
CONFIDENCE_PENALTY_PER_COMPLETENESS_ITEM = 3
CONFIDENCE_PENALTY_CAP = 40

# ----- Confidence basis (full vs partial) when signal_scope is full_costing -----
CONFIDENCE_FULL_BASIS_MIN_SCORE = 70

# ----- Anomaly rollup -----
ANOMALY_MEDIUM_COUNT_FOR_HIGH_SEVERITY = 2

# ----- Review urgency -----
URGENT_COSTING_CONFIDENCE_BELOW = 45

# ----- List / detail indicator: header completeness (quotation_ai_service) -----
HEADER_COMPLETENESS_FIELD_COUNT = 5

# ----- Costing readiness checks (equal weight) -----
COSTING_READINESS_CHECK_COUNT = 5

# Map internal diagnostic codes to stable machine reason_codes (snake_case).
INTERNAL_CODE_TO_REASON_CODE: dict[str, str] = {
    "NO_MATERIAL_LINES": "missing_material_rows",
    "NO_MANUFACTURING_LINES": "missing_manufacturing_rows",
    "NO_OTHER_COST_LINES": "missing_other_cost_rows",
    "MISSING_PROJECTED_QUANTITY": "incomplete_quantity_linkage",
    "MISSING_STYLE_CONTEXT": "incomplete_style_context",
    "NO_LINKED_INQUIRY": "incomplete_inquiry_context",
    "SIZE_RATIO_ENABLED_EMPTY": "incomplete_quantity_linkage",
    "SIZE_RATIO_SUM_DRIFT": "size_ratio_sum_drift",
    "HEADER_TOTAL_COST_MISSING": "header_total_cost_missing",
    "NEGATIVE_MATERIAL_AMOUNT": "negative_line_amount",
    "NEGATIVE_MFG_AMOUNT": "negative_line_amount",
    "NEGATIVE_OTHER_COST": "negative_line_amount",
    "HEADER_MATERIAL_ROLLUP_MISMATCH": "header_line_total_mismatch",
    "HEADER_MFG_ROLLUP_MISMATCH": "header_line_total_mismatch",
    "MIXED_LINE_CURRENCIES": "mixed_line_currencies",
}

# Human-readable labels for UI (optional); API uses reason_code keys.
REASON_CODE_LABELS: dict[str, str] = {
    "missing_material_rows": "Material lines missing or empty",
    "missing_manufacturing_rows": "Manufacturing / CM lines missing",
    "missing_other_cost_rows": "Other cost lines missing",
    "negative_line_amount": "Negative line amount",
    "header_line_total_mismatch": "Header vs line total mismatch",
    "mixed_line_currencies": "Mixed line currencies",
    "missing_fx_assumption": "FX assumption incomplete or conflicting",
    "low_margin_buffer": "Low margin vs factory cost",
    "incomplete_quantity_linkage": "Quantity / size ratio incomplete",
    "incomplete_inquiry_context": "No linked inquiry",
    "incomplete_style_context": "Style reference missing",
    "size_ratio_sum_drift": "Size ratio percentages do not sum to ~100%",
    "header_total_cost_missing": "Header total cost missing or zero",
    "urgent_costing_review": "Urgent costing review recommended",
}
