import type { AiToolInvocationResult } from "@/api/client";

/** Friendly names for the read-only tools the AI agent can use (backend `agent/catalog.py`). */
const AGENT_TOOL_LABELS: Record<string, string> = {
  search_records: "Record search",
  get_record_summary: "Record details",
  search_sales_orders: "Orders",
  get_pending_approvals: "Pending approvals",
  get_dashboard_summary: "Dashboard",
  finance_statement_summary: "Finance report summary",
  get_inventory_snapshot: "Stock",
  search_inventory_shortages: "Stock shortages",
  get_production_summary: "Production",
  search_production_issues: "Production issues",
  search_repeated_late_vendors: "Late vendors",
  get_financial_summary: "Finance",
  suggest_bom_from_similar_style: "Similar BOMs",
  suggest_items_for_bom_line: "Items",
  suggest_vendor_for_item: "Vendors for item",
  suggest_orders_with_shortage: "Material shortages",
  calendar_summary: "Factory calendar",
  calendar_impact: "Calendar impact",
  analyze_structured_metrics: "Analysis",
  search_notes: "Notes",
  search_help_articles: "Help articles",
  mfg_delivery_forecast: "Delivery forecast",
  mfg_bottlenecks: "Production bottlenecks",
  mfg_supplier_lateness: "Supplier lateness",
};

export function agentToolLabel(toolName: string): string {
  return AGENT_TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");
}

/** Unique labels of the tools that returned data, in the order they were used. */
export function checkedToolLabels(results: AiToolInvocationResult[]): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (r.status !== "SUCCESS") continue;
    const label = agentToolLabel(r.tool_name);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

/** Number of tool calls the user was not allowed to make (shown as a short note). */
export function blockedToolCount(results: AiToolInvocationResult[]): number {
  return results.filter((r) => r.status === "BLOCKED").length;
}
