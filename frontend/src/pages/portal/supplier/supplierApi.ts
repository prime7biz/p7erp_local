import { externalGet, externalPost } from "@/api/externalClient";

export interface SupplierPo {
  id: number;
  po_code: string;
  vendor_name: string | null;
  status: string;
  order_date: string | null;
  expected_date: string | null;
  currency: string | null;
  total_amount: string;
  supplier_status: "CONFIRMED" | "DECLINED" | null;
  promised_ship_date: string | null;
}

export interface SupplierDashboard {
  vendor_names: string[];
  open_po_count: number;
  awaiting_confirmation_count: number;
  due_next_14_days: number;
  overdue_count: number;
  recent: SupplierPo[];
}

export interface SupplierPoDetail extends SupplierPo {
  lines: {
    item_code: string | null;
    item_name: string | null;
    ordered_qty: string;
    unit_price: string;
    line_total: string;
    accepted_received_qty: string;
    pending_qty: string;
  }[];
  receipts: { grn_code: string; received_date: string | null; status: string }[];
  updates: { id: number; kind: string; expected_ship_date: string | null; message: string | null; created_at: string; by_supplier: boolean }[];
  can_respond: boolean;
}

export type SupplierUpdateKind = "CONFIRMED" | "DECLINED" | "SHIP_DATE" | "NOTE";

export const supplierApi = {
  dashboard: () => externalGet<SupplierDashboard>("/supplier/dashboard"),
  purchaseOrders: (status: "open" | "all") =>
    externalGet<{ items: SupplierPo[]; total: number }>(`/supplier/purchase-orders?status=${status}&limit=200`),
  purchaseOrder: (id: number) => externalGet<SupplierPoDetail>(`/supplier/purchase-orders/${id}`),
  postUpdate: (id: number, body: { kind: SupplierUpdateKind; expected_ship_date?: string | null; message?: string | null }) =>
    externalPost(`/supplier/purchase-orders/${id}/updates`, body),
};

export const fmtMoney = (v: string | number, currency?: string | null) =>
  `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;

export const SUPPLIER_STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  DECLINED: "Declined",
  SHIP_DATE: "Ship date",
  NOTE: "Note",
};
