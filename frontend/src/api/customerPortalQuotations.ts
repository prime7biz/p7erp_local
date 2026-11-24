import { externalGet, externalPost } from "@/api/externalClient";

/**
 * Customer portal quotations (backend `external_access/customer_portal/quotations.py`).
 * BUYER FIELDS ONLY: never add cost, margin, commission, notes or internal ids here.
 * Money is a decimal string.
 */
export interface PortalQuotation {
  id: number;
  quotation_code: string;
  version_no: number;
  status: string;
  style_ref: string | null;
  quantity: number | null;
  quoted_unit_price: string | null;
  total_amount: string | null;
  currency: string | null;
  valid_until: string | null;
  my_last_response: PortalQuotationResponseType | null;
}

export type PortalQuotationResponseType = "ACCEPT" | "REQUEST_REVISION";

export interface PortalQuotationList {
  items: PortalQuotation[];
  total: number;
}

export interface PortalQuotationResponseResult {
  id: number;
  quotation_id: number;
  response_type: string;
  note: string | null;
  created_at: string;
  replayed: boolean;
}

/** Tenant flag name, as read from `me.feature_flags` (strict `true`). */
export const PORTAL_QUOTATIONS_FLAG = "customer_portal_quotations_enabled";

export function portalQuotationsEnabled(flags: Record<string, unknown> | null | undefined): boolean {
  return flags?.[PORTAL_QUOTATIONS_FLAG] === true;
}

/** 8-32 safe characters, made once per dialog so a double click is a replay, not a second answer. */
export function newPortalRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const customerPortalQuotationsApi = {
  list: (q?: { limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (q?.limit != null) p.set("limit", String(q.limit));
    if (q?.offset != null) p.set("offset", String(q.offset));
    const s = p.toString() ? `?${p.toString()}` : "";
    return externalGet<PortalQuotationList>(`/customer/quotations${s}`);
  },
  get: (id: number) => externalGet<PortalQuotation>(`/customer/quotations/${id}`),
  respond: (id: number, body: { response_type: PortalQuotationResponseType; note?: string | null; request_id: string }) =>
    externalPost<PortalQuotationResponseResult>(`/customer/quotations/${id}/response`, body),
};
