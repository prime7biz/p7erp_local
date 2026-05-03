import type { AiWeeklyReportItem } from "@/api/client";

const KPI_LABELS: Record<string, string> = {
  active_orders: "Active orders",
  total_customers: "Customers",
  pending_approvals_total: "Pending approvals (total)",
  orders_past_delivery_open: "Orders past delivery (open)",
  open_downtime_events: "Open downtime events",
  open_trade_cases: "Open trade cases",
};

export function kpiKeyLabel(key: string): string {
  return KPI_LABELS[key] ?? key.replace(/_/g, " ");
}

export function buildWeeklyReportMarkdownFile(report: AiWeeklyReportItem): string {
  const lines: string[] = [
    `# Weekly AI report`,
    `Week: ${report.week_start} – ${report.week_end}`,
    `Generated: ${report.created_at}`,
    "",
    report.narrative,
    "",
  ];
  if (report.kpi_snapshot_json && Object.keys(report.kpi_snapshot_json).length > 0) {
    lines.push("## Numbers behind this report", "");
    lines.push("```json");
    lines.push(JSON.stringify(report.kpi_snapshot_json, null, 2));
    lines.push("```", "");
  }
  return lines.join("\n");
}
