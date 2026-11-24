/**
 * HR voucher-style class requests (Class 3/4 enter → Class 2 recommend → Class 1 approve).
 * Active when tenants.feature_flags.user_authority_classes_v1 is ON.
 */
import { request } from "@/api/core";

export type HrClassRequestKind =
  | "NEW_EMPLOYEE"
  | "LEAVE"
  | "INCREMENT"
  | "PROMOTION"
  | "CORRECTION"
  | "RESIGNATION"
  | "DISCONTINUE"
  | "WARNING"
  | "BULK_INCREMENT"
  | "CONFIRMATION";

export type HrClassRequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "RECOMMENDED"
  | "RETURNED"
  | "APPLYING"
  | "APPROVED"
  | "APPLIED"
  | "REJECTED"
  | "CANCELLED"
  | "FAILED";

export type HrSystemAccessMode = "NONE" | "ESS_ONLY" | "ERP_USER";

export type HrClassRequestRow = {
  id: number;
  request_no: string;
  request_id: string;
  source: "HR_ENTRY" | "ESS";
  kind: HrClassRequestKind;
  status: HrClassRequestStatus;
  employee_id: number | null;
  reason: string;
  revision: number;
  payload: Record<string, unknown>;
  before: Record<string, unknown>;
  entered_by: number | null;
  recommended_by: number | null;
  approved_by: number | null;
  recommend_is_auto: boolean;
  failure_reason: string | null;
  settlement_status: string | null;
  leave_request_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type HrClassRequestDecision = {
  decision: "RECOMMEND" | "RETURN" | "APPROVE" | "REJECT";
  note?: string;
};

export type HrClassRequestSubmitBody = {
  request_id: string;
  kind: HrClassRequestKind;
  reason: string;
  employee_id?: number | null;
  payload: Record<string, unknown>;
  source?: "HR_ENTRY" | "ESS";
};

function qs(params?: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const hrClassRequestsApi = {
  list(params?: {
    status?: string;
    kind?: string;
    employee_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<HrClassRequestRow[]> {
    return request(`/api/v1/hr/class-requests${qs(params)}`);
  },
  get(id: number): Promise<HrClassRequestRow> {
    return request(`/api/v1/hr/class-requests/${id}`);
  },
  /** Create draft (or replay request_id). Call submitWorkflow for Class 2 auto-recommend path. */
  create(body: HrClassRequestSubmitBody): Promise<HrClassRequestRow> {
    return request("/api/v1/hr/class-requests", { method: "POST", body: JSON.stringify(body) });
  },
  /** Create then submit in one UX step (matches HR Requests "Submit request"). */
  async submit(body: HrClassRequestSubmitBody): Promise<HrClassRequestRow> {
    const created = await this.create(body);
    if (created.status !== "DRAFT" && created.status !== "RETURNED") return created;
    return this.submitWorkflow(created.id);
  },
  submitWorkflow(id: number): Promise<HrClassRequestRow> {
    return request(`/api/v1/hr/class-requests/${id}/submit`, { method: "POST", body: "{}" });
  },
  resubmit(id: number, body?: { payload?: Record<string, unknown>; reason?: string }): Promise<HrClassRequestRow> {
    return request(`/api/v1/hr/class-requests/${id}/resubmit`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    });
  },
  decide(id: number, body: HrClassRequestDecision): Promise<HrClassRequestRow> {
    const path =
      body.decision === "RECOMMEND"
        ? "recommend"
        : body.decision === "RETURN"
          ? "return"
          : body.decision === "APPROVE"
            ? "approve"
            : "reject";
    return request(`/api/v1/hr/class-requests/${id}/${path}`, {
      method: "POST",
      body: JSON.stringify({ note: body.note || null }),
    });
  },
  cancel(id: number, note?: string): Promise<HrClassRequestRow> {
    return request(`/api/v1/hr/class-requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ note: note || null }),
    });
  },
  retryApply(id: number): Promise<HrClassRequestRow> {
    return request(`/api/v1/hr/class-requests/${id}/retry`, { method: "POST", body: "{}" });
  },
  preview(body: {
    kind: HrClassRequestKind;
    employee_id?: number;
    payload: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return request("/api/v1/hr/class-requests/preview", { method: "POST", body: JSON.stringify(body) });
  },
};
