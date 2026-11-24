/** Production Control Center API (tenant flag `prod_control_center_v1`). */
import { request } from "@/api/core";

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type ControlCenterSummary = {
  as_of: string;
  orders: Array<{
    order_id: number;
    order_code: string;
    status: string;
    delivery_date: string | null;
    quantity: string;
    tna_slip_days: number;
    tna_health: string;
    tna_warnings: Array<Record<string, unknown>>;
  }>;
  feeding: { enabled: boolean; items?: Array<Record<string, unknown>> };
  flags: Record<string, boolean>;
};

export type FloorBoard = {
  enabled: boolean;
  production_date?: string;
  lines: Array<{
    line_id: number;
    line_code: string;
    line_name: string;
    target_qty: string;
    good_qty: string;
    efficiency_pct: string;
    dhu_pct: string;
    rft_pct: string;
    planned_operators: number;
    present_operators: number;
    downtime_minutes: number;
    top_defects: Array<{ code: string; qty: number }>;
    hours: Array<{ hour_slot: number; target_qty: number | null; good_qty: number | null }>;
  }>;
};

export async function fetchControlCenterSummary(limit = 50): Promise<ControlCenterSummary> {
  return request(`/api/v1/production/control-center/summary${query({ limit })}`);
}

export async function fetchFloorBoard(productionDate?: string, factoryUnit?: string): Promise<FloorBoard> {
  return request(
    `/api/v1/production/control-center/floor-board${query({
      production_date: productionDate,
      factory_unit: factoryUnit,
    })}`,
  );
}

export async function fetchCuttingVariance(orderId: number): Promise<Record<string, unknown>> {
  return request(`/api/v1/production/control-center/orders/${orderId}/cutting-variance`);
}

export async function fetchFinishingFunnel(orderId: number): Promise<Record<string, unknown>> {
  return request(`/api/v1/production/finishing/orders/${orderId}/funnel`);
}

export async function fetchMachineMatch(orderId: number, onDate?: string): Promise<Record<string, unknown>> {
  return request(
    `/api/v1/mfg-intelligence/machine-match/lines${query({ order_id: orderId, on_date: onDate })}`,
  );
}
