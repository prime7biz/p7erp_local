/**
 * Inbound Job Work (CMT) API.
 * Backend: backend/app/modules/job_work/ — flag inbound_job_work_v1 (default OFF).
 * Money and qty are decimal strings — display only; never float maths.
 */
import { request, requestWithTotal } from "@/api/core";

const BASE = "/api/v1/job-work";

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export type JobWorkContractListItem = {
  id: number;
  contract_no: string;
  customer_id: number;
  customer_name: string | null;
  status: string;
  cm_rate: string;
  currency: string;
  do_cutting: boolean;
  do_sewing: boolean;
  do_finishing: boolean;
  qty_ordered_total: string;
  qty_produced_total: string;
  qty_delivered_accepted: string;
  qty_billed: string;
  amount_billed: string;
  amount_received: string;
  contract_date: string | null;
  created_at: string;
};

export type JobWorkDeliverable = {
  id: number;
  style_ref: string | null;
  color: string | null;
  size: string | null;
  qty_ordered: string;
  qty_produced: string;
  qty_delivered: string;
  qty_rejected: string;
  notes: string | null;
};

export type JobWorkMaterial = {
  id: number;
  item_id: number;
  consumption_per_unit: string;
  qty_planned: string;
  qty_received: string;
  qty_consumed: string;
  qty_returned: string;
  qty_remaining: string;
  notes: string | null;
};

export type JobWorkContractDetail = {
  id: number;
  contract_no: string;
  customer_id: number;
  customer_name: string | null;
  status: string;
  cm_rate: string;
  currency: string;
  exchange_rate_default: string;
  vat_rate_pct: string;
  do_cutting: boolean;
  do_sewing: boolean;
  do_finishing: boolean;
  location_label: string | null;
  contract_date: string | null;
  due_date: string | null;
  notes: string | null;
  qty_ordered_total: string;
  qty_produced_total: string;
  qty_delivered_accepted: string;
  qty_rejected_total: string;
  qty_billed: string;
  amount_billed: string;
  amount_received: string;
  billable_qty: string;
  deliverables: JobWorkDeliverable[];
  materials: JobWorkMaterial[];
  created_at: string;
  updated_at: string;
};

export type JobWorkDelivery = {
  id: number;
  delivery_no: string;
  delivery_date: string;
  reference_doc: string | null;
  notes: string | null;
  qty_delivered: string;
  qty_rejected: string;
  qty_accepted: string;
  lines: Array<{
    id: number;
    deliverable_id: number | null;
    style_ref: string | null;
    color: string | null;
    size: string | null;
    qty_delivered: string;
    qty_rejected: string;
  }>;
  created_at: string;
};

export type JobWorkBill = {
  id: number;
  bill_no: string;
  bill_date: string;
  qty_billed: string;
  cm_rate: string;
  currency: string;
  exchange_rate: string;
  vat_rate_pct: string;
  vat_amount: string;
  net_amount: string;
  gross_amount: string;
  amount_received: string;
  status: string;
  voucher_id: number | null;
  outstanding_bill_id: number | null;
  notes: string | null;
  created_at: string;
};

export type JobWorkReceipt = {
  id: number;
  bill_id: number;
  receipt_no: string;
  receipt_date: string;
  amount: string;
  currency: string;
  exchange_rate: string;
  cash_or_bank_account_id: number;
  status: string;
  voucher_id: number | null;
  notes: string | null;
  created_at: string;
};

export type JobWorkCloseReport = {
  can_close: boolean;
  blockers: string[];
  warnings: string[];
  materials_remaining: string;
  open_ar: string;
  variance_notes: string[];
};

export type JobWorkContractCreate = {
  customer_id: number;
  cm_rate: string;
  currency?: string;
  exchange_rate_default?: string;
  vat_rate_pct?: string;
  do_cutting?: boolean;
  do_sewing?: boolean;
  do_finishing?: boolean;
  location_label?: string | null;
  contract_date?: string | null;
  due_date?: string | null;
  notes?: string | null;
  deliverables?: Array<{
    style_ref?: string | null;
    color?: string | null;
    size?: string | null;
    qty_ordered?: string;
    notes?: string | null;
  }>;
  materials?: Array<{
    item_id: number;
    consumption_per_unit?: string;
    qty_planned?: string;
    notes?: string | null;
  }>;
};

export const jobWorkApi = {
  listContracts: (params?: { status?: string; q?: string; limit?: number; offset?: number }) =>
    requestWithTotal<JobWorkContractListItem>(`${BASE}/contracts${query(params ?? {})}`),
  getContract: (id: number) => request<JobWorkContractDetail>(`${BASE}/contracts/${id}`),
  createContract: (body: JobWorkContractCreate) =>
    request<JobWorkContractDetail>(`${BASE}/contracts`, { method: "POST", body: JSON.stringify(body) }),
  updateContract: (id: number, body: Partial<JobWorkContractCreate>) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  confirmContract: (id: number) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/confirm`, { method: "POST" }),
  receiveMaterial: (id: number, body: { material_id: number; qty: string; doc_no?: string; note?: string }) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/materials/receive`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  consumeMaterial: (id: number, body: { material_id: number; qty: string; note?: string }) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/materials/consume`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  returnMaterial: (id: number, body: { material_id: number; qty: string; note?: string }) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/materials/return`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  produce: (id: number, lines: Array<{ deliverable_id: number; qty_produced: string }>) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/produce`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),
  listDeliveries: (id: number) => request<JobWorkDelivery[]>(`${BASE}/contracts/${id}/deliveries`),
  createDelivery: (
    id: number,
    body: {
      delivery_date?: string;
      reference_doc?: string;
      notes?: string;
      lines: Array<{
        deliverable_id?: number | null;
        style_ref?: string | null;
        color?: string | null;
        size?: string | null;
        qty_delivered: string;
        qty_rejected?: string;
      }>;
    },
  ) =>
    request<JobWorkDelivery>(`${BASE}/contracts/${id}/deliveries`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  printDelivery: (contractId: number, deliveryId: number) =>
    request<Record<string, unknown>>(`${BASE}/contracts/${contractId}/deliveries/${deliveryId}/print`),
  listBills: (id: number) => request<JobWorkBill[]>(`${BASE}/contracts/${id}/bills`),
  createBill: (
    id: number,
    body?: { qty_billed?: string; vat_rate_pct?: string; exchange_rate?: string; request_id?: string; notes?: string },
  ) =>
    request<JobWorkBill>(`${BASE}/contracts/${id}/bills`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  cancelBill: (contractId: number, billId: number) =>
    request<JobWorkBill>(`${BASE}/contracts/${contractId}/bills/${billId}/cancel`, { method: "POST" }),
  listReceipts: (id: number) => request<JobWorkReceipt[]>(`${BASE}/contracts/${id}/receipts`),
  createReceipt: (
    id: number,
    body: {
      bill_id: number;
      amount: string;
      cash_or_bank_account_id: number;
      exchange_rate?: string;
      request_id?: string;
      notes?: string;
    },
  ) =>
    request<JobWorkReceipt>(`${BASE}/contracts/${id}/receipts`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  closePreview: (id: number) => request<JobWorkCloseReport>(`${BASE}/contracts/${id}/close-preview`),
  closeContract: (id: number) =>
    request<JobWorkContractDetail>(`${BASE}/contracts/${id}/close`, { method: "POST" }),
};
