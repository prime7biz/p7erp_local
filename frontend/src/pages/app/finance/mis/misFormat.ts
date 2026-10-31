import type { MisRatioItem } from "@/api/client";

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatRatioValue(ratio: MisRatioItem | { name: string; value: number | null }): string {
  if (ratio.value == null) return "n/a";
  if (ratio.name.includes("margin")) {
    return `${(ratio.value * 100).toFixed(1)}%`;
  }
  if (ratio.name.includes("turnover") || ratio.name.includes("coverage")) {
    return ratio.value.toFixed(2);
  }
  return ratio.value.toFixed(2);
}

export function statusBadgeClass(status: string | undefined): string {
  if (status === "good") return "bg-green-100 text-green-800";
  if (status === "warning") return "bg-amber-100 text-amber-800";
  if (status === "critical") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

export function scenarioLabel(name: string): string {
  if (name === "best_case") return "Best case";
  if (name === "worst_case") return "Worst case";
  if (name === "expected") return "Expected";
  return name.replaceAll("_", " ");
}
