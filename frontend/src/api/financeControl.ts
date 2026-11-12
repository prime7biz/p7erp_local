/**
 * Finance Control Tower + GL profitability API client (Finance modernization, Phase 3).
 * Backend: backend/app/modules/finance/control/ (router.py, schemas.py, constants.py).
 * Every amount is a decimal STRING with 4 places. Never turn it into a JS number for arithmetic
 * (use `components/finance/statements/statementFormat.ts` to show amounts).
 * All routes need the tenant flag `finance_control_tower_v2` (otherwise 404).
 */
import { request } from "@/api/core";

const BASE = "/api/v1/finance";

export type Money = string;
export type Severity = "high" | "medium" | "low";
export type SeverityFilter = "all" | Severity;

// ---------------------------------------------------------------- Control Tower
export interface ControlCard {
  code: string;
  label: string;
  severity: Severity;
  count: number;
  amount: Money;
  oldest_date?: string | null;
  href: string;
  source?: string | null;
  note?: string | null;
}

export interface ControlTowerResponse {
  report: string;
  as_of_date: string;
  base_currency: string;
  severity: string;
  cards: ControlCard[];
  data_as_of: string;
}

export interface ExceptionRow {
  id?: number | null;
  reference?: string | null;
  date?: string | null;
  party?: string | null;
  amount: Money;
  details: Record<string, unknown>;
}

export interface ExceptionListResponse {
  code: string;
  label: string;
  severity: Severity;
  as_of_date: string;
  base_currency: string;
  total: number;
  amount: Money;
  oldest_date?: string | null;
  limit: number;
  offset: number;
  source?: string | null;
  note?: string | null;
  rows: ExceptionRow[];
}

// ---------------------------------------------------------------- Profitability
export type ProfitEntityType = "order" | "style" | "master_contract" | "buyer";

/** The entity kinds the detail page can show, with the backend path segment. */
export type ProfitEntityKind = "orders" | "styles" | "master-contracts" | "buyers";

export interface ProfitEntity {
  type: ProfitEntityType;
  id: number;
  code?: string | null;
  name?: string | null;
}

export interface ProfitPeriod {
  from_date?: string | null;
  to_date?: string | null;
}

export interface ProfitBudget {
  revenue: Money;
  material: Money;
  cm: Money;
  other: Money;
}

export interface ProfitActual {
  revenue: Money;
  material: Money;
  cm: Money;
  overhead: Money;
  finance_cost: Money;
  other: Money;
}

export interface ProfitCoverage {
  direct_voucher_lines: number;
  cost_center_lines: number;
  unlinked_lines: number;
  orders_in_scope: number;
  orders_without_budget: number;
}

export interface ProfitWarning {
  code: string;
  count: number;
  amount: Money;
}

export interface ProfitDrill {
  source: "ORDER" | "COST_CENTER";
  bucket: string;
  account_id: number;
  account_number?: string | null;
  account_name?: string | null;
  line_count: number;
  amount: Money;
}

export interface ProfitabilityResponse {
  entity: ProfitEntity;
  period: ProfitPeriod;
  base_currency: string;
  budget: ProfitBudget;
  actual: ProfitActual;
  gross_profit: Money;
  nett_profit: Money;
  margin_percent?: Money | null;
  unattributed_actual: Money;
  coverage: ProfitCoverage;
  warnings: ProfitWarning[];
  notes: string[];
  drilldown: ProfitDrill[];
  data_as_of: string;
}

export interface OrderProfitRow {
  order_id: number;
  order_code: string;
  order_date?: string | null;
  status?: string | null;
  customer_id?: number | null;
  style_id?: number | null;
  master_contract_id?: number | null;
  revenue: Money;
  material: Money;
  cm: Money;
  overhead: Money;
  finance_cost: Money;
  other: Money;
  gross_profit: Money;
  nett_profit: Money;
  margin_percent?: Money | null;
}

export interface OrderProfitListResponse {
  period: ProfitPeriod;
  base_currency: string;
  total: number;
  limit: number;
  offset: number;
  sort: string;
  unattributed_actual: Money;
  unlinked_lines: number;
  rows: OrderProfitRow[];
  data_as_of: string;
}

/** Sort fields the backend accepts (mirror of `SORT_FIELDS` in constants.py); a leading "-" = descending. */
export const ORDER_PROFIT_SORT_FIELDS = ["order_code", "order_date", "revenue", "nett_profit", "margin_percent"] as const;
export type OrderProfitSortField = (typeof ORDER_PROFIT_SORT_FIELDS)[number];

export interface ProfitPeriodQuery {
  from_date?: string;
  to_date?: string;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

export const financeControlApi = {
  getControlTower: (q: { as_of_date?: string; severity?: SeverityFilter }) =>
    request<ControlTowerResponse>(`${BASE}/control-tower${qs({ ...q })}`),
  getExceptions: (code: string, q: { as_of_date?: string; limit?: number; offset?: number }) =>
    request<ExceptionListResponse>(`${BASE}/control-tower/exceptions/${encodeURIComponent(code)}${qs({ ...q })}`),
  listOrderProfit: (q: ProfitPeriodQuery & { limit?: number; offset?: number; sort?: string }) =>
    request<OrderProfitListResponse>(`${BASE}/profitability/orders${qs({ ...q })}`),
  getProfitability: (kind: ProfitEntityKind, id: number, q: ProfitPeriodQuery) =>
    request<ProfitabilityResponse>(`${BASE}/profitability/${kind}/${id}${qs({ ...q })}`),
};
