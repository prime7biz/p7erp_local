import type { AiForecastRunResponse } from "@/api/client";

export function getHistoryNetCash(result: Record<string, unknown>) {
  const h = (result as { history?: Array<{ month?: string; net_cash?: number }> }).history;
  if (!Array.isArray(h)) return [] as { month: string; value: number }[];
  return h
    .map((r) => ({ month: String(r?.month ?? ""), value: Number(r?.net_cash) || 0 }))
    .filter((r) => r.month);
}

export function getProjectedNetCash(result: Record<string, unknown>) {
  const fp = (result as { forecast_points?: { projected_net_cash?: number; period_index?: number }[] }).forecast_points;
  if (!Array.isArray(fp)) return [] as { period: number; value: number }[];
  return fp
    .map((p) => ({ period: Number(p?.period_index) || 0, value: Number(p?.projected_net_cash) || 0 }))
    .filter((p) => p.value !== 0 || p.period);
}

export function getInventoryShortageItems(result: Record<string, unknown>) {
  const fp = (result as { forecast_points?: Array<Record<string, unknown>> }).forecast_points;
  if (!Array.isArray(fp)) return [];
  return fp.filter((p) => typeof p?.days_to_stockout === "number" || p?.item_id != null) as Array<{
    item_id?: number;
    days_to_stockout?: number;
    current_on_hand?: number;
    [k: string]: unknown;
  }>;
}

export function getProductionHistoryAndProjected(result: Record<string, unknown>) {
  const h = (result as { history?: Array<{ month?: string; completed_output_qty?: number }> }).history;
  const fp = (result as { forecast_points?: Array<{ period_index?: number; projected_output_qty?: number }> })
    .forecast_points;
  const historyVals =
    (Array.isArray(h) ? h : []).map((r) => Number(r?.completed_output_qty) || 0);
  const projected = (Array.isArray(fp) ? fp : [])
    .map((p) => Number(p?.projected_output_qty) || 0)
    .filter((v) => v || v === 0);
  return { historyVals, projected };
}

export function getShipmentPoint(result: Record<string, unknown>) {
  const fp = (result as { forecast_points?: Array<Record<string, unknown>> }).forecast_points;
  const p = Array.isArray(fp) && fp[0] && typeof fp[0] === "object" ? fp[0] : null;
  return p as { risk_level?: string; due_next_orders?: number; projected_delayed_orders?: number } | null;
}

export function getAgingBuckets(result: Record<string, unknown>) {
  const a = (result as { aging_buckets?: Record<string, number> }).aging_buckets;
  if (!a || typeof a !== "object") return null;
  return a;
}

export function getCapacityPoint(result: Record<string, unknown>) {
  const fp = (result as { forecast_points?: Array<Record<string, unknown>> }).forecast_points;
  const p = Array.isArray(fp) && fp[0] && typeof fp[0] === "object" ? fp[0] : null;
  return p as {
    backlog_qty?: number;
    projected_capacity_qty?: number;
    projected_shortfall_qty?: number;
  } | null;
}

export function runResultJson(run: AiForecastRunResponse) {
  return (run.result_json && typeof run.result_json === "object" ? run.result_json : {}) as Record<string, unknown>;
}
