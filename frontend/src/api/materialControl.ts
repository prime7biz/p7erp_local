/** Material Control hub API (tenant flag `material_control_hub_v1`). */
import { request } from "@/api/core";

export type ActionQueueKind =
  | "GRN_DRAFT"
  | "GRN_UNBILLED"
  | "VENDOR_BILL_DRAFT"
  | "PO_OPEN"
  | "PMI_DRAFT";

export interface ActionQueueItem {
  kind: ActionQueueKind;
  severity: "info" | "warn" | "urgent";
  title: string;
  detail?: string | null;
  href: string;
  record_id: number;
  record_code?: string | null;
  as_of_date?: string | null;
}

export interface ActionQueueResponse {
  items: ActionQueueItem[];
  truncated: boolean;
}

export interface StyleListRow {
  style_id: number;
  style_code: string;
  style_name?: string | null;
  order_count: number;
}

export interface ChainHealthNode {
  count: number;
  latest_id?: number | null;
  latest_code?: string | null;
}

export interface StyleChainHealth {
  inquiries: ChainHealthNode;
  quotations: ChainHealthNode;
  orders: ChainHealthNode;
  boms: ChainHealthNode;
  proforma_invoices: ChainHealthNode;
  master_contracts: ChainHealthNode;
  btb_lcs: ChainHealthNode;
}

export interface StyleControlSheet {
  style_id: number;
  style_code: string;
  style_name?: string | null;
  counts: {
    orders: number;
    open_pos: number;
    received_grns: number;
    unbilled_grns: number;
    pmi_issued: number;
    pmi_draft: number;
  };
  chain_health?: StyleChainHealth;
  orders: Array<{
    order_id: number;
    order_code: string;
    status?: string | null;
    delivery_date?: string | null;
    quantity?: number | null;
  }>;
}

export interface GenealogyResponse {
  lot_number: string;
  grn_line_count: number;
  movements: Array<{
    id: number;
    movement_type?: string | null;
    quantity?: string | null;
    item_id?: number | null;
    warehouse_id?: number | null;
    reference_type?: string | null;
    reference_id?: number | null;
    movement_date?: string | null;
    lot_number?: string | null;
    order_id?: number | null;
  }>;
}

const BASE = "/api/v1/material-control";

export function fetchMaterialActions() {
  return request<ActionQueueResponse>(`${BASE}/actions`);
}

export function fetchMaterialStyles(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const qs = q.toString();
  return request<{ items: StyleListRow[] }>(`${BASE}/styles${qs ? `?${qs}` : ""}`);
}

export function fetchStyleControlSheet(styleId: number) {
  return request<StyleControlSheet>(`${BASE}/styles/${styleId}/control-sheet`);
}

export function fetchMaterialGenealogy(lotNumber: string) {
  const q = new URLSearchParams({ lot_number: lotNumber });
  return request<GenealogyResponse>(`${BASE}/genealogy?${q}`);
}

export interface LeakWatchlist {
  aging_remnants?: { count: number; fifo_value: string; cutoff_days: number };
  unbilled_grni?: { count: number };
  overbuy_vs_bom?: { status: string; count?: number; items?: unknown[]; detail?: string };
  qc_reject_unclaimed?: { status: string; count?: number; detail?: string };
  process_loss_over_std?: { status: string; count?: number; items?: unknown[]; detail?: string };
}

export function fetchLeakWatchlist() {
  return request<LeakWatchlist>(`${BASE}/watchlist`);
}

export function postAllocation(body: {
  cost_layer_id: number;
  qty: string;
  order_id?: number | null;
  style_id?: number | null;
  colorway_id?: number | null;
  request_id?: string | null;
}) {
  return request<{ id: number; status: string }>(`${BASE}/allocations`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postLeftoverReturn(body: {
  item_id: number;
  warehouse_id: number;
  qty: string;
  order_id?: number | null;
  style_id?: number | null;
  cost_layer_id?: number | null;
  unit_cost?: string | null;
  request_id?: string | null;
  notes?: string | null;
}) {
  return request<{ id: number; status: string }>(`${BASE}/leftover-returns`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postBondTransfer(body: {
  contract_id: number;
  lines: Array<{ material_id: number; qty: string; notes?: string | null }>;
  request_id?: string | null;
  notes?: string | null;
}) {
  return request<{ id: number; transfer_no: string; status: string }>(`${BASE}/bond-transfers`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postPrincipalClaim(body: {
  customer_id: number;
  amount: string;
  contract_id?: number | null;
  currency?: string;
  notes?: string | null;
  request_id?: string | null;
}) {
  return request<{ id: number; claim_no: string; status: string }>(`${BASE}/principal-claims`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postRtv(body: {
  vendor_id: number;
  warehouse_id: number;
  lines: Array<{ item_id: number; qty: string; unit_cost?: string | null; notes?: string | null }>;
  request_id?: string | null;
  notes?: string | null;
}) {
  return request<{ id: number; rtv_no: string; status: string }>(`${BASE}/rtv`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface MaterialRollRow {
  id: number;
  roll_code: string;
  item_id: number;
  warehouse_id: number;
  shade_band?: string | null;
  width_cm?: string | null;
  qty: string;
  qty_remaining: string;
  status: string;
}

export function postMaterialRoll(body: {
  item_id: number;
  warehouse_id: number;
  qty: string;
  shade_band?: string | null;
  width_cm?: string | null;
  lot_number?: string | null;
  grn_item_id?: number | null;
  cost_layer_id?: number | null;
  style_id?: number | null;
  colorway_id?: number | null;
  notes?: string | null;
  request_id?: string | null;
}) {
  return request<MaterialRollRow>(`${BASE}/rolls`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMaterialRolls(params?: {
  item_id?: number;
  warehouse_id?: number;
  shade_band?: string;
  available_only?: boolean;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.item_id != null) q.set("item_id", String(params.item_id));
  if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
  if (params?.shade_band) q.set("shade_band", params.shade_band);
  if (params?.available_only === false) q.set("available_only", "false");
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<{ items: MaterialRollRow[] }>(`${BASE}/rolls${qs ? `?${qs}` : ""}`);
}

export interface LandedCostDoc {
  id: number;
  doc_no: string;
  goods_receiving_id: number;
  status: string;
  total_amount: string;
  currency: string;
}

export function postLandedCost(body: {
  goods_receiving_id: number;
  lines: Array<{ cost_kind: string; amount: string; notes?: string | null }>;
  currency?: string;
  notes?: string | null;
  request_id?: string | null;
}) {
  return request<LandedCostDoc>(`${BASE}/landed-costs`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function allocateLandedCost(docId: number, creditAccountId: number) {
  return request<LandedCostDoc>(`${BASE}/landed-costs/${docId}/allocate`, {
    method: "POST",
    body: JSON.stringify({ credit_account_id: creditAccountId }),
  });
}

export interface ThreeWayExceptionRow {
  grn_id: number;
  grn_code: string;
  status: string;
  purchase_order_id?: number | null;
  vendor_id?: number | null;
  bill_count: number;
  line_count: number;
  href: string;
}

export function fetchThreeWayMatchExceptions(limit?: number) {
  const q = new URLSearchParams();
  if (limit != null) q.set("limit", String(limit));
  const qs = q.toString();
  return request<{ items: ThreeWayExceptionRow[]; warn_only: boolean; truncated: boolean }>(
    `${BASE}/three-way-match${qs ? `?${qs}` : ""}`,
  );
}

export interface ThreeWayMatchDetail {
  grn_id: number;
  grn_code: string;
  status: string;
  warn_only: boolean;
  bills: Array<{ id: number; bill_code: string; status: string; total_amount: string }>;
  lines: Array<{
    grn_item_id: number;
    item_id: number;
    po_qty: string;
    grn_accepted_qty: string;
    bill_qty: string;
    grn_value: string;
    bill_value: string;
    status: string;
    flags: string[];
  }>;
}

export function fetchThreeWayMatchDetail(grnId: number) {
  return request<ThreeWayMatchDetail>(`${BASE}/three-way-match/${grnId}`);
}
