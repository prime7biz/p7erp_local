import { externalGet, externalPost } from "@/api/externalClient";

/** Customer portal API calls (Bearer + X-Tenant-Id from external session). */
export const customerPortalApi = {
  dashboard: () => externalGet<Record<string, unknown>>("/customer/dashboard"),
  orders: (q?: { limit?: number; offset?: number; search?: string }) => {
    const p = new URLSearchParams();
    if (q?.limit != null) p.set("limit", String(q.limit));
    if (q?.offset != null) p.set("offset", String(q.offset));
    if (q?.search) p.set("search", q.search);
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<{ items: unknown[]; total: number }>(`/customer/orders${s}`);
  },
  order: (id: number) => externalGet<Record<string, unknown>>(`/customer/orders/${id}`),
  approvals: (id: number) => externalGet<unknown[]>(`/customer/orders/${id}/approvals`),
  approvalsAll: () => externalGet<unknown[]>("/customer/approvals"),
  production: (id: number) => externalGet<Record<string, unknown>>(`/customer/orders/${id}/production`),
  shipmentsOrder: (id: number) => externalGet<unknown[]>(`/customer/orders/${id}/shipments`),
  shipments: () => externalGet<unknown[]>("/customer/shipments"),
  notes: (q?: { entity_type?: string; entity_id?: number }) => {
    const p = new URLSearchParams();
    if (q?.entity_type) p.set("entity_type", q.entity_type);
    if (q?.entity_id != null) p.set("entity_id", String(q.entity_id));
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<{ items: unknown[]; total: number }>(`/customer/notes${s}`);
  },
  createNote: (body: { entity_type: string; entity_id: number; body: string }) =>
    externalPost<unknown>("/customer/notes", body),
};
