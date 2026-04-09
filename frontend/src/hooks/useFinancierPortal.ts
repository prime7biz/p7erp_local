import { externalGet } from "@/api/externalClient";

export const financierPortalApi = {
  dashboard: () => externalGet<Record<string, unknown>>("/financier/dashboard"),
  orderBook: (q?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (q?.limit != null) p.set("limit", String(q.limit));
    if (q?.offset != null) p.set("offset", String(q.offset));
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<{ items: unknown[]; total: number }>(`/financier/order-book${s}`);
  },
  pipeline: () => externalGet<Record<string, unknown>>("/financier/pipeline"),
  goodsMovement: () => externalGet<Record<string, unknown>>("/financier/goods-movement"),
  financialSummary: () => externalGet<Record<string, unknown>>("/financier/financial-summary"),
  projections: () => externalGet<{ items: { month: string; projected_units: number }[] }>("/financier/projections"),
  alerts: () => externalGet<{ items: { code: string; severity: string; title: string; detail: string }[] }>(
    "/financier/alerts",
  ),
  order: (id: number) => externalGet<Record<string, unknown>>(`/financier/orders/${id}`),
  creditLines: () => externalGet<Record<string, unknown>>("/financier/credit-lines"),
  loanPortfolio: () => externalGet<Record<string, unknown>>("/financier/loan-portfolio"),
  loanPortfolioDetail: (id: number) => externalGet<Record<string, unknown>>(`/financier/loan-portfolio/${id}`),
  traceabilityList: () => externalGet<Record<string, unknown>>("/financier/traceability"),
  traceabilityDetail: (utilizationId: number) =>
    externalGet<Record<string, unknown>>(`/financier/traceability/${utilizationId}`),
  businessHealth: () => externalGet<Record<string, unknown>>("/financier/business-health"),
  aiConfidence: () => externalGet<Record<string, unknown>>("/financier/ai/confidence-narrative"),
  procurementTracker: () => externalGet<Record<string, unknown>>("/financier/procurement-tracker"),
  stockCollateral: () => externalGet<Record<string, unknown>>("/financier/stock-collateral"),
  snapshots: () => externalGet<Record<string, unknown>>("/financier/snapshots"),
  snapshot: (id: number) => externalGet<Record<string, unknown>>(`/financier/snapshots/${id}`),
  report: (key: string) => externalGet<Record<string, unknown>>(`/financier/reports/${encodeURIComponent(key)}`),
  orderFinance: () => externalGet<{ items: unknown[]; note?: string | null }>("/financier/order-finance"),
  rawMaterialTracker: () => externalGet<{ items: unknown[]; note?: string | null }>("/financier/raw-material-tracker"),
  productionTracker: () => externalGet<{ items: unknown[]; note?: string | null }>("/financier/production-tracker"),
  financialVisibility: () => externalGet<{ items: unknown[]; note?: string | null }>("/financier/financial-visibility"),
  btbLiabilities: () => externalGet<{ items: unknown[]; note?: string | null }>("/financier/btb-liabilities"),
  inventoryOverview: (q?: { as_of_date?: string }) => {
    const p = new URLSearchParams();
    if (q?.as_of_date) p.set("as_of_date", q.as_of_date);
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<Record<string, unknown>>(`/financier/inventory-overview${s}`);
  },
  inventoryByGroup: (q?: { as_of_date?: string; btb_scope?: boolean }) => {
    const p = new URLSearchParams();
    if (q?.as_of_date) p.set("as_of_date", q.as_of_date);
    if (q?.btb_scope === true) p.set("btb_scope", "true");
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<Record<string, unknown>>(`/financier/inventory-by-group${s}`);
  },
  inventoryLedger: (q: {
    item_id?: number;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
    include_gl?: boolean;
  }) => {
    const p = new URLSearchParams();
    if (q.item_id != null) p.set("item_id", String(q.item_id));
    if (q.warehouse_id != null) p.set("warehouse_id", String(q.warehouse_id));
    if (q.date_from) p.set("date_from", q.date_from);
    if (q.date_to) p.set("date_to", q.date_to);
    if (q.limit != null) p.set("limit", String(q.limit));
    if (q.offset != null) p.set("offset", String(q.offset));
    if (q.include_gl === false) p.set("include_gl", "false");
    return externalGet<Record<string, unknown>>(`/financier/inventory-ledger?${p.toString()}`);
  },
  inventoryReconciliation: () => externalGet<Record<string, unknown>>("/financier/inventory-reconciliation"),
  inventoryBalanceSheet: () => externalGet<Record<string, unknown>>("/financier/inventory-balance-sheet"),
};
