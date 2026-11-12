/** Test-only builders for Control Tower / profitability API answers (4-decimal money strings, like the backend). */
import type {
  ControlCard,
  ControlTowerResponse,
  ExceptionListResponse,
  OrderProfitListResponse,
  OrderProfitRow,
  ProfitabilityResponse,
} from "@/api/financeControl";

export const CT_ME = {
  feature_flags: { finance_control_tower_v2: true, fiscal_year_start_month: 7 } as Record<string, unknown>,
  role_name: "accountant",
  role_permissions: {} as Record<string, unknown>,
};

export function card(code: string, extra: Partial<ControlCard> = {}): ControlCard {
  return {
    code,
    label: code,
    severity: "medium",
    count: 0,
    amount: "0.0000",
    oldest_date: null,
    href: `/app/finance/home?tab=exceptions&exception=${code}`,
    ...extra,
  };
}

export function tower(cards: ControlCard[], extra: Partial<ControlTowerResponse> = {}): ControlTowerResponse {
  return {
    report: "finance_control_tower",
    as_of_date: "2026-11-12",
    base_currency: "BDT",
    severity: "all",
    cards,
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}

export function exceptionList(card_: ControlCard, rows: ExceptionListResponse["rows"], extra: Partial<ExceptionListResponse> = {}): ExceptionListResponse {
  return {
    code: card_.code,
    label: card_.label,
    severity: card_.severity,
    as_of_date: "2026-11-12",
    base_currency: "BDT",
    total: card_.count,
    amount: card_.amount,
    oldest_date: card_.oldest_date,
    limit: 25,
    offset: 0,
    rows,
    ...extra,
  };
}

export function orderRow(id: number, extra: Partial<OrderProfitRow> = {}): OrderProfitRow {
  return {
    order_id: id,
    order_code: `ORD-00${id}`,
    order_date: "2026-10-01",
    status: "CONFIRMED",
    customer_id: 3,
    style_id: 11,
    master_contract_id: 21,
    revenue: "1000.0000",
    material: "400.0000",
    cm: "100.0000",
    overhead: "50.0000",
    finance_cost: "10.0000",
    other: "20.0000",
    gross_profit: "480.0000",
    nett_profit: "420.0000",
    margin_percent: "42.0000",
    ...extra,
  };
}

export function orderList(rows: OrderProfitRow[], extra: Partial<OrderProfitListResponse> = {}): OrderProfitListResponse {
  return {
    period: { from_date: "2026-07-01", to_date: "2027-06-30" },
    base_currency: "BDT",
    total: rows.length,
    limit: 25,
    offset: 0,
    sort: "order_code",
    unattributed_actual: "1813863870.2600",
    unlinked_lines: 4,
    rows,
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}

export function profit(extra: Partial<ProfitabilityResponse> = {}): ProfitabilityResponse {
  return {
    entity: { type: "order", id: 5, code: "ORD-005", name: null },
    period: { from_date: "2026-07-01", to_date: "2027-06-30" },
    base_currency: "BDT",
    budget: { revenue: "1000.0000", material: "400.0000", cm: "100.0000", other: "20.0000" },
    actual: { revenue: "1200.0000", material: "450.0000", cm: "100.0000", overhead: "50.0000", finance_cost: "10.0000", other: "20.0000" },
    gross_profit: "630.0000",
    nett_profit: "570.0000",
    margin_percent: "47.5000",
    unattributed_actual: "0.0000",
    coverage: { direct_voucher_lines: 7, cost_center_lines: 2, unlinked_lines: 3, orders_in_scope: 1, orders_without_budget: 0 },
    warnings: [],
    notes: ["Shared overhead is not allocated; unlinked lines are shown in unattributed_actual."],
    drilldown: [],
    data_as_of: "2026-11-12T10:00:00",
    ...extra,
  };
}
