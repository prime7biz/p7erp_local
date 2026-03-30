/** User-facing labels for costing intelligence `reason_code` values (Phase 1). */

const LABELS: Record<string, string> = {
  missing_material_rows: "Material lines missing or empty",
  missing_manufacturing_rows: "Manufacturing / CM lines missing",
  missing_other_cost_rows: "Other cost lines missing",
  negative_line_amount: "Negative line amount",
  header_line_total_mismatch: "Header vs line total mismatch",
  mixed_line_currencies: "Mixed line currencies",
  missing_fx_assumption: "FX assumption incomplete",
  low_margin_buffer: "Low margin vs factory cost",
  incomplete_quantity_linkage: "Quantity / size ratio incomplete",
  incomplete_inquiry_context: "No linked inquiry",
  incomplete_style_context: "Style reference missing",
  size_ratio_sum_drift: "Size ratio % sum drift",
  header_total_cost_missing: "Header total cost missing",
  urgent_costing_review: "Urgent costing review",
};

export function quotationCostingReasonLabel(code: string): string {
  return LABELS[code] ?? code.replace(/_/g, " ");
}
