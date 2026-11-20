/**
 * Fixed-class authority inbox + change requests (user_authority_classes_v1).
 * Merged into `api` in `api/client.ts`.
 */
import { request } from "@/api/core";

export type AuthorityInboxCounts = {
  verify: number;
  recommend: number;
  approve: number;
  class1_pending: number;
  change_requests: number;
};

export type AuthorityInboxItem = {
  kind: string;
  id: number;
  number: string;
  date: string;
  status: string;
  href?: string;
  actions?: string[];
  current_step?: string;
  resource_type?: string;
  reason?: string;
  before_snapshot?: Record<string, unknown> | null;
  proposed_snapshot?: Record<string, unknown> | null;
};

export type AuthorityChangeRequestRow = {
  id: number;
  request_id: string;
  module_code: string;
  resource_type: string;
  resource_id: number | null;
  action: string;
  status: string;
  current_step: string;
  before_snapshot?: Record<string, unknown> | null;
  proposed_snapshot?: Record<string, unknown> | null;
  reason: string;
  failure_reason?: string | null;
  created_by?: number | null;
  created_at?: string;
};

export type AuthorityInboxResponse = {
  authority_classes_enabled: boolean;
  authority_class?: string | null;
  counts: AuthorityInboxCounts;
  waiting_for_me: AuthorityInboxItem[];
  my_requests: AuthorityChangeRequestRow[];
};

export const authorityInboxApi = {
  getAuthorityInbox: (params?: { limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<AuthorityInboxResponse>(`/api/v1/authority/inbox${qs ? `?${qs}` : ""}`);
  },

  listAuthorityChangeRequests: (params?: { scope?: string; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params?.scope) q.set("scope", params.scope);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    return request<{ items: AuthorityChangeRequestRow[] }>(
      `/api/v1/authority/change-requests${qs ? `?${qs}` : ""}`,
    );
  },

  createAuthorityChangeRequest: (body: {
    request_id?: string;
    module_code?: string;
    resource_type: string;
    resource_id?: number | null;
    action: string;
    proposed_snapshot: Record<string, unknown>;
    reason: string;
  }) =>
    request<AuthorityChangeRequestRow>("/api/v1/authority/change-requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  decideAuthorityChangeRequest: (
    requestPk: number,
    body: { decision: string; note?: string | null },
  ) =>
    request<AuthorityChangeRequestRow>(`/api/v1/authority/change-requests/${requestPk}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
