/**
 * Manufacturing Intelligence Phase 2 API client (material allocation, plan changes, tentative demand,
 * people & machines). Backend: backend/app/modules/mfg_planning/ (allocation_router.py, planning_router.py,
 * assignments_router.py), prefix /api/v1/mfg-intelligence.
 *
 * Every endpoint returns 404 while its tenant flag is off. Quantities and minutes are decimal STRINGS:
 * send them back as strings and only format them for display (never float maths).
 */
import { request } from "@/api/core";

const BASE = "/api/v1/mfg-intelligence";

const post = <T>(path: string, body?: unknown) =>
  request<T>(`${BASE}${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(`${BASE}${path}`, { method: "PATCH", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(`${BASE}${path}`, { method: "PUT", body: JSON.stringify(body) });

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ------------------------------------------------------------------ materials (flag mfg_material_allocation_v1)
export type AllocationKind = "HARD_ATP" | "TENTATIVE";

export interface PegPlan {
  purchase_order_item_id: number;
  purchase_order_id: number;
  po_code: string;
  quantity: string;
  expected_date: string | null;
  eta_source: string;
}

export interface AllocationPlanLine {
  bom_item_id: number;
  item_id: number;
  item_name: string | null;
  category: string | null;
  uom: string | null;
  required_qty: string | null;
  requirement_source: string;
  issued_qty: string;
  held_qty: string;
  tentative_held_qty: string;
  pegged_qty: string;
  tentative_pegged_qty: string;
  shortfall_qty: string;
  hold_qty: string;
  pegs: PegPlan[];
  remaining_short_qty: string;
}

export interface AllocationPreview {
  order_id: number;
  order_code: string;
  order_status: string;
  kind: AllocationKind;
  expires_at: string | null;
  order_bom_id: number | null;
  order_bom_status: string | null;
  priority_rank: number;
  state_token: string;
  creates_anything: boolean;
  lines: AllocationPlanLine[];
  warnings: string[];
}

export interface MaterialHold {
  reservation_id: number;
  status: string;
  kind: string | null;
  source: string | null;
  item_id: number;
  bom_item_id: number | null;
  reserved_qty: string;
  consumed_qty: string | null;
  effective_qty: string | null;
  expires_at: string | null;
  lock_version: number;
  legacy: boolean;
}

export interface MaterialPeg {
  peg_id: number;
  kind: string;
  item_id: number;
  bom_item_id: number | null;
  purchase_order_item_id: number | null;
  po_code: string | null;
  pegged_qty: string;
  effective_qty: string | null;
  expected_date: string | null;
  eta_source: string | null;
  expires_at: string | null;
  lock_version: number;
}

export interface OrderAllocationState {
  order_id: number;
  order_code: string;
  order_status: string;
  order_bom_id: number | null;
  order_bom_status: string | null;
  order_bom_usable: boolean;
  default_kind: AllocationKind;
  priority_rank: number;
  priority_date: string | null;
  lines: AllocationPlanLine[];
  holds: MaterialHold[];
  pegs: MaterialPeg[];
}

export interface CreatedHold {
  reservation_id: number;
  item_id: number;
  bom_item_id: number | null;
  quantity: string;
  kind: AllocationKind;
}

export interface CreatedPeg {
  peg_id: number;
  purchase_order_item_id: number;
  po_code: string;
  item_id: number;
  quantity: string;
  expected_date: string | null;
  kind: string;
}

export interface AllocationConfirmResult {
  order_id: number;
  kind: AllocationKind;
  status: "ALLOCATED" | "NOOP";
  replayed: boolean;
  holds: CreatedHold[];
  pegs: CreatedPeg[];
  state_token: string;
  after: AllocationPreview;
}

export interface AllocationRunPreview {
  kind: AllocationKind;
  expires_at: string | null;
  state_token: string;
  truncated: boolean;
  orders: {
    order_id: number;
    order_code: string;
    skipped_code: string | null;
    skipped_message: string | null;
    preview: AllocationPreview | null;
  }[];
}

export interface AllocationRunConfirmResult {
  kind: AllocationKind;
  state_token: string;
  results: {
    order_id: number;
    status: "ALLOCATED" | "NOOP" | "SKIPPED";
    code: string | null;
    detail: string | null;
    holds: CreatedHold[];
    pegs: CreatedPeg[];
  }[];
}

export interface ReleaseResult {
  id: number;
  status: string;
  released_qty: string | null;
  remaining_qty: string | null;
  lock_version: number;
  changed: boolean;
}

export interface ReassignResult {
  from_reservation_id: number;
  from_order_id: number;
  to_reservation_id: number;
  to_order_id: number;
  item_id: number;
  kind: AllocationKind;
  quantity: string;
  source_remaining_qty: string;
}

export interface AllocationConflict {
  code: string;
  severity: string;
  order_id: number | null;
  order_code?: string | null;
  item_id: number | null;
  item_code?: string | null;
  item_name?: string | null;
  reservation_id: number | null;
  peg_id: number | null;
  quantity: string | null;
  detail: string;
}

export interface ItemAllocationAvailability {
  item_id: number;
  item_code: string | null;
  item_name: string | null;
  own_order_id: number | null;
  on_hand_qty: string;
  hard_reserved_qty: string;
  tentative_reserved_qty: string;
  on_order_net_qty: string;
  hard_pegged_qty: string;
  tentative_pegged_qty: string;
  free_inbound_qty: string;
  pending_qc_qty: string;
  pending_po_qty: string;
  earliest_expected_date: string | null;
  atp_hard_qty: string;
  atp_stressed_qty: string;
  holds: MaterialHold[];
  pegs: MaterialPeg[];
  po_lines: {
    purchase_order_item_id: number;
    po_code: string;
    ordered_qty: string;
    usable_received_qty: string;
    pending_qc_qty: string;
    on_order_net_qty: string;
    expected_date: string | null;
    eta_source: string;
  }[];
}

// ------------------------------------------------------------------ plan changes (flag mfg_integrated_planning_v1)
export type ReservationStatus = "DRAFT" | "SOFT_BOOKED" | "FIRM_BOOKED";
export type RevisionStatus = "PROPOSED" | "APPLIED" | "REJECTED" | "CANCELLED";

export interface LineBooking {
  id: number;
  line_id: number;
  line_code?: string | null;
  order_id: number | null;
  order_code: string | null;
  order_status: string | null;
  style_id: number | null;
  ob_id: number | null;
  shift_id: number | null;
  reservation_status: string;
  start_date: string;
  planned_end_date: string | null;
  planned_qty: string | null;
  completed_qty: string | null;
  operator_count: number;
  target_efficiency_pct: string | null;
  smv_per_piece: string | null;
  source_smv_type: string | null;
  lock_version: number;
  schedule_version: number;
}

export interface BookingsResponse {
  date_from: string;
  date_to: string;
  bookings: LineBooking[];
  tentative_bookings: TentativeBooking[];
  truncated: boolean;
  max_rows: number;
}

export interface RevisionItemInput {
  action: "CREATE" | "UPDATE" | "CANCEL";
  config_id?: number;
  line_id?: number;
  order_id?: number;
  style_id?: number;
  ob_id?: number;
  shift_id?: number;
  start_date?: string;
  planned_end_date?: string;
  planned_qty?: string;
  reservation_status?: ReservationStatus;
  operator_count?: number;
  target_efficiency_pct?: string;
}

export interface DeliveryView {
  band: string | null;
  likely_complete_date: string | null;
  delay_days: number | null;
  reason_codes: string[];
}

export interface RevisionImpact {
  window_start: string | null;
  window_end: string | null;
  orders_compared: number;
  deliveries: {
    order_id: number;
    order_code: string;
    target_date: string | null;
    before: DeliveryView;
    after: DeliveryView;
    likely_delta_days: number | null;
    band_changed: boolean;
  }[];
  overload: {
    line_id: number;
    line_code: string;
    overload_days_before: number;
    overload_days_after: number;
    newly_overloaded_dates: string[];
  }[];
  material_warnings: {
    order_id: number;
    order_code: string;
    material_status: string;
    materials_ready: boolean;
    expected_material_date: string | null;
    warning: string | null;
    reason_codes: string[];
  }[];
  summary: { orders_delayed_or_at_risk: number; lines_with_more_overload: number; material_warnings: number };
  notices: string[];
}

export interface RevisionPreviewItem {
  action: string;
  config_id: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  smv_per_piece: string | null;
  smv_source: string | null;
}

export interface RevisionPreview {
  items: RevisionPreviewItem[];
  impact: RevisionImpact;
}

export interface PlanRevision {
  id: number;
  revision_no: number | null;
  status: RevisionStatus | string;
  title: string | null;
  reason: string | null;
  request_id: string | null;
  proposed_by_user_id: number | null;
  proposed_by_name: string | null;
  proposed_at: string | null;
  decided_by_user_id: number | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
  impact: RevisionImpact | null;
  lock_version: number;
  can_approve: boolean;
  items?: {
    id: number;
    action: string;
    config_id: number | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    before_lock_version: number | null;
    applied_config_id: number | null;
    sort_order: number;
  }[];
  applied_now?: boolean;
  changed?: boolean;
}

// ------------------------------------------------------------------ tentative demand
export interface TentativeBooking {
  id: number;
  line_id: number;
  line_code: string | null;
  inquiry_id: number | null;
  inquiry_code: string | null;
  quotation_id: number | null;
  quotation_code: string | null;
  style_id: number | null;
  ob_id: number | null;
  shift_id: number | null;
  start_date: string;
  planned_end_date: string | null;
  planned_qty: string | null;
  smv_per_piece: string | null;
  smv_source: string | null;
  total_smv_minutes: string | null;
  confidence_pct: string | null;
  weighted_smv_minutes: string | null;
  expires_at: string | null;
  status: string;
  counted: boolean;
  not_counted_reason: string | null;
  converted_order_id: number | null;
  notes: string | null;
  lock_version: number;
  changed?: boolean;
}

export interface TentativeDemandResponse {
  items: TentativeBooking[];
  total: number;
  limit: number;
  offset: number;
  counted_count: number;
  counted_total_smv_minutes: string | null;
  counted_weighted_smv_minutes: string | null;
}

export interface TentativeCreateInput {
  line_id: number;
  inquiry_id?: number;
  quotation_id?: number;
  style_id?: number;
  ob_id?: number;
  shift_id?: number;
  start_date: string;
  planned_end_date?: string;
  planned_qty: string;
  confidence_pct?: string;
  expires_at?: string;
  notes?: string;
}

export interface TentativeUpdateInput {
  expected_lock_version?: number;
  line_id?: number;
  shift_id?: number;
  start_date?: string;
  planned_end_date?: string;
  planned_qty?: string;
  confidence_pct?: string;
  expires_at?: string;
  notes?: string;
}

export interface PlanningSettings {
  stage_probability: { INQUIRY: string | null; QUOTATION: string | null };
  tentative_default_expiry_days: number;
  receipt_buffer_days: number;
  is_default?: boolean;
  /** Phase 3 keys: present only while mfg_cost_intelligence_v1 or mfg_financial_readiness_v1 is on. */
  export_document_days?: number;
  export_usance_days?: number;
  btb_usance_days?: number;
  /** Decimal string (cost per minute) or null. Null + `cpm_override_hidden` when the user lacks the finance gate. */
  cpm_override?: string | null;
  cpm_override_hidden?: boolean;
  /** Phase 5 keys: present only while mfg_advanced_planning_v1 is on. Frozen zone 14-60 days, changeover loss 0-100 %. */
  frozen_horizon_days?: number;
  changeover_loss_pct?: number;
}

export interface PlanningSettingsInput {
  stage_probability?: { INQUIRY?: string | null; QUOTATION?: string | null };
  tentative_default_expiry_days?: number;
  receipt_buffer_days?: number;
  /** Phase 3 keys: need a Phase 3 flag, planning approve and the finance gate (else 403). */
  export_document_days?: number;
  export_usance_days?: number;
  btb_usance_days?: number;
  /** Decimal string > 0, or null to clear the override. */
  cpm_override?: string | null;
  /** Phase 5 keys: need mfg_advanced_planning_v1 (else 404) and planning approve. */
  frozen_horizon_days?: number;
  changeover_loss_pct?: number;
}

// ------------------------------------------------------------------ people & machines
export type AssignmentKind = "employees" | "machines";
export type AssignmentRole = "OPERATOR" | "HELPER" | "SUPERVISOR" | "QC" | "IRON" | "FINISHING";

interface AssignmentBase {
  id: number;
  sewing_line_id: number;
  line_code: string | null;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  notes: string | null;
  lock_version: number;
}

export interface EmployeeAssignment extends AssignmentBase {
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  shift_id: number | null;
  shift_code: string | null;
  role: AssignmentRole | string;
}

export interface MachineAssignment extends AssignmentBase {
  machine_id: number;
  machine_code: string | null;
  machine_name: string | null;
  machine_type: string | null;
}

export type LineAssignment = EmployeeAssignment | MachineAssignment;

export interface AssignmentList<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AssignmentListParams {
  line_id?: number;
  owner_id?: number;
  active_on?: string;
  include_inactive?: boolean;
  limit?: number;
  offset?: number;
}

export interface EmployeeAssignmentInput {
  employee_id: number;
  sewing_line_id: number;
  shift_id?: number;
  role: AssignmentRole;
  valid_from: string;
  valid_to?: string;
  notes?: string;
}

export interface MachineAssignmentInput {
  machine_id: number;
  sewing_line_id: number;
  valid_from: string;
  valid_to?: string;
  notes?: string;
}

export interface RouteStage {
  action_id: number;
  title: string | null;
  route_code: string | null;
  stage_kind: string | null;
  stage_position: string | null;
  gate_class: string | null;
  lead_time_days: number | null;
  status: string | null;
  planned_date: string | null;
  actual_completion_date: string | null;
  is_open: boolean;
}

export interface RouteStagesResponse {
  order_id: number;
  order_code: string;
  route_codes: string[];
  pre_sewing: RouteStage[];
  subcontract_sewing: RouteStage[];
  post_sewing: RouteStage[];
  pre_sewing_open_lead_time_days: number;
  post_sewing_open_lead_time_days: number;
  stages_without_lead_time: number[];
  assumptions: string[];
}

export type SmvSource = "OB" | "IE_STUDY" | "HISTORICAL" | "BUYER" | "ESTIMATE";
export type SmvConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface StyleStandardSmv {
  style_id: number;
  style_code: string | null;
  standard_smv: string | null;
  standard_smv_source: string | null;
  standard_smv_confidence: string | null;
  standard_smv_approved_by: number | null;
  standard_smv_approved_by_name?: string | null;
  standard_smv_updated_at: string | null;
  changed?: boolean;
}

/** UI hints from GET /planning-permissions. Every endpoint still checks permissions itself. */
export interface PlanningPermissions {
  can_propose: boolean;
  can_manage_tentative: boolean;
  can_manage_assignments: boolean;
  can_approve: boolean;
  can_manage_settings: boolean;
  can_edit_style_smv: boolean;
  can_allocate: boolean;
  is_admin_or_manager: boolean;
  four_eyes: boolean;
  /** Phase 3: may see money (cost at completion, cash requirement). Missing = no. */
  can_view_finance?: boolean;
}

export interface PlannerEmployeeOption {
  id: number;
  employee_code: string;
  employee_name: string;
}

export interface StyleStandardSmvInput {
  smv: string;
  source: SmvSource;
  confidence: SmvConfidence;
  reason: string;
}

export const mfgPlanningApi = {
  getPlanningPermissions(): Promise<PlanningPermissions> {
    return request<PlanningPermissions>(`${BASE}/planning-permissions`);
  },
  pickEmployees(q: string, limit = 20): Promise<{ items: PlannerEmployeeOption[] }> {
    return request(`${BASE}/planning-people/employees${query({ q: q || undefined, limit })}`);
  },
  // materials
  getOrderAllocation(orderId: number): Promise<OrderAllocationState> {
    return request<OrderAllocationState>(`${BASE}/orders/${orderId}/materials/allocation`);
  },
  allocatePreview(orderId: number, body: { kind: AllocationKind; expires_at?: string }): Promise<AllocationPreview> {
    return post<AllocationPreview>(`/orders/${orderId}/materials/allocate-preview`, body);
  },
  allocateConfirm(
    orderId: number,
    body: { kind: AllocationKind; expires_at?: string; state_token: string },
  ): Promise<AllocationConfirmResult> {
    return post<AllocationConfirmResult>(`/orders/${orderId}/materials/allocate-confirm`, body);
  },
  allocationRunPreview(body: { order_ids?: number[]; kind: AllocationKind; expires_at?: string }): Promise<AllocationRunPreview> {
    return post<AllocationRunPreview>("/materials/allocation-run/preview", body);
  },
  allocationRunConfirm(body: {
    order_ids?: number[];
    kind: AllocationKind;
    expires_at?: string;
    state_token: string;
  }): Promise<AllocationRunConfirmResult> {
    return post<AllocationRunConfirmResult>("/materials/allocation-run/confirm", body);
  },
  releaseReservation(
    id: number,
    body: { reason?: string; quantity?: string; expected_lock_version?: number },
  ): Promise<ReleaseResult> {
    return post<ReleaseResult>(`/materials/reservations/${id}/release`, body);
  },
  releasePeg(id: number, body: { reason?: string; expected_lock_version?: number }): Promise<ReleaseResult> {
    return post<ReleaseResult>(`/materials/peggings/${id}/release`, body);
  },
  reassign(body: { from_reservation_id: number; to_order_id: number; quantity: string; reason: string }): Promise<ReassignResult> {
    return post<ReassignResult>("/materials/reassign", body);
  },
  getConflicts(limit = 200): Promise<{ items: AllocationConflict[]; truncated: boolean }> {
    return request(`${BASE}/materials/conflicts${query({ limit })}`);
  },
  getItemAvailability(itemId: number, ownOrderId?: number | null): Promise<ItemAllocationAvailability> {
    return request<ItemAllocationAvailability>(`${BASE}/items/${itemId}/allocation-availability${query({ own_order_id: ownOrderId })}`);
  },

  // plan changes
  listBookings(p: { date_from: string; date_to: string; line_id?: number }): Promise<BookingsResponse> {
    return request<BookingsResponse>(`${BASE}/bookings${query(p)}`);
  },
  previewRevision(items: RevisionItemInput[]): Promise<RevisionPreview> {
    return post<RevisionPreview>("/plan-revisions/preview", { items });
  },
  proposeRevision(body: { items: RevisionItemInput[]; reason: string; title?: string; request_id?: string }): Promise<PlanRevision> {
    return post<PlanRevision>("/plan-revisions", body);
  },
  listRevisions(p: { status?: RevisionStatus; limit?: number; offset?: number } = {}): Promise<{ items: PlanRevision[]; total: number }> {
    return request(`${BASE}/plan-revisions${query(p)}`);
  },
  getRevision(id: number): Promise<PlanRevision> {
    return request<PlanRevision>(`${BASE}/plan-revisions/${id}`);
  },
  approveRevision(id: number, body: { expected_lock_version: number; decision_note?: string }): Promise<PlanRevision> {
    return post<PlanRevision>(`/plan-revisions/${id}/approve`, body);
  },
  rejectRevision(id: number, body: { decision_note: string }): Promise<PlanRevision> {
    return post<PlanRevision>(`/plan-revisions/${id}/reject`, body);
  },
  cancelRevision(id: number): Promise<PlanRevision> {
    return post<PlanRevision>(`/plan-revisions/${id}/cancel`);
  },

  // tentative demand
  getTentativeDemand(p: { status?: string; limit?: number; offset?: number } = {}): Promise<TentativeDemandResponse> {
    return request<TentativeDemandResponse>(`${BASE}/tentative-demand${query(p)}`);
  },
  createTentativeBooking(body: TentativeCreateInput): Promise<TentativeBooking> {
    return post<TentativeBooking>("/tentative-bookings", body);
  },
  updateTentativeBooking(id: number, body: TentativeUpdateInput): Promise<TentativeBooking> {
    return patch<TentativeBooking>(`/tentative-bookings/${id}`, body);
  },
  cancelTentativeBooking(id: number): Promise<TentativeBooking> {
    return post<TentativeBooking>(`/tentative-bookings/${id}/cancel`);
  },
  getPlanningSettings(): Promise<PlanningSettings> {
    return request<PlanningSettings>(`${BASE}/planning-settings`);
  },
  putPlanningSettings(body: PlanningSettingsInput): Promise<PlanningSettings> {
    return put<PlanningSettings>("/planning-settings", body);
  },

  // people & machines
  listAssignments<K extends AssignmentKind>(
    kind: K,
    p: AssignmentListParams = {},
  ): Promise<AssignmentList<K extends "employees" ? EmployeeAssignment : MachineAssignment>> {
    const { owner_id, ...rest } = p;
    const ownerKey = kind === "employees" ? "employee_id" : "machine_id";
    return request(`${BASE}/line-assignments/${kind}${query({ ...rest, [ownerKey]: owner_id })}`);
  },
  createEmployeeAssignment(body: EmployeeAssignmentInput): Promise<EmployeeAssignment> {
    return post<EmployeeAssignment>("/line-assignments/employees", body);
  },
  createMachineAssignment(body: MachineAssignmentInput): Promise<MachineAssignment> {
    return post<MachineAssignment>("/line-assignments/machines", body);
  },
  updateAssignment(kind: AssignmentKind, id: number, body: Record<string, unknown> & { expected_lock_version: number }): Promise<LineAssignment> {
    return patch<LineAssignment>(`/line-assignments/${kind}/${id}`, body);
  },
  endAssignment(kind: AssignmentKind, id: number, body: { expected_lock_version: number; valid_to: string }): Promise<LineAssignment> {
    return post<LineAssignment>(`/line-assignments/${kind}/${id}/end`, body);
  },
  deactivateAssignment(kind: AssignmentKind, id: number, body: { expected_lock_version: number; reason?: string }): Promise<LineAssignment> {
    return post<LineAssignment>(`/line-assignments/${kind}/${id}/deactivate`, body);
  },
  getRouteStages(orderId: number): Promise<RouteStagesResponse> {
    return request<RouteStagesResponse>(`${BASE}/route-stages${query({ order_id: orderId })}`);
  },
  getStyleSmv(styleId: number): Promise<StyleStandardSmv> {
    return request<StyleStandardSmv>(`${BASE}/styles/${styleId}/standard-smv`);
  },
  putStyleSmv(styleId: number, body: StyleStandardSmvInput): Promise<StyleStandardSmv> {
    return put<StyleStandardSmv>(`/styles/${styleId}/standard-smv`, body);
  },
};
