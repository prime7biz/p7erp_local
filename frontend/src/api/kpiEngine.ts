/**
 * KPI engine API (tenant flag `kpi_engine_v1`, default OFF).
 * Reads never change data. Predictive routes need `kpi_predictive_v1`.
 */
import { request } from "@/api/core";

const BASE = "/api/v1/kpi";

export type KpiDefinition = {
  id: number;
  code: string;
  name: string;
  purpose?: string | null;
  module: string;
  metric_type: string;
  tier: string;
  unit: string;
  direction: string;
  sensitivity: string;
  applicability: string[];
  dashboard_codes: string[];
  adapter_key?: string | null;
  blocked_reason?: string | null;
  definition_version: number;
  active: boolean;
  owner_role?: string | null;
  refresh_frequency?: string | null;
};

export type KpiValue = {
  code: string;
  value: string | null;
  unit: string;
  as_of: string;
  formula_version: string;
  numerator?: string | null;
  denominator?: string | null;
  status: string;
  missing_inputs: string[];
  source_event_time?: string | null;
  target_value?: string | null;
};

export type KpiCard = {
  definition: KpiDefinition;
  value: KpiValue;
};

export async function listKpiDefinitions(params?: { module?: string; dashboard?: string }) {
  const q = new URLSearchParams();
  if (params?.module) q.set("module", params.module);
  if (params?.dashboard) q.set("dashboard", params.dashboard);
  const suffix = q.toString() ? `?${q}` : "";
  return request<{ items: KpiDefinition[] }>(`${BASE}/definitions${suffix}`);
}

export async function seedKpiDefinitions() {
  return request<{ created: number; skipped: number; total_seed: number }>(`${BASE}/seed`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchKpiCards(dashboard: string, asOf?: string) {
  const q = new URLSearchParams({ dashboard });
  if (asOf) q.set("as_of", asOf);
  return request<{ dashboard: string; items: KpiCard[] }>(`${BASE}/cards?${q}`);
}

export async function fetchKpiValue(code: string, asOf?: string) {
  const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : "";
  return request<{ definition: KpiDefinition; value: KpiValue }>(
    `${BASE}/${encodeURIComponent(code)}/value${q}`,
  );
}

export async function fetchKpiEvidence(code: string, limit = 50, offset = 0) {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return request<{
    code: string;
    value: KpiValue;
    evidence: Array<Record<string, unknown>>;
    total: number;
  }>(`${BASE}/${encodeURIComponent(code)}/evidence?${q}`);
}

export async function fetchOrderDelayRisk(orderId: number) {
  return request<Record<string, unknown>>(`${BASE}/predictive/orders/${orderId}/delay-risk`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
