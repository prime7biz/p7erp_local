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
};
