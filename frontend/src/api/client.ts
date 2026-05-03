import type {
  CustomerExtractionResponse,
  InquiryExtractionResponse,
  VendorExtractionResponse,
} from "../types/extraction";
import type {
  ExternalAccessOverview,
  ExternalAuditListResponse,
  ExternalFeatureFlagsPatch,
  ExternalInviteResponse,
  ExternalPrincipalAdminRow,
  ExternalPrincipalListResponse,
} from "@/types/externalAccess";
import { parseFastApiErrorDetail } from "@/utils/fastApiDetail";

/**
 * Docker main UI is served on :5173 with nginx proxying `/api` to the backend. If an older build
 * inlined `http://localhost:8000`, the browser would cross-call :8000 and often show a misleading
 * CORS error when the connection drops. Force same-origin `/api` for that case.
 */
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
  if (typeof window === "undefined") return configured;
  const { hostname, port } = window.location;
  if ((hostname !== "localhost" && hostname !== "127.0.0.1") || port !== "5173") return configured;
  if (!configured) return configured;
  try {
    const u = new URL(configured);
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.port === "8000") {
      return "";
    }
  } catch {
    if (configured.startsWith("/")) return configured;
  }
  return configured;
}

const API_BASE = resolveApiBase();
export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

export type TenantType = "manufacturer" | "buying_house" | "both";
export type CommissionMode = "INCLUDE" | "EXCLUDE";

export interface MeResponse {
  user_id: number;
  tenant_id: number;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  tenant_name: string;
  tenant_type: TenantType;
  company_code: string | null;
  /** Optional tenant toggles, e.g. { trade_enabled: false } */
  feature_flags?: Record<string, boolean | string | number | null> | null;
  role_name: string;
  role_permissions: Record<string, unknown>;
}

export interface ResolveTenantResponse {
  tenant_id: number;
  tenant_name: string;
  company_code: string | null;
  logo_url: string | null;
  available_roles: string[];
}

export interface PermissionsSubmoduleApi {
  id: string;
  label: string;
  levels: string[];
}

export interface PermissionsModuleApi {
  id: string;
  label: string;
  access_key: string | null;
  submodules: PermissionsSubmoduleApi[];
}

export interface GovernanceToggleKeyApi {
  key: string;
  label: string;
  group: string;
}

export interface PermissionsRegistryResponse {
  modules: PermissionsModuleApi[];
  /** Optional boolean keys (e.g. material-control governance) edited as checkboxes on Roles. */
  governance_toggle_keys?: GovernanceToggleKeyApi[];
}

export interface StaffInviteRowResponse {
  id: number;
  tenant_id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role_id: number;
  role_name: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface StaffInviteCreateResponse {
  invitation: StaffInviteRowResponse;
  invite_token_plain?: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  tenant_id?: number; // Set by backend when logging in so we can set X-Tenant-Id
}

export interface ActiveAnnouncementItem {
  id: number;
  title: string;
  content: string;
  type: string;
}

export interface PlatformHealthResponse {
  status: string;
  environment: string;
  version: string;
  components: {
    api: string;
    database: string;
    redis: string;
  };
  latency_ms: number;
  timestamp: string;
}

export async function getActiveAnnouncements(): Promise<{ items: ActiveAnnouncementItem[] }> {
  return request<{ items: ActiveAnnouncementItem[] }>("/api/v1/announcements/active");
}

export async function getPlatformHealth(): Promise<PlatformHealthResponse> {
  return requestPublic<PlatformHealthResponse>("/health");
}

/** Platform (P7) support — tenant portal tickets to the operations team. */
export type PlatformSupportTicketItem = {
  id: number;
  tenant_id: number | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  source: string;
  sla_first_response_due_at: string | null;
  sla_resolution_due_at: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PlatformSupportTicketMessage = {
  id: number;
  ticket_id: number;
  author_type: string;
  author_id: number;
  content: string;
  created_at: string | null;
};

export type PlatformSupportTicketDetail = PlatformSupportTicketItem & {
  messages: PlatformSupportTicketMessage[];
};

export interface TenantResponse {
  id: number;
  name: string;
  domain: string | null;
  tenant_type: TenantType;
  company_code: string | null;
  is_active: boolean;
  allow_negative_stock?: boolean;
  default_rm_warehouse_id?: number | null;
  default_fg_warehouse_id?: number | null;
}

export interface TenantInventoryPatch {
  allow_negative_stock?: boolean;
  default_rm_warehouse_id?: number | null;
  default_fg_warehouse_id?: number | null;
}

export interface SettingsConfigResponse {
  tenant_id: number;
  company_name: string;
  company_code: string | null;
  domain: string | null;
  logo: string | null;
  tenant_type: TenantType;
  default_commission_mode?: CommissionMode | null;
  is_active: boolean;
  feature_flags?: Record<string, boolean | string | number | null> | null;
  country_code?: string | null;
  timezone?: string | null;
}

export interface SettingsConfigUpdate {
  company_name: string;
  domain?: string | null;
  logo?: string | null;
  tenant_type: TenantType;
  default_commission_mode?: CommissionMode | null;
  feature_flags?: Record<string, boolean | string | number | null> | null;
  country_code?: string | null;
  timezone?: string | null;
}

/** POST /api/v1/billing/lemonsqueezy/checkout */
export interface LemonSqueezyCheckoutResponse {
  checkout_url: string;
}

export interface FactoryCalendarOverrideRow {
  id: number;
  override_date: string;
  override_type: string;
  name: string | null;
  notes: string | null;
  category?: string | null;
  source?: string | null;
  is_paid?: boolean;
  affects_hr?: boolean;
}

export interface CountryHolidayPreviewItem {
  date: string;
  name: string;
  category: string;
  garment_recommendation?: string | null;
}

export interface CountryHolidaysPreviewResponse {
  country_code: string;
  year: number;
  items: CountryHolidayPreviewItem[];
}

export interface SettingsPricingResponse {
  plan: string;
  display_name: string;
  max_users: number | null;
  features: string[];
}

export interface SettingsChequeTemplateRow {
  id: number;
  name: string;
  is_default: boolean;
}

export interface SettingsChequeTemplatesListResponse {
  items: SettingsChequeTemplateRow[];
  total: number;
}

export interface BackupStatusResponse {
  enabled: boolean;
  provider: string;
  retention_days: number;
  last_backup_at: string | null;
  last_backup_status: string;
  last_backup_note: string | null;
}

export interface BackupHistoryRow {
  id: number;
  created_at: string;
  status: string;
  note: string | null;
  initiated_by_user_id: number | null;
}

export interface SettingsAuditLogListResponse {
  items: AuditLogResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface HrDepartmentResponse {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

export interface HrDepartmentCreate {
  code: string;
  name: string;
  is_active?: boolean;
}

export interface HrDepartmentUpdate {
  code?: string;
  name?: string;
  is_active?: boolean;
}

export interface HrDesignationResponse {
  id: number;
  tenant_id: number;
  code: string;
  title: string;
  description: string | null;
  department_id: number | null;
  is_active: boolean;
}

export interface HrDesignationCreate {
  code: string;
  title: string;
  description?: string | null;
  department_id?: number | null;
  is_active?: boolean;
}

export interface HrDesignationUpdate {
  code?: string;
  title?: string;
  description?: string | null;
  department_id?: number | null;
  is_active?: boolean;
}

export interface HrEmployeeResponse {
  id: number;
  tenant_id: number;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  reporting_manager_id: number | null;
  user_id: number | null;
  department_id: number | null;
  designation_id: number | null;
  section_id: number | null;
  employee_category: string | null;
  joining_date: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address_line: string | null;
  city: string | null;
  country: string | null;
  national_id: string | null;
  employment_type: string | null;
  confirmation_date: string | null;
  exit_date: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HrEmployeeCreate {
  employee_code: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  country?: string | null;
  national_id?: string | null;
  employment_type?: string | null;
  confirmation_date?: string | null;
  exit_date?: string | null;
  department_id?: number | null;
  designation_id?: number | null;
  section_id?: number | null;
  employee_category?: string | null;
  reporting_manager_id?: number | null;
  user_id?: number | null;
  joining_date?: string | null;
  is_active?: boolean;
}

export interface HrEmployeeUpdate {
  employee_code?: string;
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  marital_status?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  country?: string | null;
  national_id?: string | null;
  employment_type?: string | null;
  confirmation_date?: string | null;
  exit_date?: string | null;
  department_id?: number | null;
  designation_id?: number | null;
  section_id?: number | null;
  employee_category?: string | null;
  reporting_manager_id?: number | null;
  user_id?: number | null;
  joining_date?: string | null;
  is_active?: boolean;
}

export interface HrEmployeeDocumentResponse {
  id: number;
  tenant_id: number;
  employee_id: number;
  document_type: string;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_path: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: string;
}

export interface HrEmployeeDocumentCreate {
  document_type: string;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  file_path?: string | null;
  notes?: string | null;
}

export interface HrEmployeeStatusHistoryResponse {
  id: number;
  tenant_id: number;
  employee_id: number;
  status: string;
  effective_date: string;
  remarks: string | null;
  changed_by: number | null;
  created_at: string;
}

export interface HrEmployeeStatusHistoryCreate {
  status: string;
  effective_date: string;
  remarks?: string | null;
}

export interface HrDashboardData {
  total_employees: number;
  active_employees: number;
  pending_leave_requests: number;
  pending_payroll_approvals: number;
  open_recruitment_requisitions: number;
  today_attendance_entries: number;
  today_attendance_rate_percent: number;
}

export interface HrSectionResponse {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  section_type: string;
  parent_section_id: number | null;
  department_id: number | null;
  head_employee_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrPerformanceCycleResponse {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface HrShiftResponse {
  id: number;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  is_night_shift: boolean;
  is_active: boolean;
}

export interface HrShiftCreate {
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  is_night_shift?: boolean;
  is_active?: boolean;
}

export interface HrRosterEntryResponse {
  id: number;
  employee_id: number;
  roster_date: string;
  shift_id: number | null;
  is_week_off?: boolean;
  note: string | null;
}

export interface HrRosterEntryCreate {
  employee_id: number;
  roster_date: string;
  shift_id: number;
  is_week_off?: boolean;
  note?: string | null;
}

export interface HrRosterEntryUpdate {
  shift_id?: number | null;
  is_week_off?: boolean;
  note?: string | null;
}

export interface HrHolidayResponse {
  id: number;
  tenant_id: number;
  holiday_date: string;
  name: string;
  is_optional: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrHolidayUpdate {
  name?: string;
  is_optional?: boolean;
  note?: string | null;
}

export interface HrRegularizationResponse {
  id: number;
  tenant_id: number;
  attendance_entry_id: number;
  requested_in_time: string | null;
  requested_out_time: string | null;
  reason: string;
  status: string;
  requested_by: number;
  approved_by: number | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrRegularizationCreate {
  attendance_entry_id: number;
  requested_in_time?: string | null;
  requested_out_time?: string | null;
  reason: string;
}

export interface HrRegularizationDecision {
  decision_note?: string | null;
}

export interface HrOvertimeRuleResponse {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  employee_category: string | null;
  max_ot_hours_per_day: string | null;
  weekday_multiplier: string;
  weekend_multiplier: string;
  holiday_multiplier: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrOvertimeRuleUpdate {
  code?: string;
  name?: string;
  employee_category?: string | null;
  max_ot_hours_per_day?: string | null;
  weekday_multiplier?: string;
  weekend_multiplier?: string;
  holiday_multiplier?: string;
  is_active?: boolean;
}

export interface HrAttendanceEntryResponse {
  id: number;
  tenant_id?: number;
  employee_id: number;
  attendance_date: string;
  in_time: string | null;
  out_time: string | null;
  status: string;
  source: string;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
  remarks: string | null;
  created_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface HrAttendanceEntryCreate {
  employee_id: number;
  attendance_date: string;
  in_time?: string | null;
  out_time?: string | null;
  status?: string;
  remarks?: string | null;
  /** MANUAL | BIOMETRIC | CARD_READER | MOBILE_APP */
  source?: string | null;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
}

export interface HrAttendanceEntryUpdate {
  in_time?: string | null;
  out_time?: string | null;
  status?: string;
  source?: string;
  late_minutes?: number;
  early_out_minutes?: number;
  overtime_minutes?: number;
  remarks?: string | null;
}

export interface HrAttendanceBulkEntryRow {
  employee_id: number;
  attendance_date: string;
  in_time?: string | null;
  out_time?: string | null;
  status?: string;
  source?: string;
  overtime_minutes?: number;
  remarks?: string | null;
}

export interface HrAttendanceBulkEntryBody {
  rows: HrAttendanceBulkEntryRow[];
}

export interface HrAttendanceSummaryRow {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
}

export interface HrLeaveTypeResponse {
  id: number;
  code: string;
  name: string;
  is_paid: boolean;
  requires_approval: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HrLeaveTypeCreate {
  code: string;
  name: string;
  is_paid?: boolean;
  requires_approval?: boolean;
  is_active?: boolean;
}

export interface HrLeaveTypeUpdate {
  code?: string;
  name?: string;
  is_paid?: boolean;
  requires_approval?: boolean;
  is_active?: boolean;
}

export interface HrLeaveBalanceResponse {
  id: number;
  tenant_id?: number;
  employee_id: number;
  leave_type_id: number;
  balance_year: number;
  allocated_days: string;
  used_days: string;
  pending_days: string;
  closing_balance_days: string;
  created_at?: string;
  updated_at?: string;
}

export interface HrLeaveRequestResponse {
  id: number;
  tenant_id?: number;
  employee_id: number;
  leave_type_id: number;
  from_date: string;
  to_date: string;
  /** Backend field name */
  days_requested: string;
  reason: string | null;
  status: string;
  requested_by?: number | null;
  approved_by?: number | null;
  approved_at?: string | null;
  approval_note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HrLeaveRequestCreate {
  employee_id: number;
  leave_type_id: number;
  from_date: string;
  to_date: string;
  days_requested: string;
  reason?: string | null;
}

export interface HrLeaveRequestUpdate {
  from_date?: string;
  to_date?: string;
  days_requested?: string;
  reason?: string | null;
}

export interface HrLeavePolicyResponse {
  id: number;
  tenant_id: number;
  leave_type_id: number;
  employment_type: string;
  annual_quota_days: string;
  max_carry_forward_days: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface HrLeavePolicyUpdate {
  employment_type?: string;
  annual_quota_days?: string;
  max_carry_forward_days?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
}

export interface HrLeaveBalanceUpsert {
  employee_id: number;
  leave_type_id: number;
  balance_year: number;
  allocated_days: string;
  used_days: string;
  pending_days: string;
  closing_balance_days: string;
}

export interface HrPayrollPeriodResponse {
  id: number;
  tenant_id?: number;
  period_code: string;
  start_date: string;
  end_date: string;
  payment_date: string;
  status: string;
  is_locked: boolean;
  finalized_by: number | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrPayrollPeriodCreate {
  period_code: string;
  start_date: string;
  end_date: string;
  payment_date: string;
}

export interface HrSalaryStructureResponse {
  id: number;
  name: string;
  grade: string | null;
  basic_amount: number;
  house_rent_amount: number;
  medical_amount: number;
  transport_amount: number;
  is_active: boolean;
}

export interface HrSalaryStructureCreate {
  name: string;
  grade?: string | null;
  basic_amount: number;
  house_rent_amount?: number;
  medical_amount?: number;
  transport_amount?: number;
  is_active?: boolean;
}

export interface HrPayrollRunResponse {
  id: number;
  tenant_id?: number;
  period_id: number;
  run_code: string;
  run_date: string;
  status: string;
  gross_total: string;
  deduction_total: string;
  net_total: string;
  finalized_by: number | null;
  finalized_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface HrPayrollRunCreate {
  period_id: number;
  run_date: string;
  run_code?: string | null;
}

export interface HrPayrollRunLineUpsert {
  employee_id: number;
  structure_id?: number | null;
  gross_pay?: string;
  deductions?: string;
  net_pay?: string;
  remarks?: string | null;
}

export interface HrPayrollRunLineResponse {
  id: number;
  tenant_id: number;
  run_id: number;
  employee_id: number;
  structure_id: number | null;
  gross_pay: string;
  deductions: string;
  net_pay: string;
  overtime_amount: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrPayrollStructureLineResponse {
  id: number;
  tenant_id: number;
  structure_id: number;
  component_id: number;
  amount: string;
  formula: string | null;
  sort_order: number;
  created_at: string;
}

export interface HrPayrollStructureLineCreate {
  component_id: number;
  amount: string;
  formula?: string | null;
  sort_order?: number;
}

export interface HrPayrollApprovalResponse {
  id: number;
  payroll_run_id: number;
  approver_user_id: number;
  decision: string;
  note: string | null;
  decided_at: string | null;
}

export interface HrPayslipResponse {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  gross_amount: number;
  deduction_amount: number;
  net_amount: number;
  status: string;
}

export interface HrGoalResponse {
  id: number;
  employee_id: number;
  title: string;
  description: string | null;
  target_date: string | null;
  status: string;
  progress_percent: number;
}

export interface HrGoalCreate {
  employee_id: number;
  title: string;
  description?: string | null;
  target_date?: string | null;
}

export interface HrReviewResponse {
  id: number;
  employee_id: number;
  reviewer_employee_id: number | null;
  review_period: string;
  overall_rating: number;
  status: string;
  comments: string | null;
}

export interface HrReviewCreate {
  employee_id: number;
  reviewer_employee_id?: number | null;
  review_period: string;
  overall_rating: number;
  comments?: string | null;
}

export interface HrPerformanceDashboardResponse {
  total_goals: number;
  completed_goals: number;
  pending_reviews: number;
  avg_rating: number;
}

export interface HrJobRequisitionResponse {
  id: number;
  tenant_id?: number;
  title: string;
  department_id: number | null;
  requested_by_employee_id?: number | null;
  hiring_manager_employee_id?: number | null;
  vacancy_count: number;
  employment_type?: string | null;
  location?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  description?: string | null;
  status: string;
  opened_at?: string | null;
  closed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HrJobRequisitionCreate {
  title: string;
  department_id?: number | null;
  hiring_manager_employee_id?: number | null;
  vacancy_count?: number;
  employment_type?: string | null;
  location?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  description?: string | null;
}

export interface HrCandidateResponse {
  id: number;
  candidate_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  applied_requisition_id: number | null;
  stage: string;
}

export interface HrCandidateCreate {
  candidate_code: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  applied_requisition_id?: number | null;
}

export interface HrInterviewResponse {
  id: number;
  candidate_id: number;
  interview_date: string;
  interviewer: string | null;
  result: string;
  note: string | null;
}

export interface HrInterviewCreate {
  candidate_id: number;
  interview_date: string;
  interviewer?: string | null;
  result?: string;
  note?: string | null;
}

export interface HrOfferResponse {
  id: number;
  candidate_id: number;
  offered_position: string;
  offered_salary: number;
  offer_date: string;
  status: string;
}

export interface HrOfferCreate {
  candidate_id: number;
  offered_position: string;
  offered_salary: number;
  offer_date: string;
}

export interface HrEssProfileResponse {
  employee_id: number;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  address_line: string | null;
  department: string | null;
  designation: string | null;
}

export interface HrEssProfileUpdate {
  email?: string | null;
  phone?: string | null;
  address_line?: string | null;
}

export interface HrReportSummaryResponse {
  total_employees: number;
  attendance_rate_percent: number;
  pending_leave_requests: number;
  payroll_runs_this_month: number;
}

export interface HrAttendanceReportRow {
  employee_code: string;
  employee_name: string;
  present_days: number;
  absent_days: number;
  leave_days: number;
}

export interface HrLeaveReportRow {
  leave_type: string;
  total_requests: number;
  approved_requests: number;
  pending_requests: number;
  rejected_requests: number;
}

export interface HrPayrollReportRow {
  payroll_period: string;
  total_employees: number;
  gross_total: number;
  deduction_total: number;
  net_total: number;
}

export function getToken(): string | null {
  return localStorage.getItem("p7_token");
}

export function getTenantId(): string | null {
  return localStorage.getItem("p7_tenant_id");
}

export function setAuth(token: string, tenantId: number): void {
  localStorage.setItem("p7_token", token);
  localStorage.setItem("p7_tenant_id", String(tenantId));
}

export function clearAuth(): void {
  localStorage.removeItem("p7_token");
  localStorage.removeItem("p7_tenant_id");
}

/**
 * JWT expired or rejected while a token was sent. Clears auth; redirects to login when on `/app/*`.
 * Does not redirect on `/login` or `/signup` (wrong password / stale token during sign-in).
 * See docs/PRE_PRODUCTION_AUDIT.md Finding #5.
 */
function handleSessionExpiredUnauthorized(sentAuthorization: boolean): void {
  if (!sentAuthorization) return;
  clearAuth();
  try {
    const path = window.location.pathname;
    if (path === "/login" || path === "/signup") return;
    if (!path.startsWith("/app")) return;
    const next = path + window.location.search;
    window.location.replace(`/login?reason=session_expired&next=${encodeURIComponent(next)}`);
  } catch {
    window.location.replace("/login?reason=session_expired");
  }
}

export class ApiError extends Error {
  status: number;
  requestId: string | null;
  /** Machine-readable code when API returns `{ detail: { code, message } }`. */
  code: string | null;
  constructor(message: string, status: number, requestId: string | null = null, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

/** Standard shape for paginated list endpoints (Finding #3). */
export interface PaginatedRows<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ListWithTotal<T> {
  rows: T[];
  total: number | null;
}

async function fetchAllPaginated<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedRows<T>>,
  pageSize = 500,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  while (true) {
    const r = await fetchPage(page, pageSize);
    out.push(...r.items);
    if (page >= r.total_pages || r.items.length === 0) break;
    page += 1;
  }
  return out;
}

async function request<T>(
  path: string,
  options: RequestInit & { tenantId?: number | null; omitTenantHeader?: boolean } = {}
): Promise<T> {
  const { tenantId, omitTenantHeader, ...init } = options;
  const tid = omitTenantHeader ? null : (tenantId ?? getTenantId());
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = String(tid);
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const sentAuthorization = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    const fallback = typeof raw.message === "string" ? raw.message : null;
    const message = parsed.message !== "Request failed" ? parsed.message : fallback ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId, parsed.code);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function requestWithTotal<T>(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<ListWithTotal<T>> {
  const { tenantId, ...init } = options;
  const tid = tenantId ?? getTenantId();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = String(tid);
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const sentAuthorization = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    const fallback = typeof raw.message === "string" ? raw.message : null;
    const message = parsed.message !== "Request failed" ? parsed.message : fallback ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId, parsed.code);
  }
  if (res.status === 204) {
    return { rows: [] as T[], total: 0 };
  }
  const totalHeader = res.headers.get("X-Total-Count");
  const parsedTotal = totalHeader != null ? Number(totalHeader) : Number.NaN;
  return {
    rows: (await res.json()) as T[],
    total: Number.isFinite(parsedTotal) ? parsedTotal : null,
  };
}

/** Public request without auth (e.g. verify proforma token). */
async function requestPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: string | { msg?: string }[]; message?: string };
    const d = raw.detail;
    const message = typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? d[0].msg : raw.message ?? "Request failed";
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestBlob(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<Blob> {
  const { tenantId, ...init } = options;
  const tid = tenantId ?? getTenantId();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = String(tid);
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const sentAuthorization = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: string };
    const message = typeof raw.detail === "string" ? raw.detail : "Export failed";
    throw new ApiError(message, res.status);
  }
  return res.blob();
}

async function requestText(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<string> {
  const { tenantId, ...init } = options;
  const tid = tenantId ?? getTenantId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = String(tid);
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const sentAuthorization = Boolean(token);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization);
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: string | { msg?: string }[]; message?: string };
    const d = raw.detail;
    const message = typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? d[0].msg : raw.message ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId);
  }
  return res.text();
}

export type AiIntent =
  | "search_query"
  | "report_request"
  | "summary_request"
  | "forecast_request"
  | "help_request"
  | "action_request"
  | "unsupported_request";

export type AiMessageRole = "user" | "assistant" | "system" | "tool";

export interface AiSessionResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  session_code: string;
  title: string | null;
  status: string;
  provider: string | null;
  model_name: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiMessageResponse {
  id: number;
  session_id: number;
  role: AiMessageRole;
  content: string;
  content_json: Record<string, unknown> | null;
  created_at: string;
}

export interface AiToolInvocationResult {
  tool_name: string;
  status: "SUCCESS" | "FAILED" | "BLOCKED";
  summary: string;
  source_area: string;
  data: Record<string, unknown>;
  error?: string | null;
  reason_code?: string | null;
  error_category?: string | null;
}

export interface AiEscalationPayload {
  status: "escalate";
  tool_required: string;
  reason: string;
}

export interface AiChatResponse {
  session: AiSessionResponse;
  user_message: AiMessageResponse;
  assistant_message: AiMessageResponse;
  detected_intent: AiIntent;
  confidence: number;
  request_id: string;
  tool_results: AiToolInvocationResult[];
  blocked: boolean;
  escalation?: AiEscalationPayload | null;
}

/** Phase-2: stored on assistant `content_json.provenance` */
export interface AiSourceCitation {
  source_type?: string;
  source_ref?: string;
  module?: string;
  snippet?: string;
  similarity_score?: number | null;
}

export interface AiProvenanceToolTraceEntry {
  tool_name: string;
  status: string;
  latency_ms?: number;
  source_area?: string;
}

export interface AiResponseProvenance {
  answer?: string;
  confidence?: number;
  confidence_label?: string;
  grounding?: string;
  sources?: AiSourceCitation[] | null;
  warnings?: string[] | null;
  assumptions?: string[] | null;
  recommended_actions?: string[] | null;
  tool_trace?: AiProvenanceToolTraceEntry[] | null;
  routes_used?: string[] | null;
  model_used?: string | null;
  total_latency_ms?: number | null;
  data_freshness?: string | null;
}

export interface AiTraceSpan {
  name: string;
  start_ms: number;
  end_ms: number;
  status: string;
  metadata?: Record<string, unknown>;
}

export interface AiFeedbackSubmitBody {
  message_id?: number | null;
  trace_id?: string | null;
  rating: number;
  correction_text?: string | null;
  feedback_category?: string | null;
  flagged_for_review?: boolean;
  detected_intent?: string | null;
  route_used?: string | null;
  tools_used?: string[] | null;
  retrieval_method?: string | null;
  model_used?: string | null;
  confidence?: number | null;
}

export interface AiFeedbackResponse {
  id: number;
  tenant_id: number;
  user_id: number;
  message_id: number | null;
  trace_id: string | null;
  rating: number;
  feedback_category: string | null;
  flagged_for_review: boolean;
  created_at: string;
}

export interface AiApprovalArtifactResponse {
  id: number;
  tenant_id: number;
  artifact_code: string;
  artifact_type: string;
  source_tool: string;
  source_module: string;
  status: string;
  original_input_json?: Record<string, unknown> | null;
  generated_payload_json?: Record<string, unknown> | null;
  diff_json?: Record<string, unknown> | null;
  committed_payload_json?: Record<string, unknown> | null;
  commit_reference?: string | null;
  reviewer_comments?: string | null;
  created_at: string;
  expires_at?: string | null;
}

export interface AiApprovalArtifactCommitResult {
  artifact: AiApprovalArtifactResponse;
  erp_result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface AiQuickAction {
  key: string;
  label: string;
  prompt: string;
  source_area: string;
}

export interface AiQuickActionsResponse {
  items: AiQuickAction[];
}

export interface AiReportRunResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  session_id: number | null;
  request_id: string | null;
  report_code: string;
  report_name: string;
  status: string;
  source_modules: string[];
  parameters_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  narrative_summary: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AiForecastRunResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  session_id: number | null;
  request_id: string | null;
  forecast_code: string;
  forecast_name: string;
  status: string;
  source_modules: string[];
  assumptions_json: Record<string, unknown>;
  parameters_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  confidence_score: number | null;
  narrative_explanation: string | null;
  created_at: string;
  completed_at: string | null;
  model_version?: string | null;
  model_type?: string | null;
  quality_metrics?: Record<string, unknown> | null;
  expires_at?: string | null;
  celery_task_id?: string | null;
}

export interface AiForecastTemplateInfo {
  forecast_code: string;
  forecast_name: string;
  source_modules: string[];
  required_permission_keys: string[];
  example_prompt: string;
  default_horizon_days: number;
}

export interface AiForecastSummaryResponse {
  total_runs: number;
  last_run_at: string | null;
  avg_confidence: number | null;
  by_forecast_code: Record<string, number>;
  by_status: Record<string, number>;
  recent_failures: Array<{
    id: number;
    forecast_code: string;
    created_at: string;
    reason: string | null;
  }>;
}

export interface AiKnowledgeSourceReference {
  document_code: string;
  document_title: string;
  doc_type: string;
  source_area: string;
  heading: string | null;
  snippet: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface AiKnowledgeQueryResponse {
  answer: string;
  used_sources: AiKnowledgeSourceReference[];
  retrieved_from_knowledge: boolean;
  disclaimer: string;
}

export interface AiKnowledgeDocumentResponse {
  id: number;
  tenant_id: number | null;
  document_code: string;
  title: string;
  doc_type: string;
  source_area: string;
  owner_scope: string;
  visibility: string;
  permission_key: string | null;
  version_tag: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AiActionRunResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  session_id: number | null;
  message_id: number | null;
  request_id: string;
  action_key: string;
  status: string;
  requires_confirmation: boolean;
  confirmation_token: string | null;
  confirmation_token_hint: string | null;
  risk_level: string;
  prompt_text: string;
  preview_text: string | null;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown>;
  error_text: string | null;
  created_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
}

export interface AiGovernanceProposal {
  id: number;
  tenant_id: number;
  rule_code: string;
  status: string;
  payload_json: Record<string, unknown> | null;
  created_by_user_id: number | null;
  approved_by_user_id: number | null;
  rejected_by_user_id: number | null;
  rejected_reason: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  executed_at: string | null;
  rolled_back_at: string | null;
}

export interface AiAutomationRuleRow {
  rule_code: string;
  action_key: string;
  label: string;
  description: string | null;
  is_enabled: boolean;
  requires_confirmation: boolean;
  permission_key: string | null;
}

export interface AiAnomalyEventResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  session_id: number | null;
  request_id: string | null;
  source_area: string;
  rule_code: string;
  severity: string;
  title: string;
  explanation: string;
  metrics_json: Record<string, unknown>;
  dimensions_json: Record<string, unknown>;
  created_at: string;
}

export interface AiAnomalyGenerateResponse {
  summary: string;
  gemini_narrative?: string | null;
  events: Record<string, unknown>[];
  persisted_event_ids: number[];
  logic_version: string;
  scheduler_ready: boolean;
}

export interface AiDashboardBriefResponse {
  brief: string;
  generated_at: string;
  kpi_snapshot: Record<string, unknown>;
}

export interface AiProfitabilityResponse {
  narrative: string;
  metrics: Record<string, unknown>;
  generated_at: string;
}

export interface AiDataQualityScanResponse {
  issues: Array<Record<string, unknown>>;
  narrative: string;
  generated_at: string;
}

export interface AiWeeklyReportDeltaEntry {
  current: number | null;
  previous: number | null;
  change: number | null;
}

export interface AiWeeklyReportItem {
  id: number;
  tenant_id: number;
  week_start: string;
  week_end: string;
  narrative: string;
  kpi_snapshot_json: Record<string, unknown> | null;
  delta: Record<string, AiWeeklyReportDeltaEntry> | null;
  created_at: string;
}

export interface AiWeeklyReportStatus {
  gemini_configured: boolean;
  current_week_start: string;
  current_week_end: string;
  has_current_week_report: boolean;
  last_report_created_at: string | null;
  next_scheduled_utc: string;
}

export type AiWeeklyReportGenerateStatus =
  | "created"
  | "exists"
  | "updated"
  | "skipped_no_gemini"
  | "skipped_empty";

export interface AiWeeklyReportGenerateResult {
  status: AiWeeklyReportGenerateStatus;
  report: AiWeeklyReportItem | null;
}

export interface AiOpsOverviewResponse {
  period_hours: number;
  total_events: number;
  blocked_events: number;
  error_events: number;
  avg_duration_ms: number;
  tool_success_rate: number;
}

/** Loans & facilities (internal `/api/v1/facility/*`). */
export type FacilityRow = Record<string, unknown> & { id: number; facility_code?: string; status?: string };
export type FacilityUtilizationRow = Record<string, unknown> & { id: number; utilization_code?: string; status?: string };
export type EmiPreviewResponse = Record<string, unknown>;
export type BusinessOverviewResponse = Record<string, unknown>;
export type BusinessHealthScoreResponse = Record<string, unknown>;

export const api = {
  /** Reference-style: companyCode + username + password. Or tenant_id + email + password. */
  async login(params: {
    company_code?: string;
    tenant_id?: number;
    username?: string;
    email?: string;
    login_as?: string;
    password: string;
  }): Promise<TokenResponse> {
    const { company_code, tenant_id, username, email, login_as, password } = params;
    // Send only non-empty fields so backend accepts company_code + username + password (no 422)
    const body: Record<string, unknown> = { password };
    if (company_code?.trim()) body.company_code = company_code.trim();
    if (tenant_id != null && Number.isFinite(tenant_id)) body.tenant_id = tenant_id;
    if (username?.trim()) body.username = username.trim();
    if (email?.trim()) body.email = email.trim();
    if (login_as?.trim()) body.login_as = login_as.trim().toLowerCase();
    const res = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      tenantId: tenant_id ?? undefined,
      /** Avoid sending a previous session's X-Tenant-Id while switching company codes. */
      omitTenantHeader: true,
    });
    return res;
  },
  async resolveTenant(company_code: string): Promise<ResolveTenantResponse> {
    return requestPublic<ResolveTenantResponse>("/api/v1/auth/resolve-tenant", {
      method: "POST",
      body: JSON.stringify({ company_code: company_code.trim() }),
    });
  },
  async acceptStaffInvite(data: {
    token: string;
    password: string;
    first_name?: string | null;
    last_name?: string | null;
  }): Promise<TokenResponse> {
    return requestPublic<TokenResponse>("/api/v1/auth/accept-staff-invite", {
      method: "POST",
      body: JSON.stringify({
        token: data.token.trim(),
        password: data.password,
        first_name: data.first_name?.trim() || undefined,
        last_name: data.last_name?.trim() || undefined,
      }),
    });
  },
  async me(): Promise<MeResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<MeResponse>("/api/v1/auth/me", { tenantId: Number(tid) });
  },
  async register(data: {
    tenant_id: number;
    email: string;
    username?: string | null;
    password: string;
    first_name?: string;
    last_name?: string;
    /** When server sets BOOTSTRAP_REGISTRATION_KEY, first user must supply this (Finding #4). */
    bootstrap_key?: string;
    accepted_legal_terms?: boolean;
    legal_acceptance_version?: string;
  }): Promise<unknown> {
    return request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) });
  },
  async forgotPassword(data: { email: string; company_code: string }): Promise<{ message: string }> {
    return requestPublic<{ message: string }>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim(),
        company_code: data.company_code.trim() || undefined,
      }),
    });
  },
  async resetPassword(data: { token: string; new_password: string }): Promise<{ message: string }> {
    return requestPublic<{ message: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: data.token.trim(), new_password: data.new_password }),
    });
  },
  async createTenant(data: {
    name: string;
    tenant_type: TenantType;
    phone?: string | null;
    address?: string | null;
  }): Promise<TenantResponse> {
    return request<TenantResponse>("/api/v1/tenants", { method: "POST", body: JSON.stringify(data) });
  },
  async getTenantMe(): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me", { tenantId: Number(tid) });
  },
  async patchTenantInventory(data: TenantInventoryPatch): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me/inventory", {
      method: "PATCH",
      body: JSON.stringify(data),
      tenantId: Number(tid),
    });
  },
  async listUsers(): Promise<UserWithRoleResponse[]> {
    return request<UserWithRoleResponse[]>("/api/v1/users");
  },
  async settingsListUsers(): Promise<UserWithRoleResponse[]> {
    return request<UserWithRoleResponse[]>("/api/v1/settings/users");
  },
  async settingsCreateUser(data: SettingsUserCreate): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>("/api/v1/settings/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settingsUpdateUser(userId: number, data: SettingsUserUpdate): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async settingsActivateUser(userId: number): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}/activate`, {
      method: "POST",
    });
  },
  async settingsDeactivateUser(userId: number): Promise<UserWithRoleResponse> {
    return request<UserWithRoleResponse>(`/api/v1/settings/users/${userId}/deactivate`, {
      method: "POST",
    });
  },
  async settingsDeleteUser(userId: number): Promise<void> {
    return request<void>(`/api/v1/settings/users/${userId}`, {
      method: "DELETE",
    });
  },
  async settingsInviteStaff(data: {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    role_id: number;
  }): Promise<StaffInviteCreateResponse> {
    return request<StaffInviteCreateResponse>("/api/v1/settings/users/invite", {
      method: "POST",
      body: JSON.stringify({
        email: data.email.trim(),
        first_name: data.first_name?.trim() || undefined,
        last_name: data.last_name?.trim() || undefined,
        role_id: data.role_id,
      }),
    });
  },
  async settingsListStaffInvitations(): Promise<StaffInviteRowResponse[]> {
    return request<StaffInviteRowResponse[]>("/api/v1/settings/users/invitations");
  },
  async settingsCancelStaffInvitation(invitationId: number): Promise<void> {
    return request<void>(`/api/v1/settings/users/invitations/${invitationId}`, { method: "DELETE" });
  },
  async settingsGetPermissionsRegistry(): Promise<PermissionsRegistryResponse> {
    return request<PermissionsRegistryResponse>("/api/v1/settings/permissions-registry");
  },
  async listRoles(): Promise<RoleResponse[]> {
    return request<RoleResponse[]>("/api/v1/roles");
  },
  async settingsListRoles(): Promise<SettingsRoleResponse[]> {
    return request<SettingsRoleResponse[]>("/api/v1/settings/roles");
  },
  async settingsCreateRole(data: SettingsRoleCreate): Promise<SettingsRoleResponse> {
    return request<SettingsRoleResponse>("/api/v1/settings/roles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settingsUpdateRole(roleId: number, data: SettingsRoleUpdate): Promise<SettingsRoleResponse> {
    return request<SettingsRoleResponse>(`/api/v1/settings/roles/${roleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async settingsDeleteRole(roleId: number): Promise<void> {
    return request<void>(`/api/v1/settings/roles/${roleId}`, {
      method: "DELETE",
    });
  },
  async settingsListAuditLogs(params?: {
    limit?: number;
    offset?: number;
    action?: string;
    resource?: string;
    user_id?: number;
    search?: string;
    created_from?: string;
    created_to?: string;
  }): Promise<SettingsAuditLogListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.action) q.set("action", params.action);
    if (params?.resource) q.set("resource", params.resource);
    if (params?.user_id != null) q.set("user_id", String(params.user_id));
    if (params?.search) q.set("search", params.search);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<SettingsAuditLogListResponse>(`/api/v1/settings/audit${suffix}`);
  },
  async listAuditLogs(params?: { limit?: number; offset?: number }): Promise<AuditLogResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AuditLogResponse[]>(`/api/v1/audit${suffix}`);
  },
  // AI Tool module
  async aiListSessions(params?: { limit?: number; offset?: number }): Promise<AiSessionResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiSessionResponse[]>(`/api/v1/ai-tool/sessions${suffix}`);
  },
  async aiCreateSession(data?: { title?: string | null }): Promise<AiSessionResponse> {
    return request<AiSessionResponse>("/api/v1/ai-tool/sessions", {
      method: "POST",
      body: JSON.stringify({ title: data?.title ?? null }),
    });
  },
  async aiListMessages(sessionId: number): Promise<AiMessageResponse[]> {
    return request<AiMessageResponse[]>(`/api/v1/ai-tool/sessions/${sessionId}/messages`);
  },
  async aiSendMessage(sessionId: number, prompt: string): Promise<AiChatResponse> {
    return request<AiChatResponse>(`/api/v1/ai-tool/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
  },
  async aiApproveEscalation(
    sessionId: number,
    data: { message_id: number; tool_required: string; approved?: boolean },
  ): Promise<AiChatResponse> {
    return request<AiChatResponse>(`/api/v1/ai-tool/sessions/${sessionId}/approve-escalation`, {
      method: "POST",
      body: JSON.stringify({
        message_id: data.message_id,
        tool_required: data.tool_required,
        approved: data.approved ?? true,
      }),
    });
  },
  async aiQuickActions(): Promise<AiQuickActionsResponse> {
    return request<AiQuickActionsResponse>("/api/v1/ai-tool/quick-actions");
  },
  async aiListReportRuns(params?: { limit?: number }): Promise<AiReportRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiReportRunResponse[]>(`/api/v1/ai-tool/report-runs${suffix}`);
  },
  async aiGenerateReport(data: { prompt: string; session_id?: number | null }): Promise<AiReportRunResponse> {
    return request<AiReportRunResponse>("/api/v1/ai-tool/report-runs/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListForecastRuns(params?: {
    limit?: number;
    offset?: number;
    forecast_code?: string;
    status?: string[];
    since?: string;
    until?: string;
    min_confidence?: number;
  }): Promise<AiForecastRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.forecast_code) q.set("forecast_code", params.forecast_code);
    (params?.status ?? []).forEach((s) => q.append("status", s));
    if (params?.since) q.set("since", params.since);
    if (params?.until) q.set("until", params.until);
    if (params?.min_confidence != null) q.set("min_confidence", String(params.min_confidence));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiForecastRunResponse[]>(`/api/v1/ai-tool/forecast-runs${suffix}`);
  },
  async aiListForecastTemplates(): Promise<AiForecastTemplateInfo[]> {
    return request<AiForecastTemplateInfo[]>("/api/v1/ai-tool/forecast-templates");
  },
  async aiGetForecastSummary(): Promise<AiForecastSummaryResponse> {
    return request<AiForecastSummaryResponse>("/api/v1/ai-tool/forecast-runs/summary");
  },
  async aiGetForecastRun(id: number): Promise<AiForecastRunResponse> {
    return request<AiForecastRunResponse>(`/api/v1/ai-tool/forecast-runs/${id}`);
  },
  async aiDeleteForecastRun(id: number): Promise<void> {
    return request<void>(`/api/v1/ai-tool/forecast-runs/${id}`, { method: "DELETE" });
  },
  async aiGenerateForecast(data: {
    prompt: string;
    session_id?: number | null;
    horizon_days?: number;
    from_date?: string | null;
    to_date?: string | null;
  }): Promise<AiForecastRunResponse> {
    return request<AiForecastRunResponse>("/api/v1/ai-tool/forecast-runs/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiKnowledgeQuery(data: { query: string; top_k?: number }): Promise<AiKnowledgeQueryResponse> {
    return request<AiKnowledgeQueryResponse>("/api/v1/ai-tool/knowledge/query", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListKnowledgeDocuments(params?: { limit?: number }): Promise<AiKnowledgeDocumentResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiKnowledgeDocumentResponse[]>(`/api/v1/ai-tool/knowledge/documents${suffix}`);
  },
  async aiListActionRuns(params?: { limit?: number }): Promise<AiActionRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiActionRunResponse[]>(`/api/v1/ai-tool/actions/runs${suffix}`);
  },
  async aiProposeAction(data: { prompt: string; session_id?: number | null }): Promise<AiActionRunResponse> {
    return request<AiActionRunResponse>("/api/v1/ai-tool/actions/propose", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiConfirmAction(actionRunId: number, data: { confirmation_token: string }): Promise<AiActionRunResponse> {
    return request<AiActionRunResponse>(`/api/v1/ai-tool/actions/${actionRunId}/confirm`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async aiListAnomalyEvents(params?: { limit?: number }): Promise<AiAnomalyEventResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiAnomalyEventResponse[]>(`/api/v1/ai-tool/anomalies/events${suffix}`);
  },
  async aiGenerateAnomalyInsights(data?: { session_id?: number | null }): Promise<AiAnomalyGenerateResponse> {
    return request<AiAnomalyGenerateResponse>("/api/v1/ai-tool/anomalies/generate", {
      method: "POST",
      body: JSON.stringify({ session_id: data?.session_id ?? null }),
    });
  },
  async aiOpsOverview(params?: { period_hours?: number }): Promise<AiOpsOverviewResponse> {
    const q = new URLSearchParams();
    if (params?.period_hours != null) q.set("period_hours", String(params.period_hours));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiOpsOverviewResponse>(`/api/v1/ai-tool/ops/overview${suffix}`);
  },
  async aiDataQualityScan(): Promise<AiDataQualityScanResponse> {
    return request<AiDataQualityScanResponse>("/api/v1/ai-tool/data-quality-scan", { method: "POST" });
  },
  async aiListWeeklyReports(params?: { limit?: number }): Promise<{ items: AiWeeklyReportItem[] }> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ items: AiWeeklyReportItem[] }>(`/api/v1/ai-tool/weekly-reports${suffix}`);
  },
  async aiGetWeeklyReportsStatus(): Promise<AiWeeklyReportStatus> {
    return request<AiWeeklyReportStatus>("/api/v1/ai-tool/weekly-reports/status");
  },
  async aiGetWeeklyReport(reportId: number): Promise<AiWeeklyReportItem> {
    return request<AiWeeklyReportItem>(`/api/v1/ai-tool/weekly-reports/${reportId}`);
  },
  async aiGenerateWeeklyReport(body?: { force?: boolean; target_date?: string }): Promise<AiWeeklyReportGenerateResult> {
    return request<AiWeeklyReportGenerateResult>("/api/v1/ai-tool/weekly-reports/generate", {
      method: "POST",
      body: JSON.stringify({
        force: body?.force ?? false,
        target_date: body?.target_date ?? null,
      }),
    });
  },
  async aiSubmitFeedback(body: AiFeedbackSubmitBody): Promise<AiFeedbackResponse> {
    return request<AiFeedbackResponse>("/api/v1/ai-tool/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async aiListArtifacts(params?: { status?: string; limit?: number }): Promise<AiApprovalArtifactResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiApprovalArtifactResponse[]>(`/api/v1/ai-tool/artifacts${suffix}`);
  },
  async aiGetArtifact(artifactId: number): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}`);
  },
  async aiApproveArtifact(artifactId: number, data?: { comments?: string | null }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/approve`, {
      method: "POST",
      body: JSON.stringify({ comments: data?.comments ?? null }),
    });
  },
  async aiRejectArtifact(artifactId: number, data?: { comments?: string | null }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/reject`, {
      method: "POST",
      body: JSON.stringify({ comments: data?.comments ?? null }),
    });
  },
  async aiCommitArtifact(artifactId: number): Promise<AiApprovalArtifactCommitResult> {
    return request<AiApprovalArtifactCommitResult>(`/api/v1/ai-tool/artifacts/${artifactId}/commit`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async aiRollbackArtifact(artifactId: number, data: { reason: string }): Promise<AiApprovalArtifactResponse> {
    return request<AiApprovalArtifactResponse>(`/api/v1/ai-tool/artifacts/${artifactId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ reason: data.reason }),
    });
  },
  // Settings module
  async getSettingsConfig(): Promise<SettingsConfigResponse> {
    return request<SettingsConfigResponse>("/api/v1/settings/config");
  },
  async createLemonSqueezyCheckout(body: { variant_id: string; email?: string | null }): Promise<LemonSqueezyCheckoutResponse> {
    return request<LemonSqueezyCheckoutResponse>("/api/v1/billing/lemonsqueezy/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateSettingsConfig(data: SettingsConfigUpdate): Promise<SettingsConfigResponse> {
    return request<SettingsConfigResponse>("/api/v1/settings/config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async getSettingsPricing(): Promise<SettingsPricingResponse> {
    return request<SettingsPricingResponse>("/api/v1/settings/pricing");
  },
  async getSettingsChequeTemplates(): Promise<SettingsChequeTemplatesListResponse> {
    return request<SettingsChequeTemplatesListResponse>("/api/v1/settings/cheque-templates");
  },
  async getBackupStatus(): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>("/api/v1/settings/backup/status");
  },
  async triggerBackup(): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>("/api/v1/settings/backup/trigger", {
      method: "POST",
    });
  },
  async listBackupHistory(params?: { limit?: number }): Promise<BackupHistoryRow[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BackupHistoryRow[]>(`/api/v1/settings/backup/history${suffix}`);
  },
  async triggerBackupRestore(backupLogId: number): Promise<BackupStatusResponse> {
    return request<BackupStatusResponse>(`/api/v1/settings/backup/restore/${backupLogId}`, {
      method: "POST",
    });
  },
  async getExternalAccessOverview(): Promise<ExternalAccessOverview> {
    return request<ExternalAccessOverview>("/api/v1/settings/external-access/overview");
  },
  async patchExternalAccessFeatureFlags(body: ExternalFeatureFlagsPatch): Promise<ExternalAccessOverview> {
    return request<ExternalAccessOverview>("/api/v1/settings/external-access/feature-flags", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listExternalCustomerPrincipals(params?: { limit?: number; offset?: number }): Promise<ExternalPrincipalListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalPrincipalListResponse>(`/api/v1/settings/external-access/customers${s}`);
  },
  async listExternalFinancierPrincipals(params?: { limit?: number; offset?: number }): Promise<ExternalPrincipalListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalPrincipalListResponse>(`/api/v1/settings/external-access/financiers${s}`);
  },
  async inviteExternalCustomer(body: {
    email: string;
    full_name: string;
    role_codes: string[];
    customer_ids: number[];
  }): Promise<ExternalInviteResponse> {
    return request<ExternalInviteResponse>("/api/v1/settings/external-access/customers/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inviteExternalFinancier(body: {
    email: string;
    full_name: string;
    role_codes: string[];
    access_scope?: string;
    financier_party_id?: number | null;
  }): Promise<ExternalInviteResponse> {
    return request<ExternalInviteResponse>("/api/v1/settings/external-access/financiers/invite", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async patchExternalFinancierPrincipal(
    principalId: number,
    body: {
      access_scope?: string | null;
      financier_party_id?: number | null;
    },
  ): Promise<ExternalPrincipalAdminRow> {
    return request<ExternalPrincipalAdminRow>(`/api/v1/settings/external-access/financiers/${principalId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listExternalAccessAudit(params?: { limit?: number; offset?: number }): Promise<ExternalAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const s = q.toString() ? `?${q.toString()}` : "";
    return request<ExternalAuditListResponse>(`/api/v1/settings/external-access/audit${s}`);
  },
  async deactivateExternalPrincipal(principalId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/v1/settings/external-access/principals/${principalId}/deactivate`, {
      method: "POST",
    });
  },
  async reactivateExternalPrincipal(principalId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/v1/settings/external-access/principals/${principalId}/reactivate`, {
      method: "POST",
    });
  },
  async listCustomers(): Promise<CustomerResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<CustomerListPageResponse>(`/api/v1/customers/paginated?${q.toString()}`);
    }, 200);
  },
  async listCustomersPaginated(params?: {
    q?: string;
    status?: string;
    country?: string;
    customer_type?: string;
    page?: number;
    page_size?: number;
    include_ai_fields?: boolean;
    stale_only?: boolean;
    incomplete_only?: boolean;
    high_duplicate_risk_only?: boolean;
    stale_days?: number;
  }): Promise<CustomerListPageResponse> {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.status) q.set("status", params.status);
    if (params?.country) q.set("country", params.country);
    if (params?.customer_type) q.set("customer_type", params.customer_type);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.include_ai_fields) q.set("include_ai_fields", "true");
    if (params?.stale_only) q.set("stale_only", "true");
    if (params?.incomplete_only) q.set("incomplete_only", "true");
    if (params?.high_duplicate_risk_only) q.set("high_duplicate_risk_only", "true");
    if (params?.stale_days != null) q.set("stale_days", String(params.stale_days));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerListPageResponse>(`/api/v1/customers/paginated${suffix}`);
  },
  async getCustomerFacets(): Promise<CustomerFacetsResponse> {
    return request<CustomerFacetsResponse>("/api/v1/customers/facets");
  },
  async getCustomerRelated(customerId: number, limit?: number): Promise<CustomerRelatedResponse> {
    const q = new URLSearchParams();
    if (limit != null) q.set("limit", String(limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerRelatedResponse>(`/api/v1/customers/${customerId}/related${suffix}`);
  },
  async getCustomerHealth(customerId: number): Promise<CustomerHealthResponse> {
    return request<CustomerHealthResponse>(`/api/v1/customers/${customerId}/health`);
  },
  async customerAiExtract(file: File, customerId?: number): Promise<CustomerAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (customerId != null) fd.append("customer_id", String(customerId));
    return request<CustomerAiExtractWrapResponse>("/api/v1/customers/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async customerAiEnrich(body: {
    customer_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<CustomerAiEnrichResponse> {
    return request<CustomerAiEnrichResponse>("/api/v1/customers/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiValidate(body: {
    fields: Record<string, unknown>;
    customer_id?: number | null;
  }): Promise<CustomerAiValidateResponse> {
    return request<CustomerAiValidateResponse>("/api/v1/customers/ai/validate", {
      method: "POST",
      body: JSON.stringify({
        fields: body.fields,
        customer_id: body.customer_id ?? undefined,
      }),
    });
  },
  async customerAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_customer_id?: number | null;
  }): Promise<CustomerAiDedupeResponse> {
    return request<CustomerAiDedupeResponse>("/api/v1/customers/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiSummary(customerId: number): Promise<CustomerAiSummaryResponse> {
    return request<CustomerAiSummaryResponse>("/api/v1/customers/ai/summary", {
      method: "POST",
      body: JSON.stringify({ customer_id: customerId }),
    });
  },
  async customerAiNextActions(customerId: number): Promise<CustomerAiNextActionsResponse> {
    return request<CustomerAiNextActionsResponse>("/api/v1/customers/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ customer_id: customerId }),
    });
  },
  async customerAiNlSearch(q: string): Promise<CustomerAiNlSearchResponse> {
    const qs = new URLSearchParams({ q });
    return request<CustomerAiNlSearchResponse>(`/api/v1/customers/ai/nl-search?${qs.toString()}`);
  },
  async customerAiAuditLog(params?: { customer_id?: number; limit?: number }): Promise<CustomerAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerAiAuditListResponse>(`/api/v1/customers/ai/audit-log${suffix}`);
  },
  async customerAiMarkSuggestionDecisions(body: CustomerAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiApplySuggestions(body: CustomerAiApplySuggestionsRequest): Promise<CustomerAiApplySuggestionsResponse> {
    return request<CustomerAiApplySuggestionsResponse>("/api/v1/customers/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiLinkSuggestionBatch(body: { batch_id: number; customer_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/customers/ai/suggestion-batch/link-customer", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async customerAiFinalizeSuggestionBatchAfterCreate(
    body: CustomerAiFinalizeAfterCreateRequest,
  ): Promise<CustomerAiFinalizeAfterCreateResponse> {
    return request<CustomerAiFinalizeAfterCreateResponse>(
      "/api/v1/customers/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async inquiryAiExtract(file: File, inquiryId?: number): Promise<InquiryAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (inquiryId != null) fd.append("inquiry_id", String(inquiryId));
    return request<InquiryAiExtractWrapResponse>("/api/v1/inquiries/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async inquiryAiEnrich(body: {
    inquiry_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<InquiryAiEnrichResponse> {
    return request<InquiryAiEnrichResponse>("/api/v1/inquiries/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiValidate(body: {
    fields: Record<string, unknown>;
    inquiry_id?: number | null;
  }): Promise<InquiryAiValidateResponse> {
    return request<InquiryAiValidateResponse>("/api/v1/inquiries/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_inquiry_id?: number | null;
  }): Promise<InquiryAiDedupeResponse> {
    return request<InquiryAiDedupeResponse>("/api/v1/inquiries/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiSummary(inquiryId: number): Promise<InquiryAiSummaryResponse> {
    return request<InquiryAiSummaryResponse>("/api/v1/inquiries/ai/summary", {
      method: "POST",
      body: JSON.stringify({ inquiry_id: inquiryId }),
    });
  },
  async inquiryAiNextActions(inquiryId: number): Promise<InquiryAiNextActionsResponse> {
    return request<InquiryAiNextActionsResponse>("/api/v1/inquiries/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ inquiry_id: inquiryId }),
    });
  },
  async inquiryAiAuditLog(params?: { inquiry_id?: number; limit?: number }): Promise<InquiryAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.inquiry_id != null) q.set("inquiry_id", String(params.inquiry_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryAiAuditListResponse>(`/api/v1/inquiries/ai/audit-log${suffix}`);
  },
  async inquiryAiMarkSuggestionDecisions(body: InquiryAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiApplySuggestions(body: InquiryAiApplySuggestionsRequest): Promise<InquiryAiApplySuggestionsResponse> {
    return request<InquiryAiApplySuggestionsResponse>("/api/v1/inquiries/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiLinkSuggestionBatch(body: { batch_id: number; inquiry_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inquiries/ai/suggestion-batch/link-inquiry", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async inquiryAiFinalizeSuggestionBatchAfterCreate(
    body: InquiryAiFinalizeAfterCreateRequest,
  ): Promise<InquiryAiFinalizeAfterCreateResponse> {
    return request<InquiryAiFinalizeAfterCreateResponse>(
      "/api/v1/inquiries/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  // ---------- Quotation AI ----------

  async quotationAiExtract(file: File, quotationId?: number): Promise<QuotationAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (quotationId != null) fd.append("quotation_id", String(quotationId));
    return request<QuotationAiExtractWrapResponse>("/api/v1/quotations/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async quotationAiEnrich(body: {
    quotation_id?: number;
    website?: string;
    domain?: string;
    email?: string;
    company_name?: string;
    fields?: Record<string, string | null>;
  }): Promise<QuotationAiEnrichResponse> {
    return request<QuotationAiEnrichResponse>("/api/v1/quotations/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiValidate(body: {
    fields: Record<string, unknown>;
    quotation_id?: number;
  }): Promise<QuotationAiValidateResponse> {
    return request<QuotationAiValidateResponse>("/api/v1/quotations/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_quotation_id?: number;
  }): Promise<QuotationAiDedupeResponse> {
    return request<QuotationAiDedupeResponse>("/api/v1/quotations/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiSummary(quotationId: number): Promise<QuotationAiSummaryResponse> {
    return request<QuotationAiSummaryResponse>("/api/v1/quotations/ai/summary", {
      method: "POST",
      body: JSON.stringify({ quotation_id: quotationId }),
    });
  },
  async quotationAiNextActions(quotationId: number): Promise<QuotationAiNextActionsResponse> {
    return request<QuotationAiNextActionsResponse>("/api/v1/quotations/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ quotation_id: quotationId }),
    });
  },
  async quotationAiAuditLog(params?: { quotation_id?: number; limit?: number }): Promise<QuotationAiAuditListResponse> {
    const parts: string[] = [];
    if (params?.quotation_id != null) parts.push(`quotation_id=${params.quotation_id}`);
    if (params?.limit != null) parts.push(`limit=${params.limit}`);
    const suffix = parts.length ? `?${parts.join("&")}` : "";
    return request<QuotationAiAuditListResponse>(`/api/v1/quotations/ai/audit-log${suffix}`);
  },
  async quotationAiMarkSuggestionDecisions(body: QuotationAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiApplySuggestions(body: QuotationAiApplySuggestionsRequest): Promise<QuotationAiApplySuggestionsResponse> {
    return request<QuotationAiApplySuggestionsResponse>("/api/v1/quotations/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiLinkSuggestionBatch(body: { batch_id: number; quotation_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/suggestion-batch/link-quotation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationAiFinalizeSuggestionBatchAfterCreate(
    body: QuotationAiFinalizeAfterCreateRequest,
  ): Promise<QuotationAiFinalizeAfterCreateResponse> {
    return request<QuotationAiFinalizeAfterCreateResponse>(
      "/api/v1/quotations/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  async quotationCostingCompletenessCheck(
    body: { quotation_id: number },
  ): Promise<QuotationCostingAiCompletenessResponse> {
    return request<QuotationCostingAiCompletenessResponse>("/api/v1/quotations/ai/cost-completeness-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingAnomalyScan(body: { quotation_id: number }): Promise<QuotationCostingAiAnomalyScanResponse> {
    return request<QuotationCostingAiAnomalyScanResponse>("/api/v1/quotations/ai/costing-anomaly-scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingMarginRisk(body: { quotation_id: number }): Promise<QuotationCostingAiMarginRiskResponse> {
    return request<QuotationCostingAiMarginRiskResponse>("/api/v1/quotations/ai/margin-risk-explanation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingFxSensitivity(body: { quotation_id: number }): Promise<QuotationCostingAiFxSensitivityResponse> {
    return request<QuotationCostingAiFxSensitivityResponse>("/api/v1/quotations/ai/fx-sensitivity-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSummary(body: { quotation_id: number }): Promise<QuotationCostingAiCostingSummaryResponse> {
    return request<QuotationCostingAiCostingSummaryResponse>("/api/v1/quotations/ai/costing-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingNextActions(body: { quotation_id: number }): Promise<QuotationCostingAiNextActionsResponse> {
    return request<QuotationCostingAiNextActionsResponse>("/api/v1/quotations/ai/costing-next-actions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingAuditLog(params?: { quotation_id?: number; limit?: number }): Promise<QuotationAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.quotation_id != null) q.set("quotation_id", String(params.quotation_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationAiAuditListResponse>(`/api/v1/quotations/ai/costing-audit-log${suffix}`);
  },

  async quotationCostingSuggestionsGenerate(body: { quotation_id: number }): Promise<QuotationCostingSuggestionBatchOut> {
    return request<QuotationCostingSuggestionBatchOut>("/api/v1/quotations/ai/costing-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsGet(batchId: number): Promise<QuotationCostingSuggestionBatchOut> {
    return request<QuotationCostingSuggestionBatchOut>(`/api/v1/quotations/ai/costing-suggestions/${batchId}`);
  },
  async quotationCostingSuggestionsMarkDecisions(body: {
    batch_id: number;
    decisions: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>;
  }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/costing-suggestions/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsApply(body: {
    quotation_id: number;
    batch_id: number;
    items: Array<{ item_id: number; decision: "apply" | "reject" | "skip" }>;
  }): Promise<QuotationCostingSuggestionApplyResponse> {
    return request<QuotationCostingSuggestionApplyResponse>("/api/v1/quotations/ai/costing-suggestions/apply", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostingSuggestionsDiscard(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/quotations/ai/costing-suggestions/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostBenchmark(body: {
    quotation_id: number;
    same_customer_only?: boolean;
    months_back?: number;
  }): Promise<CostBenchmarkResponse> {
    return request<CostBenchmarkResponse>("/api/v1/quotations/ai/cost-benchmark", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async quotationCostBenchmarkHistory(params?: { quotation_id?: number; limit?: number }): Promise<CostBenchmarkHistoryResponse> {
    const q = new URLSearchParams();
    if (params?.quotation_id != null) q.set("quotation_id", String(params.quotation_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostBenchmarkHistoryResponse>(`/api/v1/quotations/ai/cost-benchmark-history${suffix}`);
  },

  // ---------- Order AI ----------
  async orderAiExtract(file: File, orderId?: number): Promise<OrderAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (orderId != null) fd.append("order_id", String(orderId));
    return request<OrderAiExtractWrapResponse>("/api/v1/orders/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async orderAiEnrich(body: {
    order_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<OrderAiEnrichResponse> {
    return request<OrderAiEnrichResponse>("/api/v1/orders/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiValidate(body: {
    fields: Record<string, unknown>;
    order_id?: number | null;
  }): Promise<OrderAiValidateResponse> {
    return request<OrderAiValidateResponse>("/api/v1/orders/ai/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiValidateExecution(body: {
    fields: Record<string, unknown>;
    order_id?: number | null;
    include_promise_snapshot?: boolean;
  }): Promise<OrderAiValidateExecutionResponse> {
    return request<OrderAiValidateExecutionResponse>("/api/v1/orders/ai/validate-execution", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiPlanningRiskCheck(body: { order_id: number }): Promise<OrderAiPlanningRiskCheckResponse> {
    return request<OrderAiPlanningRiskCheckResponse>("/api/v1/orders/ai/planning-risk-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiAtpCtpSummary(body: { order_id: number }): Promise<OrderAiAtpCtpSummaryResponse> {
    return request<OrderAiAtpCtpSummaryResponse>("/api/v1/orders/ai/atp-ctp-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_order_id?: number | null;
  }): Promise<OrderAiDedupeResponse> {
    return request<OrderAiDedupeResponse>("/api/v1/orders/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiSummary(orderId: number): Promise<OrderAiSummaryResponse> {
    return request<OrderAiSummaryResponse>("/api/v1/orders/ai/summary", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
  },
  async orderAiNextActions(orderId: number, includePlanningContext?: boolean): Promise<OrderAiNextActionsResponse> {
    return request<OrderAiNextActionsResponse>("/api/v1/orders/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, include_planning_context: Boolean(includePlanningContext) }),
    });
  },
  async orderAiAuditLog(params?: {
    order_id?: number;
    limit?: number;
    surface?: "all" | "planning";
  }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.surface) q.set("surface", params.surface);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/audit-log${suffix}`);
  },
  async orderAiPlanningAuditLog(params?: { order_id?: number; limit?: number }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/planning-audit-log${suffix}`);
  },
  async orderAiSimulationAuditLog(params?: { order_id?: number; limit?: number }): Promise<OrderAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderAiAuditListResponse>(`/api/v1/orders/ai/simulation-audit-log${suffix}`);
  },
  async orderAiCapacityBottleneckScan(body: { order_id: number }): Promise<OrderAiCapacityBottleneckScanResponse> {
    return request<OrderAiCapacityBottleneckScanResponse>("/api/v1/orders/ai/capacity-bottleneck-scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiWhatIfSimulation(body: {
    order_id: number;
    scenario_label?: string | null;
    delivery_date_shift_days?: number;
    quantity_scale_pct?: number | null;
    capacity_load_pct?: number | null;
    material_assumption?: "as_is" | "strict" | "relaxed";
  }): Promise<OrderAiWhatIfSimulationResponse> {
    return request<OrderAiWhatIfSimulationResponse>("/api/v1/orders/ai/what-if-simulation", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiPromiseSensitivityCheck(body: {
    order_id: number;
    delivery_offsets_days?: number[];
  }): Promise<OrderAiPromiseSensitivityCheckResponse> {
    return request<OrderAiPromiseSensitivityCheckResponse>("/api/v1/orders/ai/promise-sensitivity-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiExecutionPlanningSummary(body: { order_id: number }): Promise<OrderAiExecutionPlanningSummaryResponse> {
    return request<OrderAiExecutionPlanningSummaryResponse>("/api/v1/orders/ai/planning-summary", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiMarkSuggestionDecisions(body: OrderAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiApplySuggestions(body: OrderAiApplySuggestionsRequest): Promise<OrderAiApplySuggestionsResponse> {
    return request<OrderAiApplySuggestionsResponse>("/api/v1/orders/ai/suggestion-batch/apply-suggestions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiLinkSuggestionBatch(body: { batch_id: number; order_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/orders/ai/suggestion-batch/link-order", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async orderAiFinalizeSuggestionBatchAfterCreate(
    body: OrderAiFinalizeAfterCreateRequest,
  ): Promise<OrderAiFinalizeAfterCreateResponse> {
    return request<OrderAiFinalizeAfterCreateResponse>(
      "/api/v1/orders/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },

  async vendorAiExtract(file: File, vendorId?: number): Promise<VendorAiExtractWrapResponse> {
    const fd = new FormData();
    fd.append("file", file);
    if (vendorId != null) fd.append("vendor_id", String(vendorId));
    return request<VendorAiExtractWrapResponse>("/api/v1/inventory/vendors/ai/extract", {
      method: "POST",
      body: fd,
    });
  },
  async vendorAiEnrich(body: {
    vendor_id?: number | null;
    website?: string | null;
    domain?: string | null;
    email?: string | null;
    company_name?: string | null;
    fields?: Record<string, string | null>;
  }): Promise<VendorAiEnrichResponse> {
    return request<VendorAiEnrichResponse>("/api/v1/inventory/vendors/ai/enrich", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiValidate(body: {
    fields: Record<string, unknown>;
    vendor_id?: number | null;
  }): Promise<VendorAiValidateResponse> {
    return request<VendorAiValidateResponse>("/api/v1/inventory/vendors/ai/validate", {
      method: "POST",
      body: JSON.stringify({
        fields: body.fields,
        vendor_id: body.vendor_id ?? undefined,
      }),
    });
  },
  async vendorAiDedupe(body: {
    fields: Record<string, unknown>;
    exclude_vendor_id?: number | null;
  }): Promise<VendorAiDedupeResponse> {
    return request<VendorAiDedupeResponse>("/api/v1/inventory/vendors/ai/dedupe", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiSummary(vendorId: number): Promise<VendorAiSummaryResponse> {
    return request<VendorAiSummaryResponse>("/api/v1/inventory/vendors/ai/summary", {
      method: "POST",
      body: JSON.stringify({ vendor_id: vendorId }),
    });
  },
  async vendorAiNextActions(vendorId: number): Promise<VendorAiNextActionsResponse> {
    return request<VendorAiNextActionsResponse>("/api/v1/inventory/vendors/ai/next-actions", {
      method: "POST",
      body: JSON.stringify({ vendor_id: vendorId }),
    });
  },
  async vendorAiAuditLog(params?: { vendor_id?: number; limit?: number }): Promise<VendorAiAuditListResponse> {
    const q = new URLSearchParams();
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VendorAiAuditListResponse>(`/api/v1/inventory/vendors/ai/audit-log${suffix}`);
  },
  async vendorAiMarkSuggestionDecisions(body: VendorAiMarkDecisionsRequest): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/mark-decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiApplySuggestions(body: VendorAiApplySuggestionsRequest): Promise<VendorAiApplySuggestionsResponse> {
    return request<VendorAiApplySuggestionsResponse>(
      "/api/v1/inventory/vendors/ai/suggestion-batch/apply-suggestions",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async vendorAiDiscardSuggestionBatch(body: { batch_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/discard", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiLinkSuggestionBatch(body: { batch_id: number; vendor_id: number }): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/vendors/ai/suggestion-batch/link-vendor", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async vendorAiFinalizeSuggestionBatchAfterCreate(
    body: VendorAiFinalizeAfterCreateRequest,
  ): Promise<VendorAiFinalizeAfterCreateResponse> {
    return request<VendorAiFinalizeAfterCreateResponse>(
      "/api/v1/inventory/vendors/ai/suggestion-batch/finalize-after-create",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  async uploadCustomerLogo(file: File): Promise<CustomerLogoUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return request<CustomerLogoUploadResponse>("/api/v1/customers/upload-logo", {
      method: "POST",
      body: form,
    });
  },
  async uploadStyleImage(styleId: number, file: File): Promise<StyleImageUploadResponse> {
    const form = new FormData();
    form.append("file", file);
    return request<StyleImageUploadResponse>(`/api/v1/merch/styles/${styleId}/upload-picture`, {
      method: "POST",
      body: form,
    });
  },
  async getCustomer(id: number): Promise<CustomerResponse> {
    return request<CustomerResponse>(`/api/v1/customers/${id}`);
  },
  async createCustomer(data: CustomerCreate): Promise<CustomerResponse> {
    return request<CustomerResponse>("/api/v1/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCustomer(id: number, data: CustomerUpdate): Promise<CustomerResponse> {
    return request<CustomerResponse>(`/api/v1/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteCustomer(id: number): Promise<void> {
    return request<void>(`/api/v1/customers/${id}`, { method: "DELETE" });
  },
  async listIntermediaries(params?: {
    kind?: "BUYING_HOUSE" | "AGENT";
    is_active?: boolean;
    q?: string;
  }): Promise<IntermediaryResponse[]> {
    const q = new URLSearchParams();
    if (params?.kind) q.set("kind", params.kind);
    if (params?.is_active != null) q.set("is_active", String(params.is_active));
    if (params?.q) q.set("q", params.q);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<IntermediaryResponse[]>(`/api/v1/parties/intermediaries${suffix}`);
  },
  async createIntermediary(data: IntermediaryCreate): Promise<IntermediaryResponse> {
    return request<IntermediaryResponse>("/api/v1/parties/intermediaries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateIntermediary(id: number, data: IntermediaryUpdate): Promise<IntermediaryResponse> {
    return request<IntermediaryResponse>(`/api/v1/parties/intermediaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteIntermediary(id: number): Promise<void> {
    return request<void>(`/api/v1/parties/intermediaries/${id}`, { method: "DELETE" });
  },
  async listCustomerIntermediaryLinks(params?: {
    customer_id?: number;
    intermediary_id?: number;
  }): Promise<CustomerIntermediaryLinkResponse[]> {
    const q = new URLSearchParams();
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.intermediary_id != null) q.set("intermediary_id", String(params.intermediary_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerIntermediaryLinkResponse[]>(`/api/v1/parties/customer-intermediaries${suffix}`);
  },
  async createCustomerIntermediaryLink(
    data: CustomerIntermediaryLinkCreate
  ): Promise<CustomerIntermediaryLinkResponse> {
    return request<CustomerIntermediaryLinkResponse>("/api/v1/parties/customer-intermediaries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCustomerIntermediaryLink(
    id: number,
    data: CustomerIntermediaryLinkUpdate
  ): Promise<CustomerIntermediaryLinkResponse> {
    return request<CustomerIntermediaryLinkResponse>(`/api/v1/parties/customer-intermediaries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteCustomerIntermediaryLink(id: number): Promise<void> {
    return request<void>(`/api/v1/parties/customer-intermediaries/${id}`, {
      method: "DELETE",
    });
  },
  async listHrDepartments(params?: { active_only?: boolean }): Promise<HrDepartmentResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrDepartmentResponse[]>(`/api/v1/hr/departments${suffix}`);
  },
  async createHrDepartment(data: HrDepartmentCreate): Promise<HrDepartmentResponse> {
    return request<HrDepartmentResponse>("/api/v1/hr/departments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrDepartment(id: number, data: HrDepartmentUpdate): Promise<HrDepartmentResponse> {
    return request<HrDepartmentResponse>(`/api/v1/hr/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteHrDepartment(id: number): Promise<void> {
    return request<void>(`/api/v1/hr/departments/${id}`, { method: "DELETE" });
  },
  async listHrDesignations(params?: { active_only?: boolean; department_id?: number }): Promise<HrDesignationResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrDesignationResponse[]>(`/api/v1/hr/designations${suffix}`);
  },
  async createHrDesignation(data: HrDesignationCreate): Promise<HrDesignationResponse> {
    return request<HrDesignationResponse>("/api/v1/hr/designations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrDesignation(id: number, data: HrDesignationUpdate): Promise<HrDesignationResponse> {
    return request<HrDesignationResponse>(`/api/v1/hr/designations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteHrDesignation(id: number): Promise<void> {
    return request<void>(`/api/v1/hr/designations/${id}`, { method: "DELETE" });
  },
  async listHrEmployees(params?: {
    active_only?: boolean;
    department_id?: number;
    designation_id?: number;
    search?: string;
  }): Promise<HrEmployeeResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    if (params?.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrEmployeeResponse[]>(`/api/v1/hr/employees${suffix}`);
  },
  async getHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}`);
  },
  async createHrEmployee(data: HrEmployeeCreate): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>("/api/v1/hr/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrEmployee(id: number, data: HrEmployeeUpdate): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async activateHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}/activate`, { method: "POST" });
  },
  async deactivateHrEmployee(id: number): Promise<HrEmployeeResponse> {
    return request<HrEmployeeResponse>(`/api/v1/hr/employees/${id}/deactivate`, { method: "POST" });
  },
  async listHrEmployeeDocuments(employeeId: number): Promise<HrEmployeeDocumentResponse[]> {
    return request<HrEmployeeDocumentResponse[]>(`/api/v1/hr/employees/${employeeId}/documents`);
  },
  async createHrEmployeeDocument(employeeId: number, data: HrEmployeeDocumentCreate): Promise<HrEmployeeDocumentResponse> {
    return request<HrEmployeeDocumentResponse>(`/api/v1/hr/employees/${employeeId}/documents`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrEmployeeStatusHistory(employeeId: number): Promise<HrEmployeeStatusHistoryResponse[]> {
    return request<HrEmployeeStatusHistoryResponse[]>(`/api/v1/hr/employees/${employeeId}/status-history`);
  },
  async createHrEmployeeStatusHistory(
    employeeId: number,
    data: HrEmployeeStatusHistoryCreate
  ): Promise<HrEmployeeStatusHistoryResponse> {
    return request<HrEmployeeStatusHistoryResponse>(`/api/v1/hr/employees/${employeeId}/status-history`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrDashboardData(): Promise<HrDashboardData> {
    return request<HrDashboardData>("/api/v1/hr/dashboard-data");
  },
  async listHrSections(params?: { active_only?: boolean }): Promise<HrSectionResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrSectionResponse[]>(`/api/v1/hr/sections${suffix}`);
  },
  async createHrSection(data: Record<string, unknown>): Promise<HrSectionResponse> {
    return request<HrSectionResponse>("/api/v1/hr/sections", { method: "POST", body: JSON.stringify(data) });
  },
  async updateHrSection(id: number, data: Record<string, unknown>): Promise<HrSectionResponse> {
    return request<HrSectionResponse>(`/api/v1/hr/sections/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },
  async exportHrEmployees(): Promise<Blob> {
    return requestBlob("/api/v1/hr/employees/export", { method: "GET" });
  },
  async importHrEmployees(file: File): Promise<{ created: number; updated: number; errors: string[] }> {
    const form = new FormData();
    form.append("file", file);
    return request<{ created: number; updated: number; errors: string[] }>("/api/v1/hr/employees/import", {
      method: "POST",
      body: form,
    });
  },
  async listHrComplianceChecks(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/compliance-checks");
  },
  async createHrComplianceCheck(data: Record<string, unknown>): Promise<{ id: number; ok: boolean }> {
    return request<{ id: number; ok: boolean }>("/api/v1/hr/compliance-checks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPerformanceCycles(): Promise<HrPerformanceCycleResponse[]> {
    return request<HrPerformanceCycleResponse[]>("/api/v1/hr/performance/cycles");
  },
  async createHrPerformanceCycle(data: Record<string, unknown>): Promise<HrPerformanceCycleResponse> {
    return request<HrPerformanceCycleResponse>("/api/v1/hr/performance/cycles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrPerformanceCycleStatus(cycleId: number, body: { status: string }): Promise<HrPerformanceCycleResponse> {
    return request<HrPerformanceCycleResponse>(`/api/v1/hr/performance/cycles/${cycleId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async submitHrGoal(goalId: number, body?: { manager_comment?: string | null }): Promise<HrGoalResponse> {
    return request<HrGoalResponse>(`/api/v1/hr/performance/goals/${goalId}/submit`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async submitHrReview(
    reviewId: number,
    body?: { manager_rating?: number | null; final_rating?: number | null; manager_comment?: string | null }
  ): Promise<HrReviewResponse> {
    return request<HrReviewResponse>(`/api/v1/hr/performance/reviews/${reviewId}/submit`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async listHrPayrollAccountingConfig(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/accounting-config");
  },
  async upsertHrPayrollAccountingConfig(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/accounting-config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollAdvances(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/payroll/advances");
  },
  async createHrPayrollAdvance(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/advances", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollBonuses(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/payroll/bonuses");
  },
  async createHrPayrollBonus(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/bonuses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrShifts(params?: { active_only?: boolean }): Promise<HrShiftResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrShiftResponse[]>(`/api/v1/hr/attendance/shifts${suffix}`);
  },
  async createHrShift(data: HrShiftCreate): Promise<HrShiftResponse> {
    return request<HrShiftResponse>("/api/v1/hr/attendance/shifts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrShift(id: number, data: Partial<HrShiftCreate>): Promise<HrShiftResponse> {
    return request<HrShiftResponse>(`/api/v1/hr/attendance/shifts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrRosterEntries(params?: {
    roster_date?: string;
    employee_id?: number;
  }): Promise<HrRosterEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.roster_date) q.set("roster_date", params.roster_date);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrRosterEntryResponse[]>(`/api/v1/hr/attendance/rosters${suffix}`);
  },
  async createHrRosterEntry(data: HrRosterEntryCreate): Promise<HrRosterEntryResponse> {
    return request<HrRosterEntryResponse>("/api/v1/hr/attendance/rosters", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrRosterEntry(id: number, data: HrRosterEntryUpdate): Promise<HrRosterEntryResponse> {
    return request<HrRosterEntryResponse>(`/api/v1/hr/attendance/rosters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrAttendanceEntries(params?: {
    attendance_date?: string;
    employee_id?: number;
    status_filter?: string;
  }): Promise<HrAttendanceEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.attendance_date) q.set("attendance_date", params.attendance_date);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceEntryResponse[]>(`/api/v1/hr/attendance/entries${suffix}`);
  },
  async createHrAttendanceEntry(data: HrAttendanceEntryCreate): Promise<HrAttendanceEntryResponse> {
    return request<HrAttendanceEntryResponse>("/api/v1/hr/attendance/entries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrAttendanceEntry(id: number, data: HrAttendanceEntryUpdate): Promise<HrAttendanceEntryResponse> {
    return request<HrAttendanceEntryResponse>(`/api/v1/hr/attendance/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrRegularizations(params?: { status_filter?: string }): Promise<HrRegularizationResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrRegularizationResponse[]>(`/api/v1/hr/attendance/regularizations${suffix}`);
  },
  async createHrRegularization(data: HrRegularizationCreate): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>("/api/v1/hr/attendance/regularizations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveHrRegularization(id: number, body?: HrRegularizationDecision): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>(`/api/v1/hr/attendance/regularizations/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async rejectHrRegularization(id: number, body?: HrRegularizationDecision): Promise<HrRegularizationResponse> {
    return request<HrRegularizationResponse>(`/api/v1/hr/attendance/regularizations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async postHrAttendanceEntriesBulk(body: HrAttendanceBulkEntryBody): Promise<{ ok: boolean; created: number }> {
    return request<{ ok: boolean; created: number }>("/api/v1/hr/attendance/entries/bulk", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrAttendanceSummary(params?: { month?: string; department_id?: number }): Promise<HrAttendanceSummaryRow[]> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceSummaryRow[]>(`/api/v1/hr/attendance/summary${suffix}`);
  },
  async listHrHolidays(params?: { year?: number }): Promise<HrHolidayResponse[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrHolidayResponse[]>(`/api/v1/hr/attendance/holidays${suffix}`);
  },
  async createHrHoliday(data: Record<string, unknown>): Promise<HrHolidayResponse> {
    return request<HrHolidayResponse>("/api/v1/hr/attendance/holidays", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrHoliday(id: number, data: HrHolidayUpdate): Promise<HrHolidayResponse> {
    return request<HrHolidayResponse>(`/api/v1/hr/attendance/holidays/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrOvertimeRules(): Promise<HrOvertimeRuleResponse[]> {
    return request<HrOvertimeRuleResponse[]>("/api/v1/hr/attendance/overtime-rules");
  },
  async createHrOvertimeRule(data: Record<string, unknown>): Promise<HrOvertimeRuleResponse> {
    return request<HrOvertimeRuleResponse>("/api/v1/hr/attendance/overtime-rules", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrOvertimeRule(id: number, data: HrOvertimeRuleUpdate): Promise<HrOvertimeRuleResponse> {
    return request<HrOvertimeRuleResponse>(`/api/v1/hr/attendance/overtime-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrOvertimeEntries(params?: { status?: string }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status_filter", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<Record<string, unknown>[]>(`/api/v1/hr/attendance/overtime${suffix}`);
  },
  async createHrOvertimeEntry(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/attendance/overtime", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveHrOvertimeEntry(id: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/attendance/overtime/${id}/approve`, { method: "POST" });
  },
  async listHrLeavePolicies(): Promise<HrLeavePolicyResponse[]> {
    return request<HrLeavePolicyResponse[]>("/api/v1/hr/leave/policies");
  },
  async updateHrLeavePolicy(id: number, data: HrLeavePolicyUpdate): Promise<HrLeavePolicyResponse> {
    return request<HrLeavePolicyResponse>(`/api/v1/hr/leave/policies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async postHrLeaveBalanceUpsert(data: HrLeaveBalanceUpsert): Promise<HrLeaveBalanceResponse> {
    return request<HrLeaveBalanceResponse>("/api/v1/hr/leave/balances/upsert", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrLeaveCalendarData(params: { year: number; month: number }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams({ year: String(params.year), month: String(params.month) });
    return request<Record<string, unknown>[]>(`/api/v1/hr/leave/calendar-data?${q.toString()}`);
  },
  async postHrLeaveCarryForward(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/leave/balances/carry-forward", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postHrLeaveEncashment(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/leave/encashment", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrLeaveTypes(params?: { active_only?: boolean }): Promise<HrLeaveTypeResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveTypeResponse[]>(`/api/v1/hr/leave/types${suffix}`);
  },
  async createHrLeaveType(data: HrLeaveTypeCreate): Promise<HrLeaveTypeResponse> {
    return request<HrLeaveTypeResponse>("/api/v1/hr/leave/types", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrLeaveType(id: number, data: HrLeaveTypeUpdate): Promise<HrLeaveTypeResponse> {
    return request<HrLeaveTypeResponse>(`/api/v1/hr/leave/types/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrLeaveBalances(params?: { balance_year?: number; employee_id?: number }): Promise<HrLeaveBalanceResponse[]> {
    const q = new URLSearchParams();
    if (params?.balance_year != null) q.set("balance_year", String(params.balance_year));
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveBalanceResponse[]>(`/api/v1/hr/leave/balances${suffix}`);
  },
  async listHrLeaveRequests(params?: { status_filter?: string; employee_id?: number }): Promise<HrLeaveRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveRequestResponse[]>(`/api/v1/hr/leave/requests${suffix}`);
  },
  async createHrLeaveRequest(data: HrLeaveRequestCreate): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>("/api/v1/hr/leave/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrLeaveRequest(id: number, data: HrLeaveRequestUpdate): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async submitHrLeaveRequest(id: number): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}/submit`, { method: "POST" });
  },
  async decideHrLeaveRequest(id: number, decision: "approved" | "rejected", note?: string): Promise<HrLeaveRequestResponse> {
    const actionPath = decision === "approved" ? "approve" : "reject";
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}/${actionPath}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },
  async listHrPayrollComponents(params?: { active_only?: boolean }): Promise<Record<string, unknown>[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<Record<string, unknown>[]>(`/api/v1/hr/payroll/components${suffix}`);
  },
  async createHrPayrollComponent(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/payroll/components", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateHrPayrollComponent(id: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/payroll/components/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollPeriods(): Promise<HrPayrollPeriodResponse[]> {
    return request<HrPayrollPeriodResponse[]>("/api/v1/hr/payroll/periods");
  },
  async createHrPayrollPeriod(data: HrPayrollPeriodCreate): Promise<HrPayrollPeriodResponse> {
    return request<HrPayrollPeriodResponse>("/api/v1/hr/payroll/periods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async finalizeHrPayrollPeriod(periodId: number): Promise<HrPayrollPeriodResponse> {
    return request<HrPayrollPeriodResponse>(`/api/v1/hr/payroll/periods/${periodId}/finalize`, { method: "POST" });
  },
  async listHrSalaryStructures(params?: { active_only?: boolean }): Promise<HrSalaryStructureResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrSalaryStructureResponse[]>(`/api/v1/hr/payroll/structures${suffix}`);
  },
  async createHrSalaryStructure(data: HrSalaryStructureCreate): Promise<HrSalaryStructureResponse> {
    return request<HrSalaryStructureResponse>("/api/v1/hr/payroll/structures", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrSalaryStructureLines(structureId: number): Promise<HrPayrollStructureLineResponse[]> {
    return request<HrPayrollStructureLineResponse[]>(`/api/v1/hr/payroll/structures/${structureId}/lines`);
  },
  async createHrSalaryStructureLine(
    structureId: number,
    data: HrPayrollStructureLineCreate
  ): Promise<HrPayrollStructureLineResponse> {
    return request<HrPayrollStructureLineResponse>(`/api/v1/hr/payroll/structures/${structureId}/lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollRuns(params?: { period_id?: number; status_filter?: string }): Promise<HrPayrollRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.period_id != null) q.set("period_id", String(params.period_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollRunResponse[]>(`/api/v1/hr/payroll/runs${suffix}`);
  },
  async createHrPayrollRun(data: HrPayrollRunCreate): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>("/api/v1/hr/payroll/runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrPayrollApprovals(params?: { status?: string }): Promise<HrPayrollApprovalResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollApprovalResponse[]>(`/api/v1/hr/payroll/approvals${suffix}`);
  },
  async decideHrPayrollApproval(id: number, decision: "approved" | "rejected", note?: string): Promise<HrPayrollApprovalResponse> {
    return request<HrPayrollApprovalResponse>(`/api/v1/hr/payroll/approvals/${id}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ decision, note }),
    });
  },
  async listHrPayslips(params?: { run_id?: number; employee_id?: number }): Promise<HrPayslipResponse[]> {
    const q = new URLSearchParams();
    if (params?.run_id != null) q.set("run_id", String(params.run_id));
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayslipResponse[]>(`/api/v1/hr/payroll/payslips${suffix}`);
  },
  async downloadHrPayslipPdf(payslipId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/payroll/payslips/${payslipId}/pdf`, { method: "GET" });
  },
  async downloadHrPayrollRunBankFile(runId: number): Promise<Blob> {
    return requestBlob(`/api/v1/hr/payroll/runs/${runId}/bank-file`, { method: "GET" });
  },
  async postHrPayrollRun(
    runId: number,
    body?: { note?: string | null; payroll_expense_account_id?: number | null; payroll_payable_account_id?: number | null }
  ): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/hr/payroll/runs/${runId}/post`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async listHrPayrollRunLines(runId: number): Promise<HrPayrollRunLineResponse[]> {
    return request<HrPayrollRunLineResponse[]>(`/api/v1/hr/payroll/runs/${runId}/lines`);
  },
  async upsertHrPayrollRunLine(runId: number, data: HrPayrollRunLineUpsert): Promise<HrPayrollRunLineResponse> {
    return request<HrPayrollRunLineResponse>(`/api/v1/hr/payroll/runs/${runId}/lines/upsert`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async finalizeHrPayrollRun(runId: number): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>(`/api/v1/hr/payroll/runs/${runId}/finalize`, { method: "POST" });
  },
  async approveHrPayrollRun(runId: number, body?: { note?: string | null }): Promise<HrPayrollRunResponse> {
    return request<HrPayrollRunResponse>(`/api/v1/hr/payroll/runs/${runId}/approve`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async generateHrPayrollPayslips(runId: number): Promise<{ ok: boolean; created: number }> {
    return request<{ ok: boolean; created: number }>(`/api/v1/hr/payroll/runs/${runId}/generate-payslips`, {
      method: "POST",
    });
  },
  async listHrGoals(params?: { employee_id?: number; status?: string }): Promise<HrGoalResponse[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrGoalResponse[]>(`/api/v1/hr/performance/goals${suffix}`);
  },
  async createHrGoal(data: HrGoalCreate): Promise<HrGoalResponse> {
    return request<HrGoalResponse>("/api/v1/hr/performance/goals", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrReviews(params?: { employee_id?: number; status?: string }): Promise<HrReviewResponse[]> {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrReviewResponse[]>(`/api/v1/hr/performance/reviews${suffix}`);
  },
  async createHrReview(data: HrReviewCreate): Promise<HrReviewResponse> {
    return request<HrReviewResponse>("/api/v1/hr/performance/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getHrPerformanceDashboard(params?: { month?: string }): Promise<HrPerformanceDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPerformanceDashboardResponse>(`/api/v1/hr/performance/dashboard${suffix}`);
  },
  async listHrJobRequisitions(params?: { status?: string }): Promise<HrJobRequisitionResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrJobRequisitionResponse[]>(`/api/v1/hr/recruitment/requisitions${suffix}`);
  },
  async createHrJobRequisition(data: HrJobRequisitionCreate): Promise<HrJobRequisitionResponse> {
    return request<HrJobRequisitionResponse>("/api/v1/hr/recruitment/requisitions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrJobRequisitionStatus(requisitionId: number, body: { status: string }): Promise<HrJobRequisitionResponse> {
    return request<HrJobRequisitionResponse>(`/api/v1/hr/recruitment/requisitions/${requisitionId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postHrCandidateStage(
    candidateId: number,
    body: { stage: string; status?: string | null }
  ): Promise<HrCandidateResponse> {
    return request<HrCandidateResponse>(`/api/v1/hr/recruitment/candidates/${candidateId}/stage`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrCandidates(params?: { stage?: string }): Promise<HrCandidateResponse[]> {
    const q = new URLSearchParams();
    if (params?.stage) q.set("stage", params.stage);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrCandidateResponse[]>(`/api/v1/hr/recruitment/candidates${suffix}`);
  },
  async createHrCandidate(data: HrCandidateCreate): Promise<HrCandidateResponse> {
    return request<HrCandidateResponse>("/api/v1/hr/recruitment/candidates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrInterviews(params?: { candidate_id?: number }): Promise<HrInterviewResponse[]> {
    const q = new URLSearchParams();
    if (params?.candidate_id != null) q.set("candidate_id", String(params.candidate_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrInterviewResponse[]>(`/api/v1/hr/recruitment/interviews${suffix}`);
  },
  async createHrInterview(data: HrInterviewCreate): Promise<HrInterviewResponse> {
    return request<HrInterviewResponse>("/api/v1/hr/recruitment/interviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrInterviewStatus(
    interviewId: number,
    body: { status: string; feedback?: string | null; rating?: number | null }
  ): Promise<HrInterviewResponse> {
    return request<HrInterviewResponse>(`/api/v1/hr/recruitment/interviews/${interviewId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listHrOffers(params?: { status?: string }): Promise<HrOfferResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrOfferResponse[]>(`/api/v1/hr/recruitment/offers${suffix}`);
  },
  async createHrOffer(data: HrOfferCreate): Promise<HrOfferResponse> {
    return request<HrOfferResponse>("/api/v1/hr/recruitment/offers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postHrOfferStatus(offerId: number, body: { status: string }): Promise<HrOfferResponse> {
    return request<HrOfferResponse>(`/api/v1/hr/recruitment/offers/${offerId}/status`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getHrEssMyProfile(): Promise<HrEssProfileResponse> {
    return request<HrEssProfileResponse>("/api/v1/hr/ess/my-profile");
  },
  async updateHrEssMyProfile(data: HrEssProfileUpdate): Promise<HrEssProfileResponse> {
    return request<HrEssProfileResponse>("/api/v1/hr/ess/my-profile/preferences", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listHrEssMyAttendance(params?: { from_date?: string; to_date?: string }): Promise<HrAttendanceEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceEntryResponse[]>(`/api/v1/hr/ess/my-attendance-summary${suffix}`);
  },
  async listHrEssMyLeaveRequests(params?: { status?: string }): Promise<HrLeaveRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveRequestResponse[]>(`/api/v1/hr/ess/my-leave-requests${suffix}`);
  },
  async createHrEssMyLeaveRequest(data: Omit<HrLeaveRequestCreate, "employee_id">): Promise<HrLeaveRequestResponse> {
    return request<HrLeaveRequestResponse>("/api/v1/hr/ess/my-leave-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrEssMyPayslips(params?: { year?: number }): Promise<HrPayslipResponse[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayslipResponse[]>(`/api/v1/hr/ess/my-payslips${suffix}`);
  },
  async listHrEssMyTickets(): Promise<Record<string, unknown>[]> {
    return request<Record<string, unknown>[]>("/api/v1/hr/ess/my-tickets");
  },
  async createHrEssMyTicket(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/hr/ess/my-tickets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listPlatformSupportTickets(params?: {
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<{ items: PlatformSupportTicketItem[]; total: number; page: number; page_size: number }> {
    const q = new URLSearchParams();
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/support/tickets${suffix}`);
  },
  async getPlatformSupportTicket(id: number): Promise<PlatformSupportTicketDetail> {
    return request(`/api/v1/support/tickets/${id}`);
  },
  async createPlatformSupportTicket(data: {
    title: string;
    description: string;
    category?: string;
    priority?: string;
  }): Promise<{ id: number }> {
    return request("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(data) });
  },
  async replyPlatformSupportTicket(id: number, content: string): Promise<{ id: number }> {
    return request(`/api/v1/support/tickets/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  async getHrReportSummary(params?: { month?: string }): Promise<HrReportSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrReportSummaryResponse>(`/api/v1/hr/reports/summary${suffix}`);
  },
  async listHrAttendanceReport(params?: { month?: string; department_id?: number }): Promise<HrAttendanceReportRow[]> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceReportRow[]>(`/api/v1/hr/reports/attendance${suffix}`);
  },
  async listHrLeaveReport(params?: { year?: number }): Promise<HrLeaveReportRow[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveReportRow[]>(`/api/v1/hr/reports/leave${suffix}`);
  },
  async listHrPayrollReport(params?: { year?: number }): Promise<HrPayrollReportRow[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrPayrollReportRow[]>(`/api/v1/hr/reports/payroll${suffix}`);
  },
  async listInquiries(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    limit?: number;
    offset?: number;
    /** 1 = include rules-based AI indicators per row (no LLM). */
    ai_indicators?: 0 | 1;
  }): Promise<InquiryResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.ai_indicators === 1) q.set("ai_indicators", "1");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryResponse[]>(`/api/v1/inquiries${suffix}`);
  },
  async listInquiriesPaginated(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: 0 | 1;
    page?: number;
    page_size?: number;
  }): Promise<InquiryListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators === 1) q.set("ai_indicators", "1");
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryListPageResponse>(`/api/v1/inquiries/paginated${suffix}`);
  },
  async getInquiry(id: number): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`);
  },
  async createInquiry(data: InquiryCreate): Promise<InquiryResponse> {
    return request<InquiryResponse>("/api/v1/inquiries", {
      method: "POST",
      body: JSON.stringify(inquiryWriteBodyForApi(data)),
    });
  },
  async updateInquiry(id: number, data: InquiryUpdate): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(inquiryWriteBodyForApi(data)),
    });
  },
  async deleteInquiry(id: number): Promise<void> {
    return request<void>(`/api/v1/inquiries/${id}`, { method: "DELETE" });
  },
  async listQuotations(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    benchmark_hint?: number;
    limit?: number;
    offset?: number;
  }): Promise<QuotationResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.benchmark_hint != null) q.set("benchmark_hint", String(params.benchmark_hint));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationResponse[]>(`/api/v1/quotations${suffix}`);
  },
  async listQuotationsPaginated(params?: {
    search?: string;
    status?: string;
    department?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    benchmark_hint?: number;
    page?: number;
    page_size?: number;
  }): Promise<QuotationListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.benchmark_hint != null) q.set("benchmark_hint", String(params.benchmark_hint));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationListPageResponse>(`/api/v1/quotations/paginated${suffix}`);
  },
  async getQuotation(id: number, params?: { ai_indicators?: 0 | 1 }): Promise<QuotationDetailResponse> {
    const q =
      params?.ai_indicators === 1 ? `?ai_indicators=${params.ai_indicators}` : "";
    return request<QuotationDetailResponse>(`/api/v1/quotations/${id}${q}`);
  },
  async createQuotation(data: QuotationCreate): Promise<QuotationResponse> {
    return request<QuotationResponse>("/api/v1/quotations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateQuotation(id: number, data: QuotationUpdate): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteQuotation(id: number): Promise<void> {
    return request<void>(`/api/v1/quotations/${id}`, { method: "DELETE" });
  },
  async updateQuotationFull(id: number, data: QuotationFullUpdate): Promise<QuotationDetailResponse> {
    return request<QuotationDetailResponse>(`/api/v1/quotations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async listOrders(params?: {
    search?: string;
    status?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    limit?: number;
    offset?: number;
  }): Promise<OrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderResponse[]>(`/api/v1/orders${suffix}`);
  },
  async listOrdersPaginated(params?: {
    search?: string;
    status?: string;
    created_from?: string;
    created_to?: string;
    ai_indicators?: number;
    page?: number;
    page_size?: number;
  }): Promise<OrderListPageResponse> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderListPageResponse>(`/api/v1/orders/paginated${suffix}`);
  },
  async getOrder(id: number, params?: { ai_indicators?: number }): Promise<OrderResponse> {
    const q = new URLSearchParams();
    if (params?.ai_indicators != null) q.set("ai_indicators", String(params.ai_indicators));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderResponse>(`/api/v1/orders/${id}${suffix}`);
  },
  /** Same data as GET /merch/orders/{id}/material-requirement (PrimeX-style path). */
  async getOrderMaterials(orderId: number): Promise<MaterialRequirementResponse> {
    return request<MaterialRequirementResponse>(`/api/v1/orders/${orderId}/materials`);
  },
  async getOrderPromiseCheck(id: number): Promise<OrderPromiseCheckResponse> {
    return request<OrderPromiseCheckResponse>(`/api/v1/orders/${id}/promise-check`);
  },
  async getOrderCommercialAlignment(orderId: number): Promise<OrderCommercialAlignmentResponse> {
    return request<OrderCommercialAlignmentResponse>(`/api/v1/orders/${orderId}/commercial-alignment`);
  },
  async getOrderPromiseSummary(params?: { statuses?: string; limit?: number }): Promise<OrderPromiseSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.statuses) q.set("statuses", params.statuses);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderPromiseSummaryResponse>(`/api/v1/orders/promise-summary${suffix}`);
  },
  async createOrder(data: OrderCreate): Promise<OrderResponse> {
    return request<OrderResponse>("/api/v1/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateOrder(id: number, data: OrderUpdate): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteOrder(id: number): Promise<void> {
    return request<void>(`/api/v1/orders/${id}`, { method: "DELETE" });
  },
  async convertQuotationToOrder(id: number): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/from-quotation/${id}`, {
      method: "POST",
    });
  },
  async updateOrderStatus(
    id: number,
    status: string,
    opts?: { force_pipeline_status?: string | null },
  ): Promise<OrderResponse> {
    const body: Record<string, unknown> = { status };
    if (opts?.force_pipeline_status) {
      body.force_pipeline_status = opts.force_pipeline_status;
    }
    return request<OrderResponse>(`/api/v1/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getOrderMilestones(orderId: number): Promise<OrderMilestonesResponse> {
    return request<OrderMilestonesResponse>(`/api/v1/orders/${orderId}/milestones`);
  },
  async updateOrderPipelineSettings(
    orderId: number,
    data: { na_steps?: string[]; order_type?: string },
  ): Promise<OrderMilestonesResponse> {
    return request<OrderMilestonesResponse>(`/api/v1/orders/${orderId}/pipeline-settings`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listOrderAmendments(id: number): Promise<OrderAmendmentResponse[]> {
    return request<OrderAmendmentResponse[]>(`/api/v1/orders/${id}/amendments`);
  },
  async createOrderAmendment(id: number, data: OrderAmendmentCreate): Promise<OrderAmendmentResponse> {
    return request<OrderAmendmentResponse>(`/api/v1/orders/${id}/amendments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getOrderPlanningGrounding(orderId: number): Promise<PlanningGroundingSnapshot> {
    return request<PlanningGroundingSnapshot>(`/api/v1/orders/${orderId}/planning-grounding`);
  },
  async getOrdersPlanningGroundingSummary(orderIds: number[]): Promise<PlanningGroundingSummaryRow[]> {
    if (!orderIds.length) return [];
    const q = new URLSearchParams();
    q.set("order_ids", orderIds.join(","));
    return request<PlanningGroundingSummaryRow[]>(`/api/v1/orders/planning-grounding-summary?${q.toString()}`);
  },
  async listOrderChangeRequests(
    orderId: number,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<CommercialChangeRequestOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialChangeRequestOut[]>(`/api/v1/orders/${orderId}/change-requests${suffix}`);
  },
  async listQuotationChangeRequests(
    quotationId: number,
    params?: { status?: string; limit?: number; offset?: number }
  ): Promise<CommercialChangeRequestOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialChangeRequestOut[]>(
      `/api/v1/quotations/${quotationId}/change-requests${suffix}`
    );
  },
  async getCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}`);
  },
  async createCommercialChangeRequest(data: CommercialChangeRequestCreate): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>("/api/v1/change-requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveCommercialChangeRequest(id: number, note?: string): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    });
  },
  async rejectCommercialChangeRequest(id: number, note?: string): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note: note ?? null }),
    });
  },
  async applyCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/apply`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async cancelCommercialChangeRequest(id: number): Promise<CommercialChangeRequestOut> {
    return request<CommercialChangeRequestOut>(`/api/v1/change-requests/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  async getCommercialChangePendingSummary(): Promise<CommercialChangePendingSummary> {
    return request<CommercialChangePendingSummary>("/api/v1/change-requests/pending-summary");
  },
  async getOrderCommercialTimeline(orderId: number, params?: { limit?: number }): Promise<CommercialTimelineOut> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialTimelineOut>(`/api/v1/orders/${orderId}/commercial-timeline${suffix}`);
  },
  async getQuotationCommercialTimeline(
    quotationId: number,
    params?: { limit?: number }
  ): Promise<CommercialTimelineOut> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CommercialTimelineOut>(
      `/api/v1/quotations/${quotationId}/commercial-timeline${suffix}`
    );
  },
  async convertInquiryToQuotation(
    id: number,
    data?: { profit_percentage?: number }
  ): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/from-inquiry/${id}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  // Costing masters
  async listItemCategories(): Promise<ItemCategoryResponse[]> {
    return request<ItemCategoryResponse[]>("/api/v1/costing/item-categories");
  },
  async listItemUnits(): Promise<ItemUnitResponse[]> {
    return request<ItemUnitResponse[]>("/api/v1/costing/item-units");
  },
  async listCostingItems(params?: { category_id?: number; search?: string }): Promise<CostingItemResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostingItemResponse[]>(`/api/v1/costing/items${suffix}`);
  },
  async listCurrencies(): Promise<CurrencyMasterResponse[]> {
    return request<CurrencyMasterResponse[]>("/api/v1/costing/currencies");
  },
  // Inventory module (legacy parity wave)
  async listInventoryItemCategories(params?: { search?: string; limit?: number }): Promise<ItemCategoryResponse[]> {
    const q = new URLSearchParams();
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemCategoryResponse[]>(`/api/v1/inventory/item-categories${suffix}`);
  },
  async createInventoryItemCategory(data: ItemCategoryCreate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>("/api/v1/inventory/item-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemCategory(id: number, data: ItemCategoryUpdate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>(`/api/v1/inventory/item-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemCategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-categories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemSubcategories(params?: {
    category_id?: number;
    search?: string;
    limit?: number;
  }): Promise<ItemSubcategoryResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemSubcategoryResponse[]>(`/api/v1/inventory/item-subcategories${suffix}`);
  },
  async createInventoryItemSubcategory(data: ItemSubcategoryCreate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>("/api/v1/inventory/item-subcategories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemSubcategory(id: number, data: ItemSubcategoryUpdate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>(`/api/v1/inventory/item-subcategories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemSubcategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-subcategories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemUnits(params?: { search?: string; limit?: number }): Promise<ItemUnitResponse[]> {
    const q = new URLSearchParams();
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemUnitResponse[]>(`/api/v1/inventory/item-units${suffix}`);
  },
  async createInventoryItemUnit(data: ItemUnitCreate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>("/api/v1/inventory/item-units", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemUnit(id: number, data: ItemUnitUpdate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>(`/api/v1/inventory/item-units/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemUnit(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-units/${id}`, { method: "DELETE" });
  },
  async listInventoryItems(params?: { category_id?: number; subcategory_id?: number }): Promise<InventoryItemResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.category_id != null) q.set("category_id", String(params.category_id));
      if (params?.subcategory_id != null) q.set("subcategory_id", String(params.subcategory_id));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<InventoryItemResponse>>(`/api/v1/inventory/items?${q.toString()}`);
    });
  },
  /** Single page of items (use for list UIs; avoids downloading the full catalog). */
  async listInventoryItemsPaginated(params?: {
    category_id?: number;
    subcategory_id?: number;
    /** Substring match on code or name (server-side). */
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<InventoryItemResponse>> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.subcategory_id != null) q.set("subcategory_id", String(params.subcategory_id));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<InventoryItemResponse>>(`/api/v1/inventory/items${suffix}`);
  },
  async getInventoryItem(id: number): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>(`/api/v1/inventory/items/${id}`);
  },
  async createInventoryItem(data: InventoryItemCreate): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>("/api/v1/inventory/items", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItem(id: number, data: InventoryItemUpdate): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>(`/api/v1/inventory/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItem(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/items/${id}`, { method: "DELETE" });
  },
  async listWarehouses(): Promise<WarehouseResponse[]> {
    return request<WarehouseResponse[]>("/api/v1/inventory/warehouses");
  },
  async createWarehouse(data: WarehouseCreate): Promise<WarehouseResponse> {
    return request<WarehouseResponse>("/api/v1/inventory/warehouses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateWarehouse(id: number, data: WarehouseUpdate): Promise<WarehouseResponse> {
    return request<WarehouseResponse>(`/api/v1/inventory/warehouses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteWarehouse(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/warehouses/${id}`, { method: "DELETE" });
  },
  async listVendors(params?: {
    search?: string;
    is_active?: boolean;
    vendor_type?: string;
    currency?: string;
    ledger_id?: number;
    has_ledger?: boolean;
  }): Promise<VendorResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.search) q.set("search", params.search);
      if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
      if (params?.vendor_type) q.set("vendor_type", params.vendor_type);
      if (params?.currency) q.set("currency", params.currency);
      if (params?.ledger_id != null) q.set("ledger_id", String(params.ledger_id));
      if (params?.has_ledger !== undefined) q.set("has_ledger", String(params.has_ledger));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<VendorResponse>>(`/api/v1/inventory/vendors?${q.toString()}`);
    });
  },
  async listVendorsPaginated(params?: {
    search?: string;
    is_active?: boolean;
    vendor_type?: string;
    currency?: string;
    ledger_id?: number;
    has_ledger?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<VendorResponse>> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
    if (params?.vendor_type) q.set("vendor_type", params.vendor_type);
    if (params?.currency) q.set("currency", params.currency);
    if (params?.ledger_id != null) q.set("ledger_id", String(params.ledger_id));
    if (params?.has_ledger !== undefined) q.set("has_ledger", String(params.has_ledger));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<VendorResponse>>(`/api/v1/inventory/vendors${suffix}`);
  },
  async getVendor(id: number): Promise<VendorResponse> {
    return request<VendorResponse>(`/api/v1/inventory/vendors/${id}`);
  },
  async createVendor(data: VendorCreate): Promise<VendorResponse> {
    return request<VendorResponse>("/api/v1/inventory/vendors", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateVendor(id: number, data: VendorUpdate): Promise<VendorResponse> {
    return request<VendorResponse>(`/api/v1/inventory/vendors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteVendor(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/vendors/${id}`, { method: "DELETE" });
  },
  async listStockGroups(): Promise<StockGroupResponse[]> {
    return request<StockGroupResponse[]>("/api/v1/inventory/stock-groups");
  },
  async createStockGroup(data: StockGroupCreate): Promise<StockGroupResponse> {
    return request<StockGroupResponse>("/api/v1/inventory/stock-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStockGroup(id: number, data: StockGroupUpdate): Promise<StockGroupResponse> {
    return request<StockGroupResponse>(`/api/v1/inventory/stock-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStockGroup(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/stock-groups/${id}`, { method: "DELETE" });
  },
  async getPurchaseOrder(id: number): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>(`/api/v1/inventory/purchase-orders/${id}`);
  },
  async listPurchaseOrders(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    source_bom_id?: number;
    vendor_id?: number;
    exclude_po_linked_to_proforma?: number;
    exclude_linked_to_proforma_invoice_id?: number;
  }): Promise<PurchaseOrderResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.status_filter) q.set("status_filter", params.status_filter);
      if (params?.date_from) q.set("date_from", params.date_from);
      if (params?.date_to) q.set("date_to", params.date_to);
      if (params?.source_bom_id != null) q.set("source_bom_id", String(params.source_bom_id));
      if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
      if (params?.exclude_po_linked_to_proforma != null) {
        q.set("exclude_po_linked_to_proforma", String(params.exclude_po_linked_to_proforma));
      }
      if (params?.exclude_linked_to_proforma_invoice_id != null) {
        q.set(
          "exclude_linked_to_proforma_invoice_id",
          String(params.exclude_linked_to_proforma_invoice_id)
        );
      }
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<PurchaseOrderResponse>>(`/api/v1/inventory/purchase-orders?${q.toString()}`);
    }, 100);
  },
  async listPurchaseOrdersPaginated(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    source_bom_id?: number;
    vendor_id?: number;
    exclude_po_linked_to_proforma?: number;
    exclude_linked_to_proforma_invoice_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<PurchaseOrderResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.source_bom_id != null) q.set("source_bom_id", String(params.source_bom_id));
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.exclude_po_linked_to_proforma != null) {
      q.set("exclude_po_linked_to_proforma", String(params.exclude_po_linked_to_proforma));
    }
    if (params?.exclude_linked_to_proforma_invoice_id != null) {
      q.set(
        "exclude_linked_to_proforma_invoice_id",
        String(params.exclude_linked_to_proforma_invoice_id)
      );
    }
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<PurchaseOrderResponse>>(`/api/v1/inventory/purchase-orders${suffix}`);
  },
  async createPurchaseOrder(data: PurchaseOrderCreate): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>("/api/v1/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updatePurchaseOrderStatus(id: number, status: string): Promise<PurchaseOrderResponse> {
    return request<PurchaseOrderResponse>(`/api/v1/inventory/purchase-orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  async getPurchaseOrderReceiptProgress(poId: number): Promise<PurchaseOrderReceiptProgress> {
    return request<PurchaseOrderReceiptProgress>(`/api/v1/inventory/purchase-orders/${poId}/receipt-progress`);
  },
  async getGoodsReceiving(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}`);
  },
  async listGoodsReceiving(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    purchase_order_id?: number;
  }): Promise<GoodsReceivingResponse[]> {
    return fetchAllPaginated(async (page, pageSize) => {
      const q = new URLSearchParams();
      if (params?.status_filter) q.set("status_filter", params.status_filter);
      if (params?.date_from) q.set("date_from", params.date_from);
      if (params?.date_to) q.set("date_to", params.date_to);
      if (params?.purchase_order_id != null) q.set("purchase_order_id", String(params.purchase_order_id));
      q.set("page", String(page));
      q.set("page_size", String(pageSize));
      return request<PaginatedRows<GoodsReceivingResponse>>(`/api/v1/inventory/goods-receiving?${q.toString()}`);
    }, 100);
  },
  async listGoodsReceivingPaginated(params?: {
    status_filter?: string;
    date_from?: string;
    date_to?: string;
    purchase_order_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedRows<GoodsReceivingResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.purchase_order_id != null) q.set("purchase_order_id", String(params.purchase_order_id));
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaginatedRows<GoodsReceivingResponse>>(`/api/v1/inventory/goods-receiving${suffix}`);
  },
  async createGoodsReceiving(data: GoodsReceivingCreate): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>("/api/v1/inventory/goods-receiving", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async receiveGoods(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}/receive`, {
      method: "POST",
    });
  },
  async acknowledgeGoodsReceiving(id: number): Promise<GoodsReceivingResponse> {
    return request<GoodsReceivingResponse>(`/api/v1/inventory/goods-receiving/${id}/acknowledge`, { method: "POST" });
  },
  async getGoodsReceivingPrintData(id: number): Promise<InventoryDocumentPrintPayload & Record<string, unknown>> {
    return request<InventoryDocumentPrintPayload & Record<string, unknown>>(`/api/v1/inventory/goods-receiving/${id}/print-data`);
  },
  async bulkPurchaseOrderStatus(ids: number[], status: string): Promise<{ updated: number }> {
    return request<{ updated: number }>("/api/v1/inventory/purchase-orders/bulk-status", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    });
  },
  async bulkReceiveGoods(ids: number[]): Promise<Array<{ id: number; ok: boolean; grn_code?: string; detail?: unknown }>> {
    return request(`/api/v1/inventory/goods-receiving/bulk-receive`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
  async getStockSummary(params?: { limit?: number; offset?: number }): Promise<StockSummaryRow[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockSummaryRow[]>(`/api/v1/inventory/stock-summary${suffix}`);
  },
  async getStockSummaryWithTotal(params?: {
    limit?: number;
    offset?: number;
    search?: string;
    warehouse_id?: number;
    hide_zero?: boolean;
    sort?: "item" | "warehouse" | "in" | "out" | "on_hand";
    sort_dir?: "asc" | "desc";
  }): Promise<ListWithTotal<StockSummaryRow>> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    if (params?.hide_zero) q.set("hide_zero", "true");
    if (params?.sort) q.set("sort", params.sort);
    if (params?.sort_dir) q.set("sort_dir", params.sort_dir);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StockSummaryRow>(`/api/v1/inventory/stock-summary${suffix}`);
  },
  async getStockValuation(params?: { as_of_date?: string }): Promise<StockValuationResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockValuationResponse>(`/api/v1/inventory/stock-valuation${suffix}`);
  },

  async postFifoRebuild(): Promise<{ ok: boolean; movements_replayed: number }> {
    return request<{ ok: boolean; movements_replayed: number }>("/api/v1/inventory/fifo-rebuild", { method: "POST" });
  },

  async getStockSummaryByGroup(as_of_date?: string): Promise<StockSummaryByGroupResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockSummaryByGroupResponse>(`/api/v1/inventory/stock-summary/by-group${q}`);
  },

  async getStockSummaryByWarehouse(as_of_date?: string): Promise<StockSummaryByWarehouseResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockSummaryByWarehouseResponse>(`/api/v1/inventory/stock-summary/by-warehouse${q}`);
  },

  async getStockSummaryWip(): Promise<WipSummaryResponse> {
    return request<WipSummaryResponse>("/api/v1/inventory/stock-summary/wip");
  },

  async getStockSummaryOverview(as_of_date?: string): Promise<StockOverviewResponse> {
    const q = as_of_date ? `?as_of_date=${encodeURIComponent(as_of_date)}` : "";
    return request<StockOverviewResponse>(`/api/v1/inventory/stock-summary/overview${q}`);
  },

  async getReconciliationStockVsGl(): Promise<StockVsGlResponse> {
    return request<StockVsGlResponse>("/api/v1/inventory/reconciliation/stock-vs-gl");
  },

  async getReconciliationWipVsGl(): Promise<WipVsGlResponse> {
    return request<WipVsGlResponse>("/api/v1/inventory/reconciliation/wip-vs-gl");
  },
  async getStockDashboard(params?: { low_stock_threshold?: number }): Promise<StockDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.low_stock_threshold != null) q.set("low_stock_threshold", String(params.low_stock_threshold));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockDashboardResponse>(`/api/v1/inventory/stock-dashboard${suffix}`);
  },
  async getStockLedger(params?: {
    item_id?: number;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<StockLedgerPageResponse> {
    const q = new URLSearchParams();
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockLedgerPageResponse>(`/api/v1/inventory/stock-ledger${suffix}`);
  },
  async listWarehouseTransfers(params?: { status_filter?: string }): Promise<WarehouseTransferResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WarehouseTransferResponse[]>(`/api/v1/inventory/warehouse-transfers${suffix}`);
  },
  async createWarehouseTransfer(data: WarehouseTransferCreate): Promise<WarehouseTransferResponse> {
    return request<WarehouseTransferResponse>("/api/v1/inventory/warehouse-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postWarehouseTransfer(id: number): Promise<WarehouseTransferResponse> {
    return request<WarehouseTransferResponse>(`/api/v1/inventory/warehouse-transfers/${id}/post`, { method: "POST" });
  },
  async listStockAdjustments(params?: { status_filter?: string }): Promise<StockAdjustmentResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockAdjustmentResponse[]>(`/api/v1/inventory/stock-adjustments${suffix}`);
  },
  async createStockAdjustment(data: StockAdjustmentCreate): Promise<StockAdjustmentResponse> {
    return request<StockAdjustmentResponse>("/api/v1/inventory/stock-adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async postStockAdjustment(id: number): Promise<StockAdjustmentResponse> {
    return request<StockAdjustmentResponse>(`/api/v1/inventory/stock-adjustments/${id}/post`, { method: "POST" });
  },
  async traceLotNumber(lotNumber: string): Promise<LotTraceResponse> {
    const q = new URLSearchParams({ lot_number: lotNumber });
    return request<LotTraceResponse>(`/api/v1/inventory/lot-trace?${q.toString()}`);
  },
  async listDeliveryChallans(params?: { status_filter?: string; date_from?: string; date_to?: string }): Promise<DeliveryChallanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DeliveryChallanResponse[]>(`/api/v1/inventory/delivery-challans${suffix}`);
  },
  async createDeliveryChallan(data: DeliveryChallanCreate): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>("/api/v1/inventory/delivery-challans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateDeliveryChallanStatus(id: number, status: string): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>(`/api/v1/inventory/delivery-challans/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  async getDeliveryChallan(id: number): Promise<DeliveryChallanResponse> {
    return request<DeliveryChallanResponse>(`/api/v1/inventory/delivery-challans/${id}`);
  },
  async getDeliveryChallanPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/delivery-challans/${id}/print-data`);
  },
  async getDeliveryChallanGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/delivery-challans/${id}/gl-postings`);
  },
  async getEnhancedGatePass(id: number): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>(`/api/v1/inventory/enhanced-gate-passes/${id}`);
  },
  async getGatePassPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/enhanced-gate-passes/${id}/print-data`);
  },
  async getGatePassGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/enhanced-gate-passes/${id}/gl-postings`);
  },
  async getGoodsReceivingGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/goods-receiving/${id}/gl-postings`);
  },
  async verifyInventoryDocument(verificationId: string): Promise<InventoryDocumentVerifyResponse> {
    return request<InventoryDocumentVerifyResponse>(
      `/api/v1/inventory/documents/verify/${encodeURIComponent(verificationId)}`,
    );
  },
  async backfillInventoryDocumentSignatures(): Promise<{ ok: boolean; signed: Record<string, number> }> {
    return request(`/api/v1/inventory/documents/backfill-signatures`, { method: "POST" });
  },
  async getProductionMaterialIssueDetail(id: number): Promise<ProductionMaterialIssueDetailResponse> {
    return request<ProductionMaterialIssueDetailResponse>(`/api/v1/inventory/production-material-issues/${id}`);
  },
  async getProductionMaterialIssuePrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/production-material-issues/${id}/print-data`);
  },
  async getProductionMaterialIssueGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/production-material-issues/${id}/gl-postings`);
  },
  async getProcessOrderPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/process-orders/${id}/print-data`);
  },
  async getProcessOrderGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/process-orders/${id}/gl-postings`);
  },
  async getWarehouseTransferPrintData(id: number): Promise<InventoryDocumentPrintPayload> {
    return request<InventoryDocumentPrintPayload>(`/api/v1/inventory/warehouse-transfers/${id}/print-data`);
  },
  async getWarehouseTransferGlPostings(id: number): Promise<InventoryGlPostingDetail[]> {
    return request<InventoryGlPostingDetail[]>(`/api/v1/inventory/warehouse-transfers/${id}/gl-postings`);
  },
  async listEnhancedGatePasses(params?: { status_filter?: string; date_from?: string; date_to?: string }): Promise<EnhancedGatePassResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<EnhancedGatePassResponse[]>(`/api/v1/inventory/enhanced-gate-passes${suffix}`);
  },
  async createEnhancedGatePass(data: EnhancedGatePassCreate): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>("/api/v1/inventory/enhanced-gate-passes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateEnhancedGatePassStatus(
    id: number,
    data: { status?: string; guard_acknowledged?: boolean },
  ): Promise<EnhancedGatePassResponse> {
    return request<EnhancedGatePassResponse>(`/api/v1/inventory/enhanced-gate-passes/${id}/status`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listProcessOrders(): Promise<ProcessOrderResponse[]> {
    return request<ProcessOrderResponse[]>("/api/v1/inventory/process-orders");
  },
  async getProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}`);
  },
  async createProcessOrder(data: ProcessOrderCreate): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>("/api/v1/inventory/process-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateProcessOrder(id: number, data: ProcessOrderCreate): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async issueProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/issue`, { method: "POST" });
  },
  async receiveProcessOrder(id: number, data: ProcessOrderReceive): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/receive`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveProcessOrder(id: number): Promise<ProcessOrderResponse> {
    return request<ProcessOrderResponse>(`/api/v1/inventory/process-orders/${id}/approve`, { method: "POST" });
  },
  async addProcessOrderCostLine(
    processOrderId: number,
    data: { cost_type?: string; description?: string | null; amount: string; vendor_id?: number | null; currency?: string | null; remarks?: string | null },
  ): Promise<{ id: number; process_order_id: number; amount: string; cost_type: string }> {
    return request(`/api/v1/inventory/process-orders/${processOrderId}/cost-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listProductionMaterialIssues(params?: { limit?: number; offset?: number }): Promise<ProductionMaterialIssueResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ProductionMaterialIssueResponse[]>(`/api/v1/inventory/production-material-issues${suffix}`);
  },
  async createProductionMaterialIssue(data: ProductionMaterialIssueCreate): Promise<ProductionMaterialIssueResponse> {
    return request<ProductionMaterialIssueResponse>("/api/v1/inventory/production-material-issues", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listManufacturingOrders(params?: { limit?: number; offset?: number }): Promise<ManufacturingOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ManufacturingOrderResponse[]>(`/api/v1/inventory/manufacturing-orders${suffix}`);
  },
  async listManufacturingOrdersWithTotal(params?: { limit?: number; offset?: number }): Promise<ListWithTotal<ManufacturingOrderResponse>> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders${suffix}`);
  },
  async getManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}`);
  },
  async createManufacturingOrder(data: ManufacturingOrderCreate): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>("/api/v1/inventory/manufacturing-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getManufacturingStages(id: number): Promise<ManufacturingStageResponse[]> {
    return request<ManufacturingStageResponse[]>(`/api/v1/inventory/manufacturing-orders/${id}/stages`);
  },
  async startManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/start`, { method: "POST" });
  },
  async holdManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/hold`, { method: "POST" });
  },
  async resumeManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/resume`, { method: "POST" });
  },
  async completeManufacturingOrder(id: number): Promise<ManufacturingOrderResponse> {
    return request<ManufacturingOrderResponse>(`/api/v1/inventory/manufacturing-orders/${id}/complete`, { method: "POST" });
  },
  async startManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/start`, { method: "POST" });
  },
  async completeManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/complete`, { method: "POST" });
  },
  async skipManufacturingStage(stageId: number): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}/skip`, { method: "POST" });
  },
  async updateManufacturingStage(stageId: number, data: ManufacturingStageUpdate): Promise<ManufacturingStageResponse> {
    return request<ManufacturingStageResponse>(`/api/v1/inventory/manufacturing-orders/stages/${stageId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async listMfgProductionPlans(params?: { status_filter?: string }): Promise<MfgProductionPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgProductionPlanResponse[]>(`/api/v1/manufacturing/planning/production-plans${suffix}`);
  },
  async createMfgProductionPlan(data: MfgProductionPlanCreate): Promise<MfgProductionPlanResponse> {
    return request<MfgProductionPlanResponse>("/api/v1/manufacturing/planning/production-plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async generateMfgWorkOrders(planId: number): Promise<MfgWorkOrderResponse[]> {
    return request<MfgWorkOrderResponse[]>(`/api/v1/manufacturing/planning/production-plans/${planId}/generate-work-orders`, {
      method: "POST",
    });
  },
  async listMfgWorkOrders(params?: { status_filter?: string }): Promise<MfgWorkOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgWorkOrderResponse[]>(`/api/v1/manufacturing/execution/work-orders${suffix}`);
  },
  async runMfgMrp(data: MfgMrpRunCreate): Promise<MfgMrpRunResponse> {
    return request<MfgMrpRunResponse>("/api/v1/manufacturing/planning/mrp/runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMfgMrpRecommendations(runId: number): Promise<MfgMrpRecommendationResponse[]> {
    return request<MfgMrpRecommendationResponse[]>(`/api/v1/manufacturing/planning/mrp/runs/${runId}/recommendations`);
  },
  async getMfgCapacityLoads(): Promise<MfgCapacityLoadRow[]> {
    return request<MfgCapacityLoadRow[]>("/api/v1/manufacturing/planning/capacity/loads");
  },
  async getMfgActualCost(workOrderId: number): Promise<MfgActualCostResponse> {
    return request<MfgActualCostResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/actual-cost`);
  },
  async freezeMfgCostSnapshot(workOrderId: number, data: MfgFreezeSnapshotCreate): Promise<MfgCostSnapshotResponse> {
    return request<MfgCostSnapshotResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/freeze-cost-snapshot`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMfgCostVariance(workOrderId: number): Promise<MfgVarianceResponse> {
    return request<MfgVarianceResponse>(`/api/v1/manufacturing/costing/work-orders/${workOrderId}/variance`);
  },
  async getMfgExecutionDashboard(): Promise<MfgExecutionDashboardResponse> {
    return request<MfgExecutionDashboardResponse>("/api/v1/manufacturing/execution/dashboard");
  },
  async getMfgDowntimeReasonSummary(params?: { start_date?: string; end_date?: string }): Promise<MfgDowntimeReasonRow[]> {
    const q = new URLSearchParams();
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeReasonRow[]>(`/api/v1/manufacturing/execution/dashboard/downtime-reasons${suffix}`);
  },
  async getMfgDowntimeTrend(params?: { start_date?: string; end_date?: string }): Promise<MfgDowntimeTrendRow[]> {
    const q = new URLSearchParams();
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeTrendRow[]>(`/api/v1/manufacturing/execution/dashboard/downtime-trend${suffix}`);
  },
  async listMfgMasterOperations(params?: { active_only?: boolean }): Promise<MfgMasterOperationResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgMasterOperationResponse[]>(`/api/v1/manufacturing/master/operations${suffix}`);
  },
  async createMfgMasterOperation(data: MfgMasterOperationCreate): Promise<MfgMasterOperationResponse> {
    return request<MfgMasterOperationResponse>("/api/v1/manufacturing/master/operations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgMasterOperation(operationId: number, data: MfgMasterOperationUpdate): Promise<MfgMasterOperationResponse> {
    return request<MfgMasterOperationResponse>(`/api/v1/manufacturing/master/operations/${operationId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listMfgSampleRequests(params?: { status_filter?: string; priority?: string }): Promise<MfgSampleRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.priority) q.set("priority", params.priority);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgSampleRequestResponse[]>(`/api/v1/manufacturing/samples/requests${suffix}`);
  },
  async createMfgSampleRequest(data: MfgSampleRequestCreate): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>("/api/v1/manufacturing/samples/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgSampleRequest(sampleId: number, data: MfgSampleRequestUpdate): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>(`/api/v1/manufacturing/samples/requests/${sampleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async updateMfgSampleRequestStatus(sampleId: number, statusValue: string, note?: string): Promise<MfgSampleRequestResponse> {
    return request<MfgSampleRequestResponse>(`/api/v1/manufacturing/samples/requests/${sampleId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: statusValue, note: note ?? null }),
    });
  },
  async listMfgTnaTemplates(params?: { active_only?: boolean }): Promise<MfgTnaTemplateResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgTnaTemplateResponse[]>(`/api/v1/manufacturing/tna/templates${suffix}`);
  },
  async createMfgTnaTemplate(data: MfgTnaTemplateCreate): Promise<MfgTnaTemplateResponse> {
    return request<MfgTnaTemplateResponse>("/api/v1/manufacturing/tna/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaTemplateTasks(templateId: number): Promise<MfgTnaTemplateTaskResponse[]> {
    return request<MfgTnaTemplateTaskResponse[]>(`/api/v1/manufacturing/tna/templates/${templateId}/tasks`);
  },
  async addMfgTnaTemplateTask(templateId: number, data: MfgTnaTemplateTaskCreate): Promise<MfgTnaTemplateTaskResponse> {
    return request<MfgTnaTemplateTaskResponse>(`/api/v1/manufacturing/tna/templates/${templateId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaPlans(params?: { status_filter?: string }): Promise<MfgTnaPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgTnaPlanResponse[]>(`/api/v1/manufacturing/tna/plans${suffix}`);
  },
  async getMfgTnaPlan(planId: number): Promise<MfgTnaPlanResponse> {
    return request<MfgTnaPlanResponse>(`/api/v1/manufacturing/tna/plans/${planId}`);
  },
  async createMfgTnaPlan(data: MfgTnaPlanCreate): Promise<MfgTnaPlanResponse> {
    return request<MfgTnaPlanResponse>("/api/v1/manufacturing/tna/plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgTnaPlanTasks(planId: number): Promise<MfgTnaPlanTaskResponse[]> {
    return request<MfgTnaPlanTaskResponse[]>(`/api/v1/manufacturing/tna/plans/${planId}/tasks`);
  },
  async updateMfgTnaPlanTask(taskId: number, data: MfgTnaPlanTaskUpdate): Promise<MfgTnaPlanTaskResponse> {
    return request<MfgTnaPlanTaskResponse>(`/api/v1/manufacturing/tna/plan-tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getMfgTnaDashboardSummary(): Promise<MfgTnaDashboardSummary> {
    return request<MfgTnaDashboardSummary>("/api/v1/manufacturing/tna/dashboard/summary");
  },
  async listMfgOperationQueue(params?: {
    work_center_id?: number;
    status_filter?: string;
    area?: "cutting" | "sewing" | "finishing";
    limit?: number;
  }): Promise<MfgOperationQueueRow[]> {
    const q = new URLSearchParams();
    if (params?.work_center_id != null) q.set("work_center_id", String(params.work_center_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.area) q.set("area", params.area);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgOperationQueueRow[]>(`/api/v1/manufacturing/execution/operations/queue${suffix}`);
  },
  async assignMfgOperation(data: MfgOperationAssignCreate): Promise<MfgOperationAssignmentResponse> {
    return request<MfgOperationAssignmentResponse>("/api/v1/manufacturing/execution/operations/assignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async startMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/start`, {
      method: "POST",
    });
  },
  async holdMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/hold`, {
      method: "POST",
    });
  },
  async resumeMfgOperation(workOrderOperationId: number): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/resume`, {
      method: "POST",
    });
  },
  async completeMfgOperation(
    workOrderOperationId: number,
    data: { qty_in?: number; qty_out?: number; scrap_qty?: number },
  ): Promise<WorkOrderOperationResponseApi> {
    return request<WorkOrderOperationResponseApi>(`/api/v1/manufacturing/execution/operations/${workOrderOperationId}/complete`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async createMfgDowntime(data: MfgDowntimeCreate): Promise<MfgDowntimeResponse> {
    return request<MfgDowntimeResponse>("/api/v1/manufacturing/execution/operations/downtime", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgDowntime(params?: { work_order_operation_id?: number; open_only?: boolean }): Promise<MfgDowntimeResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_operation_id != null) q.set("work_order_operation_id", String(params.work_order_operation_id));
    if (params?.open_only) q.set("open_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgDowntimeResponse[]>(`/api/v1/manufacturing/execution/operations/downtime${suffix}`);
  },
  async endMfgDowntime(downtimeId: number, endedAt?: string): Promise<MfgDowntimeResponse> {
    return request<MfgDowntimeResponse>(`/api/v1/manufacturing/execution/operations/downtime/${downtimeId}/end`, {
      method: "POST",
      body: JSON.stringify({ ended_at: endedAt ?? null }),
    });
  },
  async listMfgMaterialReturns(params?: { work_order_id?: number }): Promise<MfgMaterialReturnResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgMaterialReturnResponse[]>(`/api/v1/manufacturing/execution/material-returns${suffix}`);
  },
  async listMfgQualityChecks(params?: { work_order_id?: number; check_type?: string }): Promise<MfgQualityCheckResponse[]> {
    const q = new URLSearchParams();
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    if (params?.check_type) q.set("check_type", params.check_type);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgQualityCheckResponse[]>(`/api/v1/manufacturing/quality/checks${suffix}`);
  },
  async createMfgQualityCheck(data: MfgQualityCheckCreate): Promise<MfgQualityCheckResponse> {
    return request<MfgQualityCheckResponse>("/api/v1/manufacturing/quality/checks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listMfgNcrs(params?: { status_filter?: string; work_order_id?: number }): Promise<MfgNcrResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.work_order_id != null) q.set("work_order_id", String(params.work_order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgNcrResponse[]>(`/api/v1/manufacturing/quality/ncrs${suffix}`);
  },
  async createMfgNcr(data: MfgNcrCreate): Promise<MfgNcrResponse> {
    return request<MfgNcrResponse>("/api/v1/manufacturing/quality/ncrs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgNcrStatus(ncrId: number, statusValue: string, note?: string): Promise<MfgNcrResponse> {
    return request<MfgNcrResponse>(`/api/v1/manufacturing/quality/ncrs/${ncrId}/status`, {
      method: "POST",
      body: JSON.stringify({ status: statusValue, note: note ?? null }),
    });
  },
  async listMfgCapas(params?: { status_filter?: string; ncr_id?: number }): Promise<MfgCapaResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.ncr_id != null) q.set("ncr_id", String(params.ncr_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MfgCapaResponse[]>(`/api/v1/manufacturing/quality/capas${suffix}`);
  },
  async createMfgCapa(data: MfgCapaCreate): Promise<MfgCapaResponse> {
    return request<MfgCapaResponse>("/api/v1/manufacturing/quality/capas", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMfgCapaStatus(capaId: number, data: MfgCapaStatusUpdate): Promise<MfgCapaResponse> {
    return request<MfgCapaResponse>(`/api/v1/manufacturing/quality/capas/${capaId}/status`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getQualityDashboard(params?: { date_from?: string; date_to?: string }): Promise<QualityDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QualityDashboardResponse>(`/api/v1/manufacturing/quality/dashboard${suffix}`);
  },
  async finalizeConsumptionOrder(orderId: number): Promise<{ ok: boolean; already_finalized?: boolean }> {
    return request<{ ok: boolean; already_finalized?: boolean }>(
      `/api/v1/inventory/consumption-control/finalize-order/${orderId}`,
      { method: "POST" },
    );
  },
  async getConsumptionSnapshot(orderId: number): Promise<ConsumptionSnapshotResponse> {
    return request<ConsumptionSnapshotResponse>(`/api/v1/inventory/consumption-control/snapshot/${orderId}`);
  },
  async getConsumptionReservations(orderId: number): Promise<ConsumptionReservationRow[]> {
    return request<ConsumptionReservationRow[]>(`/api/v1/inventory/consumption-control/reservations/${orderId}`);
  },
  async issueConsumptionMaterial(data: ConsumptionIssueCreate): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>("/api/v1/inventory/consumption-control/issue-material", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getInventoryReconciliationOverview(): Promise<InventoryReconciliationOverview> {
    return request<InventoryReconciliationOverview>("/api/v1/inventory/reconciliation/overview");
  },
  async getOrderMaterialVariance(orderId: number): Promise<Record<string, unknown>> {
    return request(`/api/v1/inventory/material-control/order/${orderId}/variance`);
  },
  async listMaterialControlStockMovements(params?: {
    order_id?: number;
    movement_kind?: string;
    limit?: number;
    offset?: number;
  }): Promise<MaterialControlStockMovementRow[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.movement_kind) q.set("movement_kind", params.movement_kind);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MaterialControlStockMovementRow[]>(`/api/v1/inventory/stock-movements${suffix}`);
  },
  async listConsumptionChangeRequests(params?: { status_filter?: string; order_id?: number }): Promise<ConsumptionChangeRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionChangeRequestResponse[]>(`/api/v1/inventory/consumption-control/change-requests${suffix}`);
  },
  async createConsumptionChangeRequest(data: ConsumptionChangeRequestCreate): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>("/api/v1/inventory/consumption-control/change-request", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async approveConsumptionChangeRequest(id: number, reason?: string): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>(`/api/v1/inventory/consumption-control/change-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    });
  },
  async rejectConsumptionChangeRequest(id: number, reason: string): Promise<ConsumptionChangeRequestResponse> {
    return request<ConsumptionChangeRequestResponse>(`/api/v1/inventory/consumption-control/change-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  // Currency module (exchange rates – PrimeX parity)
  async listCurrencyExchangeRates(params?: { active_only?: boolean }): Promise<CurrencyExchangeRateResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only !== false) q.set("active_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CurrencyExchangeRateResponse[]>(`/api/v1/currency/exchange-rates${suffix}`);
  },
  async getCurrencyExchangeRatePair(fromCode: string, toCode: string): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>(
      `/api/v1/currency/exchange-rates/${encodeURIComponent(fromCode)}/${encodeURIComponent(toCode)}`
    );
  },
  async createCurrencyExchangeRate(data: CurrencyExchangeRateCreate): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>("/api/v1/currency/exchange-rates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCurrencyExchangeRate(
    rateId: number,
    data: CurrencyExchangeRateUpdate
  ): Promise<CurrencyExchangeRateResponse> {
    return request<CurrencyExchangeRateResponse>(`/api/v1/currency/exchange-rates/${rateId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteCurrencyExchangeRate(rateId: number): Promise<void> {
    return request<void>(`/api/v1/currency/exchange-rates/${rateId}`, { method: "DELETE" });
  },
  async getLiveRates(base?: string): Promise<LiveRatesResponse> {
    const q = base ? `?base=${encodeURIComponent(base)}` : "";
    return request<LiveRatesResponse>(`/api/v1/currency/live-rates${q}`);
  },
  // Merchandising linked module
  async listStyles(params?: {
    status?: string;
    search?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    lifecycle_stage?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
    style_ids?: number[];
    limit?: number;
    offset?: number;
  }): Promise<StyleResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<StyleResponse>(`/api/v1/merch/styles${suffix}`);
    return res.rows;
  },
  async listStylesWithTotal(params?: {
    status?: string;
    search?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    lifecycle_stage?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
    style_ids?: number[];
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<StyleResponse>> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StyleResponse>(`/api/v1/merch/styles${suffix}`);
  },
  async createStyle(data: StyleCreate): Promise<StyleResponse> {
    return request<StyleResponse>("/api/v1/merch/styles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getStyle(id: number): Promise<StyleResponse> {
    return request<StyleResponse>(`/api/v1/merch/styles/${id}`);
  },
  async updateStyle(id: number, data: StyleUpdate): Promise<StyleResponse> {
    return request<StyleResponse>(`/api/v1/merch/styles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyle(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${id}`, { method: "DELETE" });
  },
  async getStyleSummary(id: number): Promise<StyleSummaryResponse> {
    return request<StyleSummaryResponse>(`/api/v1/merch/styles/${id}/summary`);
  },
  async listStyleTimeline(id: number, params?: { limit?: number }): Promise<StyleTimelineEvent[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StyleTimelineEvent[]>(`/api/v1/merch/styles/${id}/timeline${suffix}`);
  },
  async listStyleSummaryReport(params?: {
    search?: string;
    lifecycle_stage?: string;
    critical_only?: boolean;
    saved_view?: string;
    style_ids?: number[];
    report_limit?: number;
    report_offset?: number;
    status?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
  }): Promise<StyleReportRow[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.critical_only != null) q.set("critical_only", String(params.critical_only));
    if (params?.saved_view) q.set("saved_view", params.saved_view);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.report_limit != null) q.set("report_limit", String(params.report_limit));
    if (params?.report_offset != null) q.set("report_offset", String(params.report_offset));
    if (params?.status) q.set("status", params.status);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StyleReportRow[]>(`/api/v1/merch/styles/summary-report${suffix}`);
  },
  async listStyleSummaryReportWithTotal(params?: {
    search?: string;
    lifecycle_stage?: string;
    critical_only?: boolean;
    saved_view?: string;
    style_ids?: number[];
    report_limit?: number;
    report_offset?: number;
    status?: string;
    buyer_customer_id?: number;
    season?: string;
    department?: string;
    active_for_orders?: boolean;
    priority?: string;
    risk_level?: string;
  }): Promise<ListWithTotal<StyleReportRow>> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.lifecycle_stage) q.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.critical_only != null) q.set("critical_only", String(params.critical_only));
    if (params?.saved_view) q.set("saved_view", params.saved_view);
    if (params?.style_ids?.length) {
      for (const id of params.style_ids) q.append("style_ids", String(id));
    }
    if (params?.report_limit != null) q.set("report_limit", String(params.report_limit));
    if (params?.report_offset != null) q.set("report_offset", String(params.report_offset));
    if (params?.status) q.set("status", params.status);
    if (params?.buyer_customer_id != null) q.set("buyer_customer_id", String(params.buyer_customer_id));
    if (params?.season) q.set("season", params.season);
    if (params?.department) q.set("department", params.department);
    if (params?.active_for_orders != null) q.set("active_for_orders", String(params.active_for_orders));
    if (params?.priority) q.set("priority", params.priority);
    if (params?.risk_level) q.set("risk_level", params.risk_level);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<StyleReportRow>(`/api/v1/merch/styles/summary-report${suffix}`);
  },
  async listStyleComponents(styleId: number): Promise<StyleComponentResponse[]> {
    return request<StyleComponentResponse[]>(`/api/v1/merch/styles/${styleId}/components`);
  },
  async createStyleComponent(styleId: number, data: StyleComponentCreate): Promise<StyleComponentResponse> {
    return request<StyleComponentResponse>(`/api/v1/merch/styles/${styleId}/components`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleComponent(
    styleId: number,
    componentId: number,
    data: StyleComponentCreate
  ): Promise<StyleComponentResponse> {
    return request<StyleComponentResponse>(`/api/v1/merch/styles/${styleId}/components/${componentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleComponent(styleId: number, componentId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/components/${componentId}`, { method: "DELETE" });
  },
  async listStyleColorways(styleId: number): Promise<StyleColorwayResponse[]> {
    return request<StyleColorwayResponse[]>(`/api/v1/merch/styles/${styleId}/colorways`);
  },
  async createStyleColorway(styleId: number, data: StyleColorwayCreate): Promise<StyleColorwayResponse> {
    return request<StyleColorwayResponse>(`/api/v1/merch/styles/${styleId}/colorways`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleColorway(
    styleId: number,
    colorwayId: number,
    data: StyleColorwayCreate
  ): Promise<StyleColorwayResponse> {
    return request<StyleColorwayResponse>(`/api/v1/merch/styles/${styleId}/colorways/${colorwayId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleColorway(styleId: number, colorwayId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/colorways/${colorwayId}`, { method: "DELETE" });
  },
  async listStyleSizeScales(styleId: number): Promise<StyleSizeScaleResponse[]> {
    return request<StyleSizeScaleResponse[]>(`/api/v1/merch/styles/${styleId}/size-scales`);
  },
  async createStyleSizeScale(styleId: number, data: StyleSizeScaleCreate): Promise<StyleSizeScaleResponse> {
    return request<StyleSizeScaleResponse>(`/api/v1/merch/styles/${styleId}/size-scales`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateStyleSizeScale(
    styleId: number,
    scaleId: number,
    data: StyleSizeScaleCreate
  ): Promise<StyleSizeScaleResponse> {
    return request<StyleSizeScaleResponse>(`/api/v1/merch/styles/${styleId}/size-scales/${scaleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStyleSizeScale(styleId: number, scaleId: number): Promise<void> {
    return request<void>(`/api/v1/merch/styles/${styleId}/size-scales/${scaleId}`, { method: "DELETE" });
  },
  async listBoms(params?: { style_id?: number }): Promise<BomResponse[]> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<BomResponse>(`/api/v1/merch/boms${suffix}`);
    return res.rows;
  },
  async listBomsWithTotal(params?: { style_id?: number }): Promise<ListWithTotal<BomResponse>> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<BomResponse>(`/api/v1/merch/boms${suffix}`);
  },
  async createBom(data: BomCreate): Promise<BomResponse> {
    return request<BomResponse>("/api/v1/merch/boms", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getBom(id: number): Promise<BomDetailResponse> {
    return request<BomDetailResponse>(`/api/v1/merch/boms/${id}`);
  },
  async updateBom(id: number, data: BomUpdate): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteBom(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/boms/${id}`, { method: "DELETE" });
  },
  async submitBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/submit`, { method: "POST" });
  },
  async approveBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/approve`, { method: "POST" });
  },
  async freezeBom(id: number): Promise<BomResponse> {
    return request<BomResponse>(`/api/v1/merch/boms/${id}/freeze`, { method: "POST" });
  },
  async createBomItem(bomId: number, data: BomItemCreate): Promise<BomItemResponse> {
    return request<BomItemResponse>(`/api/v1/merch/boms/${bomId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBomItem(bomId: number, itemId: number, data: BomItemCreate): Promise<BomItemResponse> {
    return request<BomItemResponse>(`/api/v1/merch/boms/${bomId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteBomItem(bomId: number, itemId: number): Promise<void> {
    return request<void>(`/api/v1/merch/boms/${bomId}/items/${itemId}`, { method: "DELETE" });
  },
  async getOrderMaterialRequirement(orderId: number): Promise<MaterialRequirementResponse> {
    return request<MaterialRequirementResponse>(`/api/v1/merch/orders/${orderId}/material-requirement`);
  },
  async generatePurchaseOrderFromBom(
    bomId: number,
    data: { quantity: number; supplier_name?: string; vendor_id?: number },
  ): Promise<GeneratePOFromBOMResponse> {
    return request<GeneratePOFromBOMResponse>(`/api/v1/merch/boms/${bomId}/generate-purchase-order`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listEligibleOrdersForBom(): Promise<EligibleOrderForBom[]> {
    return request<EligibleOrderForBom[]>("/api/v1/merch/order-boms/eligible-orders");
  },
  async createBomFromOrder(orderId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>("/api/v1/merch/order-boms/from-order", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
  },
  async getOrderDrivenBomByOrder(orderId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/by-order/${orderId}`);
  },
  async getOrderDrivenBomDetail(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/detail`);
  },
  async patchOrderDrivenBomLine(
    bomId: number,
    lineId: number,
    data: OrderDrivenBomLinePatch,
  ): Promise<OrderDrivenBomLine> {
    return request<OrderDrivenBomLine>(`/api/v1/merch/order-boms/${bomId}/lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async addOrderDrivenBomLine(bomId: number, data: OrderDrivenBomLineCreate): Promise<OrderDrivenBomLine> {
    return request<OrderDrivenBomLine>(`/api/v1/merch/order-boms/${bomId}/lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async deleteOrderDrivenBomLine(bomId: number, lineId: number): Promise<void> {
    return request<void>(`/api/v1/merch/order-boms/${bomId}/lines/${lineId}`, { method: "DELETE" });
  },
  async submitOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/submit`, { method: "POST" });
  },
  async approveOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/approve`, { method: "POST" });
  },
  async rejectOrderDrivenBom(bomId: number, comment: string): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/reject`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    });
  },
  async freezeOrderDrivenBom(bomId: number): Promise<OrderDrivenBomDetailResponse> {
    return request<OrderDrivenBomDetailResponse>(`/api/v1/merch/order-boms/${bomId}/freeze`, { method: "POST" });
  },
  async createPurchaseOrderFromOrderBomLine(
    lineId: number,
    data: CreatePoFromOrderBomLinePayload,
  ): Promise<GeneratePOFromBOMResponse> {
    return request<GeneratePOFromBOMResponse>(`/api/v1/merch/order-boms/lines/${lineId}/purchase-order`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async bulkGeneratePurchaseOrdersFromOrderBom(
    bomId: number,
    lineIds?: number[],
  ): Promise<{ created: Array<{ id: number; po_code: string; line_count: number }> }> {
    return request(`/api/v1/merch/order-boms/${bomId}/generate-purchase-orders-bulk`, {
      method: "POST",
      body: JSON.stringify({ line_ids: lineIds ?? null }),
    });
  },
  async getSuggestedVendorsForOrderBomLine(lineId: number): Promise<{
    suggestions: Array<{
      unit_price: string;
      vendor_id: number | null;
      po_code: string;
      purchase_order_id: number;
      vendor_name: string | null;
    }>;
  }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/suggested-vendors`);
  },
  async getLinkedPurchaseOrdersForOrderBomLine(lineId: number): Promise<{
    items: Array<{
      purchase_order_id: number;
      po_code: string;
      status: string;
      line_quantity: string;
      unit_price: string;
      received_qty: number;
    }>;
  }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/purchase-orders`);
  },
  async getOrderBomLineProcurementStatus(lineId: number): Promise<{ status: BomLineProcurementStatus }> {
    return request(`/api/v1/merch/order-boms/lines/${lineId}/procurement-status`);
  },
  async refreshOrderBomLineVendorPrice(
    lineId: number,
    vendorId: number,
  ): Promise<OrderDrivenBomLine> {
    const q = new URLSearchParams({ vendor_id: String(vendorId) });
    return request<OrderDrivenBomLine>(
      `/api/v1/merch/order-boms/lines/${lineId}/refresh-vendor-price?${q.toString()}`,
      { method: "POST" },
    );
  },
  /**
   * Returns rows only (`X-Total-Count` is ignored). For paginated UIs use `listConsumptionPlansWithTotal`.
   */
  async listConsumptionPlans(params?: { order_id?: number; limit?: number; offset?: number }): Promise<ConsumptionPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans${suffix}`);
    return res.rows;
  },
  async listConsumptionPlansWithTotal(params?: {
    order_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<ConsumptionPlanResponse>> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans${suffix}`);
  },
  async createConsumptionPlan(data: ConsumptionPlanCreate): Promise<ConsumptionPlanResponse> {
    return request<ConsumptionPlanResponse>("/api/v1/merch/consumption-plans", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getConsumptionPlan(id: number): Promise<ConsumptionPlanDetailResponse> {
    return request<ConsumptionPlanDetailResponse>(`/api/v1/merch/consumption-plans/${id}`);
  },
  async updateConsumptionPlan(id: number, data: ConsumptionPlanUpdate): Promise<ConsumptionPlanResponse> {
    return request<ConsumptionPlanResponse>(`/api/v1/merch/consumption-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteConsumptionPlan(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/consumption-plans/${id}`, { method: "DELETE" });
  },
  async createConsumptionPlanItem(planId: number, data: ConsumptionPlanItemCreate): Promise<ConsumptionPlanItemResponse> {
    return request<ConsumptionPlanItemResponse>(`/api/v1/merch/consumption-plans/${planId}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateConsumptionPlanItem(
    planId: number,
    itemId: number,
    data: ConsumptionPlanItemCreate
  ): Promise<ConsumptionPlanItemResponse> {
    return request<ConsumptionPlanItemResponse>(`/api/v1/merch/consumption-plans/${planId}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteConsumptionPlanItem(planId: number, itemId: number): Promise<void> {
    return request<void>(`/api/v1/merch/consumption-plans/${planId}/items/${itemId}`, { method: "DELETE" });
  },
  async listFollowups(params?: { order_id?: number; status?: string }): Promise<FollowupResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    const res = await requestWithTotal<FollowupResponse>(`/api/v1/merch/followups${suffix}`);
    return res.rows;
  },
  async listFollowupsWithTotal(params?: { order_id?: number; status?: string }): Promise<ListWithTotal<FollowupResponse>> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<FollowupResponse>(`/api/v1/merch/followups${suffix}`);
  },
  async createFollowup(data: FollowupCreate): Promise<FollowupResponse> {
    return request<FollowupResponse>("/api/v1/merch/followups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowup(id: number, data: FollowupUpdate): Promise<FollowupResponse> {
    return request<FollowupResponse>(`/api/v1/merch/followups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteFollowup(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followups/${id}`, { method: "DELETE" });
  },
  // TNA / Advanced follow-up
  async listFollowupTemplates(params?: { phase?: string; is_active?: boolean; buyer_id?: number }): Promise<FollowupActionTemplateResponse[]> {
    const q = new URLSearchParams();
    if (params?.phase) q.set("phase", params.phase);
    if (params?.is_active != null) q.set("is_active", String(params.is_active));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FollowupActionTemplateResponse[]>(`/api/v1/merch/followup-templates${suffix}`);
  },
  async getFollowupTemplate(id: number): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>(`/api/v1/merch/followup-templates/${id}`);
  },
  async createFollowupTemplate(data: FollowupActionTemplateCreate): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>("/api/v1/merch/followup-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowupTemplate(id: number, data: FollowupActionTemplateUpdate): Promise<FollowupActionTemplateResponse> {
    return request<FollowupActionTemplateResponse>(`/api/v1/merch/followup-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteFollowupTemplate(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followup-templates/${id}`, { method: "DELETE" });
  },
  async listFollowupActions(params?: {
    order_id?: number;
    status?: string;
    phase?: string;
    assigned_to_id?: number;
    due_from?: string;
    due_to?: string;
    overdue_only?: boolean;
  }): Promise<OrderFollowupActionResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status) q.set("status", params.status);
    if (params?.phase) q.set("phase", params.phase);
    if (params?.assigned_to_id != null) q.set("assigned_to_id", String(params.assigned_to_id));
    if (params?.due_from) q.set("due_from", params.due_from);
    if (params?.due_to) q.set("due_to", params.due_to);
    if (params?.overdue_only) q.set("overdue_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions${suffix}`);
  },
  async getFollowupActionsSummary(params?: { order_id?: number }): Promise<FollowupSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FollowupSummaryResponse>(`/api/v1/merch/followup-actions/summary${suffix}`);
  },
  async listUnifiedTnaActions(params?: {
    order_id?: number;
    status_filter?: string;
    source?: "all" | "merch" | "manufacturing";
    overdue_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<UnifiedTnaActionResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source) q.set("source", params.source);
    if (params?.overdue_only) q.set("overdue_only", "true");
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<UnifiedTnaActionResponse[]>(`/api/v1/tna-unified/actions${suffix}`);
  },
  async getUnifiedTnaSummary(params?: { order_id?: number }): Promise<UnifiedTnaSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<UnifiedTnaSummaryResponse>(`/api/v1/tna-unified/summary${suffix}`);
  },
  async searchFollowupActions(q: string): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions/search?q=${encodeURIComponent(q)}`);
  },
  async getFollowupActionsTimeline(orderId: number): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>(`/api/v1/merch/followup-actions/order/${orderId}/timeline`);
  },
  async generateFollowupActions(body: TnaGenerateRequest): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>("/api/v1/merch/followup-actions/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getFollowupActionsOverdue(): Promise<OrderFollowupActionResponse[]> {
    return request<OrderFollowupActionResponse[]>("/api/v1/merch/followup-actions/overdue");
  },
  async getFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}`);
  },
  async createFollowupAction(data: OrderFollowupActionCreate): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>("/api/v1/merch/followup-actions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateFollowupAction(id: number, data: OrderFollowupActionUpdate): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async completeFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}/complete`, { method: "POST" });
  },
  async reopenFollowupAction(id: number): Promise<OrderFollowupActionResponse> {
    return request<OrderFollowupActionResponse>(`/api/v1/merch/followup-actions/${id}/reopen`, { method: "POST" });
  },
  async deleteFollowupAction(id: number): Promise<void> {
    return request<void>(`/api/v1/merch/followup-actions/${id}`, { method: "DELETE" });
  },
  async getFollowupActionComments(actionId: number): Promise<FollowupActionCommentOut[]> {
    return request<FollowupActionCommentOut[]>(`/api/v1/merch/followup-actions/${actionId}/comments`);
  },
  async createFollowupActionComment(actionId: number, data: FollowupActionCommentCreate): Promise<FollowupActionCommentOut> {
    return request<FollowupActionCommentOut>(`/api/v1/merch/followup-actions/${actionId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getFollowupActionRejectionHistory(actionId: number): Promise<FollowupActionRejectionLogEntry[]> {
    return request<FollowupActionRejectionLogEntry[]>(`/api/v1/merch/followup-actions/${actionId}/rejection-history`);
  },
  async addFollowupActionRejectionLog(
    actionId: number,
    data: FollowupActionRejectionLogCreate
  ): Promise<FollowupActionRejectionLogEntry> {
    return request<FollowupActionRejectionLogEntry>(`/api/v1/merch/followup-actions/${actionId}/rejection-history`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchPipeline(): Promise<{ inquiries: number; quotations: number; orders: number }> {
    return request<{ inquiries: number; quotations: number; orders: number }>("/api/v1/merch/pipeline");
  },
  async getMerchReportsCatalog(): Promise<MerchReportsCatalogResponse> {
    return request<MerchReportsCatalogResponse>("/api/v1/merch/reports/catalog");
  },
  async getMerchControlTowerSummary(): Promise<MerchControlTowerSummaryResponse> {
    return request<MerchControlTowerSummaryResponse>("/api/v1/merch/control-tower/summary");
  },
  async listMerchSamples(params?: {
    status?: string;
    sample_type?: string;
    style_id?: number;
    order_id?: number;
    target_from?: string;
    target_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<MerchSampleOut[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.sample_type) q.set("sample_type", params.sample_type);
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.target_from) q.set("target_from", params.target_from);
    if (params?.target_to) q.set("target_to", params.target_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchSampleOut[]>(`/api/v1/merch/samples${suffix}`);
  },
  async listMerchSamplesByStyle(styleId: number, params?: { limit?: number }): Promise<MerchSampleOut[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchSampleOut[]>(`/api/v1/merch/samples/by-style/${styleId}${suffix}`);
  },
  async getMerchSample(sampleId: number): Promise<MerchSampleOut> {
    return request<MerchSampleOut>(`/api/v1/merch/samples/${sampleId}`);
  },
  async createMerchSample(data: MerchSampleCreate): Promise<MerchSampleOut> {
    return request<MerchSampleOut>("/api/v1/merch/samples", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSample(sampleId: number, data: MerchSampleUpdate): Promise<MerchSampleOut> {
    return request<MerchSampleOut>(`/api/v1/merch/samples/${sampleId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listMerchSampleComments(sampleId: number): Promise<MerchSampleCommentOut[]> {
    return request<MerchSampleCommentOut[]>(`/api/v1/merch/samples/${sampleId}/comments`);
  },
  async addMerchSampleComment(sampleId: number, data: MerchSampleCommentCreate): Promise<MerchSampleCommentOut> {
    return request<MerchSampleCommentOut>(`/api/v1/merch/samples/${sampleId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchSampleMetrics(sampleId: number): Promise<MerchSampleMetricsOut> {
    return request<MerchSampleMetricsOut>(`/api/v1/merch/samples/${sampleId}/metrics`);
  },
  async listMerchSampleTasks(sampleId: number): Promise<MerchSampleTaskOut[]> {
    return request<MerchSampleTaskOut[]>(`/api/v1/merch/samples/${sampleId}/tasks`);
  },
  async createMerchSampleTask(sampleId: number, data: MerchSampleTaskCreate): Promise<MerchSampleTaskOut> {
    return request<MerchSampleTaskOut>(`/api/v1/merch/samples/${sampleId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleTask(sampleId: number, taskId: number, data: MerchSampleTaskUpdate): Promise<MerchSampleTaskOut> {
    return request<MerchSampleTaskOut>(`/api/v1/merch/samples/${sampleId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleTask(sampleId: number, taskId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/tasks/${taskId}`, { method: "DELETE" });
  },
  async listMerchSampleCostLines(sampleId: number): Promise<MerchSampleCostLineOut[]> {
    return request<MerchSampleCostLineOut[]>(`/api/v1/merch/samples/${sampleId}/cost-lines`);
  },
  async createMerchSampleCostLine(sampleId: number, data: MerchSampleCostLineCreate): Promise<MerchSampleCostLineOut> {
    return request<MerchSampleCostLineOut>(`/api/v1/merch/samples/${sampleId}/cost-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleCostLine(sampleId: number, lineId: number, data: MerchSampleCostLineUpdate): Promise<MerchSampleCostLineOut> {
    return request<MerchSampleCostLineOut>(`/api/v1/merch/samples/${sampleId}/cost-lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleCostLine(sampleId: number, lineId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/cost-lines/${lineId}`, { method: "DELETE" });
  },
  async listMerchSampleMaterialLines(sampleId: number): Promise<MerchSampleMaterialLineOut[]> {
    return request<MerchSampleMaterialLineOut[]>(`/api/v1/merch/samples/${sampleId}/material-lines`);
  },
  async createMerchSampleMaterialLine(sampleId: number, data: MerchSampleMaterialLineCreate): Promise<MerchSampleMaterialLineOut> {
    return request<MerchSampleMaterialLineOut>(`/api/v1/merch/samples/${sampleId}/material-lines`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateMerchSampleMaterialLine(sampleId: number, lineId: number, data: MerchSampleMaterialLineUpdate): Promise<MerchSampleMaterialLineOut> {
    return request<MerchSampleMaterialLineOut>(`/api/v1/merch/samples/${sampleId}/material-lines/${lineId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteMerchSampleMaterialLine(sampleId: number, lineId: number): Promise<void> {
    await request<void>(`/api/v1/merch/samples/${sampleId}/material-lines/${lineId}`, { method: "DELETE" });
  },
  async merchSampleAiPlanProposal(sampleId: number): Promise<MerchSampleAiPlanProposalResponse> {
    return request<MerchSampleAiPlanProposalResponse>(`/api/v1/merch/samples/${sampleId}/ai/plan-proposal`, {
      method: "POST",
    });
  },
  async merchSampleAiPlanApply(sampleId: number, data: MerchSampleAiPlanApplyBody): Promise<MerchSampleTaskOut[]> {
    return request<MerchSampleTaskOut[]>(`/api/v1/merch/samples/${sampleId}/ai/plan-apply`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getMerchPipelineFull(params?: {
    document_type?: string;
    customer_id?: number;
    search?: string;
  }): Promise<MerchPipelineFullResponse> {
    const q = new URLSearchParams();
    if (params?.document_type) q.set("document_type", params.document_type);
    if (params?.customer_id != null) q.set("customer_id", String(params.customer_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchPipelineFullResponse>(`/api/v1/merch/pipeline/full${suffix}`);
  },
  async getMerchPipelineAnalytics(params?: { years_back?: number }): Promise<PipelineAnalyticsResponse> {
    const q = new URLSearchParams();
    if (params?.years_back != null) q.set("years_back", String(params.years_back));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PipelineAnalyticsResponse>(`/api/v1/merch/pipeline/analytics${suffix}`);
  },
  async getMerchCriticalAlerts(params?: { wastage_threshold_pct?: number }): Promise<MerchCriticalAlertsResponse> {
    const q = new URLSearchParams();
    if (params?.wastage_threshold_pct != null) q.set("wastage_threshold_pct", String(params.wastage_threshold_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchCriticalAlertsResponse>(`/api/v1/merch/critical-alerts${suffix}`);
  },
  async getMerchAlerts(params?: {
    severity?: string;
    status?: string;
    alert_type?: string;
    entity_type?: string;
    entity_id?: number;
    order_id?: number;
    assigned_to_id?: number;
    min_priority_score?: number;
    sla_bucket?: "at_risk" | "breach" | "met";
    page?: number;
    page_size?: number;
    sort?: string;
  }): Promise<MerchAlertsListResponse> {
    const q = new URLSearchParams();
    if (params?.severity) q.set("severity", params.severity);
    if (params?.status) q.set("status", params.status);
    if (params?.alert_type) q.set("alert_type", params.alert_type);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.entity_id != null) q.set("entity_id", String(params.entity_id));
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.assigned_to_id != null) q.set("assigned_to_id", String(params.assigned_to_id));
    if (params?.min_priority_score != null) q.set("min_priority_score", String(params.min_priority_score));
    if (params?.sla_bucket) q.set("sla_bucket", params.sla_bucket);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    if (params?.sort) q.set("sort", params.sort);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchAlertsListResponse>(`/api/v1/merch/alerts${suffix}`);
  },
  async getMerchAlertsSummary(params?: {
    severity?: string;
    status?: string;
    alert_type?: string;
    entity_type?: string;
    entity_id?: number;
  }): Promise<MerchAlertsSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.severity) q.set("severity", params.severity);
    if (params?.status) q.set("status", params.status);
    if (params?.alert_type) q.set("alert_type", params.alert_type);
    if (params?.entity_type) q.set("entity_type", params.entity_type);
    if (params?.entity_id != null) q.set("entity_id", String(params.entity_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MerchAlertsSummaryResponse>(`/api/v1/merch/alerts/summary${suffix}`);
  },
  async getMerchAlertDetail(alertId: number): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}`);
  },
  async updateMerchAlertStatus(alertId: number, status: string): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
  async snoozeMerchAlert(alertId: number, snoozed_until: string): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/snooze`, {
      method: "POST",
      body: JSON.stringify({ snoozed_until }),
    });
  },
  async assignMerchAlert(alertId: number, assigned_to_id: number | null): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/assign`, {
      method: "POST",
      body: JSON.stringify({ assigned_to_id }),
    });
  },
  async runMerchAlertsScan(): Promise<{ status: string; message?: string }> {
    return request<{ status: string; message?: string }>(`/api/v1/merch/alerts/scan`, { method: "POST" });
  },
  async getMerchAlertComments(alertId: number): Promise<MerchAlertCommentItem[]> {
    return request<MerchAlertCommentItem[]>(`/api/v1/merch/alerts/${alertId}/comments`);
  },
  async addMerchAlertComment(alertId: number, body: string, is_internal?: boolean): Promise<MerchAlertCommentItem> {
    return request<MerchAlertCommentItem>(`/api/v1/merch/alerts/${alertId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, is_internal: is_internal ?? false }),
    });
  },
  async getMerchAlertHistory(alertId: number): Promise<MerchAlertHistoryItem[]> {
    return request<MerchAlertHistoryItem[]>(`/api/v1/merch/alerts/${alertId}/history`);
  },
  async escalateMerchAlert(alertId: number, to_level?: number, assigned_to_id?: number | null, reason?: string | null): Promise<MerchAlertDetailResponse> {
    return request<MerchAlertDetailResponse>(`/api/v1/merch/alerts/${alertId}/escalate`, {
      method: "POST",
      body: JSON.stringify({ to_level: to_level ?? 1, assigned_to_id: assigned_to_id ?? null, reason: reason ?? null }),
    });
  },
  async getMerchAlertViews(): Promise<MerchAlertSavedView[]> {
    return request<MerchAlertSavedView[]>(`/api/v1/merch/alerts/views`);
  },
  async createMerchAlertView(params: { name: string; description?: string; filter_json: Record<string, unknown>; is_default?: boolean }): Promise<MerchAlertSavedView> {
    return request<MerchAlertSavedView>(`/api/v1/merch/alerts/views`, {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        description: params.description ?? null,
        filter_json: params.filter_json,
        is_default: params.is_default ?? false,
      }),
    });
  },
  async deleteMerchAlertView(viewId: number): Promise<void> {
    return request(`/api/v1/merch/alerts/views/${viewId}`, { method: "DELETE" });
  },
  async getWastageReport(params?: {
    order_id?: number;
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
    threshold_pct?: number;
    above_threshold_only?: boolean;
  }): Promise<WastageReportRowResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.threshold_pct != null) q.set("threshold_pct", String(params.threshold_pct));
    if (params?.above_threshold_only === true) q.set("above_threshold_only", "true");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageReportRowResponse[]>(`/api/v1/merch/reports/wastage${suffix}`);
  },
  async getWastageSummary(params?: {
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<WastageSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageSummaryResponse>(`/api/v1/merch/reports/wastage/summary${suffix}`);
  },
  async getWastageOrderDetail(orderId: number): Promise<WastageOrderDetailResponse> {
    return request<WastageOrderDetailResponse>(`/api/v1/merch/reports/wastage/order/${orderId}`);
  },
  async getWastageReasons(): Promise<WastageReasonResponse[]> {
    return request<WastageReasonResponse[]>("/api/v1/merch/reports/wastage/reasons");
  },
  async getWastageTrends(params?: {
    date_from?: string;
    date_to?: string;
    group_by?: "month" | "buyer" | "material_group";
  }): Promise<WastageTrendsResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.group_by) q.set("group_by", params.group_by);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageTrendsResponse>(`/api/v1/merch/reports/wastage/trends${suffix}`);
  },
  async getWastageExportBlob(params?: {
    order_id?: number;
    style_id?: number;
    buyer_id?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<Blob> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    q.set("format", "xlsx");
    return requestBlob(`/api/v1/merch/reports/wastage/export?${q.toString()}`);
  },
  async getWastageThresholds(): Promise<WastageThresholdRuleResponse[]> {
    return request<WastageThresholdRuleResponse[]>("/api/v1/merch/reports/wastage/thresholds");
  },
  async createWastageThreshold(body: {
    scope_type: string;
    scope_id?: number | null;
    allowed_pct: number;
    critical_pct: number;
  }): Promise<WastageThresholdRuleResponse> {
    return request<WastageThresholdRuleResponse>("/api/v1/merch/reports/wastage/thresholds", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getWastageViews(): Promise<WastageSavedViewResponse[]> {
    return request<WastageSavedViewResponse[]>("/api/v1/merch/reports/wastage/views");
  },
  async createWastageView(body: {
    name: string;
    description?: string | null;
    filter_json: Record<string, unknown>;
    is_default?: boolean;
  }): Promise<WastageSavedViewResponse> {
    return request<WastageSavedViewResponse>("/api/v1/merch/reports/wastage/views", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteWastageView(viewId: number): Promise<void> {
    return request<void>(`/api/v1/merch/reports/wastage/views/${viewId}`, { method: "DELETE" });
  },
  async getWastageManagementSummary(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<WastageManagementSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<WastageManagementSummaryResponse>(`/api/v1/merch/reports/wastage/management-summary${suffix}`);
  },
  async refreshWastageSummary(params?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{ updated_orders: number }> {
    const q = new URLSearchParams();
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ updated_orders: number }>(`/api/v1/merch/reports/wastage/refresh-summary${suffix}`, {
      method: "POST",
    });
  },
  async getConsumptionReconciliation(
    orderId: number,
    params?: { tolerance_pct?: number }
  ): Promise<ConsumptionReconciliationResponse> {
    const q = new URLSearchParams();
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationResponse>(
      `/api/v1/merch/consumption-reconciliation/${orderId}${suffix}`
    );
  },
  async getConsumptionReconciliationExportBlob(
    orderId: number,
    params?: { tolerance_pct?: number }
  ): Promise<Blob> {
    const q = new URLSearchParams();
    q.set("format", "xlsx");
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    return requestBlob(
      `/api/v1/merch/consumption-reconciliation/${orderId}/export?${q.toString()}`
    );
  },
  async getConsumptionReconciliationDashboard(
    params?: ConsumptionReconciliationDashboardParams
  ): Promise<ConsumptionReconciliationDashboardResponse> {
    const q = new URLSearchParams();
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.status) q.set("status", params.status);
    if (params?.material_type) q.set("material_type", params.material_type);
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.sort_by) q.set("sort_by", params.sort_by);
    if (params?.sort_dir) q.set("sort_dir", params.sort_dir);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationDashboardResponse>(
      `/api/v1/merch/consumption-reconciliation/dashboard${suffix}`
    );
  },
  async getConsumptionReconciliationTrends(
    params?: { months?: number; buyer_id?: number; style_id?: number; tolerance_pct?: number }
  ): Promise<ConsumptionReconciliationTrendsResponse> {
    const q = new URLSearchParams();
    if (params?.months != null) q.set("months", String(params.months));
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionReconciliationTrendsResponse>(
      `/api/v1/merch/consumption-reconciliation/trends${suffix}`
    );
  },
  async getConsumptionReconciliationDashboardExportBlob(
    params?: ConsumptionReconciliationDashboardParams
  ): Promise<Blob> {
    const q = new URLSearchParams();
    if (params?.buyer_id != null) q.set("buyer_id", String(params.buyer_id));
    if (params?.style_id != null) q.set("style_id", String(params.style_id));
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.status) q.set("status", params.status);
    if (params?.material_type) q.set("material_type", params.material_type);
    if (params?.tolerance_pct != null) q.set("tolerance_pct", String(params.tolerance_pct));
    return requestBlob(
      `/api/v1/merch/consumption-reconciliation/dashboard/export?${q.toString()}`
    );
  },
  async getConsumptionReconciliationMovements(
    orderId: number,
    itemId: number
  ): Promise<ConsumptionReconciliationMovementsResponse> {
    return request<ConsumptionReconciliationMovementsResponse>(
      `/api/v1/merch/consumption-reconciliation/${orderId}/movements/${itemId}`
    );
  },
  async submitQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/submit`, { method: "POST" });
  },
  async approveQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/approve`, { method: "POST" });
  },
  async sendQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/send`, { method: "POST" });
  },
  async reviseQuotation(id: number): Promise<QuotationResponse> {
    return request<QuotationResponse>(`/api/v1/quotations/${id}/revise`, { method: "POST" });
  },
  async updateInquiryStatus(id: number, status: string, notes?: string): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    });
  },
  async getInquiryTrace(id: number): Promise<InquiryEventResponse[]> {
    return request<InquiryEventResponse[]>(`/api/v1/inquiries/${id}/trace`);
  },
  async getDashboardKpis(): Promise<DashboardKpi[]> {
    return request<DashboardKpi[]>("/api/v1/dashboard/kpi");
  },
  async getDashboardOrderStatus(): Promise<OrderStatusSummary[]> {
    return request<OrderStatusSummary[]>("/api/v1/dashboard/order-status-breakdown");
  },
  async getDashboardCustomerMap(): Promise<CustomerMapPoint[]> {
    return request<CustomerMapPoint[]>("/api/v1/dashboard/customer-map");
  },
  async getDashboardInsights(): Promise<DashboardInsight[]> {
    return request<DashboardInsight[]>("/api/v1/dashboard/ai-insights");
  },
  async getDashboardAiBrief(): Promise<AiDashboardBriefResponse> {
    return request<AiDashboardBriefResponse>("/api/v1/dashboard/ai-brief");
  },
  async getDashboardAiProfitability(): Promise<AiProfitabilityResponse> {
    return request<AiProfitabilityResponse>("/api/v1/dashboard/ai-profitability");
  },
  async getDashboardProductionTrends(): Promise<DashboardProductionPoint[]> {
    return request<DashboardProductionPoint[]>("/api/v1/dashboard/production-trends");
  },
  async getDashboardRecentOrders(): Promise<DashboardRecentOrder[]> {
    return request<DashboardRecentOrder[]>("/api/v1/dashboard/recent-orders");
  },
  async getDashboardTasks(): Promise<DashboardTask[]> {
    return request<DashboardTask[]>("/api/v1/dashboard/tasks");
  },
  async getDashboardEmployeeSummary(): Promise<DashboardEmployeeSummary> {
    return request<DashboardEmployeeSummary>("/api/v1/dashboard/employee-summary");
  },
  async getDashboardPayrollSummary(): Promise<DashboardPayrollRow[]> {
    return request<DashboardPayrollRow[]>("/api/v1/dashboard/payroll-summary");
  },
  async getDashboardRevenueTrend(): Promise<DashboardRevenueTrend> {
    return request<DashboardRevenueTrend>("/api/v1/dashboard/revenue-trend");
  },
  /** Phase 18 — read-only executive brief (requires EXECUTIVE_AI_DASHBOARD_ENABLED + tenant flag). */
  async getExecutiveAiBrief(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/dashboard/ai/executive-brief");
  },
  /** Phase 17 — voucher activity series (requires FINANCE_AI_READONLY_ENABLED + tenant flag). */
  async getFinanceAiReadonlyInsights(monthsBack?: number): Promise<Record<string, unknown>> {
    const q = monthsBack != null ? `?months_back=${monthsBack}` : "";
    return request<Record<string, unknown>>(`/api/v1/finance/ai/readonly-insights${q}`);
  },
  /** Phase 14 — planning capacity/sequencing advisory (POST, requires PRODUCTION_PLANNING_AI_ENHANCED_ENABLED). */
  async postProductionPlanningAdvisory(body: {
    from_date: string;
    to_date: string;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/production/planning/advisory/capacity-sequencing", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** Phase 15 — TNA follow-up insights (requires TNA_FOLLOWUP_AI_ENABLED + tenant flag). */
  async getTnaFollowupAiInsights(orderId?: number): Promise<Record<string, unknown>> {
    const q = orderId != null ? `?order_id=${orderId}` : "";
    return request<Record<string, unknown>>(`/api/v1/tna-unified/ai/followup-insights${q}`);
  },
  /** Phase 16 — document vs ERP field compare (no writes). */
  async postDocumentAiValidate(body: {
    entity_type: string;
    entity_id: number;
    extracted_fields: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/document/validate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** Phase 19 — whitelisted read-only intents only. */
  async postErpAiCopilotSafeQuery(body: { intent: string }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/copilot/safe-query", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  /** Phase 20 — propose a rule-based automation (approval required; no execution in this endpoint). */
  async postErpAiGovernanceProposal(body: {
    rule_code: string;
    payload_json?: Record<string, unknown> | null;
    idempotency_key?: string | null;
  }): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/erp-ai/governance/proposals", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async postErpAiGovernanceApprove(proposalId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/approve`, {
      method: "POST",
    });
  },
  async postErpAiGovernanceReject(
    proposalId: number,
    body?: { reason?: string | null }
  ): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/reject`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async postErpAiGovernanceRollback(proposalId: number): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`/api/v1/erp-ai/governance/proposals/${proposalId}/rollback`, {
      method: "POST",
    });
  },
  async getErpAiGovernanceProposals(params?: {
    status_filter?: "proposed" | "approved" | "rejected" | "rolled_back" | "all" | string;
    limit?: number;
    offset?: number;
  }): Promise<AiGovernanceProposal[]> {
    const q = new URLSearchParams();
    if (params?.status_filter != null) q.set("status_filter", params.status_filter);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiGovernanceProposal[]>(`/api/v1/erp-ai/governance/proposals${suffix}`);
  },
  async aiListAutomationRules(): Promise<AiAutomationRuleRow[]> {
    return request<AiAutomationRuleRow[]>("/api/v1/ai-tool/automation/rules");
  },
  async getTenantOverview(): Promise<TenantOverviewReport> {
    return request<TenantOverviewReport>("/api/v1/reports/tenant-overview");
  },
  async getCustomerPerformance(): Promise<CustomerPerformanceRow[]> {
    return request<CustomerPerformanceRow[]>("/api/v1/reports/customer-performance");
  },
  async getReportPurchaseOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportPurchaseOrderRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportPurchaseOrderRow[]>(`/api/v1/reports/purchase-orders${suffix}`);
  },
  async getReportGrn(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportGrnRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportGrnRow[]>(`/api/v1/reports/grn${suffix}`);
  },
  async getReportSalesOrders(params?: { status?: string; limit?: number; offset?: number }): Promise<ReportSalesOrderRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ReportSalesOrderRow[]>(`/api/v1/reports/sales-orders${suffix}`);
  },
  // Finance + Accounting parity baseline
  async listAccountGroups(): Promise<AccountGroupResponse[]> {
    return request<AccountGroupResponse[]>("/api/v1/finance/account-groups");
  },
  async listAccountGroupsHierarchy(): Promise<AccountGroupHierarchyNode[]> {
    return request<AccountGroupHierarchyNode[]>("/api/v1/finance/account-groups/hierarchy");
  },
  async seedAccountGroups(): Promise<AccountGroupResponse[]> {
    return request<AccountGroupResponse[]>("/api/v1/finance/account-groups/seed", { method: "POST" });
  },
  async createAccountGroup(data: AccountGroupCreate): Promise<AccountGroupResponse> {
    return request<AccountGroupResponse>("/api/v1/finance/account-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateAccountGroup(id: number, data: AccountGroupCreate): Promise<AccountGroupResponse> {
    return request<AccountGroupResponse>(`/api/v1/finance/account-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteAccountGroup(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/account-groups/${id}`, { method: "DELETE" });
  },
  async listChartOfAccounts(params?: { active_only?: boolean }): Promise<ChartOfAccountResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ChartOfAccountResponse[]>(`/api/v1/finance/chart-of-accounts${suffix}`);
  },
  async listChartOfAccountsWithTotal(params?: {
    active_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<ChartOfAccountResponse>> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts${suffix}`);
  },
  async getChartOfAccount(id: number): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts/${id}`);
  },
  async createChartOfAccount(data: ChartOfAccountCreate): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>("/api/v1/finance/chart-of-accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateChartOfAccount(id: number, data: ChartOfAccountCreate): Promise<ChartOfAccountResponse> {
    return request<ChartOfAccountResponse>(`/api/v1/finance/chart-of-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteChartOfAccount(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/chart-of-accounts/${id}`, { method: "DELETE" });
  },
  async getCoaConfig(): Promise<CoAConfigResponse> {
    return request<CoAConfigResponse>("/api/v1/finance/coa-config");
  },
  async putCoaConfig(data: CoAConfigUpdate): Promise<CoAConfigResponse> {
    return request<CoAConfigResponse>("/api/v1/finance/coa-config", { method: "PUT", body: JSON.stringify(data) });
  },
  async getAccountGroupReportingImpact(groupId: number): Promise<ReportingImpactResponse> {
    return request<ReportingImpactResponse>(`/api/v1/finance/account-groups/${groupId}/reporting-impact`);
  },
  async coaExport(): Promise<string> {
    return requestText("/api/v1/finance/coa/export");
  },
  async coaImport(file: File, conflict: "skip" | "update" | "abort" = "skip"): Promise<CoAImportResult> {
    const form = new FormData();
    form.append("file", file);
    const path = `/api/v1/finance/coa/import?conflict=${encodeURIComponent(conflict)}`;
    return request<CoAImportResult>(path, { method: "POST", body: form });
  },
  async listVouchers(params?: { status_filter?: string; from_date?: string; to_date?: string }): Promise<VoucherResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VoucherResponse[]>(`/api/v1/finance/vouchers${suffix}`);
  },
  async listVouchersWithTotal(params?: {
    status_filter?: string;
    from_date?: string;
    to_date?: string;
    search?: string;
    voucher_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<VoucherResponse>> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.voucher_id != null) q.set("voucher_id", String(params.voucher_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<VoucherResponse>(`/api/v1/finance/vouchers${suffix}`);
  },
  async createVoucher(data: VoucherCreate): Promise<VoucherResponse> {
    return request<VoucherResponse>("/api/v1/finance/vouchers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getVoucher(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}`);
  },
  async updateVoucher(id: number, data: VoucherUpdate): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteVoucher(id: number): Promise<{ ok: boolean; message: string }> {
    return request<{ ok: boolean; message: string }>(`/api/v1/finance/vouchers/${id}`, {
      method: "DELETE",
    });
  },
  async updateVoucherStatus(id: number, status: string): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  async postVoucher(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/post`, { method: "POST" });
  },
  async reverseVoucher(id: number, body: { reason: string }): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async duplicateVoucherRiskCheck(body: {
    voucher_date: string;
    reference?: string | null;
    voucher_type?: string | null;
    lines: VoucherLineCreate[];
  }): Promise<{
    duplicate_risk_hash: string;
    similar_posted_voucher_ids: number[];
    risk_level: "high" | "none";
  }> {
    return request(`/api/v1/finance/vouchers/duplicate-risk-check`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async cancelVoucherPosting(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/cancel-posting`, { method: "POST" });
  },
  async getVoucherTypesMeta(): Promise<string[]> {
    return request<string[]>("/api/v1/finance/vouchers/meta/types");
  },
  async getVoucherStatusesMeta(): Promise<string[]> {
    return request<string[]>("/api/v1/finance/vouchers/meta/statuses");
  },
  async getVoucherApprovalRulesMeta(): Promise<{
    min_levels: number;
    max_levels: number;
    rules: Array<{ level: number; required_role: string }>;
    notes: string;
  }> {
    return request<{
      min_levels: number;
      max_levels: number;
      rules: Array<{ level: number; required_role: string }>;
      notes: string;
    }>("/api/v1/finance/vouchers/meta/approval-rules");
  },
  async getVoucherAvailableActions(voucherId: number): Promise<{ voucher_id: number; status: string; actions: string[] }> {
    return request<{ voucher_id: number; status: string; actions: string[] }>(`/api/v1/finance/vouchers/${voucherId}/available-actions`);
  },
  async getDayBook(params?: {
    from_date?: string;
    to_date?: string;
    voucher_type?: string;
    account_id?: number;
    group_id?: number;
    party_name?: string;
  }): Promise<DayBookResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.group_id) q.set("group_id", String(params.group_id));
    if (params?.party_name) q.set("party_name", params.party_name);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<DayBookResponse>(`/api/v1/finance/reports/day-book${suffix}`);
  },
  async getTrialBalance(params?: { as_of_date?: string; account_id?: number; group_id?: number }): Promise<TrialBalanceResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.group_id) q.set("group_id", String(params.group_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<TrialBalanceResponse>(`/api/v1/finance/reports/trial-balance${suffix}`);
  },
  async getFinancialStatements(params?: { as_of_date?: string; group_id?: number }): Promise<FinancialStatementsResponse> {
    const q = new URLSearchParams();
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.group_id) q.set("group_id", String(params.group_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FinancialStatementsResponse>(`/api/v1/finance/reports/financial-statements${suffix}`);
  },
  async getCashFlowStatement(params?: { from_date?: string; to_date?: string }): Promise<CashFlowStatementResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CashFlowStatementResponse>(`/api/v1/finance/reports/cash-flow-statement${suffix}`);
  },
  async getLedgerActivity(params: { account_id: number; from_date?: string; to_date?: string }): Promise<LedgerActivityResponse> {
    const q = new URLSearchParams();
    q.set("account_id", String(params.account_id));
    if (params.from_date) q.set("from_date", params.from_date);
    if (params.to_date) q.set("to_date", params.to_date);
    return request<LedgerActivityResponse>(`/api/v1/finance/reports/ledger-activity?${q.toString()}`);
  },
  async getVoucherReportSummary(params?: {
    from_date?: string;
    to_date?: string;
    voucher_type?: string;
    status_filter?: string;
  }): Promise<VoucherReportSummaryResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VoucherReportSummaryResponse>(`/api/v1/finance/voucher-reports/summary${suffix}`);
  },
  async getVoucherReportMonthly(
    months_back = 12,
    params?: { from_date?: string; to_date?: string; voucher_type?: string; status_filter?: string },
  ): Promise<VoucherReportMonthlyResponse> {
    const q = new URLSearchParams();
    q.set("months_back", String(months_back));
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    return request<VoucherReportMonthlyResponse>(`/api/v1/finance/voucher-reports/monthly?${q.toString()}`);
  },
  async getVoucherReportTopPreparers(
    limit = 10,
    params?: { from_date?: string; to_date?: string; voucher_type?: string; status_filter?: string },
  ): Promise<VoucherReportTopPreparersResponse> {
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.voucher_type) q.set("voucher_type", params.voucher_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    return request<VoucherReportTopPreparersResponse>(`/api/v1/finance/voucher-reports/top-preparers?${q.toString()}`);
  },
  async listCashForecastScenarios(): Promise<CashForecastScenarioResponse[]> {
    return request<CashForecastScenarioResponse[]>("/api/v1/finance/cash-forecast/scenarios");
  },
  async createCashForecastScenario(data: CashForecastScenarioCreate): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>("/api/v1/finance/cash-forecast/scenarios", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCashForecastScenario(id: number, data: CashForecastScenarioUpdate): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>(`/api/v1/finance/cash-forecast/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteCashForecastScenario(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/cash-forecast/scenarios/${id}`, { method: "DELETE" });
  },
  async generateCashForecastScenario(id: number): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>(`/api/v1/finance/cash-forecast/scenarios/${id}/generate`, {
      method: "POST",
    });
  },
  async getCashForecastSummary(): Promise<CashForecastSummaryResponse> {
    return request<CashForecastSummaryResponse>("/api/v1/finance/cash-forecast/summary");
  },
  async createVendorBillDraftFromGrn(grnId: number): Promise<{ id: number; bill_code: string; status: string }> {
    return request(`/api/v1/finance/vendor-bills/from-grn/${grnId}`, { method: "POST" });
  },
  async listVendorBills(params?: { limit?: number; offset?: number }): Promise<VendorBillSummary[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VendorBillSummary[]>(`/api/v1/finance/vendor-bills${suffix}`);
  },
  async getVendorBill(billId: number): Promise<VendorBillDetailResponse> {
    return request<VendorBillDetailResponse>(`/api/v1/finance/vendor-bills/${billId}`);
  },
  async patchVendorBill(
    billId: number,
    data: { vendor_invoice_ref?: string | null; status?: string | null; notes?: string | null },
  ): Promise<{ id: number; bill_code: string; status: string; vendor_invoice_ref: string | null }> {
    return request(`/api/v1/finance/vendor-bills/${billId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async postVendorBill(billId: number): Promise<{ id: number; bill_code: string; status: string; voucher_id: number | null }> {
    return request(`/api/v1/finance/vendor-bills/${billId}/post`, { method: "POST" });
  },
  async getBusinessOverview(): Promise<BusinessOverviewResponse> {
    return request<BusinessOverviewResponse>("/api/v1/finance/business-overview");
  },
  async getBusinessOverviewHealthScore(): Promise<BusinessHealthScoreResponse> {
    return request<BusinessHealthScoreResponse>("/api/v1/finance/business-overview/health-score");
  },
  async getBusinessOverviewDeterministicSummary(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/finance/business-overview/deterministic-summary");
  },
  async getBusinessOverviewAiNarrative(): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/api/v1/finance/business-overview/ai-narrative");
  },
  async listFinancierPrincipalsForFacility(): Promise<{ id: number; full_name: string | null; email: string | null }[]> {
    return request("/api/v1/facility/financier-principals");
  },
  async listFacilities(params?: { status_filter?: string; limit?: number; offset?: number }): Promise<FacilityRow[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FacilityRow[]>(`/api/v1/facility/facilities${suffix}`);
  },
  async getFacility(id: number): Promise<{ facility: FacilityRow; utilizations: FacilityUtilizationRow[] }> {
    return request(`/api/v1/facility/facilities/${id}`);
  },
  async createFacility(body: Record<string, unknown>): Promise<FacilityRow> {
    return request<FacilityRow>("/api/v1/facility/facilities", { method: "POST", body: JSON.stringify(body) });
  },
  async patchFacility(id: number, body: Record<string, unknown>): Promise<FacilityRow> {
    return request<FacilityRow>(`/api/v1/facility/facilities/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async deleteFacility(id: number): Promise<{ ok: boolean }> {
    return request(`/api/v1/facility/facilities/${id}`, { method: "DELETE" });
  },
  async listFacilityUtilizations(facilityId: number): Promise<FacilityUtilizationRow[]> {
    return request<FacilityUtilizationRow[]>(`/api/v1/facility/facilities/${facilityId}/utilizations`);
  },
  async createFacilityUtilization(facilityId: number, body: Record<string, unknown>): Promise<FacilityUtilizationRow> {
    return request<FacilityUtilizationRow>(`/api/v1/facility/facilities/${facilityId}/utilizations`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getFacilityUtilization(id: number): Promise<{
    utilization: FacilityUtilizationRow;
    facility: FacilityRow | null;
    schedule: Record<string, unknown>[];
  }> {
    return request(`/api/v1/facility/utilizations/${id}`);
  },
  async patchFacilityUtilization(id: number, body: Record<string, unknown>): Promise<FacilityUtilizationRow> {
    return request<FacilityUtilizationRow>(`/api/v1/facility/utilizations/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async getUtilizationSchedule(utilizationId: number): Promise<Record<string, unknown>[]> {
    return request(`/api/v1/facility/utilizations/${utilizationId}/schedule`);
  },
  async calculateFacilityEmi(body: Record<string, unknown>): Promise<EmiPreviewResponse> {
    return request<EmiPreviewResponse>("/api/v1/facility/calculate-emi", { method: "POST", body: JSON.stringify(body) });
  },
  async getFacilitySummary(): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/summary");
  },
  async getFacilityUpcomingObligations(): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/upcoming-obligations");
  },
  async activateFacilityUtilization(utilizationId: number, body?: { grace_days?: number | null }): Promise<Record<string, unknown>> {
    return request(`/api/v1/facility/utilizations/${utilizationId}/activate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  async generateFacilitySnapshots(body: { snapshot_month: string; facility_id?: number | null }): Promise<Record<string, unknown>> {
    return request("/api/v1/facility/snapshots/generate", { method: "POST", body: JSON.stringify(body) });
  },
  async listFxReceipts(params?: { status_filter?: string }): Promise<FxReceiptResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<FxReceiptResponse[]>(`/api/v1/finance/fx-receipts${suffix}`);
  },
  async createFxReceipt(data: FxReceiptCreate): Promise<FxReceiptResponse> {
    return request<FxReceiptResponse>("/api/v1/finance/fx-receipts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settleFxReceipt(id: number, settle_amount: string): Promise<FxReceiptResponse> {
    return request<FxReceiptResponse>(`/api/v1/finance/fx-receipts/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ settle_amount }),
    });
  },
  async getFxUnsettledSummary(): Promise<FxUnsettledSummaryResponse> {
    return request<FxUnsettledSummaryResponse>("/api/v1/finance/fx-receipts/unsettled-summary");
  },
  async getStyleProfitability(styleId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/style/${styleId}`);
  },
  async getLcProfitability(orderId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/lc/${orderId}`);
  },
  async getCostingVariance(orderId: number): Promise<ProfitabilityResponse> {
    return request<ProfitabilityResponse>(`/api/v1/finance/profitability/variance/${orderId}`);
  },
  async getMultiCurrencyRevaluationSummary(params?: { base_currency?: string }): Promise<MultiCurrencyRevaluationResponse> {
    const q = new URLSearchParams();
    if (params?.base_currency) q.set("base_currency", params.base_currency);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MultiCurrencyRevaluationResponse>(`/api/v1/finance/multi-currency/revaluation-summary${suffix}`);
  },
  async listOutstandingBills(params?: { bill_type?: "PAYABLE" | "RECEIVABLE"; status_filter?: string }): Promise<OutstandingBillResponse[]> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OutstandingBillResponse[]>(`/api/v1/finance/bills${suffix}`);
  },
  async createOutstandingBill(data: OutstandingBillCreate): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>("/api/v1/finance/bills", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async settleOutstandingBill(id: number, settle_amount: string): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/${id}/settle`, {
      method: "POST",
      body: JSON.stringify({ settle_amount }),
    });
  },
  async allocateOutstandingBill(id: number, voucher_id: number, amount: string): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/${id}/allocate`, {
      method: "POST",
      body: JSON.stringify({ voucher_id, amount }),
    });
  },
  async autoCreateBillFromVoucher(
    voucherId: number,
    data: { party_name: string; bill_type?: "PAYABLE" | "RECEIVABLE"; due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/bills/auto-create-from-voucher/${voucherId}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async getBillsAging(params?: { bill_type?: "PAYABLE" | "RECEIVABLE"; as_of_date?: string; party_name?: string }): Promise<BillsAgingResponse> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.as_of_date) q.set("as_of_date", params.as_of_date);
    if (params?.party_name) q.set("party_name", params.party_name);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BillsAgingResponse>(`/api/v1/finance/bills/aging${suffix}`);
  },
  async listCostCenters(params?: { active_only?: boolean }): Promise<CostCenterResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostCenterResponse[]>(`/api/v1/finance/cost-centers${suffix}`);
  },
  async listCostCentersWithTotal(params?: {
    active_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListWithTotal<CostCenterResponse>> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    if (params?.search != null && params.search.trim() !== "") q.set("search", params.search.trim());
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestWithTotal<CostCenterResponse>(`/api/v1/finance/cost-centers${suffix}`);
  },
  async getCostCenter(id: number): Promise<CostCenterResponse> {
    return request<CostCenterResponse>(`/api/v1/finance/cost-centers/${id}`);
  },
  async createCostCenter(data: CostCenterCreate): Promise<CostCenterResponse> {
    return request<CostCenterResponse>("/api/v1/finance/cost-centers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateCostCenter(id: number, data: CostCenterCreate): Promise<CostCenterResponse> {
    return request<CostCenterResponse>(`/api/v1/finance/cost-centers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getCostCenterDashboard(): Promise<CostCenterDashboardRow[]> {
    return request<CostCenterDashboardRow[]>("/api/v1/finance/cost-centers/dashboard");
  },
  async listBudgets(params?: { fiscal_year?: string }): Promise<BudgetResponse[]> {
    const q = new URLSearchParams();
    if (params?.fiscal_year) q.set("fiscal_year", params.fiscal_year);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BudgetResponse[]>(`/api/v1/finance/budgets${suffix}`);
  },
  async createBudget(data: BudgetCreate): Promise<BudgetResponse> {
    return request<BudgetResponse>("/api/v1/finance/budgets", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBudget(budgetId: number, data: BudgetCreate): Promise<BudgetResponse> {
    return request<BudgetResponse>(`/api/v1/finance/budgets/${budgetId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
  async deleteBudget(budgetId: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/budgets/${budgetId}`, { method: "DELETE" });
  },
  async getBudgetVsActual(budgetId: number): Promise<BudgetVsActualResponse> {
    return request<BudgetVsActualResponse>(`/api/v1/finance/budgets/${budgetId}/vs-actual`);
  },
  async getVoucherPrint(voucherId: number): Promise<VoucherPrintResponse> {
    return request<VoucherPrintResponse>(`/api/v1/finance/vouchers/${voucherId}/print`);
  },
  async verifyVoucher(verificationId: string): Promise<VoucherVerificationResponse> {
    return request<VoucherVerificationResponse>(`/api/v1/finance/vouchers/verify/${encodeURIComponent(verificationId)}`);
  },
  async listAccountingPeriods(): Promise<AccountingPeriodResponse[]> {
    return request<AccountingPeriodResponse[]>("/api/v1/finance/accounting-periods");
  },
  async createAccountingPeriod(data: AccountingPeriodCreate): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>("/api/v1/finance/accounting-periods", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async closeAccountingPeriod(id: number): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>(`/api/v1/finance/accounting-periods/${id}/close`, { method: "POST" });
  },
  async reopenAccountingPeriod(id: number): Promise<AccountingPeriodResponse> {
    return request<AccountingPeriodResponse>(`/api/v1/finance/accounting-periods/${id}/reopen`, { method: "POST" });
  },
  async deleteAccountingPeriod(id: number): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/v1/finance/accounting-periods/${id}`, { method: "DELETE" });
  },
  async checkAccountingPeriodLock(voucher_date: string): Promise<{ locked: boolean; reason?: string; period_id?: number; period_name?: string }> {
    const q = new URLSearchParams();
    q.set("voucher_date", voucher_date);
    return request<{ locked: boolean; reason?: string; period_id?: number; period_name?: string }>(`/api/v1/finance/accounting-periods/check-lock?${q.toString()}`);
  },
  async listBankAccounts(params?: { active_only?: boolean }): Promise<BankAccountResponse[]> {
    const q = new URLSearchParams();
    if (params?.active_only === false) q.set("active_only", "false");
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BankAccountResponse[]>(`/api/v1/finance/banking/accounts${suffix}`);
  },
  async createBankAccount(data: BankAccountCreate): Promise<BankAccountResponse> {
    return request<BankAccountResponse>("/api/v1/finance/banking/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateBankAccount(id: number, data: BankAccountCreate): Promise<BankAccountResponse> {
    return request<BankAccountResponse>(`/api/v1/finance/banking/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async listBankReconciliations(params?: { bank_account_id?: number }): Promise<BankReconciliationResponse[]> {
    const q = new URLSearchParams();
    if (params?.bank_account_id != null) q.set("bank_account_id", String(params.bank_account_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BankReconciliationResponse[]>(`/api/v1/finance/banking/reconciliation${suffix}`);
  },
  async createBankReconciliation(data: BankReconciliationCreate): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>("/api/v1/finance/banking/reconciliation", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async resolveBankReconciliation(id: number): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>(`/api/v1/finance/banking/reconciliation/${id}/resolve`, { method: "POST" });
  },
  async listBankStatementLines(reconId: number): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines`);
  },
  async getBankReconciliationSummary(reconId: number): Promise<BankReconciliationSummaryResponse> {
    return request<BankReconciliationSummaryResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/summary`);
  },
  async finalizeBankReconciliation(reconId: number, reason?: string): Promise<BankReconciliationResponse> {
    return request<BankReconciliationResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/finalize`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async listBankStatementMatchLogs(reconId: number): Promise<BankStatementMatchLogResponse[]> {
    return request<BankStatementMatchLogResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/match-logs`);
  },
  async exportBankStatementMatchLogsCsv(reconId: number): Promise<string> {
    return requestText(`/api/v1/finance/banking/reconciliation/${reconId}/match-logs/export-csv`);
  },
  async importBankStatementLines(reconId: number, lines: BankStatementLineCreate[]): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    });
  },
  async importBankStatementLinesCsv(reconId: number, csv_text: string): Promise<BankStatementLineResponse[]> {
    return request<BankStatementLineResponse[]>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/import-csv`, {
      method: "POST",
      body: JSON.stringify({ csv_text }),
    });
  },
  async manualMatchBankStatementLine(
    reconId: number,
    lineId: number,
    payment_run_id: number
  ): Promise<BankStatementLineResponse> {
    return request<BankStatementLineResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/${lineId}/match`, {
      method: "POST",
      body: JSON.stringify({ payment_run_id }),
    });
  },
  async manualUnmatchBankStatementLine(reconId: number, lineId: number): Promise<BankStatementLineResponse> {
    return request<BankStatementLineResponse>(`/api/v1/finance/banking/reconciliation/${reconId}/statement-lines/${lineId}/unmatch`, {
      method: "POST",
    });
  },
  async autoMatchBankStatementLines(reconId: number, tolerance?: number): Promise<{ matched_count: number; remaining_unmatched: number }> {
    const q = new URLSearchParams();
    if (tolerance != null) q.set("tolerance", String(tolerance));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<{ matched_count: number; remaining_unmatched: number }>(
      `/api/v1/finance/banking/reconciliation/${reconId}/auto-match${suffix}`,
      { method: "POST" }
    );
  },
  async listPaymentRuns(params?: { status_filter?: string }): Promise<PaymentRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PaymentRunResponse[]>(`/api/v1/finance/banking/payment-runs${suffix}`);
  },
  async createPaymentRun(data: PaymentRunCreate): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>("/api/v1/finance/banking/payment-runs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async executePaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/execute`, { method: "POST" });
  },
  async approvePaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/approve`, { method: "POST" });
  },
  async processPaymentRun(id: number): Promise<PaymentRunResponse> {
    return request<PaymentRunResponse>(`/api/v1/finance/banking/payment-runs/${id}/process`, { method: "POST" });
  },
  async getPaymentRunAdvice(id: number): Promise<PaymentRunAdviceResponse> {
    return request<PaymentRunAdviceResponse>(`/api/v1/finance/banking/payment-runs/${id}/advice`);
  },
  async listSettlementAudit(params?: {
    from_date?: string;
    to_date?: string;
    status_filter?: string;
    source_currency?: string;
    party_query?: string;
    limit?: number;
    offset?: number;
  }): Promise<SettlementAuditResponse> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source_currency) q.set("source_currency", params.source_currency);
    if (params?.party_query) q.set("party_query", params.party_query);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<SettlementAuditResponse>(`/api/v1/finance/banking/settlement-audit${suffix}`);
  },
  async exportSettlementAuditCsv(params?: {
    from_date?: string;
    to_date?: string;
    status_filter?: string;
    source_currency?: string;
    party_query?: string;
  }): Promise<string> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.source_currency) q.set("source_currency", params.source_currency);
    if (params?.party_query) q.set("party_query", params.party_query);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return requestText(`/api/v1/finance/banking/settlement-audit/export.csv${suffix}`);
  },
  async listSettlementAuditPresets(): Promise<SettlementAuditPresetResponse[]> {
    return request<SettlementAuditPresetResponse[]>("/api/v1/finance/banking/settlement-audit-presets");
  },
  async saveSettlementAuditPreset(
    body: SettlementAuditPresetCreate,
  ): Promise<SettlementAuditPresetResponse> {
    return request<SettlementAuditPresetResponse>("/api/v1/finance/banking/settlement-audit-presets", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async deleteSettlementAuditPreset(id: number): Promise<void> {
    return request<void>(`/api/v1/finance/banking/settlement-audit-presets/${id}`, {
      method: "DELETE",
    });
  },
  async getPurchaseApOverview(): Promise<PurchaseApOverviewResponse> {
    return request<PurchaseApOverviewResponse>("/api/v1/finance/purchase-workflow/ap-overview");
  },
  async createPayableFromPurchaseOrder(
    poId: number,
    data?: { due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/purchase-workflow/create-payable-from-po/${poId}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },
  async createPayableFromGoodsReceiving(
    grnId: number,
    data?: { due_in_days?: number; currency?: string; notes?: string }
  ): Promise<OutstandingBillResponse> {
    return request<OutstandingBillResponse>(`/api/v1/finance/purchase-workflow/create-payable-from-grn/${grnId}`, {
      method: "POST",
      body: JSON.stringify(data ?? {}),
    });
  },

  // Commercial
  async listExportCases(): Promise<ExportCaseRow[]> {
    return request<ExportCaseRow[]>("/api/v1/commercial/export-cases");
  },
  async listProformaInvoices(params?: {
    status?: string;
    direction?: string;
    vendor_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<ProformaInvoiceRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.direction) q.set("direction", params.direction);
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ProformaInvoiceRow[]>(`/api/v1/commercial/proforma-invoices${suffix}`);
  },
  async createProformaInvoice(body: ProformaInvoiceCreate): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>("/api/v1/commercial/proforma-invoices", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateProformaInvoice(id: number, body: ProformaInvoiceUpdate): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getProformaInvoice(id: number): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}`);
  },
  async getIssuedExportProformaOrderIds(): Promise<{ order_ids: number[] }> {
    return request<{ order_ids: number[] }>(
      "/api/v1/commercial/proforma-invoices/issued-export-order-ids"
    );
  },
  async getProformaInvoiceForPrint(id: number): Promise<ProformaInvoiceForPrint> {
    return request<ProformaInvoiceForPrint>(`/api/v1/commercial/proforma-invoices/${id}/for-print`);
  },
  async finalizeProformaInvoice(id: number): Promise<ProformaInvoiceRow> {
    return request<ProformaInvoiceRow>(`/api/v1/commercial/proforma-invoices/${id}/finalize`, { method: "POST" });
  },
  async deleteProformaInvoice(id: number): Promise<void> {
    return request<void>(`/api/v1/commercial/proforma-invoices/${id}`, { method: "DELETE" });
  },
  async verifyProformaToken(token: string): Promise<ProformaVerifyResponse> {
    const q = new URLSearchParams({ token });
    return requestPublic<ProformaVerifyResponse>(`/api/v1/commercial/verify?${q.toString()}`);
  },
  async listBtbLcs(params?: {
    status?: string;
    master_contract_id?: number;
    vendor_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<BtbLcRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.master_contract_id != null) q.set("master_contract_id", String(params.master_contract_id));
    if (params?.vendor_id != null) q.set("vendor_id", String(params.vendor_id));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BtbLcRow[]>(`/api/v1/commercial/btb-lcs${suffix}`);
  },
  async createBtbLc(body: BtbLcCreate): Promise<BtbLcRow> {
    return request<BtbLcRow>("/api/v1/commercial/btb-lcs", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateBtbLc(id: number, body: BtbLcUpdate): Promise<BtbLcRow> {
    return request<BtbLcRow>(`/api/v1/commercial/btb-lcs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async getBtbLc(id: number): Promise<BtbLcRow> {
    return request<BtbLcRow>(`/api/v1/commercial/btb-lcs/${id}`);
  },
  async getBtbLcAccounting(id: number): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/accounting`);
  },
  async recordBtbLcOpening(id: number, body: BtbLcRecordOpeningBody): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-opening`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async recordBtbLcDocumentsAcceptance(
    id: number,
    body: BtbLcRecordDocumentsAcceptanceBody
  ): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-documents-acceptance`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async recordBtbLcRealization(id: number, body: BtbLcRecordRealizationBody): Promise<BtbLcAccountingRow> {
    return request<BtbLcAccountingRow>(`/api/v1/commercial/btb-lcs/${id}/record-realization`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listMasterContracts(params?: { status?: string }): Promise<MasterContractRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<MasterContractRow[]>(`/api/v1/commercial/master-contracts${suffix}`);
  },
  async getMasterContract(id: number): Promise<MasterContractRow> {
    return request<MasterContractRow>(`/api/v1/commercial/master-contracts/${id}`);
  },
  async createMasterContract(body: MasterContractCreate): Promise<MasterContractRow> {
    return request<MasterContractRow>("/api/v1/commercial/master-contracts", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateMasterContract(id: number, body: MasterContractUpdate): Promise<MasterContractRow> {
    return request<MasterContractRow>(`/api/v1/commercial/master-contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async listTradeCases(params?: {
    status?: string;
    current_stage?: string;
    direction?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    at_risk?: boolean;
    at_risk_days?: number;
    limit?: number;
    offset?: number;
  }): Promise<TradeCaseRow[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.current_stage) q.set("current_stage", params.current_stage);
    if (params?.direction) q.set("direction", params.direction);
    if (params?.search) q.set("search", params.search);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    if (params?.at_risk === true) q.set("at_risk", "true");
    if (params?.at_risk_days != null) q.set("at_risk_days", String(params.at_risk_days));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<TradeCaseRow[]>(`/api/v1/trade-cases${suffix}`);
  },
  async getTradeCaseDocumentCounts(): Promise<{
    documents: Record<string, number>;
    shipments: Record<string, number>;
  }> {
    return request("/api/v1/trade-cases/document-counts");
  },
  async getTradeCase(id: number): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}`);
  },
  async createTradeCase(body: TradeCaseCreate): Promise<TradeCaseRow> {
    return request<TradeCaseRow>("/api/v1/trade-cases", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateTradeCase(id: number, body: TradeCaseUpdate): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async transitionTradeCase(id: number, body: TradeCaseTransitionBody): Promise<TradeCaseRow> {
    return request<TradeCaseRow>(`/api/v1/trade-cases/${id}/transition`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getTradeCaseStages(id: number): Promise<TradeCaseStageRow[]> {
    return request<TradeCaseStageRow[]>(`/api/v1/trade-cases/${id}/stages`);
  },
  async getTradeCaseStageLog(id: number): Promise<TradeCaseStageLogRow[]> {
    return request<TradeCaseStageLogRow[]>(`/api/v1/trade-cases/${id}/stage-log`);
  },
  async uploadTradeDocument(
    tradeCaseId: number,
    payload: {
      file: File;
      document_type: string;
      shipment_id?: number | null;
      linked_entity_type?: string | null;
      linked_entity_id?: number | null;
    }
  ): Promise<{ id: number; trade_case_id: number; document_type: string; file_name: string; version: number; created_at: string }> {
    const form = new FormData();
    form.append("file", payload.file);
    form.append("document_type", payload.document_type);
    if (payload.shipment_id != null) form.append("shipment_id", String(payload.shipment_id));
    if (payload.linked_entity_type) form.append("linked_entity_type", payload.linked_entity_type);
    if (payload.linked_entity_id != null) form.append("linked_entity_id", String(payload.linked_entity_id));
    return request(`/api/v1/trade-cases/${tradeCaseId}/documents`, {
      method: "POST",
      body: form,
    });
  },
  async listTradeDocuments(tradeCaseId: number): Promise<TradeDocumentRow[]> {
    return request<TradeDocumentRow[]>(`/api/v1/trade-cases/${tradeCaseId}/documents`);
  },
  async downloadTradeDocument(tradeCaseId: number, documentId: number): Promise<Blob> {
    return requestBlob(`/api/v1/trade-cases/${tradeCaseId}/documents/${documentId}/download`);
  },
  /** GET a tenant file by API path (e.g. /api/v1/files/customer_logos/xxx.png) with JWT + X-Tenant-Id. */
  async fetchSecureFileBlob(apiPath: string): Promise<Blob> {
    const p = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
    return requestBlob(p, { method: "GET" });
  },
  async getTradeCaseMargin(tradeCaseId: number): Promise<TradeCaseMarginResponse> {
    return request<TradeCaseMarginResponse>(`/api/v1/trade-cases/${tradeCaseId}/margin`);
  },
  async getTradeDashboardSummary(): Promise<TradeCaseDashboardResponse> {
    return request<TradeCaseDashboardResponse>("/api/v1/trade-cases/dashboard/summary");
  },
  async listShipments(params?: {
    trade_case_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ShipmentRow[]> {
    const q = new URLSearchParams();
    if (params?.trade_case_id != null) q.set("trade_case_id", String(params.trade_case_id));
    if (params?.status) q.set("status", params.status);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ShipmentRow[]>(`/api/v1/logistics/shipments${suffix}`);
  },
  async getShipment(id: number): Promise<ShipmentRow> {
    return request<ShipmentRow>(`/api/v1/logistics/shipments/${id}`);
  },
  async createShipment(body: ShipmentCreate): Promise<ShipmentRow> {
    return request<ShipmentRow>("/api/v1/logistics/shipments", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async updateShipment(id: number, body: ShipmentUpdate): Promise<ShipmentRow> {
    return request<ShipmentRow>(`/api/v1/logistics/shipments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  // ── Bill-Wise Tracking ──
  async listBillReferences(params?: { bill_type?: string; status_filter?: string; account_id?: number; search?: string }): Promise<BillReferenceRow[]> {
    const q = new URLSearchParams();
    if (params?.bill_type) q.set("bill_type", params.bill_type);
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.account_id) q.set("account_id", String(params.account_id));
    if (params?.search) q.set("search", params.search);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<BillReferenceRow[]>(`/api/v1/finance/bill-references${suffix}`);
  },
  async createBillReference(body: BillReferenceCreate): Promise<BillReferenceRow> {
    return request<BillReferenceRow>("/api/v1/finance/bill-references", { method: "POST", body: JSON.stringify(body) });
  },
  async getBillReferenceDetail(id: number): Promise<BillReferenceDetail> {
    return request<BillReferenceDetail>(`/api/v1/finance/bill-references/${id}`);
  },
  async allocateBillWise(body: BillAllocationCreate): Promise<{ ok: boolean; allocation_id: number; message: string }> {
    return request<{ ok: boolean; allocation_id: number; message: string }>("/api/v1/finance/bill-references/allocate", { method: "POST", body: JSON.stringify(body) });
  },
  async autoCreateBillRefs(voucherId: number): Promise<{ ok: boolean; bills_created: number; bill_numbers: string[] }> {
    return request<{ ok: boolean; bills_created: number; bill_numbers: string[] }>(`/api/v1/finance/bill-references/auto-create/${voucherId}`, { method: "POST" });
  },
  async billWiseOutstandingReport(): Promise<BillWiseOutstandingReport> {
    return request<BillWiseOutstandingReport>("/api/v1/finance/bill-references/report/outstanding");
  },
  async billWiseAgingReport(billType?: string): Promise<BillWiseAgingReport> {
    const q = billType ? `?bill_type=${encodeURIComponent(billType)}` : "";
    return request<BillWiseAgingReport>(`/api/v1/finance/bill-references/report/aging${q}`);
  },
  async backfillVoucherSignatures(): Promise<{ signed_count: number; message: string }> {
    return request<{ signed_count: number; message: string }>("/api/v1/finance/vouchers/backfill-signatures", { method: "POST" });
  },

  // ── AI document extraction (no file persistence) ──
  async extractCustomerForm(file: File): Promise<CustomerExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<CustomerExtractionResponse>("/api/v1/ai-extract/customer-form", {
      method: "POST",
      body: fd,
    });
  },
  async extractInquiryForm(file: File): Promise<InquiryExtractionResponse> {
    const fd = new FormData();
    fd.append("file", file);
    return request<InquiryExtractionResponse>("/api/v1/ai-extract/inquiry-form", {
      method: "POST",
      body: fd,
    });
  },

  // ── Production (garment manufacturing) ──
  async getProductionSettings(): Promise<{
    tenant_id: number;
    enabled_optional_units: string[];
    weekend_days: string[];
    cm_alert_threshold_pct: number;
    ai_provider_config?: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/settings");
  },
  async updateProductionSettings(body: {
    enabled_optional_units?: string[];
    weekend_days?: string[];
    cm_alert_threshold_pct?: number;
    ai_provider_config?: Record<string, unknown> | null;
  }): Promise<{
    tenant_id: number;
    enabled_optional_units: string[];
    weekend_days: string[];
    cm_alert_threshold_pct: number;
    ai_provider_config?: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/settings", { method: "PUT", body: JSON.stringify(body) });
  },
  async listProductionShifts(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      shift_code: string;
      name: string;
      start_time: string;
      end_time: string;
      break_minutes: number;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/shifts");
  },
  async createProductionShift(body: {
    shift_code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/shifts", { method: "POST", body: JSON.stringify(body) });
  },
  async updateProductionShift(
    shift_id: number,
    body: {
      shift_code?: string;
      name?: string;
      start_time?: string;
      end_time?: string;
      break_minutes?: number;
      is_active?: boolean;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/shifts/${shift_id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
  async listSewingLines(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      line_code: string;
      name: string;
      default_machine_count: number;
      running_machine_count: number;
      default_operator_count: number;
      default_helper_count: number;
      supervisor_user_id: number | null;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/sewing-lines");
  },
  async createSewingLine(body: {
    line_code: string;
    name: string;
    default_machine_count?: number;
    running_machine_count?: number;
    default_operator_count?: number;
    default_helper_count?: number;
    supervisor_user_id?: number | null;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/sewing-lines", { method: "POST", body: JSON.stringify(body) });
  },
  async updateSewingLine(
    line_id: number,
    body: {
      name?: string;
      default_machine_count?: number;
      running_machine_count?: number;
      default_operator_count?: number;
      default_helper_count?: number;
      supervisor_user_id?: number | null;
      is_active?: boolean;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/sewing-lines/${line_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteSewingLine(line_id: number): Promise<void> {
    return request(`/api/v1/production/sewing-lines/${line_id}`, { method: "DELETE" });
  },
  async listDepartmentMachines(department_type?: string): Promise<
    Array<{
      id: number;
      tenant_id: number;
      department_type: string;
      machine_code: string;
      name: string;
      machine_type: string | null;
      status: string;
      is_active: boolean;
    }>
  > {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/machines${q}`);
  },
  async createDepartmentMachine(body: {
    department_type: string;
    machine_code: string;
    name: string;
    machine_type?: string | null;
    status?: string;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/machines", { method: "POST", body: JSON.stringify(body) });
  },
  async listCrewRoles(department_type?: string): Promise<
    Array<{
      id: number;
      tenant_id: number;
      department_type: string;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      sort_order: number;
      is_active: boolean;
    }>
  > {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/crew-roles${q}`);
  },
  async createCrewRole(body: {
    department_type: string;
    role_key: string;
    role_name: string;
    is_named?: boolean;
    designation_id?: number | null;
    designation_filter?: string | null;
    sort_order?: number;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-roles", { method: "POST", body: JSON.stringify(body) });
  },
  async updateCrewRole(
    crew_role_id: number,
    body: {
      role_name?: string;
      is_named?: boolean;
      designation_id?: number | null;
      designation_filter?: string | null;
      sort_order?: number;
      is_active?: boolean;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/crew-roles/${crew_role_id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  async deleteCrewRole(crew_role_id: number): Promise<void> {
    return request(`/api/v1/production/crew-roles/${crew_role_id}`, { method: "DELETE" });
  },
  async listHrEmployeesForCrew(params?: { designation_filter?: string; designation_id?: number }): Promise<{
    items: Array<{
      id: number;
      employee_code: string;
      name: string;
      designation_id: number | null;
      designation_title: string | null;
      user_id: number | null;
    }>;
  }> {
    const q = new URLSearchParams();
    if (params?.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params?.designation_filter) q.set("designation_filter", params.designation_filter);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/production/hr-employees${suffix}`);
  },
  async getHrAvailableForCrew(params: {
    date: string;
    designation_id?: number;
    designation_filter?: string;
  }): Promise<{
    designation_id: number | null;
    designation_filter: string | null;
    date: string;
    available_count: number;
    active_count: number;
    on_leave_count: number;
    employees: Array<{ id: number; employee_code: string; name: string; designation_id: number | null }>;
  }> {
    const q = new URLSearchParams();
    q.set("date", params.date);
    if (params.designation_id != null) q.set("designation_id", String(params.designation_id));
    if (params.designation_filter) q.set("designation_filter", params.designation_filter);
    return request(`/api/v1/production/hr-available?${q.toString()}`);
  },
  async getLineCrewTemplate(line_id: number): Promise<
    Array<{
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      default_count: number;
      employee_id: number | null;
      employee_name: string | null;
      sort_order: number;
    }>
  > {
    return request(`/api/v1/production/sewing-lines/${line_id}/crew-template`);
  },
  async putLineCrewTemplate(
    line_id: number,
    rows: Array<{ crew_role_id: number; default_count: number; employee_id?: number | null }>,
  ): Promise<unknown> {
    return request(`/api/v1/production/sewing-lines/${line_id}/crew-template`, {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });
  },
  async getUnitCrewTemplate(
    department_type: string,
    machine_id?: number | null,
  ): Promise<
    Array<{
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      default_count: number;
      employee_id: number | null;
      employee_name: string | null;
      sort_order: number;
    }>
  > {
    const q = machine_id != null ? `?machine_id=${machine_id}` : "";
    return request(`/api/v1/production/units/${encodeURIComponent(department_type)}/crew-template${q}`);
  },
  async putUnitCrewTemplate(
    department_type: string,
    body: {
      machine_id?: number | null;
      rows: Array<{ crew_role_id: number; default_count: number; employee_id?: number | null }>;
    },
  ): Promise<unknown> {
    return request(`/api/v1/production/units/${encodeURIComponent(department_type)}/crew-template`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  async getCrewDaily(params: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
  }): Promise<
    Array<{
      id: number;
      crew_role_id: number;
      role_key: string;
      role_name: string;
      is_named: boolean;
      designation_id: number | null;
      designation_filter: string | null;
      planned_count: number;
      actual_present: number;
      shortfall: number;
      employee_id: number | null;
      employee_name: string | null;
      notes: string | null;
      sort_order: number;
      validation_warning: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    if (params.department_type) q.set("department_type", params.department_type);
    if (params.machine_id != null) q.set("machine_id", String(params.machine_id));
    return request(`/api/v1/production/crew-daily?${q.toString()}`);
  },
  async putCrewDaily(body: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
    rows: Array<{ crew_role_id: number; planned_count: number; employee_id?: number | null; notes?: string | null }>;
    override_validation?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-daily", { method: "PUT", body: JSON.stringify(body) });
  },
  async initCrewDailyFromTemplate(body: {
    production_date: string;
    shift_id: number;
    line_id?: number | null;
    department_type?: string | null;
    machine_id?: number | null;
  }): Promise<unknown> {
    return request("/api/v1/production/crew-daily/init-from-template", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async syncCrewAttendance(date: string): Promise<{ ok: boolean; updated_rows: number }> {
    return request(`/api/v1/production/crew-daily/sync-attendance?date=${encodeURIComponent(date)}`, {
      method: "POST",
    });
  },
  async getCrewDailyFilters(): Promise<{
    shifts: Array<{ id: number; code: string; name: string }>;
    lines: Array<{ id: number; line_code: string; name: string }>;
    optional_units: string[];
  }> {
    return request("/api/v1/production/crew-daily/filters");
  },
  async getProductionDashboard(production_date: string): Promise<{
    production_date: string;
    total_output_today: number;
    overall_efficiency_pct: number | null;
    crew_fill_rate_pct: number | null;
    cm_alerts_open: number;
    lines: Array<Record<string, unknown>>;
    cutting_bundles_pending: number;
    cutting_bundles_issued: number;
  }> {
    return request(`/api/v1/production/dashboard?production_date=${encodeURIComponent(production_date)}`);
  },
  async getCrewSubstituteSuggestions(params: {
    production_date: string;
    shift_id: number;
    line_id: number;
  }): Promise<{
    production_date: string;
    line_id: number;
    shift_id: number;
    gaps: Array<{
      crew_role_id: number;
      role_name: string;
      current_employee_id: number;
      suggested_substitutes: Array<{ id: number; employee_code: string; name: string }>;
    }>;
  }> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/crew-daily/substitute-suggestions?${q.toString()}`);
  },
  async getLineCrewSheetStatus(params: { production_date: string; shift_id: number; line_id: number }): Promise<{
    id: number | null;
    sewing_line_id: number;
    shift_id: number;
    production_date: string;
    status: string;
    submitted_at: string | null;
    approved_at: string | null;
    locked_at: string | null;
  }> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/line-crew-sheet/status?${q.toString()}`);
  },
  async updateLineCrewSheetStatus(
    params: { production_date: string; shift_id: number; line_id: number },
    body: { action: string },
  ): Promise<unknown> {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    q.set("shift_id", String(params.shift_id));
    q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/line-crew-sheet/status?${q.toString()}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async listProductionDefectCodes(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      code: string;
      name: string;
      category: string | null;
      severity: string;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/quality/defect-codes");
  },
  async createProductionDefectCode(body: {
    code: string;
    name: string;
    category?: string | null;
    severity?: string;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/quality/defect-codes", { method: "POST", body: JSON.stringify(body) });
  },
  async listProductionQcChecks(params: { production_date: string; shift_id?: number; line_id?: number }): Promise<
    Array<{
      id: number;
      tenant_id: number;
      sewing_line_id: number;
      shift_id: number;
      production_date: string;
      hour_slot: number;
      check_type: string;
      total_checked: number;
      pass_qty: number;
      fail_qty: number;
      defect_codes: unknown[] | null;
      notes: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("production_date", params.production_date);
    if (params.shift_id != null) q.set("shift_id", String(params.shift_id));
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    return request(`/api/v1/production/quality/checks?${q.toString()}`);
  },
  async upsertProductionQcCheck(body: {
    sewing_line_id: number;
    shift_id: number;
    production_date: string;
    hour_slot: number;
    check_type?: string;
    total_checked?: number;
    pass_qty?: number;
    fail_qty?: number;
    defect_codes?: unknown[] | null;
    notes?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/quality/checks", { method: "PUT", body: JSON.stringify(body) });
  },
  async listWorkerSkills(params?: { employee_id?: number }): Promise<
    Array<{
      id: number;
      tenant_id: number;
      employee_id: number;
      ie_operation_id: number;
      operation_code: string | null;
      operation_name: string | null;
      skill_level: string;
      certified_at: string | null;
      is_active: boolean;
    }>
  > {
    const q = new URLSearchParams();
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request(`/api/v1/production/skills${suffix}`);
  },
  async createWorkerSkill(body: {
    employee_id: number;
    ie_operation_id: number;
    skill_level?: string;
    certified_at?: string | null;
    is_active?: boolean;
  }): Promise<unknown> {
    return request("/api/v1/production/skills", { method: "POST", body: JSON.stringify(body) });
  },
  async listCrewRosterWeekly(params: {
    week_start_date: string;
    sewing_line_id?: number;
    shift_id?: number;
  }): Promise<
    Array<{
      id: number;
      week_start_date: string;
      sewing_line_id: number;
      shift_id: number;
      crew_role_id: number;
      role_name: string | null;
      day_of_week: number;
      employee_id: number | null;
      planned_count: number;
      notes: string | null;
    }>
  > {
    const q = new URLSearchParams();
    q.set("week_start_date", params.week_start_date);
    if (params.sewing_line_id != null) q.set("sewing_line_id", String(params.sewing_line_id));
    if (params.shift_id != null) q.set("shift_id", String(params.shift_id));
    return request(`/api/v1/production/roster-weekly?${q.toString()}`);
  },
  async upsertCrewRosterCell(body: {
    week_start_date: string;
    sewing_line_id: number;
    shift_id: number;
    crew_role_id: number;
    day_of_week: number;
    employee_id?: number | null;
    planned_count?: number;
    notes?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/roster-weekly/cell", { method: "PUT", body: JSON.stringify(body) });
  },
  async generateCrewDailyFromRoster(body: {
    week_start_date: string;
    sewing_line_id: number;
    shift_id: number;
    target_date: string;
  }): Promise<void> {
    return request("/api/v1/production/roster-weekly/generate-daily", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getEmployeeProductionProfile(employee_id: number, limit_days?: number): Promise<{
    employee_id: number;
    line_assignment: { line_id: number; line_code: string; last_date: string } | null;
    skills: Array<{ operation_code: string; name: string; skill_level: string }>;
    attendance_trend: Array<{ date: string; status: string }>;
    hourly_good_qty_total_period: number;
  }> {
    const q = limit_days != null ? `?limit_days=${limit_days}` : "";
    return request(`/api/v1/production/employees/${employee_id}/production-profile${q}`);
  },
  async getPlanBoard(from_date: string, to_date: string): Promise<{ items: unknown[] }> {
    return request(`/api/v1/production/plan-board?from_date=${encodeURIComponent(from_date)}&to_date=${encodeURIComponent(to_date)}`);
  },
  async getControlTowerSummary(params: {
    delivery_from: string;
    delivery_to: string;
    limit?: number;
    offset?: number;
  }): Promise<ControlTowerSummaryResponse> {
    const q = new URLSearchParams();
    q.set("delivery_from", params.delivery_from);
    q.set("delivery_to", params.delivery_to);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return request(`/api/v1/control-tower/summary?${q}`);
  },
  async getControlTowerOrderTimeline(orderId: number): Promise<ControlTowerTimelineResponse> {
    return request(`/api/v1/control-tower/order/${orderId}/timeline`);
  },
  async getControlTowerMasterLcSnapshot(masterContractId: number): Promise<ControlTowerLcSnapshotResponse> {
    return request(`/api/v1/control-tower/master-lc/${masterContractId}/snapshot`);
  },
  async getControlTowerCapacityHeatmap(date_from: string, date_to: string): Promise<ControlTowerCapacityHeatmapResponse> {
    const q = new URLSearchParams();
    q.set("date_from", date_from);
    q.set("date_to", date_to);
    return request(`/api/v1/control-tower/capacity-heatmap?${q}`);
  },
  async getFinanceExposureMasterLc(masterContractId: number): Promise<FinanceMasterLcExposureResponse> {
    return request(`/api/v1/finance/exposure/master-lc/${masterContractId}`);
  },
  async getFinanceMaturityLadder(masterContractId?: number): Promise<FinanceMaturityTrancheRow[]> {
    const q = masterContractId != null ? `?master_contract_id=${masterContractId}` : "";
    return request(`/api/v1/finance/maturity-ladder${q}`);
  },
  async proposeLineReservation(order_id: number): Promise<{ id: number; reservation_status: string }> {
    return request("/api/v1/production/reservations/propose", {
      method: "POST",
      body: JSON.stringify({ order_id }),
    });
  },
  async confirmReservationSoft(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/confirm-soft`, { method: "POST" });
  },
  async confirmReservationFirm(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/confirm-firm`, { method: "POST" });
  },
  async releaseLineReservation(config_id: number): Promise<{ id: number; reservation_status: string }> {
    return request(`/api/v1/production/reservations/${config_id}/release`, { method: "POST" });
  },
  async replanMaterialDelay(body: { order_id: number; delay_days: number }): Promise<{ shifted_config_ids: number[] }> {
    return request("/api/v1/production/replan/material-delay", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async getPlanSuggest(start_date: string): Promise<{ suggestions: unknown[] }> {
    return request(`/api/v1/production/plan-board/suggest?start_date=${encodeURIComponent(start_date)}`);
  },
  async getOrderReadiness(order_id: number): Promise<unknown> {
    return request(`/api/v1/production/plan-board/readiness/${order_id}`);
  },
  /** Full chain readiness (style, OB, TNA, materials, line). */
  async getOrderChainReadiness(order_id: number): Promise<unknown> {
    return request(`/api/v1/production/planning/pipeline/${order_id}/readiness`);
  },
  /** Orders with readiness; optional group_by=style */
  async getProductionPipeline(params?: { group_by?: "style" }): Promise<unknown> {
    const q = params?.group_by === "style" ? "?group_by=style" : "";
    return request(`/api/v1/production/planning/pipeline${q}`);
  },
  async aiAnalyzePipeline(): Promise<{ summary: string | null; pipeline_snapshot: unknown }> {
    return request("/api/v1/production/planning/ai/analyze", { method: "POST" });
  },
  async aiSuggestAllocation(order_id: number): Promise<{ suggestion: Record<string, unknown> | null }> {
    return request("/api/v1/production/planning/ai/suggest-allocation", {
      method: "POST",
      body: JSON.stringify({ order_id }),
    });
  },
  async aiPredictMove(body: {
    config_id: number;
    target_line_id: number;
    target_start_date: string;
  }): Promise<{
    prediction: string | null;
    ai_status?: {
      enabled: boolean;
      has_api_key: boolean;
      model: string;
      rate_limited: boolean;
      reason: string;
    };
  }> {
    return request("/api/v1/production/planning/ai/predict-move", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  async aiOptimizeBoard(): Promise<{
    moves: Array<Record<string, unknown>>;
    ai_status?: {
      enabled: boolean;
      has_api_key: boolean;
      model: string;
      rate_limited: boolean;
      reason: string;
    };
  }> {
    return request("/api/v1/production/planning/ai/optimize", { method: "POST" });
  },
  async aiRiskAlerts(): Promise<{ alerts: Array<Record<string, unknown>> | null }> {
    return request("/api/v1/production/planning/ai/risk-alerts");
  },
  async aiEfficiencyForecast(): Promise<{
    forecast_text: string;
    lines: Array<Record<string, unknown>>;
    generated_at: string;
  }> {
    return request("/api/v1/production/planning/ai/efficiency-forecast");
  },
  async getAiPlanningSettings(): Promise<{
    effective_enabled: boolean;
    effective_model: string;
    tenant_override: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/planning/ai/settings");
  },
  async putAiPlanningSettings(body: { enabled?: boolean | null; model?: string | null }): Promise<{
    effective_enabled: boolean;
    effective_model: string;
    tenant_override: Record<string, unknown> | null;
  }> {
    return request("/api/v1/production/planning/ai/settings", { method: "PUT", body: JSON.stringify(body) });
  },
  async getMaterialReadinessForOrder(order_id: number): Promise<unknown> {
    return request(`/api/v1/inventory/orders/${order_id}/material-readiness`);
  },
  async listFactoryCalendar(from_date?: string, to_date?: string): Promise<FactoryCalendarOverrideRow[]> {
    const q = new URLSearchParams();
    if (from_date) q.set("from_date", from_date);
    if (to_date) q.set("to_date", to_date);
    const s = q.toString();
    return request(`/api/v1/production/calendar${s ? `?${s}` : ""}`);
  },
  async upsertFactoryCalendar(body: {
    override_date: string;
    override_type: string;
    name?: string | null;
    notes?: string | null;
    category?: string | null;
    source?: string | null;
    is_paid?: boolean;
    affects_hr?: boolean;
  }): Promise<FactoryCalendarOverrideRow> {
    return request("/api/v1/production/calendar", { method: "POST", body: JSON.stringify(body) });
  },
  async deleteFactoryCalendarOverride(override_id: number): Promise<void> {
    return request(`/api/v1/production/calendar/${override_id}`, { method: "DELETE" });
  },
  async getCountryHolidaysPreview(year: number): Promise<CountryHolidaysPreviewResponse> {
    return request(`/api/v1/production/calendar/country-holidays?year=${encodeURIComponent(String(year))}`);
  },
  async importCountryHolidays(body: { year: number; selected_dates: string[] }): Promise<{
    imported_count: number;
    skipped_count: number;
  }> {
    return request("/api/v1/production/calendar/import-holidays", { method: "POST", body: JSON.stringify(body) });
  },
  async deleteProductionShift(shift_id: number): Promise<void> {
    return request(`/api/v1/production/shifts/${shift_id}`, { method: "DELETE" });
  },
  async listIeOperations(): Promise<
    Array<{
      id: number;
      operation_code: string;
      name: string;
      category: string;
      default_smv: number;
      machine_type_required: string | null;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/ie/operations");
  },
  async createIeOperation(body: {
    operation_code: string;
    name: string;
    category?: string;
    default_smv?: number;
    machine_type_required?: string | null;
  }): Promise<unknown> {
    return request("/api/v1/production/ie/operations", { method: "POST", body: JSON.stringify(body) });
  },
  async listOperationBulletins(style_id?: number): Promise<
    Array<{ id: number; style_id: number; ob_code: string; version_no: number; total_smv: number; status: string }>
  > {
    const q = style_id != null ? `?style_id=${style_id}` : "";
    return request(`/api/v1/production/ie/bulletins${q}`);
  },
  async createOperationBulletin(body: {
    style_id: number;
    ob_code: string;
    version_no?: number;
    notes?: string | null;
    operations: Array<{
      sequence_no: number;
      operation_id?: number | null;
      operation_name: string;
      smv?: number;
      machine_type?: string | null;
      attachment_needed?: string | null;
      is_critical?: boolean;
    }>;
  }): Promise<unknown> {
    return request("/api/v1/production/ie/bulletins", { method: "POST", body: JSON.stringify(body) });
  },
  async runLineBalance(body: { ob_id: number; line_id: number; num_workstations: number }): Promise<unknown> {
    return request("/api/v1/production/ie/line-balance", { method: "POST", body: JSON.stringify(body) });
  },
  async assignPlanBoard(body: {
    line_id: number;
    order_id?: number | null;
    style_id?: number | null;
    ob_id?: number | null;
    machine_count?: number;
    operator_count?: number;
    helper_count?: number;
    target_efficiency_pct?: number;
    shift_id?: number | null;
    start_date: string;
    planned_qty?: number;
    sort_order?: number;
  }): Promise<{ id: number }> {
    return request("/api/v1/production/plan-board/assign", { method: "POST", body: JSON.stringify(body) });
  },
  async movePlanBoard(config_id: number, body: { line_id?: number | null; start_date?: string | null }): Promise<{ ok: boolean }> {
    return request(`/api/v1/production/plan-board/${config_id}/move`, { method: "PUT", body: JSON.stringify(body) });
  },
  async upsertHourlyEntry(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/hourly/upsert", { method: "POST", body: JSON.stringify(body) });
  },
  async getHourlySheet(params: {
    department_type: string;
    production_date: string;
    line_id?: number | null;
    machine_id?: number | null;
  }): Promise<{ items: unknown[] }> {
    const q = new URLSearchParams();
    q.set("department_type", params.department_type);
    q.set("production_date", params.production_date);
    if (params.line_id != null) q.set("line_id", String(params.line_id));
    if (params.machine_id != null) q.set("machine_id", String(params.machine_id));
    return request(`/api/v1/production/hourly/sheet?${q.toString()}`);
  },
  async getHourlySummary(line_style_config_id: number, production_date: string): Promise<unknown> {
    return request(
      `/api/v1/production/hourly/summary?line_style_config_id=${line_style_config_id}&production_date=${encodeURIComponent(production_date)}`,
    );
  },
  async listMarkerPlans(): Promise<{ items: Array<{ id: number; marker_code: string; status: string }> }> {
    return request("/api/v1/production/cutting/marker-plans");
  },
  async createMarkerPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/marker-plans", { method: "POST", body: JSON.stringify(body) });
  },
  async createLayPlan(body: { marker_plan_id: number; lay_code: string; fabric_item_id?: number | null }): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/lay-plans", { method: "POST", body: JSON.stringify(body) });
  },
  async createCutTicket(body: { lay_plan_id: number; ticket_code: string }): Promise<{ id: number }> {
    return request("/api/v1/production/cutting/cut-tickets", { method: "POST", body: JSON.stringify(body) });
  },
  async generateCuttingBundles(
    ticket_id: number,
    lines?: Array<{ size?: string; color?: string | null; qty_in_bundle?: number; bundle_count?: number }>,
  ): Promise<{ barcodes: string[] }> {
    return request(`/api/v1/production/cutting/cut-tickets/${ticket_id}/generate-bundles`, {
      method: "POST",
      body: JSON.stringify({ lines: lines ?? null }),
    });
  },
  async lookupCuttingBundle(barcode: string): Promise<unknown> {
    return request(`/api/v1/production/cutting/bundles/lookup/${encodeURIComponent(barcode)}`);
  },
  async issueCuttingBundles(body: { bundle_ids: number[]; issued_to_line_id: number }): Promise<{ ok: boolean }> {
    return request("/api/v1/production/cutting/bundles/issue", { method: "POST", body: JSON.stringify(body) });
  },
  async downloadCuttingBundlePdf(cut_ticket_id: number): Promise<Blob> {
    return requestBlob(`/api/v1/production/cutting/bundles/barcode-pdf/${cut_ticket_id}`, { method: "GET" });
  },
  async postProductionDailyCost(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/costs/daily", { method: "POST", body: JSON.stringify(body) });
  },
  async getCmAnalysis(period_date: string): Promise<{ items: unknown[] }> {
    return request(`/api/v1/production/costs/cm-analysis?period_date=${encodeURIComponent(period_date)}`);
  },
  async recalcCm(period_date: string): Promise<unknown> {
    return request(`/api/v1/production/costs/cm-recalc?period_date=${encodeURIComponent(period_date)}`, { method: "POST" });
  },
  async getCmAlerts(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/costs/cm-alerts");
  },
  async listCmOverheadConfig(): Promise<
    Array<{
      id: number;
      tenant_id: number;
      cost_category: string;
      account_id: number | null;
      cost_center_id: number | null;
      allocation_method: string;
      is_active: boolean;
    }>
  > {
    return request("/api/v1/production/costs/overhead-config");
  },
  async upsertCmOverheadConfig(
    rows: Array<{
      cost_category: string;
      account_id?: number | null;
      cost_center_id?: number | null;
      allocation_method?: string;
      is_active?: boolean;
    }>,
  ): Promise<unknown> {
    return request("/api/v1/production/costs/overhead-config", {
      method: "PUT",
      body: JSON.stringify(rows),
    });
  },
  async createWipJournal(body: Record<string, unknown>): Promise<{ id: number; voucher_id?: number | null }> {
    return request("/api/v1/production/costs/wip-journal", { method: "POST", body: JSON.stringify(body) });
  },
  async listWipJournals(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/costs/wip-journal");
  },
  async listKnittingPlans(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/knitting/plans");
  },
  async createKnittingPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/knitting/plans", { method: "POST", body: JSON.stringify(body) });
  },
  async listDyeRecipes(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/dyeing/recipes");
  },
  async createDyeRecipe(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/dyeing/recipes", { method: "POST", body: JSON.stringify(body) });
  },
  async listDyeBatches(): Promise<{ items: unknown[] }> {
    return request("/api/v1/production/dyeing/batches");
  },
  async createDyeBatch(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/dyeing/batches", { method: "POST", body: JSON.stringify(body) });
  },
  async listDepartmentProductionPlans(department_type?: string): Promise<{ items: unknown[] }> {
    const q = department_type ? `?department_type=${encodeURIComponent(department_type)}` : "";
    return request(`/api/v1/production/departments/plans${q}`);
  },
  async createDepartmentProductionPlan(body: Record<string, unknown>): Promise<{ id: number }> {
    return request("/api/v1/production/departments/plans", { method: "POST", body: JSON.stringify(body) });
  },
};

export interface DashboardKpi {
  id: string;
  label: string;
  value: number;
}

export interface OrderStatusSummary {
  status: string;
  count: number;
}

export interface CustomerMapPoint {
  country: string;
  count: number;
}

export interface DashboardInsight {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success";
}

export interface DashboardProductionPoint {
  date: string;
  output: number;
  target: number;
  efficiency: number;
}

export interface DashboardRecentOrder {
  id: number;
  order_code: string;
  style_ref: string | null;
  status: string;
  quantity: number | null;
  delivery_date: string | null;
  customer_name: string;
}

export interface DashboardTask {
  id: number;
  title: string;
  status: string;
  due_date: string | null;
  severity: string | null;
  order_id: number;
}

export interface DashboardEmployeeSummary {
  total: number;
  breakdown: { status: string; count: number }[];
  departments: { status: string; count: number }[];
}

export interface DashboardPayrollRow {
  period: string;
  totalNet: string;
  totalGross: string;
  totalDeductions: string;
  status: string;
}

export interface DashboardRevenueTrend {
  months: { month: string; revenue: number }[];
  totalRevenue: number;
}

export interface TenantOverviewReport {
  tenant_id: number;
  tenant_name: string;
  customers: number;
  orders: number;
  orders_by_status: OrderStatusSummary[];
}

export interface CustomerPerformanceRow {
  customer_id: number;
  customer_name: string;
  orders: number;
}

export interface ReportPurchaseOrderRow {
  id: number;
  po_code: string;
  supplier_name: string;
  order_date: string | null;
  expected_date: string | null;
  status: string;
  created_at: string;
}

export interface ReportGrnRow {
  id: number;
  grn_code: string;
  purchase_order_id: number | null;
  received_date: string | null;
  status: string;
  created_at: string;
}

export interface ReportSalesOrderRow {
  id: number;
  order_code: string;
  customer_name: string;
  style_ref: string | null;
  order_date: string | null;
  delivery_date: string | null;
  quantity: number | null;
  status: string;
  created_at: string;
}

export interface UserWithRoleResponse {
  id: number;
  tenant_id: number;
  role_id: number;
  email: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  role_name: string;
}

export interface RoleResponse {
  id: number;
  tenant_id: number | null;
  name: string;
  display_name: string;
}

export interface SettingsRoleResponse extends RoleResponse {
  permissions: Record<string, unknown>;
}

export interface SettingsRoleCreate {
  name: string;
  display_name: string;
  permissions?: Record<string, unknown>;
}

export interface SettingsRoleUpdate {
  display_name?: string;
  permissions?: Record<string, unknown>;
}

export interface SettingsUserCreate {
  role_id: number;
  email: string;
  username?: string | null;
  password: string;
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean;
}

export interface SettingsUserUpdate {
  role_id?: number;
  email?: string;
  username?: string;
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean;
  password?: string;
}

export interface AuditLogResponse {
  id: number;
  tenant_id: number;
  user_id: number | null;
  action: string;
  resource: string | null;
  details: string | null;
  created_at: string;
}

export interface CustomerResponse {
  id: number;
  tenant_id: number;
  customer_code: string;
  name: string;
  address: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  legal_entity_name: string | null;
  trade_name: string | null;
  tax_id_vat_number: string | null;
  customer_type: string | null;
  status: string;
  primary_contact_name: string | null;
  designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  phone_country_code: string | null;
  subscribe_newsletter: boolean;
  company_logo_url: string | null;
  billing_address_line1: string | null;
  billing_city: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  shipping_address_line1: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  same_as_billing: boolean;
  /** Default quotation currency; may be absent on older API responses */
  preferred_currency?: string | null;
  created_at: string;
  updated_at: string;
  profile_completeness?: number | null;
  last_activity_at?: string | null;
  duplicate_risk_score?: number | null;
  days_since_activity?: number | null;
}

export interface CustomerFacetsResponse {
  countries: string[];
  customer_types: string[];
  statuses: string[];
}

export interface CustomerRelatedRecordItem {
  id: number;
  code: string;
  status: string;
  updated_at: string;
}

export interface CustomerRelatedResponse {
  orders: CustomerRelatedRecordItem[];
  inquiries: CustomerRelatedRecordItem[];
  quotations: CustomerRelatedRecordItem[];
}

export interface CustomerHealthResponse {
  customer_id: number;
  profile_completeness: number;
  is_active: boolean;
  orders_count: number;
  inquiries_count: number;
  quotations_count: number;
  outstanding_receivable_count: number;
  last_activity_at: string | null;
  duplicate_risk_score: number;
}

export interface CustomerAiExtractWrapResponse {
  extraction: CustomerExtractionResponse;
  model_hint: string;
  request_id?: string | null;
  suggestion_batch_id?: number | null;
}

export interface CustomerAiFieldSuggestion {
  value: string | null;
  confidence: number;
  source: string;
  rationale?: string | null;
}

export interface CustomerAiEnrichResponse {
  suggestions: Record<string, CustomerAiFieldSuggestion>;
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface CustomerAiValidateIssue {
  field: string;
  severity: string;
  message: string;
  suggestion?: string | null;
}

export interface CustomerAiValidateResponse {
  issues: CustomerAiValidateIssue[];
  completeness_score: number;
  normalized_fields: Record<string, string | null>;
  suggestion_batch_id?: number | null;
}

export interface CustomerAiDedupeMatch {
  customer_id: number;
  customer_code: string;
  name: string;
  score: number;
  matched_on: string[];
}

export interface CustomerAiDedupeResponse {
  matches: CustomerAiDedupeMatch[];
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface CustomerAiSummaryResponse {
  summary_text: string;
  key_facts: string[];
  risk_indicators: string[];
  profile_grade: string;
  suggestion_batch_id?: number | null;
}

export interface CustomerAiNextActionItem {
  action_type: string;
  title: string;
  description: string;
  priority: number;
  target_module: string;
  target_url?: string | null;
}

export interface CustomerAiNextActionsResponse {
  actions: CustomerAiNextActionItem[];
  suggestion_batch_id?: number | null;
}

export interface CustomerAiNlSearchResponse {
  interpreted_filters: Record<string, string | null>;
  keyword: string | null;
  explanation: string | null;
}

export interface CustomerAiAuditEntry {
  id: number;
  action: string;
  created_at: string;
  model_used?: string | null;
  latency_ms?: number | null;
  result?: string | null;
  error_category?: string | null;
  customer_id?: number | null;
  summary?: string | null;
  suggestion_batch_id?: number | null;
  actor_username?: string | null;
  event_label?: string | null;
  issue_count?: number | null;
  match_count?: number | null;
  key_facts_count?: number | null;
  action_count?: number | null;
  applied_field_count?: number | null;
}

export interface CustomerAiAuditListResponse {
  items: CustomerAiAuditEntry[];
}

export type CustomerAiSuggestionDecision = "apply" | "reject" | "skip";

export interface CustomerAiMarkDecisionsRequest {
  batch_id: number;
  decisions: Array<{ field_key: string; decision: CustomerAiSuggestionDecision }>;
}

export interface CustomerAiApplySuggestionsRequest {
  batch_id: number;
  customer_id: number;
  items: Array<{ field_key: string; decision: CustomerAiSuggestionDecision }>;
  conflict_mode?: "overwrite" | "skip_if_different";
}

export interface CustomerAiApplyConflict {
  field: string;
  current: string;
  suggested: string;
}

export interface CustomerAiApplySuggestionsResponse {
  customer: CustomerResponse;
  applied_fields: string[];
  skipped_fields: string[];
  rejected_fields: string[];
  conflicts: CustomerAiApplyConflict[];
}

export interface CustomerAiFinalizeAfterCreateRequest {
  batch_id: number;
  customer_id: number;
}

export interface CustomerAiFinalizeAfterCreateResponse {
  applied_fields: string[];
  diff_summary: Array<Record<string, string>>;
}

export interface InquiryAiIndicatorsOut {
  completeness_score: number;
  quotation_readiness_score: number;
  flags: string[];
}

export interface InquiryAiExtractWrapResponse {
  extraction: InquiryExtractionResponse;
  model_hint: string;
  request_id?: string | null;
  suggestion_batch_id?: number | null;
}

export interface InquiryAiFieldSuggestion {
  value: string | null;
  confidence: number;
  source: string;
  rationale?: string | null;
}

export interface InquiryAiEnrichResponse {
  suggestions: Record<string, InquiryAiFieldSuggestion>;
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface InquiryAiValidateIssue {
  field: string;
  severity: string;
  message: string;
  suggestion?: string | null;
}

export interface InquiryAiValidateResponse {
  issues: InquiryAiValidateIssue[];
  completeness_score: number;
  quotation_readiness_score: number;
  commercial_risk_score: number;
  normalized_fields: Record<string, string | null>;
  suggestion_batch_id?: number | null;
}

export interface InquiryAiDedupeMatch {
  inquiry_id: number;
  inquiry_code: string;
  customer_id: number;
  score: number;
  matched_on: string[];
}

export interface InquiryAiDedupeResponse {
  matches: InquiryAiDedupeMatch[];
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface InquiryAiSummaryResponse {
  summary_text: string;
  key_facts: string[];
  risk_indicators: string[];
  profile_grade: string;
  suggestion_batch_id?: number | null;
}

export interface InquiryAiNextActionItem {
  action_type: string;
  title: string;
  description: string;
  priority: number;
  target_module: string;
  target_url?: string | null;
}

export interface InquiryAiNextActionsResponse {
  actions: InquiryAiNextActionItem[];
  suggestion_batch_id?: number | null;
}

export interface InquiryAiAuditEntry {
  id: number;
  action: string;
  created_at: string;
  model_used?: string | null;
  latency_ms?: number | null;
  result?: string | null;
  error_category?: string | null;
  inquiry_id?: number | null;
  summary?: string | null;
  suggestion_batch_id?: number | null;
  actor_username?: string | null;
  event_label?: string | null;
  issue_count?: number | null;
  match_count?: number | null;
  key_facts_count?: number | null;
  action_count?: number | null;
  applied_field_count?: number | null;
}

export interface InquiryAiAuditListResponse {
  items: InquiryAiAuditEntry[];
}

export type InquiryAiSuggestionDecision = "apply" | "reject" | "skip";

export interface InquiryAiMarkDecisionsRequest {
  batch_id: number;
  decisions: Array<{ field_key: string; decision: InquiryAiSuggestionDecision }>;
}

export interface InquiryAiApplySuggestionsRequest {
  batch_id: number;
  inquiry_id: number;
  items: Array<{ field_key: string; decision: InquiryAiSuggestionDecision }>;
  conflict_mode?: "overwrite" | "skip_if_different";
}

export interface InquiryAiApplyConflict {
  field: string;
  current: string;
  suggested: string;
}

/** Narrow inquiry shape returned after AI apply (matches backend InquiryAiInquiryOut). */
export interface InquiryAiInquiryOut {
  id: number;
  tenant_id: number;
  customer_id: number;
  inquiry_code: string;
  style_ref: string | null;
  style_id: number | null;
  customer_intermediary_id: number | null;
  season: string | null;
  department: string | null;
  quantity: number | null;
  target_price: string | null;
  target_price_currency: string | null;
  currency: string | null;
  exchange_rate: string | null;
  expected_delivery_date: string | null;
  shipping_term: string | null;
  commission_mode: string | null;
  commission_type: string | null;
  commission_value: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryAiApplySuggestionsResponse {
  inquiry: InquiryAiInquiryOut;
  applied_fields: string[];
  skipped_fields: string[];
  rejected_fields: string[];
  conflicts: InquiryAiApplyConflict[];
}

export interface InquiryAiFinalizeAfterCreateRequest {
  batch_id: number;
  inquiry_id: number;
}

export interface InquiryAiFinalizeAfterCreateResponse {
  applied_fields: string[];
  diff_summary: Array<Record<string, string>>;
}

// ---------- Quotation AI types ----------

export interface QuotationAiIndicatorsOut {
  completeness_score: number;
  costing_readiness_score: number;
  flags: string[];
  costing_phase1_enabled?: boolean;
  signal_scope?: "header_only" | "full_costing";
  confidence_basis?: "partial" | "full";
  source_mode?: "deterministic_only";
  reason_codes?: string[];
  limited_confidence?: boolean;
  cost_completeness_score?: number;
  costing_confidence_score?: number;
  anomaly_severity?: "none" | "low" | "medium" | "high";
  margin_pressure?: "low" | "medium" | "high";
  fx_sensitivity?: boolean;
  missing_prerequisite_count?: number;
  urgent_costing_review?: boolean;
  costing_flags?: string[];
  cost_benchmark_enabled?: boolean;
  cost_benchmark_label?: string | null;
}

export interface QuotationCostingAiSignalMeta {
  signal_scope: "header_only" | "full_costing";
  confidence_basis: "partial" | "full";
  source_mode: "deterministic_only";
  reason_codes: string[];
  limited_confidence: boolean;
}

export interface QuotationCostingIntelItem {
  reason_code: string;
  code: string;
  severity: string;
  message: string;
}

export interface QuotationCostingAiCompletenessResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  cost_completeness_score: number;
  costing_confidence_score: number;
  items: QuotationCostingIntelItem[];
  line_counts: Record<string, number>;
}

export interface QuotationCostingAiAnomalyScanResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  anomaly_severity: "none" | "low" | "medium" | "high";
  items: QuotationCostingIntelItem[];
}

export interface QuotationCostingAiMarginRiskResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  margin_pressure: "low" | "medium" | "high";
  context: Record<string, unknown>;
}

export interface QuotationCostingAiFxSensitivityResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  fx_sensitivity: boolean;
  context: Record<string, unknown>;
}

export interface QuotationCostingAiCostingSummaryResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  summary_lines: string[];
  scores: Record<string, unknown>;
}

export interface QuotationCostingNextActionItem {
  title: string;
  description: string;
  category: string;
}

export interface QuotationCostingAiNextActionsResponse extends QuotationCostingAiSignalMeta {
  advisory_notice: string;
  quotation_id: number;
  actions: QuotationCostingNextActionItem[];
}

export interface QuotationCostingSuggestionItemOut {
  id: number;
  ordinal: number;
  cost_category: "material" | "manufacturing" | "other_cost";
  target_line_id: number | null;
  suggestion_type: string;
  field_changes_json: Record<string, unknown>;
  confidence: number | null;
  reason_code: string | null;
  explanation: string | null;
  source_mode: string;
  disposition: string;
  before_snapshot_json?: Record<string, unknown> | null;
}

export interface QuotationCostingSuggestionBatchOut {
  id: number;
  tenant_id: number;
  quotation_id: number | null;
  action_type: string;
  status: string;
  meta_json?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  items: QuotationCostingSuggestionItemOut[];
}

export interface QuotationCostingSuggestionApplyResponse {
  quotation_id: number;
  batch_id: number;
  applied_item_ids: number[];
  skipped_item_ids: number[];
  rejected_item_ids: number[];
  blocked_items: Array<Record<string, unknown>>;
  requires_revision: boolean;
}

export interface BenchmarkRange {
  min: number | null;
  max: number | null;
  avg: number | null;
  p25: number | null;
  p75: number | null;
}

export interface BenchmarkMetricOut {
  metric_key: string;
  benchmark_range: BenchmarkRange;
  current_value: number | null;
  deviation_percent: number | null;
  /** 0–1 peer-sample strength for this metric */
  confidence: number;
  classification: string;
  reason_code: string | null;
  explanation: string | null;
}

export interface CostBenchmarkResponse {
  advisory_notice: string;
  quotation_id: number;
  insufficient_data: boolean;
  similar_quotation_count: number;
  overall_classification: string;
  /** 0–1 aggregate benchmark confidence */
  overall_confidence: number;
  metrics: BenchmarkMetricOut[];
  summary: string;
  next_actions: string[];
  source_mode: string;
  reason_codes: string[];
}

export interface CostBenchmarkHistoryEntry {
  id: number;
  created_at: string | null;
  action: string;
  quotation_id: number | null;
  summary: string | null;
  overall_classification: string | null;
  overall_confidence: number | null;
}

export interface CostBenchmarkHistoryResponse {
  items: CostBenchmarkHistoryEntry[];
}

export interface QuotationAiFieldSuggestion {
  value: string | null;
  confidence: number;
  source: string;
  rationale: string | null;
}

export interface QuotationAiEnrichResponse {
  suggestions: Record<string, QuotationAiFieldSuggestion>;
  warnings: string[];
  suggestion_batch_id: number | null;
}

export interface QuotationAiExtractWrapResponse {
  extraction: InquiryExtractionResponse;
  model_hint: string;
  request_id?: string | null;
  suggestion_batch_id?: number | null;
}

export interface QuotationAiValidateIssue {
  field: string;
  severity: string;
  message: string;
  suggestion: string | null;
}

export interface QuotationAiValidateResponse {
  issues: QuotationAiValidateIssue[];
  completeness_score: number;
  costing_readiness_score: number;
  commercial_risk_score: number;
  normalized_fields: Record<string, string | null>;
  suggestion_batch_id: number | null;
}

export interface QuotationAiDedupeMatch {
  quotation_id: number;
  quotation_code: string;
  customer_id: number;
  score: number;
  matched_on: string[];
}

export interface QuotationAiDedupeResponse {
  matches: QuotationAiDedupeMatch[];
  warnings: string[];
  suggestion_batch_id: number | null;
}

export interface QuotationAiSummaryResponse {
  summary_text: string;
  key_facts: string[];
  risk_indicators: string[];
  profile_grade: string;
  suggestion_batch_id: number | null;
}

export interface QuotationAiNextActionItem {
  action_type: string;
  title: string;
  description: string;
  priority: number;
  target_module: string;
  target_url: string | null;
}

export interface QuotationAiNextActionsResponse {
  actions: QuotationAiNextActionItem[];
  suggestion_batch_id: number | null;
}

export interface QuotationAiAuditEntry {
  id: number;
  action: string;
  created_at: string;
  model_used: string | null;
  latency_ms: number | null;
  result: string | null;
  error_category: string | null;
  quotation_id: number | null;
  summary: string | null;
  suggestion_batch_id: number | null;
  actor_username: string | null;
  event_label: string | null;
  issue_count: number | null;
  match_count: number | null;
  key_facts_count: number | null;
  action_count: number | null;
  applied_field_count: number | null;
}

export interface QuotationAiAuditListResponse {
  items: QuotationAiAuditEntry[];
}

export interface QuotationAiMarkDecisionsRequest {
  batch_id: number;
  decisions: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>;
}

export interface QuotationAiApplyConflict {
  field: string;
  current: string;
  suggested: string;
}

export interface QuotationAiQuotationOut {
  id: number;
  tenant_id: number;
  customer_id: number;
  inquiry_id: number | null;
  quotation_code: string;
  style_ref: string | null;
  style_id: number | null;
  customer_intermediary_id: number | null;
  department: string | null;
  projected_quantity: number | null;
  projected_delivery_date: string | null;
  quotation_date: string | null;
  target_price: string | null;
  target_price_currency: string | null;
  exchange_rate: string | null;
  shipping_term: string | null;
  commission_mode: string | null;
  commission_type: string | null;
  commission_value: number | null;
  currency: string | null;
  valid_until: string | null;
  notes: string | null;
  status: string;
  version_no: number;
  created_at: string;
  updated_at: string;
}

export interface QuotationAiApplySuggestionsRequest {
  batch_id: number;
  quotation_id: number;
  items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>;
  conflict_mode: "overwrite" | "skip_if_different";
}

export interface QuotationAiApplySuggestionsResponse {
  quotation: QuotationAiQuotationOut;
  applied_fields: string[];
  skipped_fields: string[];
  rejected_fields: string[];
  conflicts: QuotationAiApplyConflict[];
  requires_change_request?: Array<{ field_key: string; message: string }>;
}

export interface QuotationAiFinalizeAfterCreateRequest {
  batch_id: number;
  quotation_id: number;
}

export interface QuotationAiFinalizeAfterCreateResponse {
  applied_fields: string[];
  diff_summary: Array<Record<string, string>>;
}

// ---------- Order AI types ----------

export interface OrderAiIndicatorsOut {
  completeness_score: number;
  execution_readiness_score: number;
  material_readiness_score: number;
  planning_confidence_score: number;
  promise_date_risk_score: number;
  duplicate_risk_score: number;
  missing_dependency_count: number;
  urgent_planning_flag: boolean;
  flags: string[];
  capacity_bottleneck_flag?: boolean;
  bottleneck_severity_score?: number;
  promise_sensitivity_score?: number;
}

export interface OrderExtractionField {
  value: unknown;
  confidence: number;
  source_text?: string | null;
  source: string;
}

export interface OrderExtractionResponse {
  success: boolean;
  document_type: string;
  fields: Record<string, OrderExtractionField>;
  unmapped_text: string[];
  warnings: string[];
}

export interface OrderAiExtractWrapResponse {
  extraction: OrderExtractionResponse;
  model_hint: string;
  request_id: string | null;
  suggestion_batch_id: number | null;
}

export interface OrderAiFieldSuggestion {
  value: string | null;
  confidence: number;
  source: string;
  rationale: string | null;
}

export interface OrderAiEnrichResponse {
  suggestions: Record<string, OrderAiFieldSuggestion>;
  warnings: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiValidateIssue {
  field: string;
  severity: string;
  message: string;
  suggestion: string | null;
}

export interface OrderAiValidateResponse {
  issues: OrderAiValidateIssue[];
  completeness_score: number;
  execution_readiness_score: number;
  commercial_risk_score: number;
  normalized_fields: Record<string, string | null>;
  suggestion_batch_id: number | null;
}

export interface OrderAiPromiseLineOut {
  item_id: number;
  item_code: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
}

export interface OrderAiPromiseCheckOut {
  order_id: number;
  atp_ok: boolean;
  ctp_ok: boolean;
  reasons: string[];
  lines: OrderAiPromiseLineOut[];
}

export interface OrderAiValidateExecutionResponse {
  issues: OrderAiValidateIssue[];
  completeness_score: number;
  execution_readiness_score: number;
  material_readiness_score: number;
  planning_confidence_score: number;
  promise_date_risk_score: number;
  missing_prerequisites: string[];
  normalized_fields: Record<string, string | null>;
  promise_check: OrderAiPromiseCheckOut | null;
  suggestion_batch_id: number | null;
}

export interface OrderAiPlanningRiskFactor {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  details: Record<string, unknown>;
}

export interface OrderAiPlanningRiskCheckResponse {
  order_id: number;
  risk_band: "low" | "medium" | "high";
  risk_score: number;
  material_readiness_score: number;
  planning_confidence_score: number;
  promise_date_risk_score: number;
  missing_prerequisites: string[];
  factors: OrderAiPlanningRiskFactor[];
  promise_check: OrderAiPromiseCheckOut;
  suggestion_batch_id: number | null;
}

export interface OrderAiAtpCtpSummaryResponse {
  order_id: number;
  atp_ok: boolean;
  ctp_ok: boolean;
  reasons: string[];
  shortage_line_count: number;
  max_shortage_qty: number;
  summary_text: string;
  lines: OrderAiPromiseLineOut[];
  suggestion_batch_id: number | null;
}

export interface OrderAiBottleneckOverlapOut {
  line_id: number;
  this_config_id: number;
  peer_config_id: number;
  peer_order_id: number | null;
  window_start: string;
  window_end: string;
  peer_window_start: string;
  peer_window_end: string;
  severity_hint: "info" | "warning" | "error";
  message: string;
}

export interface OrderAiCapacityBottleneckScanResponse {
  order_id: number;
  config_count: number;
  distinct_lines: number;
  overlap_hits: number;
  severity_score: number;
  bottlenecks: OrderAiBottleneckOverlapOut[];
  limitations: string[];
  explainability_notes: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiWhatIfSimulationResponse {
  order_id: number;
  scenario_label: string | null;
  assumptions: string[];
  baseline_promise: OrderAiPromiseCheckOut;
  simulated_promise: OrderAiPromiseCheckOut;
  bottleneck_severity_baseline: number;
  bottleneck_severity_adjusted: number;
  scenario_readiness_score: number;
  advisory_notes: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiPromiseSensitivityPointOut {
  offset_days: number;
  effective_delivery_date: string | null;
  atp_ok: boolean;
  ctp_ok: boolean;
  reason_count: number;
}

export interface OrderAiPromiseSensitivityCheckResponse {
  order_id: number;
  points: OrderAiPromiseSensitivityPointOut[];
  sensitivity_score: number;
  explainability_notes: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiExecutionPlanningSummaryResponse {
  order_id: number;
  headline: string;
  bullets: string[];
  bottleneck_severity_score: number;
  scenario_readiness_proxy: number;
  promise_sensitivity_score: number;
  recommended_review_path: string[];
  next_step_hints: string[];
  limitations: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiDedupeMatch {
  order_id: number;
  order_code: string;
  customer_id: number;
  score: number;
  matched_on: string[];
}

export interface OrderAiDedupeResponse {
  matches: OrderAiDedupeMatch[];
  warnings: string[];
  suggestion_batch_id: number | null;
}

export interface OrderAiSummaryResponse {
  summary_text: string;
  key_facts: string[];
  risk_indicators: string[];
  profile_grade: string;
  suggestion_batch_id: number | null;
}

export interface OrderAiNextActionItem {
  action_type: string;
  title: string;
  description: string;
  priority: number;
  target_module: string;
  target_url: string | null;
}

export interface OrderAiNextActionsResponse {
  actions: OrderAiNextActionItem[];
  suggestion_batch_id: number | null;
}

export interface OrderAiAuditEntry {
  id: number;
  action: string;
  created_at: string;
  model_used: string | null;
  latency_ms: number | null;
  result: string | null;
  error_category: string | null;
  order_id: number | null;
  summary: string | null;
  suggestion_batch_id: number | null;
  actor_username: string | null;
  event_label: string | null;
  issue_count: number | null;
  match_count: number | null;
  key_facts_count: number | null;
  action_count: number | null;
  applied_field_count: number | null;
}

export interface OrderAiAuditListResponse {
  items: OrderAiAuditEntry[];
}

export interface OrderAiMarkDecisionsRequest {
  batch_id: number;
  decisions: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>;
}

export interface OrderAiApplyConflict {
  field: string;
  current: string;
  suggested: string;
}

export interface OrderAiOrderOut {
  id: number;
  tenant_id: number;
  customer_id: number;
  quotation_id: number | null;
  order_code: string;
  style_ref: string | null;
  customer_intermediary_id: number | null;
  shipping_term: string | null;
  commission_mode: string | null;
  commission_type: string | null;
  commission_value: number | null;
  order_date: string | null;
  delivery_date: string | null;
  quantity: number | null;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderAiApplySuggestionsRequest {
  batch_id: number;
  order_id: number;
  items: Array<{ field_key: string; decision: "apply" | "reject" | "skip" }>;
  conflict_mode: "overwrite" | "skip_if_different";
}

export interface OrderAiApplySuggestionsResponse {
  order: OrderAiOrderOut;
  applied_fields: string[];
  skipped_fields: string[];
  rejected_fields: string[];
  conflicts: OrderAiApplyConflict[];
}

export interface OrderAiFinalizeAfterCreateRequest {
  batch_id: number;
  order_id: number;
}

export interface OrderAiFinalizeAfterCreateResponse {
  applied_fields: string[];
  diff_summary: Array<Record<string, string>>;
}

export interface CustomerCreate {
  name: string;
  address?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  legal_entity_name?: string;
  trade_name?: string;
  tax_id_vat_number?: string;
  customer_type?: string;
  status?: string;
  primary_contact_name?: string;
  designation?: string;
  contact_email?: string;
  contact_phone?: string;
  phone_country_code?: string;
  subscribe_newsletter?: boolean;
  company_logo_url?: string;
  billing_address_line1?: string;
  billing_city?: string;
  billing_postal_code?: string;
  billing_country?: string;
  shipping_address_line1?: string;
  shipping_city?: string;
  shipping_postal_code?: string;
  shipping_country?: string;
  same_as_billing?: boolean;
  preferred_currency?: string;
}

export interface CustomerUpdate {
  name?: string;
  address?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
  legal_entity_name?: string;
  trade_name?: string;
  tax_id_vat_number?: string;
  customer_type?: string;
  status?: string;
  primary_contact_name?: string;
  designation?: string;
  contact_email?: string;
  contact_phone?: string;
  phone_country_code?: string;
  subscribe_newsletter?: boolean;
  company_logo_url?: string;
  billing_address_line1?: string;
  billing_city?: string;
  billing_postal_code?: string;
  billing_country?: string;
  shipping_address_line1?: string;
  shipping_city?: string;
  shipping_postal_code?: string;
  shipping_country?: string;
  same_as_billing?: boolean;
  preferred_currency?: string;
}

export interface CustomerListPageResponse {
  items: CustomerResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  active_count: number;
  inactive_count: number;
  recent_count: number;
}

export interface CustomerLogoUploadResponse {
  logo_url: string;
  filename: string;
  size_bytes: number;
}

export interface StyleImageUploadResponse {
  style_image_url: string;
  filename: string;
  size_bytes: number;
}

export interface IntermediaryResponse {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  kind: "BUYING_HOUSE" | "AGENT";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntermediaryCreate {
  code?: string;
  name: string;
  kind: "BUYING_HOUSE" | "AGENT";
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_address?: string;
  is_active?: boolean;
  notes?: string;
}

export interface IntermediaryUpdate {
  code?: string;
  name?: string;
  kind?: "BUYING_HOUSE" | "AGENT";
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_address?: string;
  is_active?: boolean;
  notes?: string;
}

export interface CustomerIntermediaryLinkResponse {
  id: number;
  tenant_id: number;
  customer_id: number;
  intermediary_id: number;
  intermediary_name: string | null;
  intermediary_code: string | null;
  is_primary: boolean;
  commission_type: "PERCENTAGE" | "FIXED" | null;
  commission_value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerIntermediaryLinkCreate {
  customer_id: number;
  intermediary_id: number;
  is_primary?: boolean;
  commission_type?: "PERCENTAGE" | "FIXED";
  commission_value?: number;
  notes?: string;
}

export interface CustomerIntermediaryLinkUpdate {
  customer_id?: number;
  intermediary_id?: number;
  is_primary?: boolean;
  commission_type?: "PERCENTAGE" | "FIXED";
  commission_value?: number;
  notes?: string;
}

export interface InquiryResponse {
  id: number;
  tenant_id: number;
  customer_id: number;
  inquiry_code: string;
  style_id?: number | null;
  style_name?: string | null;
  style_image_url?: string | null;
  style_ref: string | null;
  season: string | null;
  department: string | null;
  quantity: number | null;
  target_price: string | null;
  target_price_currency?: string | null;
  currency?: string | null;
  exchange_rate?: string | null;
  expected_delivery_date?: string | null;
  customer_intermediary_id?: number | null;
  intermediary_name?: string | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  status: string;
  is_converted_to_quotation?: boolean;
  converted_quotation_id?: number | null;
  notes: string | null;
  items: InquiryItemResponse[];
  created_at: string;
  updated_at: string;
  ai_indicators?: InquiryAiIndicatorsOut | null;
  customer_name?: string | null;
}

export interface InquiryListPageResponse {
  items: InquiryResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface InquiryItemResponse {
  id: number;
  item_name: string | null;
  description: string | null;
  quantity: number | null;
  sort_order: number;
}

export interface InquiryItemCreate {
  item_name?: string;
  description?: string;
  quantity?: number;
  sort_order?: number;
}

export interface InquiryCreate {
  customer_id: number;
  style_id?: number;
  style_ref?: string;
  season?: string;
  department?: string;
  quantity?: number;
  target_price?: string;
  target_price_currency?: string;
  currency?: string;
  exchange_rate?: string;
  expected_delivery_date?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  notes?: string;
  items?: InquiryItemCreate[];
}

export interface InquiryUpdate {
  style_id?: number;
  style_ref?: string;
  season?: string;
  department?: string;
  quantity?: number;
  target_price?: string;
  target_price_currency?: string;
  currency?: string;
  exchange_rate?: string;
  expected_delivery_date?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  status?: string;
  notes?: string;
  items?: InquiryItemCreate[];
}

/**
 * Inquiry forms keep some fields as UI strings (e.g. empty commission value).
 * FastAPI expects `float | null` for commission_value and literals for commission mode/type,
 * so empty strings must not be sent in JSON.
 */
function inquiryWriteBodyForApi(data: InquiryCreate | InquiryUpdate): Record<string, unknown> {
  const body: Record<string, unknown> = { ...data };

  if (body.commission_mode === "") {
    delete body.commission_mode;
  }
  if (body.commission_type === "") {
    delete body.commission_type;
  }
  if (body.expected_delivery_date === "") {
    delete body.expected_delivery_date;
  }

  const cv = body.commission_value;
  if (cv === "" || cv === null || cv === undefined) {
    delete body.commission_value;
  } else if (typeof cv === "string") {
    const t = cv.trim();
    if (!t) {
      delete body.commission_value;
    } else {
      const n = Number(t);
      if (Number.isFinite(n)) {
        body.commission_value = n;
      } else {
        delete body.commission_value;
      }
    }
  }

  if (Array.isArray(body.items)) {
    body.items = (body.items as InquiryItemCreate[]).map((it) => {
      const row: Record<string, unknown> = { ...it };
      const q = row.quantity;
      if (q === "" || q === null || (typeof q === "number" && !Number.isFinite(q))) {
        delete row.quantity;
      }
      if (row.sort_order === "" || row.sort_order === null) {
        delete row.sort_order;
      }
      return row;
    });
  }

  return body;
}

export interface QuotationResponse {
  id: number;
  tenant_id: number;
  customer_id: number;
  inquiry_id: number | null;
  quotation_code: string;
  style_id?: number | null;
  style_name?: string | null;
  style_image_url?: string | null;
  style_ref: string | null;
  customer_intermediary_id?: number | null;
  intermediary_name?: string | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  department?: string | null;
  projected_quantity?: number | null;
  quotation_date?: string | null;
  projected_delivery_date?: string | null;
  target_price?: string | null;
  target_price_currency?: string | null;
  exchange_rate?: string | null;
  currency: string | null;
  total_amount: string | null;
  material_cost?: string | null;
  manufacturing_cost?: string | null;
  other_cost?: string | null;
  total_cost?: string | null;
  cost_per_piece?: string | null;
  profit_percentage?: string | null;
  quoted_price?: string | null;
  status: string;
  is_converted_to_order?: boolean;
  converted_order_id?: number | null;
  version_no: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ai_indicators?: QuotationAiIndicatorsOut | null;
  commercial_book_currency?: string | null;
  customer_name?: string | null;
  inquiry_code?: string | null;
}

export interface QuotationListPageResponse {
  items: QuotationResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Costing masters
export interface ItemCategoryResponse {
  id: number;
  tenant_id: number;
  category_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ItemCategoryCreate {
  /** Omit to auto-generate (e.g. CAT-0001). */
  category_code?: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface ItemCategoryUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface ItemSubcategoryResponse {
  id: number;
  tenant_id: number;
  category_id: number;
  subcategory_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ItemSubcategoryCreate {
  category_id: number;
  /** Omit to auto-generate (e.g. SUBCAT-0001). */
  subcategory_code?: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface ItemSubcategoryUpdate {
  category_id?: number;
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface ItemUnitResponse {
  id: number;
  tenant_id: number;
  unit_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface ItemUnitCreate {
  /** Omit to auto-generate (e.g. UOM-0001). */
  unit_code?: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface ItemUnitUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface CostingItemResponse {
  id: number;
  tenant_id: number;
  item_code: string;
  name: string;
  description: string | null;
  category_id: number;
  unit_id: number;
  subcategory_id?: number | null;
  stock_group_id?: number | null;
  unit_code?: string | null;
  unit_name?: string | null;
  default_cost: string;
  is_active: boolean;
}

export interface InventoryItemResponse {
  id: number;
  tenant_id: number;
  item_code: string;
  name: string;
  description: string | null;
  category_id: number;
  subcategory_id: number | null;
  unit_id: number;
  default_warehouse_id?: number | null;
  stock_group_id?: number | null;
  default_cost: string;
  is_active: boolean;
}

export interface InventoryItemCreate {
  /** Omit to auto-generate (e.g. ITEM-000001). */
  item_code?: string;
  name: string;
  description?: string;
  category_id: number;
  subcategory_id?: number | null;
  unit_id: number;
  default_warehouse_id?: number | null;
  stock_group_id?: number | null;
  default_cost?: string;
  is_active?: boolean;
}

/** PATCH /inventory/items — codes are immutable after create. */
export interface InventoryItemUpdate {
  name?: string;
  description?: string;
  category_id?: number;
  subcategory_id?: number | null;
  unit_id?: number;
  default_warehouse_id?: number | null;
  stock_group_id?: number | null;
  default_cost?: string;
  is_active?: boolean;
}

export interface WarehouseResponse {
  id: number;
  tenant_id: number;
  warehouse_code: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export interface WarehouseCreate {
  /** Omit to auto-generate (e.g. WH-0001). */
  warehouse_code?: string;
  name: string;
  address?: string;
  is_active?: boolean;
}

export interface WarehouseUpdate {
  name?: string;
  address?: string | null;
  is_active?: boolean;
}

export interface StockGroupResponse {
  id: number;
  tenant_id: number;
  group_code: string;
  name: string;
  parent_id: number | null;
  is_active: boolean;
  inventory_account_id?: number | null;
  wip_account_id?: number | null;
  cogs_account_id?: number | null;
  adjustment_account_id?: number | null;
  grni_account_id?: number | null;
}

export interface StockGroupCreate {
  /** Omit to auto-generate (e.g. GRP-0001). */
  group_code?: string;
  name: string;
  parent_id?: number | null;
  is_active?: boolean;
  inventory_account_id?: number | null;
  wip_account_id?: number | null;
  cogs_account_id?: number | null;
  adjustment_account_id?: number | null;
  grni_account_id?: number | null;
}

/** PATCH /inventory/stock-groups — group_code is immutable. */
export interface StockGroupUpdate {
  name: string;
  parent_id?: number | null;
  is_active?: boolean;
  inventory_account_id?: number | null;
  wip_account_id?: number | null;
  cogs_account_id?: number | null;
  adjustment_account_id?: number | null;
  grni_account_id?: number | null;
}

export interface PurchaseOrderItemCreate {
  item_id: number;
  warehouse_id?: number | null;
  quantity: string;
  unit_price?: string;
}

export interface PurchaseOrderItemResponse {
  id: number;
  purchase_order_id: number;
  item_id: number;
  warehouse_id: number | null;
  quantity: string;
  unit_price: string;
}

export interface VendorResponse {
  id: number;
  tenant_id: number;
  vendor_code: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  ledger_id: number | null;
  default_currency: string | null;
  payment_terms_days: number | null;
  vendor_type: string | null;
  country: string | null;
  city: string | null;
  tax_id: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  swift_code: string | null;
  credit_limit: number | null;
  legal_name?: string | null;
  trade_name?: string | null;
  website?: string | null;
  mobile?: string | null;
  designation?: string | null;
  address_line1?: string | null;
  state_or_region?: string | null;
  postal_code?: string | null;
  registration_number?: string | null;
  bank_account_title?: string | null;
  iban?: string | null;
  payment_terms?: string | null;
  incoterms?: string | null;
  shipping_terms?: string | null;
  lead_time_notes?: string | null;
  compliance_status?: string | null;
  compliance_reference_numbers?: string | null;
  certifications_summary?: string | null;
  onboarding_status?: string | null;
  remarks?: string | null;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorCreate {
  vendor_code: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
  ledger_id?: number | null;
  default_currency?: string | null;
  payment_terms_days?: number | null;
  vendor_type?: string | null;
  country?: string | null;
  city?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  swift_code?: string | null;
  credit_limit?: number | null;
  legal_name?: string | null;
  trade_name?: string | null;
  website?: string | null;
  mobile?: string | null;
  designation?: string | null;
  address_line1?: string | null;
  state_or_region?: string | null;
  postal_code?: string | null;
  registration_number?: string | null;
  bank_account_title?: string | null;
  iban?: string | null;
  payment_terms?: string | null;
  incoterms?: string | null;
  shipping_terms?: string | null;
  lead_time_notes?: string | null;
  compliance_status?: string | null;
  compliance_reference_numbers?: string | null;
  certifications_summary?: string | null;
  onboarding_status?: string | null;
  remarks?: string | null;
  internal_notes?: string | null;
}

export interface VendorUpdate {
  vendor_code?: string;
  name?: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
  ledger_id?: number | null;
  default_currency?: string | null;
  payment_terms_days?: number | null;
  vendor_type?: string | null;
  country?: string | null;
  city?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  swift_code?: string | null;
  credit_limit?: number | null;
  legal_name?: string | null;
  trade_name?: string | null;
  website?: string | null;
  mobile?: string | null;
  designation?: string | null;
  address_line1?: string | null;
  state_or_region?: string | null;
  postal_code?: string | null;
  registration_number?: string | null;
  bank_account_title?: string | null;
  iban?: string | null;
  payment_terms?: string | null;
  incoterms?: string | null;
  shipping_terms?: string | null;
  lead_time_notes?: string | null;
  compliance_status?: string | null;
  compliance_reference_numbers?: string | null;
  certifications_summary?: string | null;
  onboarding_status?: string | null;
  remarks?: string | null;
  internal_notes?: string | null;
}

export interface PurchaseOrderCreate {
  po_code?: string;
  supplier_name?: string | null;
  vendor_id?: number | null;
  order_date?: string | null;
  expected_date?: string | null;
  currency?: string | null;
  exchange_rate_to_base?: number | null;
  base_total_amount?: number | null;
  btb_lc_id?: number | null;
  source_bom_id?: number | null;
  notes?: string;
  status?: string;
  items: PurchaseOrderItemCreate[];
}

export interface PurchaseOrderResponse {
  id: number;
  tenant_id: number;
  po_code: string;
  vendor_id: number | null;
  supplier_name: string;
  order_date: string | null;
  expected_date: string | null;
  currency: string | null;
  exchange_rate_to_base: number | null;
  base_total_amount: number | null;
  btb_lc_id: number | null;
  source_bom_id?: number | null;
  source_order_id?: number | null;
  status: string;
  notes: string | null;
  items: PurchaseOrderItemResponse[];
}

export interface GoodsReceivingItemCreate {
  item_id: number;
  warehouse_id: number;
  quantity: string;
  lot_number?: string | null;
  purchase_order_line_id?: number | null;
  received_qty?: string | null;
  accepted_qty?: string | null;
  rejected_qty?: string | null;
  rejection_reason?: string | null;
  unit_price?: string | null;
}

export interface GoodsReceivingItemResponse {
  id: number;
  goods_receiving_id: number;
  item_id: number;
  warehouse_id: number;
  quantity: string;
  lot_number?: string | null;
  purchase_order_line_id?: number | null;
  ordered_qty?: string | null;
  previously_received_qty?: string | null;
  received_qty?: string | null;
  accepted_qty?: string | null;
  rejected_qty?: string | null;
  pending_qty?: string | null;
  unit_price?: string | null;
  accepted_value?: string | null;
  rejection_reason?: string | null;
  source_order_id?: number | null;
  source_bom_id?: number | null;
  source_bom_line_id?: number | null;
}

export interface GoodsReceivingCreate {
  grn_code?: string;
  purchase_order_id?: number | null;
  vendor_id?: number | null;
  default_warehouse_id?: number | null;
  source_type?: string | null;
  non_po_reason?: string | null;
  supplier_delivery_challan_no?: string | null;
  supplier_invoice_no?: string | null;
  vehicle_info?: string | null;
  received_date?: string | null;
  notes?: string;
  status?: string;
  items: GoodsReceivingItemCreate[];
}

export interface GoodsReceivingResponse {
  id: number;
  tenant_id: number;
  grn_code: string;
  purchase_order_id: number | null;
  received_date: string | null;
  status: string;
  notes: string | null;
  created_by_user_id?: number | null;
  vendor_id?: number | null;
  default_warehouse_id?: number | null;
  source_type?: string | null;
  approval_status?: string | null;
  supplier_delivery_challan_no?: string | null;
  supplier_invoice_no?: string | null;
  vehicle_info?: string | null;
  non_po_reason?: string | null;
  acknowledgement_issued?: boolean;
  source_order_id?: number | null;
  source_bom_id?: number | null;
  btb_lc_id?: number | null;
  master_contract_id?: number | null;
  export_case_id?: number | null;
  items: GoodsReceivingItemResponse[];
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface StockSummaryRow {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  in_qty: number;
  out_qty: number;
  on_hand_qty: number;
}

export interface StockValuationRow {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  on_hand_qty: number;
  unit_cost: number;
  line_value: number;
}

export interface VendorAiExtractWrapResponse {
  extraction: VendorExtractionResponse;
  model_hint: string;
  request_id?: string | null;
  suggestion_batch_id?: number | null;
}

export interface VendorAiFieldSuggestion {
  value: string | null;
  confidence: number;
  source: string;
  rationale?: string | null;
}

export interface VendorAiEnrichResponse {
  suggestions: Record<string, VendorAiFieldSuggestion>;
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface VendorAiValidateIssue {
  field: string;
  severity: string;
  message: string;
  suggestion?: string | null;
}

export interface VendorAiValidateResponse {
  issues: VendorAiValidateIssue[];
  completeness_score: number;
  banking_score: number;
  compliance_score: number;
  normalized_fields: Record<string, string | null>;
  suggestion_batch_id?: number | null;
}

export interface VendorAiDedupeMatch {
  vendor_id: number;
  vendor_code: string;
  name: string;
  score: number;
  matched_on: string[];
}

export interface VendorAiDedupeResponse {
  matches: VendorAiDedupeMatch[];
  warnings: string[];
  suggestion_batch_id?: number | null;
}

export interface VendorAiSummaryResponse {
  summary_text: string;
  key_facts: string[];
  risk_indicators: string[];
  profile_grade: string;
  suggestion_batch_id?: number | null;
}

export interface VendorAiNextActionsResponse {
  actions: CustomerAiNextActionItem[];
  suggestion_batch_id?: number | null;
}

export interface VendorAiAuditEntry {
  id: number;
  action: string;
  created_at: string;
  model_used?: string | null;
  latency_ms?: number | null;
  result?: string | null;
  error_category?: string | null;
  vendor_id?: number | null;
  summary?: string | null;
  suggestion_batch_id?: number | null;
  actor_username?: string | null;
  event_label?: string | null;
  issue_count?: number | null;
  match_count?: number | null;
  key_facts_count?: number | null;
  action_count?: number | null;
  applied_field_count?: number | null;
}

export interface VendorAiAuditListResponse {
  items: VendorAiAuditEntry[];
}

export type VendorAiSuggestionDecision = "apply" | "reject" | "skip";

export interface VendorAiMarkDecisionsRequest {
  batch_id: number;
  decisions: Array<{ field_key: string; decision: VendorAiSuggestionDecision }>;
}

export interface VendorAiApplySuggestionsRequest {
  batch_id: number;
  vendor_id: number;
  items: Array<{ field_key: string; decision: VendorAiSuggestionDecision }>;
  conflict_mode?: "overwrite" | "skip_if_different";
}

export interface VendorAiApplySuggestionsResponse {
  vendor: VendorResponse;
  applied_fields: string[];
  skipped_fields: string[];
  rejected_fields: string[];
  conflicts: CustomerAiApplyConflict[];
}

export interface VendorAiFinalizeAfterCreateRequest {
  batch_id: number;
  vendor_id: number;
}

export interface VendorAiFinalizeAfterCreateResponse {
  applied_fields: string[];
  diff_summary: Array<Record<string, string>>;
}

export interface StockValuationResponse {
  method: string;
  total_value: number;
  rows: StockValuationRow[];
}

export interface LotTraceGrnLine {
  grn_id: number;
  grn_code: string;
  received_date: string | null;
  item_id: number;
  quantity: string;
  warehouse_id: number;
  lot_number: string | null;
}

export interface LotTraceMovement {
  id: number;
  movement_type: string;
  quantity: string;
  item_id: number;
  warehouse_id: number | null;
  reference_type: string | null;
  reference_id: number | null;
  movement_date: string | null;
  lot_number: string | null;
  created_at: string;
}

export interface LotTraceResponse {
  lot_number: string;
  grn_lines: LotTraceGrnLine[];
  movements: LotTraceMovement[];
}

export interface InventorySummaryLine {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  on_hand_qty: number;
  unit_cost: number;
  line_value: number;
}

export interface StockSummaryGroupBlock {
  stock_group_id: number | null;
  stock_group_code: string | null;
  stock_group_name: string | null;
  total_qty: number;
  total_value: number;
  lines: InventorySummaryLine[];
}

export interface StockSummaryByGroupResponse {
  as_of_date: string | null;
  groups: StockSummaryGroupBlock[];
}

export interface StockSummaryWarehouseBlock {
  warehouse_id: number | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  total_qty: number;
  total_value: number;
  lines: InventorySummaryLine[];
}

export interface StockSummaryByWarehouseResponse {
  as_of_date: string | null;
  warehouses: StockSummaryWarehouseBlock[];
}

export interface WipProcessLine {
  process_order_id: number;
  process_number: string;
  warehouse_id: number | null;
  input_item_id: number;
  input_item_code: string;
  output_item_id: number;
  output_item_code: string;
  input_quantity: string;
  wip_value: number;
}

export interface WipSummaryResponse {
  rows: WipProcessLine[];
  total_wip_value: number;
}

export interface StockOverviewResponse {
  as_of_date: string | null;
  stock_on_hand_value: number;
  wip_value: number;
  grand_total: number;
}

export interface StockVsGlResponse {
  fifo_stock_value: number;
  gl_inventory_balance: number;
  variance: number;
  inventory_account_ids: number[];
}

export interface WipVsGlResponse {
  process_wip_value: number;
  gl_wip_balance: number;
  variance: number;
  wip_account_ids: number[];
}

export interface StockLedgerRow {
  id: number;
  movement_date: string | null;
  movement_type: string;
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  quantity: string;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  /** Cumulative signed quantity (IN − OUT) for this item + warehouse after this movement. */
  running_balance: number;
}

export interface StockLedgerPageResponse {
  items: StockLedgerRow[];
  total: number;
}

export interface StockDashboardResponse {
  open_purchase_orders: number;
  grns_pending_receive: number;
  skus_with_positive_stock: number;
  low_stock_lines: number;
  low_stock_threshold: number;
  recent_movements: StockLedgerRow[];
}

export interface WarehouseTransferLineResponse {
  id: number;
  transfer_id: number;
  item_id: number;
  quantity: string;
}

export interface WarehouseTransferResponse {
  id: number;
  tenant_id: number;
  transfer_code: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  transfer_date: string | null;
  status: string;
  notes: string | null;
  items: WarehouseTransferLineResponse[];
  created_by_user_id?: number | null;
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface WarehouseTransferCreate {
  from_warehouse_id: number;
  to_warehouse_id: number;
  transfer_date?: string | null;
  notes?: string | null;
  items: { item_id: number; quantity: string }[];
}

export interface StockAdjustmentResponse {
  id: number;
  tenant_id: number;
  adjust_code: string;
  warehouse_id: number;
  item_id: number;
  quantity: string;
  reason_code: string;
  adjustment_date: string | null;
  status: string;
  notes: string | null;
}

export interface StockAdjustmentCreate {
  warehouse_id: number;
  item_id: number;
  quantity: string;
  reason_code?: string;
  adjustment_date?: string | null;
  notes?: string | null;
}

export interface DeliveryChallanItemCreate {
  item_id: number;
  warehouse_id: number;
  quantity: string;
}

export interface DeliveryChallanCreate {
  challan_code?: string;
  customer_name: string;
  delivery_date?: string | null;
  notes?: string;
  status?: string;
  items: DeliveryChallanItemCreate[];
  order_ids?: number[];
}

export interface DeliveryChallanItemResponse {
  id: number;
  challan_id: number;
  item_id: number;
  warehouse_id: number;
  quantity: string;
}

export interface DeliveryChallanResponse {
  id: number;
  tenant_id: number;
  challan_code: string;
  customer_name: string;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  items: DeliveryChallanItemResponse[];
  order_ids?: number[];
  created_by_user_id?: number | null;
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface EnhancedGatePassCreate {
  gate_pass_code?: string;
  challan_id?: number | null;
  purpose: string;
  destination?: string;
  vehicle_no?: string;
  notes?: string;
  status?: string;
}

export interface EnhancedGatePassResponse {
  id: number;
  tenant_id: number;
  gate_pass_code: string;
  challan_id: number | null;
  purpose: string;
  destination: string | null;
  vehicle_no: string | null;
  status: string;
  guard_acknowledged: boolean;
  notes: string | null;
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface ProcessOrderCreate {
  process_number?: string;
  process_type: string;
  process_method?: string;
  linked_order_id?: number | null;
  warehouse_id?: number | null;
  input_item_id: number;
  output_item_id: number;
  input_quantity: string;
  expected_output_qty: string;
  remarks?: string;
  process_stage?: string | null;
  prior_process_order_id?: number | null;
  vendor_id?: number | null;
  output_warehouse_id?: number | null;
  source_bom_id?: number | null;
  source_order_id?: number | null;
  btb_lc_id?: number | null;
  master_contract_id?: number | null;
  export_case_id?: number | null;
  planned_loss_pct?: string | null;
  output_same_as_input?: boolean | null;
  output_grade?: string | null;
  output_lot_number?: string | null;
}

export interface ProcessOrderReceive {
  actual_output_qty: string;
  processing_charges?: string;
}

export interface ProcessOrderResponse {
  id: number;
  tenant_id: number;
  process_number: string;
  process_type: string;
  process_method: string;
  linked_order_id: number | null;
  warehouse_id: number | null;
  input_item_id: number;
  output_item_id: number;
  input_quantity: string;
  expected_output_qty: string;
  actual_output_qty: string | null;
  processing_charges: string;
  status: string;
  remarks: string | null;
  process_stage?: string | null;
  prior_process_order_id?: number | null;
  vendor_id?: number | null;
  output_warehouse_id?: number | null;
  source_bom_id?: number | null;
  source_order_id?: number | null;
  btb_lc_id?: number | null;
  master_contract_id?: number | null;
  export_case_id?: number | null;
  planned_loss_pct?: string | null;
  actual_loss_qty?: string | null;
  output_grade?: string | null;
  output_lot_number?: string | null;
  output_same_as_input?: boolean | null;
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface ProductionMaterialIssueLineCreate {
  bom_line_id: number;
  actual_issue_qty: string;
}

export interface ProductionMaterialIssueCreate {
  order_id: number;
  bom_id: number;
  production_stage: string;
  covered_order_qty: number;
  warehouse_id: number;
  issue_date?: string | null;
  notes?: string | null;
  lines: ProductionMaterialIssueLineCreate[];
}

export interface ProductionMaterialIssueResponse {
  id: number;
  tenant_id: number;
  issue_code: string;
  order_id: number;
  bom_id: number;
  production_stage: string;
  covered_order_qty: number;
  warehouse_id: number;
  status: string;
  issue_date?: string | null;
  verification_id?: string | null;
  signature_hash?: string | null;
  signed_at?: string | null;
}

export interface ProductionMaterialIssueLineDetailResponse {
  id: number;
  issue_id: number;
  bom_line_id: number;
  item_id: number;
  standard_qty_for_covered?: string | null;
  actual_issue_qty: string;
  variance_qty?: string | null;
  variance_pct?: string | null;
  variance_type?: string | null;
  approval_required: boolean;
  stock_movement_id?: number | null;
}

export interface ProductionMaterialIssueDetailResponse extends ProductionMaterialIssueResponse {
  lines: ProductionMaterialIssueLineDetailResponse[];
}

export interface InventoryGlPostingDetail {
  posting_id: number;
  action: string;
  source_system: string;
  source_id: number;
  voucher_id: number;
  voucher_number: string;
  voucher_date: string | null;
  voucher_status: string;
  lines: Array<{
    line_id: number;
    account_id: number;
    entry_type: string;
    amount: string;
    notes: string | null;
  }>;
  created_at?: string | null;
}

export interface InventoryDocumentVerifyResponse {
  document_type: string;
  document_id: number;
  document_code: string | null;
  verification_id: string | null;
  is_valid: boolean;
  signature_hash: string | null;
  recalculated_hash: string;
  signed_at: string | null;
}

export interface InventoryDocumentPrintPayload {
  tenant: {
    name: string;
    company_code?: string | null;
    domain?: string | null;
    address?: string | null;
  };
  document_type: string;
  document: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  verification_path?: string | null;
  print_meta?: {
    generated_at?: string;
    title?: string;
    copy_labels?: string[];
    /** Optional; same pattern as vouchers — relative `/api/v1/...` path. */
    verification_url?: string | null;
  };
}

export interface PurchaseOrderReceiptProgressLine {
  purchase_order_line_id: number;
  item_id: number;
  ordered_qty: number;
  accepted_received_qty: number;
  pending_qty: number;
  unit_price: string;
}

export interface PurchaseOrderReceiptProgress {
  purchase_order_id: number;
  po_code: string;
  status: string;
  lines: PurchaseOrderReceiptProgressLine[];
}

export interface MaterialControlStockMovementRow {
  id: number;
  movement_type: string;
  movement_kind?: string | null;
  item_id: number;
  warehouse_id: number | null;
  quantity: string;
  reference_type: string | null;
  reference_id: number | null;
  order_id?: number | null;
  bom_id?: number | null;
  bom_line_id?: number | null;
  purchase_order_id?: number | null;
  goods_receiving_id?: number | null;
  process_order_id?: number | null;
  movement_value: string | null;
  movement_date: string | null;
}

export interface VendorBillSummary {
  id: number;
  bill_code: string;
  vendor_id: number;
  status: string;
  goods_receiving_id: number | null;
  purchase_order_id: number | null;
  total_amount: string | null;
  vendor_invoice_ref: string | null;
}

export interface VendorBillLineResponse {
  id: number;
  item_id: number;
  quantity: string;
  unit_price: string;
  line_total: string | null;
  goods_receiving_item_id: number | null;
  purchase_order_line_id: number | null;
}

export interface VendorBillDetailResponse {
  id: number;
  bill_code: string;
  vendor_id: number;
  status: string;
  vendor_invoice_ref?: string | null;
  goods_receiving_id: number | null;
  purchase_order_id: number | null;
  source_order_id: number | null;
  is_non_po_receipt: boolean;
  lines: VendorBillLineResponse[];
}

export interface ManufacturingOrderCreate {
  mo_number?: string;
  finished_item_id: number;
  planned_quantity: string;
  notes?: string;
}

export interface ManufacturingOrderResponse {
  id: number;
  tenant_id: number;
  mo_number: string;
  finished_item_id: number;
  planned_quantity: string;
  completed_quantity: string;
  current_stage: string | null;
  status: string;
  notes: string | null;
}

export interface ManufacturingStageUpdate {
  input_quantity?: string | null;
  output_quantity?: string | null;
  process_loss_percentage?: string | null;
  notes?: string | null;
}

export interface ManufacturingStageResponse {
  id: number;
  tenant_id: number;
  manufacturing_order_id: number;
  stage_name: string;
  stage_order: number;
  status: string;
  input_quantity: string | null;
  output_quantity: string | null;
  process_loss_percentage: string | null;
  notes: string | null;
}

export interface MfgProductionPlanLineCreate {
  item_id: number;
  order_id?: number | null;
  routing_id?: number | null;
  planned_qty: number;
  due_date?: string | null;
  priority?: number;
}

export interface MfgProductionPlanCreate {
  plan_code?: string;
  period_start: string;
  period_end: string;
  lines: MfgProductionPlanLineCreate[];
}

export interface MfgProductionPlanLineResponse {
  id: number;
  tenant_id: number;
  plan_id: number;
  item_id: number;
  order_id: number | null;
  routing_id: number | null;
  planned_qty: number;
  due_date: string | null;
  priority: number;
}

export interface MfgProductionPlanResponse {
  id: number;
  tenant_id: number;
  plan_code: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lines: MfgProductionPlanLineResponse[];
}

export interface MfgWorkOrderResponse {
  id: number;
  tenant_id: number;
  mo_number: string;
  item_id: number;
  plan_line_id: number | null;
  routing_id: number | null;
  qty_planned: number;
  qty_completed: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MfgMrpRunCreate {
  plan_id?: number | null;
  horizon_start: string;
  horizon_end: string;
}

export interface MfgMrpRunResponse {
  id: number;
  tenant_id: number;
  run_code: string;
  plan_id: number | null;
  horizon_start: string;
  horizon_end: string;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
}

export interface MfgMrpRecommendationResponse {
  id: number;
  tenant_id: number;
  run_id: number;
  item_id: number;
  recommendation_type: string;
  suggested_qty: number;
  due_date: string | null;
  reason: string | null;
  created_at: string;
}

export interface MfgCapacityLoadRow {
  work_center_id: number | null;
  work_center_name: string;
  total_orders: number;
  total_qty_planned: number;
  total_qty_completed: number;
  load_percent: number;
}

export interface MfgActualCostResponse {
  work_order_id: number;
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_cost: number;
}

export interface MfgFreezeSnapshotCreate {
  labor_cost?: number;
  overhead_cost?: number;
  standard_total_cost?: number | null;
  snapshot_note?: string;
}

export interface MfgCostSnapshotResponse {
  id: number;
  tenant_id: number;
  work_order_id: number;
  material_cost: number;
  labor_cost: number;
  overhead_cost: number;
  total_cost: number;
  variance_amount: number;
  snapshot_note: string | null;
  created_by_user_id: number | null;
  created_at: string;
}

export interface MfgVarianceResponse {
  work_order_id: number;
  variance_amount: number;
  has_snapshot: boolean;
}

export interface MfgOperationAssignCreate {
  work_order_operation_id: number;
  assigned_user_id: number;
  role_type?: string;
  notes?: string;
}

export interface MfgOperationAssignmentResponse {
  id: number;
  tenant_id: number;
  work_order_operation_id: number;
  assigned_user_id: number;
  role_type: string;
  assigned_at: string;
  notes: string | null;
}

export interface MfgDowntimeCreate {
  work_order_operation_id: number;
  reason_code: string;
  reason_note?: string;
  started_at?: string;
  ended_at?: string;
}

export interface MfgDowntimeResponse {
  id: number;
  tenant_id: number;
  work_order_operation_id: number;
  reason_code: string;
  reason_note: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  recorded_by_user_id: number | null;
  created_at: string;
}

export interface MfgExecutionDashboardResponse {
  total_work_orders: number;
  active_work_orders: number;
  completed_work_orders: number;
  total_operations: number;
  completed_operations: number;
  total_downtime_minutes: number;
  oee_like_percent: number;
}

export interface MfgDowntimeReasonRow {
  reason_code: string;
  total_events: number;
  open_events: number;
  total_minutes: number;
}

export interface MfgDowntimeTrendRow {
  trend_date: string;
  total_events: number;
  open_events: number;
  total_minutes: number;
}

export interface MfgMasterOperationCreate {
  code: string;
  name: string;
  default_work_center_id?: number | null;
  process_area?: "cutting" | "sewing" | "finishing" | "general";
  std_cycle_minutes?: number | null;
  std_setup_minutes?: number | null;
  is_active?: boolean;
}

export interface MfgMasterOperationUpdate {
  code?: string;
  name?: string;
  default_work_center_id?: number | null;
  process_area?: "cutting" | "sewing" | "finishing" | "general";
  std_cycle_minutes?: number | null;
  std_setup_minutes?: number | null;
  is_active?: boolean;
}

export interface MfgMasterOperationResponse {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  default_work_center_id: number | null;
  process_area: "cutting" | "sewing" | "finishing" | "general";
  std_cycle_minutes: number | null;
  std_setup_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MfgSampleRequestCreate {
  sample_no?: string;
  order_id?: number | null;
  item_id?: number | null;
  sample_type?: string;
  priority?: string;
  requested_date?: string | null;
  target_date?: string | null;
  assigned_user_id?: number | null;
  notes?: string;
}

export interface MfgSampleRequestUpdate {
  sample_type?: string;
  priority?: string;
  requested_date?: string | null;
  target_date?: string | null;
  assigned_user_id?: number | null;
  notes?: string;
}

export interface MfgSampleRequestResponse {
  id: number;
  tenant_id: number;
  sample_no: string;
  order_id: number | null;
  item_id: number | null;
  sample_type: string;
  priority: string;
  requested_date: string | null;
  target_date: string | null;
  status: string;
  assigned_user_id: number | null;
  notes: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MfgTnaTemplateCreate {
  template_code?: string;
  name: string;
  applies_to?: string;
  version_no?: number;
  is_active?: boolean;
  notes?: string;
}

export interface MfgTnaTemplateResponse {
  id: number;
  tenant_id: number;
  template_code: string;
  name: string;
  applies_to: string;
  version_no: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MfgTnaTemplateTaskCreate {
  seq_no: number;
  task_code?: string;
  task_name: string;
  department?: string;
  offset_days?: number;
  duration_days?: number;
  depends_on_seq?: number | null;
  owner_role?: string;
  is_milestone?: boolean;
}

export interface MfgTnaTemplateTaskResponse {
  id: number;
  tenant_id: number;
  template_id: number;
  seq_no: number;
  task_code: string | null;
  task_name: string;
  department: string | null;
  offset_days: number;
  duration_days: number;
  depends_on_seq: number | null;
  owner_role: string | null;
  is_milestone: boolean;
  created_at: string;
  updated_at: string;
}

export interface MfgTnaPlanCreate {
  plan_code?: string;
  template_id: number;
  order_id?: number | null;
  item_id?: number | null;
  start_date: string;
  status?: string;
}

export interface MfgTnaPlanResponse {
  id: number;
  tenant_id: number;
  plan_code: string;
  template_id: number;
  order_id: number | null;
  item_id: number | null;
  start_date: string;
  target_end_date: string | null;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MfgTnaPlanTaskUpdate {
  actual_date?: string | null;
  status?: string;
  owner_user_id?: number | null;
  remarks?: string;
}

export interface MfgTnaPlanTaskResponse {
  id: number;
  tenant_id: number;
  plan_id: number;
  template_task_id: number | null;
  seq_no: number;
  depends_on_seq: number | null;
  dependency_status: string | null;
  dependency_ready: boolean;
  task_name: string;
  department: string | null;
  planned_date: string;
  actual_date: string | null;
  status: string;
  owner_user_id: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface MfgTnaDashboardSummary {
  total_plans: number;
  active_plans: number;
  done_tasks: number;
  delayed_tasks: number;
  upcoming_tasks_7d: number;
  overdue_tasks: number;
}

export interface MfgOperationQueueRow {
  work_order_operation_id: number;
  work_order_id: number;
  mo_number: string;
  step_no: number;
  operation_id: number;
  operation_name: string;
  work_center_id: number | null;
  work_center_name: string;
  status: string;
  assigned_user_id: number | null;
  open_downtime: boolean;
  qty_in: number | null;
  qty_out: number | null;
  scrap_qty: number | null;
}

export interface WorkOrderOperationResponseApi {
  id: number;
  tenant_id: number;
  work_order_id: number;
  step_no: number;
  operation_id: number;
  work_center_id: number | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  qty_in: number | null;
  qty_out: number | null;
  scrap_qty: number | null;
  created_at: string;
  updated_at: string;
}

export interface MfgQualityCheckCreate {
  work_order_id: number;
  work_order_operation_id?: number | null;
  check_type?: string;
  result?: string;
  defect_code?: string;
  remarks?: string;
}

export interface MfgQualityCheckResponse {
  id: number;
  tenant_id: number;
  work_order_id: number;
  work_order_operation_id: number | null;
  check_type: string;
  result: string;
  defect_code: string | null;
  remarks: string | null;
  checked_by_user_id: number | null;
  created_at: string;
}

export interface MfgMaterialReturnResponse {
  id: number;
  tenant_id: number;
  issue_id: number;
  qty_returned: number;
  warehouse_id: number | null;
  stock_movement_id: number | null;
  returned_at: string;
}

export interface MfgNcrCreate {
  ncr_code?: string;
  work_order_id: number;
  work_order_operation_id?: number | null;
  defect_code: string;
  severity?: string;
  description?: string;
}

export interface MfgNcrResponse {
  id: number;
  tenant_id: number;
  ncr_code: string;
  work_order_id: number;
  work_order_operation_id: number | null;
  defect_code: string;
  severity: string;
  status: string;
  description: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface MfgCapaCreate {
  ncr_id: number;
  owner_user_id?: number | null;
  corrective_action: string;
  preventive_action?: string;
  due_date?: string | null;
}

export interface MfgCapaStatusUpdate {
  status: string;
  closure_note?: string;
  note?: string;
}

export interface MfgCapaResponse {
  id: number;
  tenant_id: number;
  ncr_id: number;
  owner_user_id: number | null;
  corrective_action: string;
  preventive_action: string | null;
  due_date: string | null;
  status: string;
  closure_note: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QualityDashboardResponse {
  inspections: { total: number; passed: number; failed: number; pass_rate: number };
  by_check_type: Array<{ check_type: string; total: number; passed: number; failed: number; pass_rate: number }>;
  defect_distribution: Array<{ defect_code: string; count: number }>;
  recent_checks: Array<{
    id: number;
    work_order_id: number;
    check_type: string;
    result: string;
    defect_code: string | null;
    created_at: string | null;
  }>;
  capa: { total: number; open: number; in_progress: number; closed: number };
  ncr: { total: number; open: number; closed: number };
}

export interface ConsumptionSnapshotResponse {
  order_id: number;
  snapshot_locked: boolean;
  items: Array<Record<string, unknown>>;
}

export interface ConsumptionReservationRow {
  item_id: number;
  item_name: string;
  reserved_qty: number;
  issued_qty: number;
  remaining_qty: number;
}

export interface ConsumptionIssueCreate {
  order_id: number;
  item_id: number;
  issue_qty: number;
  warehouse_id?: number | null;
  remarks?: string;
  bom_line_id?: number | null;
}

export interface InventoryReconciliationOverview {
  purchase_orders_total: number;
  purchase_orders_open: number;
  goods_receiving_total: number;
  goods_receiving_open: number;
  delivery_challans_total: number;
  delivery_challans_posted: number;
  gate_pass_total: number;
  gate_pass_released: number;
  stock_items_on_hand: number;
  production_material_issues_total?: number;
  vendor_bills_draft?: number;
  vendor_bills_posted?: number;
  stock_movements_total?: number;
}

export interface ConsumptionChangeRequestItem {
  plan_item_id: number;
  new_qty: string;
  reason?: string;
}

export interface ConsumptionChangeRequestCreate {
  order_id: number;
  change_type: string;
  reason: string;
  items: ConsumptionChangeRequestItem[];
}

export interface ConsumptionChangeRequestResponse {
  id: number;
  order_id: number;
  change_type: string;
  reason: string;
  items: Array<Record<string, unknown>>;
  status: string;
  requested_by: number | null;
  reviewed_by: number | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface CurrencyMasterResponse {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
}

// Currency module – exchange rates (PrimeX parity)
export interface CurrencyExchangeRateResponse {
  id: number;
  tenant_id: number;
  from_currency: string;
  to_currency: string;
  exchange_rate: string;
  effective_date: string;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrencyExchangeRateCreate {
  from_currency: string;
  to_currency: string;
  exchange_rate: string;
  effective_date: string;
  source?: string;
}

export interface CurrencyExchangeRateUpdate {
  exchange_rate?: string;
  effective_date?: string;
  source?: string;
  is_active?: boolean;
}

export interface LiveRatesResponse {
  rates: Record<string, number>;
  base: string;
  source: string;
  fetched_at: string;
  live: boolean;
  error?: string;
}

// Costing line items (match backend field names)
export interface QuotationMaterialLine {
  id?: number | null;
  serial_no: number;
  category_id: number | null;
  item_id: number | null;
  description: string | null;
  unit: string | null;
  consumption_per_dozen: string;
  unit_price: string;
  amount_per_dozen: string;
  total_amount: string;
  currency: string;
  exchange_rate: string;
  base_amount: string;
  local_amount: string;
}

export interface QuotationManufacturingLine {
  id?: number | null;
  serial_no: number;
  style_part: string;
  machines_required: number;
  production_per_hour: string;
  production_per_day: string;
  cost_per_machine: string;
  total_line_cost: string;
  cost_per_dozen: string;
  cm_per_piece: string;
  total_order_cost: string;
  currency: string;
  exchange_rate: string;
  base_amount: string;
  local_amount: string;
}

export interface QuotationOtherCostLine {
  id?: number | null;
  serial_no: number;
  cost_head: string;
  percentage: string;
  total_amount: string;
  cost_type: string;
  value: string;
  based_on: string;
  calculated_amount: string;
  notes: string | null;
  currency: string;
  exchange_rate: string;
  base_amount: string;
  local_amount: string;
}

export interface QuotationSizeRatioLine {
  id?: number | null;
  serial_no: number;
  size: string;
  ratio_percentage: string;
  fabric_factor: string;
  quantity: number;
}

// Full quotation detail (header + costing breakdown)
export interface QuotationDetailResponse {
  id: number;
  tenant_id: number;
  customer_id: number;
  inquiry_id: number | null;
  quotation_code: string;
  style_ref: string | null;
  style_id: number | null;
  style_name?: string | null;
  style_image_url?: string | null;
  customer_intermediary_id?: number | null;
  intermediary_name?: string | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  department: string | null;
  projected_quantity: number | null;
  projected_delivery_date: string | null;
  quotation_date: string | null;
  target_price: string | null;
  target_price_currency: string | null;
  exchange_rate: string | null;
  material_cost: string | null;
  manufacturing_cost: string | null;
  other_cost: string | null;
  total_cost: string | null;
  cost_per_piece: string | null;
  profit_percentage: string | null;
  quoted_price: string | null;
  currency: string | null;
  total_amount: string | null;
  status: string;
  is_converted_to_order?: boolean;
  converted_order_id?: number | null;
  version_no: number;
  valid_until: string | null;
  size_ratio_enabled: boolean;
  pack_ratio: string | null;
  pcs_per_carton: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  materials: QuotationMaterialLine[];
  manufacturing: QuotationManufacturingLine[];
  other_costs: QuotationOtherCostLine[];
  size_ratios: QuotationSizeRatioLine[];
  commercial_book_currency?: string | null;
  ai_indicators?: QuotationAiIndicatorsOut | null;
}

// Body for full quotation update (PUT)
export interface QuotationFullUpdate {
  style_ref?: string | null;
  style_id?: number | null;
  customer_intermediary_id?: number | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  department?: string | null;
  projected_quantity?: number | null;
  projected_delivery_date?: string | null;
  quotation_date?: string | null;
  target_price?: string | null;
  target_price_currency?: string | null;
  exchange_rate?: string | null;
  material_cost?: string | null;
  manufacturing_cost?: string | null;
  other_cost?: string | null;
  total_cost?: string | null;
  cost_per_piece?: string | null;
  profit_percentage?: string | null;
  quoted_price?: string | null;
  currency?: string | null;
  total_amount?: string | null;
  status?: string | null;
  valid_until?: string | null;
  size_ratio_enabled?: boolean | null;
  pack_ratio?: string | null;
  pcs_per_carton?: number | null;
  notes?: string | null;
  materials?: QuotationMaterialLine[] | null;
  manufacturing?: QuotationManufacturingLine[] | null;
  other_costs?: QuotationOtherCostLine[] | null;
  size_ratios?: QuotationSizeRatioLine[] | null;
}

export interface QuotationCreate {
  customer_id: number;
  inquiry_id?: number;
  style_id?: number;
  style_ref?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  currency?: string;
  total_amount?: string;
  valid_until?: string;
  notes?: string;
}

export interface QuotationUpdate {
  style_id?: number;
  style_ref?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  currency?: string;
  total_amount?: string;
  valid_until?: string;
  status?: string;
  notes?: string;
}

export interface OrderFinancialStatusOut {
  pi_issued?: boolean;
  buyer_document_received?: boolean;
  master_contract_type?: string | null;
  bank_facility_linked?: boolean;
  btb_utilization_pct?: number | null;
  btb_lc_count?: number;
  btb_lc_opened_count?: number;
  in_production?: boolean;
  shipped?: boolean;
}

export interface OrderSewingLineAllocationOut {
  line_id: number;
  line_code: string;
  reservation_status: string;
  start_date?: string | null;
  planned_end_date?: string | null;
  actual_end_date?: string | null;
  booked_at?: string | null;
}

export interface OrderSewingLineSummaryOut {
  allocations?: OrderSewingLineAllocationOut[];
  primary_line_code?: string | null;
  primary_planned_end_date?: string | null;
  primary_booked_at?: string | null;
  delivery_on_track?: "yes" | "no" | "unknown";
  extra_allocation_count?: number;
}

export interface OrderResponse {
  id: number;
  tenant_id: number;
  customer_id: number;
  quotation_id: number | null;
  order_code: string;
  style_id?: number | null;
  style_name?: string | null;
  style_image_url?: string | null;
  style_ref: string | null;
  customer_intermediary_id?: number | null;
  intermediary_name?: string | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  order_date: string | null;
  delivery_date: string | null;
  quantity: number | null;
  status: string;
  /** Auto-advanced lifecycle stage (source of truth for fulfillment). */
  pipeline_status?: string | null;
  pipeline_na_steps?: string[] | null;
  order_type?: string | null;
  master_contract_id?: number | null;
  rm_inhouse_pct?: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  ai_indicators?: OrderAiIndicatorsOut | null;
  commercial_snapshot?: Record<string, unknown> | null;
  commercial_book_currency?: string | null;
  customer_name?: string | null;
  quotation_code?: string | null;
  financial_status?: OrderFinancialStatusOut | null;
  sewing_line_summary?: OrderSewingLineSummaryOut | null;
}

/** GET /api/v1/control-tower/summary */
export interface ControlTowerOrderRow {
  order_id: number;
  order_code: string;
  customer_name?: string | null;
  delivery_date?: string | null;
  pipeline_status?: string | null;
  style_id?: number | null;
  master_contract_id?: number | null;
  lc_status?: string | null;
  material_readiness_pct?: number | null;
  line_code?: string | null;
  reservation_status?: string | null;
  planned_end_date?: string | null;
}

export interface ControlTowerSummaryResponse {
  delivery_from: string;
  delivery_to: string;
  limit: number;
  offset: number;
  total: number;
  orders: ControlTowerOrderRow[];
}

export interface ControlTowerTimelineResponse {
  order_id: number;
  milestones: Record<string, unknown>;
  readiness: Record<string, unknown>;
}

export interface ControlTowerLcSnapshotResponse {
  master_contract_id: number;
  reference: string;
  status: string;
  amount: number | null;
  currency: string | null;
  linked_order_ids: number[];
  btb_lc_count: number;
}

export interface ControlTowerCapacityHeatmapCell {
  line_id: number;
  line_code: string;
  bucket_date: string;
  firm_minutes: number;
  soft_minutes: number;
  draft_minutes: number;
}

export interface ControlTowerCapacityHeatmapResponse {
  date_from: string;
  date_to: string;
  cells: ControlTowerCapacityHeatmapCell[];
}

export interface FinanceMasterLcExposureResponse {
  master_contract_id: number;
  reference: string;
  total_btb_amount: number;
  funded_portion: number;
  non_funded_portion: number;
  btb_count: number;
}

export interface FinanceMaturityTrancheRow {
  id: number;
  btb_lc_id: number;
  btb_reference: string | null;
  tranche_no: number;
  maturity_date: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
}

export type OrderPipelineStepStatus = "done" | "current" | "pending" | "na";

export interface OrderMilestoneStep {
  name: string;
  status: OrderPipelineStepStatus;
  timestamp: string | null;
  linked_ids: number[];
  rm_pct?: number | null;
}

export interface OrderMilestonesResponse {
  pipeline_status: string;
  rm_inhouse_pct: number;
  steps: OrderMilestoneStep[];
  tna_warnings: string[];
  pipeline_na_steps: string[];
  order_type: string | null;
}

export interface OrderListPageResponse {
  items: OrderResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OrderCommercialAlignmentResponse {
  commercial_book_currency: string | null;
  costing_numeraire_description: string;
  frozen_at_conversion: Record<string, unknown> | null;
  live_quotation: Record<string, unknown> | null;
  order_execution: Record<string, unknown>;
  discrepancies: Array<{ code: string; message: string }>;
  quotation_commercially_locked: boolean;
  quotation_status: string | null;
}

export interface OrderCreate {
  customer_id: number;
  quotation_id?: number;
  style_id?: number;
  style_ref?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  order_date?: string;
  delivery_date?: string;
  quantity?: number;
  status?: string;
  remarks?: string;
}

export interface OrderUpdate {
  style_id?: number;
  style_ref?: string;
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  order_date?: string;
  delivery_date?: string;
  quantity?: number;
  status?: string;
  remarks?: string;
}

export interface OrderPromiseCheckLine {
  item_id: number;
  item_code: string;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
}

export interface OrderPromiseCheckOut {
  order_id: number;
  atp_ok: boolean;
  ctp_ok: boolean;
  reasons: string[];
  lines: OrderPromiseCheckLine[];
}

export type OrderPromiseCheckResponse = OrderPromiseCheckOut;

export interface OrderPromiseSummaryItem {
  order_id: number;
  order_code: string;
  status: string;
  atp_ok: boolean;
  ctp_ok: boolean;
  reasons: string[];
}

export interface OrderPromiseSummaryOut {
  scanned_count: number;
  blocked_count: number;
  atp_fail_count: number;
  ctp_fail_count: number;
  items: OrderPromiseSummaryItem[];
}

export type OrderPromiseSummaryResponse = OrderPromiseSummaryOut;

export interface PlanningGroundingSignal {
  code: string;
  status: string;
  confidence: string;
  value: unknown;
  explanation: string;
  source: string;
}

export interface PlanningGroundingSnapshot {
  order_id: number;
  computed_at: string;
  overall_readiness: string;
  signals: PlanningGroundingSignal[];
  dependency_completeness: Record<string, boolean>;
  assumptions: string[];
  limitations: string[];
}

export interface PlanningGroundingSummaryRow {
  order_id: number;
  overall_readiness: string;
  pending_change_requests: number;
}

export interface CommercialChangeRequestOut {
  id: number;
  tenant_id: number;
  entity_type: string;
  entity_id: number;
  field_key: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  source: string;
  source_ref: string | null;
  status: string;
  proposed_by: number | null;
  proposed_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_note: string | null;
  applied_by: number | null;
  applied_at: string | null;
  request_id: string | null;
}

export interface CommercialChangeRequestCreate {
  entity_type: "order" | "quotation";
  entity_id: number;
  field_key: string;
  new_value: unknown;
  reason: string;
  source?: "manual" | "ai_suggestion" | "system";
  source_ref?: string | null;
}

export interface CommercialChangePendingSummary {
  pending_approval_count: number;
}

export interface CommercialTimelineEventOut {
  id: number;
  at: string;
  action: string;
  severity: string;
  user_id: number | null;
  username: string | null;
  details: Record<string, unknown>;
}

export interface CommercialTimelineOut {
  entity_type: string;
  entity_id: number;
  events: CommercialTimelineEventOut[];
}

export interface OrderAmendmentResponse {
  id: number;
  tenant_id: number;
  order_id: number;
  amendment_no: number;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface OrderAmendmentCreate {
  field_changed: string;
  old_value?: string;
  new_value?: string;
  reason?: string;
  status?: string;
}

export interface StyleResponse {
  id: number;
  tenant_id: number;
  style_code: string;
  name: string;
  buyer_customer_id: number | null;
  season: string | null;
  department: string | null;
  product_type: string | null;
  fabric_type: string | null;
  gsm: string | null;
  fit_type: string | null;
  wash_type: string | null;
  brand: string | null;
  buyer_style_ref: string | null;
  hs_code: string | null;
  uom: string | null;
  target_fob: string | null;
  currency: string | null;
  sample_lead_days: number | null;
  production_lead_days: number | null;
  is_active_for_new_orders: boolean;
  lifecycle_stage: string;
  priority: string | null;
  risk_level: string | null;
  style_image_url?: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleCreate {
  style_code?: string;
  name: string;
  buyer_customer_id?: number | null;
  season?: string | null;
  department?: string | null;
  product_type?: string | null;
  fabric_type?: string | null;
  gsm?: string | null;
  fit_type?: string | null;
  wash_type?: string | null;
  brand?: string | null;
  buyer_style_ref?: string | null;
  hs_code?: string | null;
  uom?: string | null;
  target_fob?: string | null;
  currency?: string | null;
  sample_lead_days?: number | null;
  production_lead_days?: number | null;
  is_active_for_new_orders?: boolean;
  lifecycle_stage?: string;
  priority?: string | null;
  risk_level?: string | null;
  style_image_url?: string | null;
  status?: string;
  notes?: string | null;
}

export interface StyleUpdate {
  style_code?: string;
  name?: string;
  buyer_customer_id?: number | null;
  season?: string | null;
  department?: string | null;
  product_type?: string | null;
  fabric_type?: string | null;
  gsm?: string | null;
  fit_type?: string | null;
  wash_type?: string | null;
  brand?: string | null;
  buyer_style_ref?: string | null;
  hs_code?: string | null;
  uom?: string | null;
  target_fob?: string | null;
  currency?: string | null;
  sample_lead_days?: number | null;
  production_lead_days?: number | null;
  is_active_for_new_orders?: boolean;
  lifecycle_stage?: string;
  priority?: string | null;
  risk_level?: string | null;
  style_image_url?: string | null;
  status?: string;
  notes?: string | null;
}

export interface StyleSummaryResponse {
  style_id: number;
  inquiry_count: number;
  quotation_count: number;
  order_count: number;
  open_followup_actions: number;
  overdue_followup_actions: number;
  shipment_count: number;
  shipped_order_qty: number;
  pending_order_qty: number;
  invoice_amount: string;
  received_amount: string;
  due_amount: string;
  last_event_at: string | null;
  next_due_at: string | null;
}

export interface StyleTimelineEvent {
  event_type: string;
  reference: string;
  status: string | null;
  event_at: string;
  notes: string | null;
}

export interface StyleReportRow {
  style_id: number;
  style_code: string;
  style_name: string;
  lifecycle_stage: string;
  priority: string | null;
  risk_level: string | null;
  open_followup_actions: number;
  overdue_followup_actions: number;
  invoice_amount: string;
  received_amount: string;
  due_amount: string;
  last_event_at: string | null;
  next_due_at: string | null;
}

export interface StyleComponentResponse {
  id: number;
  tenant_id: number;
  style_id: number;
  component_name: string;
  sequence_no: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleComponentCreate {
  component_name: string;
  sequence_no?: number;
  notes?: string | null;
}

export interface StyleColorwayResponse {
  id: number;
  tenant_id: number;
  style_id: number;
  color_name: string;
  color_code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleColorwayCreate {
  color_name: string;
  color_code?: string | null;
  notes?: string | null;
}

export interface StyleSizeScaleResponse {
  id: number;
  tenant_id: number;
  style_id: number;
  scale_name: string;
  sizes_csv: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleSizeScaleCreate {
  scale_name: string;
  sizes_csv?: string | null;
  notes?: string | null;
}

export interface BomResponse {
  id: number;
  tenant_id: number;
  style_id: number;
  version_no: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BomCreate {
  style_id: number;
  version_no?: number;
  status?: string;
  notes?: string | null;
}

export interface BomUpdate {
  version_no?: number;
  status?: string;
  notes?: string | null;
}

export interface BomItemResponse {
  id: number;
  tenant_id: number;
  bom_id: number;
  item_id: number | null;
  category: string;
  item_code: string | null;
  description: string | null;
  uom: string | null;
  base_consumption: string;
  wastage_pct: string | null;
  created_at?: string;
}

export interface BomItemCreate {
  item_id?: number | null;
  category: string;
  item_code?: string | null;
  description?: string | null;
  uom?: string | null;
  base_consumption: string;
  wastage_pct?: string | null;
}

export interface BomDetailResponse {
  bom: BomResponse;
  items: BomItemResponse[];
}

export interface GeneratePOFromBOMResponse {
  id: number;
  po_code: string;
  warnings?: string[];
}

/** Order-driven BOM (API under /merch/order-boms/*) */
export interface EligibleOrderForBom {
  order_id: number;
  order_code: string;
  customer_name: string;
  style_id: number;
  style_code: string | null;
  style_name: string | null;
  quotation_id: number;
  quotation_code: string;
  order_qty: number | null;
  delivery_date: string | null;
  status: string;
}

export type BomLineProcurementStatus =
  | "NOT_PROCURED"
  | "PO_DRAFT"
  | "PO_APPROVED"
  | "PARTIALLY_RECEIVED"
  | "FULLY_RECEIVED";

export interface OrderDrivenBomHeader {
  id: number;
  tenant_id: number;
  style_id: number;
  order_id: number | null;
  quotation_id: number | null;
  is_active: boolean;
  is_legacy: boolean;
  revision_of_bom_id: number | null;
  order_code_snapshot: string | null;
  quotation_code_snapshot: string | null;
  order_qty_snapshot: number | null;
  order_qty_at_approval: number | null;
  currency_snapshot: string | null;
  version_no: number;
  status: string;
  notes: string | null;
  submitted_at: string | null;
  submitted_by: number | null;
  approved_at: string | null;
  approved_by: number | null;
  rejected_at: string | null;
  rejected_by: number | null;
  rejection_comment: string | null;
  frozen_at: string | null;
  frozen_by: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderDrivenBomLine {
  id: number;
  bom_id: number;
  item_id: number | null;
  quotation_line_id: number | null;
  category: string;
  item_code: string | null;
  description: string | null;
  item_code_snapshot: string | null;
  description_snapshot: string | null;
  material_type: string | null;
  uom: string | null;
  base_consumption: string;
  wastage_pct: string | null;
  process_loss_pct: number | null;
  quoted_consumption_per_unit: number | null;
  quoted_unit_price: number | null;
  quoted_currency: string | null;
  quoted_total_cost: number | null;
  bom_net_consumption_per_unit: number | null;
  bom_gross_consumption_per_unit: number | null;
  order_qty_snapshot: number | null;
  required_net_qty: number | null;
  wastage_qty: number | null;
  process_loss_qty: number | null;
  required_gross_qty: number | null;
  vendor_suggested_price: number | null;
  bom_expected_unit_price: number | null;
  bom_expected_total_cost: number | null;
  consumption_variance_pct: number | null;
  price_variance_pct: number | null;
  total_cost_variance: number | null;
  preferred_vendor_id: number | null;
  remarks: string | null;
  sort_order: number;
  procurement_status: BomLineProcurementStatus;
}

export interface OrderDrivenBomSummary {
  total_quoted_material_cost: number;
  total_bom_material_cost: number;
  variance_amount: number;
  planned_wastage_cost: number;
  planned_process_loss_cost: number;
  lines_pending_vendor: number;
  lines_ready_for_po: number;
  lines_procurement_started: number;
}

export interface OrderDrivenBomDetailResponse {
  bom: OrderDrivenBomHeader;
  items: OrderDrivenBomLine[];
  summary: OrderDrivenBomSummary;
}

export interface OrderDrivenBomLinePatch {
  bom_net_consumption_per_unit?: number | null;
  wastage_pct?: number | null;
  process_loss_pct?: number | null;
  bom_expected_unit_price?: number | null;
  preferred_vendor_id?: number | null;
  remarks?: string | null;
  item_id?: number | null;
}

export interface OrderDrivenBomLineCreate {
  item_id?: number | null;
  description?: string | null;
  uom?: string | null;
  bom_net_consumption_per_unit?: number;
  wastage_pct?: number;
  process_loss_pct?: number;
  bom_expected_unit_price?: number;
  category?: string;
}

export interface CreatePoFromOrderBomLinePayload {
  vendor_id?: number | null;
  quantity: number;
  unit_price?: string;
  currency?: string | null;
  warehouse_id?: number | null;
}

export interface MaterialRequirementLineResponse {
  item_id: number;
  item_code: string;
  item_name: string;
  uom: string | null;
  required_qty: number;
  available_qty: number;
  shortage_qty: number;
}

export interface MaterialRequirementResponse {
  order_id: number;
  order_code: string;
  style_id: number;
  bom_id: number;
  quantity_used: number;
  lines: MaterialRequirementLineResponse[];
}

export interface ConsumptionPlanResponse {
  id: number;
  tenant_id: number;
  order_id: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ConsumptionPlanCreate {
  order_id: number;
  status?: string;
}

export interface ConsumptionPlanUpdate {
  status?: string;
}

export interface ConsumptionPlanItemResponse {
  id: number;
  tenant_id: number;
  plan_id: number;
  item_code: string | null;
  required_qty: string;
  uom: string | null;
}

export interface ConsumptionPlanItemCreate {
  item_code?: string | null;
  required_qty: string;
  uom?: string | null;
}

export interface ConsumptionPlanDetailResponse {
  plan: ConsumptionPlanResponse;
  items: ConsumptionPlanItemResponse[];
}

export interface FollowupResponse {
  id: number;
  tenant_id: number;
  order_id: number;
  title: string;
  due_date: string | null;
  status: string;
  severity: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupCreate {
  order_id: number;
  title: string;
  due_date?: string | null;
  status?: string;
  severity?: string | null;
  notes?: string | null;
}

export interface FollowupUpdate {
  title?: string;
  due_date?: string | null;
  status?: string;
  severity?: string | null;
  notes?: string | null;
}

// ----- TNA / Advanced Order Follow-up -----
export interface FollowupActionTemplateOut {
  id: number;
  code: string;
  name: string;
  phase: string;
  action_group: string | null;
  sequence_no: number;
  default_days_before_delivery: number | null;
  is_mandatory: boolean;
  is_active: boolean;
  buyer_id: number | null;
}

export type FollowupActionTemplateResponse = FollowupActionTemplateOut;

export interface FollowupActionTemplateCreate {
  code: string;
  name: string;
  phase: string;
  action_group?: string | null;
  sequence_no?: number;
  default_days_before_delivery?: number | null;
  is_mandatory?: boolean;
  is_active?: boolean;
  buyer_id?: number | null;
}

export interface FollowupActionTemplateUpdate {
  name?: string | null;
  phase?: string | null;
  action_group?: string | null;
  sequence_no?: number | null;
  default_days_before_delivery?: number | null;
  is_mandatory?: boolean | null;
  is_active?: boolean | null;
  buyer_id?: number | null;
}

export interface OrderFollowupActionOut {
  id: number;
  order_id: number;
  order_code: string | null;
  delivery_date: string | null;
  style_code: string | null;
  merch_sample_request_id?: number | null;
  template_id: number | null;
  sequence_no: number;
  phase: string;
  action_group: string | null;
  action_type: string | null;
  title: string;
  description: string | null;
  is_template_generated: boolean;
  is_mandatory: boolean;
  is_active: boolean;
  assigned_to_id: number | null;
  planned_date: string | null;
  actual_submission_date: string | null;
  approval_received_date: string | null;
  actual_completion_date: string | null;
  resubmission_date: string | null;
  status: string;
  approval_status: string | null;
  is_rejected: boolean;
  rejection_reason: string | null;
  delay_reason: string | null;
  severity: string | null;
  remarks: string | null;
  completed_at: string | null;
  milestone_type: string | null;
  external_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface FollowupActionCommentOut {
  id: number;
  user_id: number;
  username: string | null;
  comment_text: string;
  created_at: string;
}

export interface FollowupActionCommentCreate {
  comment_text: string;
}

/** Alias for API responses */
export type OrderFollowupActionResponse = OrderFollowupActionOut;

export interface FollowupActionRejectionLogEntry {
  id: number;
  rejected_at: string;
  rejection_reason: string | null;
  resubmission_date: string | null;
  created_at: string;
}

export interface FollowupActionRejectionLogCreate {
  rejection_reason?: string | null;
  resubmission_date?: string | null;
}

export interface OrderFollowupActionCreate {
  order_id: number;
  merch_sample_request_id?: number | null;
  template_id?: number | null;
  sequence_no?: number;
  phase: string;
  action_group?: string | null;
  action_type?: string | null;
  title: string;
  description?: string | null;
  is_mandatory?: boolean;
  planned_date?: string | null;
  actual_submission_date?: string | null;
  approval_received_date?: string | null;
  resubmission_date?: string | null;
  status?: string;
  approval_status?: string | null;
  is_rejected?: boolean;
  rejection_reason?: string | null;
  delay_reason?: string | null;
  severity?: string | null;
  remarks?: string | null;
  assigned_to_id?: number | null;
}

export interface OrderFollowupActionUpdate {
  merch_sample_request_id?: number | null;
  sequence_no?: number | null;
  phase?: string | null;
  action_group?: string | null;
  action_type?: string | null;
  title?: string | null;
  description?: string | null;
  planned_date?: string | null;
  actual_submission_date?: string | null;
  approval_received_date?: string | null;
  actual_completion_date?: string | null;
  resubmission_date?: string | null;
  status?: string | null;
  approval_status?: string | null;
  is_rejected?: boolean | null;
  rejection_reason?: string | null;
  delay_reason?: string | null;
  severity?: string | null;
  remarks?: string | null;
  assigned_to_id?: number | null;
  milestone_type?: string | null;
  external_id?: number | null;
}

export interface FollowupSummaryOut {
  open_count: number;
  overdue_count: number;
  due_this_week_count: number;
  rejected_count: number;
  completed_count: number;
}

/** Alias for API responses */
export type FollowupSummaryResponse = FollowupSummaryOut;

export interface TnaGenerateRequest {
  order_id: number;
  template_ids?: number[] | null;
}

export interface UnifiedTnaActionOut {
  source_system: "merch" | "manufacturing";
  source_action_id: number;
  source_plan_id?: number | null;
  order_id?: number | null;
  order_code?: string | null;
  title: string;
  phase?: string | null;
  department?: string | null;
  planned_date?: string | null;
  actual_date?: string | null;
  status: string;
  assigned_to_id?: number | null;
  dependency_seq_no?: number | null;
  dependency_status?: string | null;
  dependency_ready: boolean;
  severity?: string | null;
  created_at: string;
  updated_at: string;
}

export type UnifiedTnaActionResponse = UnifiedTnaActionOut;

export interface UnifiedTnaSummaryOut {
  total_count: number;
  open_count: number;
  overdue_count: number;
  completed_count: number;
  merch_count: number;
  manufacturing_count: number;
}

export type UnifiedTnaSummaryResponse = UnifiedTnaSummaryOut;

export interface MerchCriticalAlert {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  order_id?: number;
  style_id?: number;
  item_id?: number;
}

export interface WastageReportRowResponse {
  order_id: number;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  buyer_id: number;
  buyer_name: string;
  style_id: number;
  style_code: string;
  item_id: number;
  item_code: string;
  item_name: string;
  category: string;
  expected_qty: number;
  actual_qty: number;
  wastage_pct_vs_bom: number;
  wastage_value: number;
  allowed_threshold_pct: number;
  threshold_breach: boolean;
}

export interface WastageSummaryByStyle {
  style_id: number;
  order_item_count: number;
  avg_wastage_pct: number;
  max_wastage_pct: number;
}

export interface WastageSummaryResponse {
  total_wastage_value: number;
  fabric_wastage_pct_avg: number;
  trim_wastage_pct_avg: number;
  above_threshold_orders_count: number;
  by_style: WastageSummaryByStyle[];
  total_rows: number;
}

export interface WastageReasonResponse {
  id: number;
  code: string;
  name: string;
  category: string;
  recoverable: boolean;
}

export interface WastageTrendSeriesItem {
  label: string;
  value: number;
}

export interface WastageTrendsResponse {
  series?: WastageTrendSeriesItem[] | null;
  by_buyer?: Array<{ buyer_id: number; buyer_name: string; value: number }> | null;
  by_material_group?: Array<{ category: string; value: number }> | null;
}

export interface WastageOrderDetailBomLine {
  item_id: number;
  item_code: string;
  item_name: string;
  category: string;
  base_consumption: number;
  wastage_pct: number;
  expected_qty: number;
  actual_qty: number;
  variance_qty: number;
  wastage_pct_vs_bom: number;
  wastage_value: number;
  threshold_breach: boolean;
}

export interface WastageReasonBreakdownItem {
  reason_id: number | null;
  reason_code: string;
  reason_name: string;
  value: number;
  quantity: number;
}

export interface WastageProcessStageBreakdownItem {
  process_stage: string;
  value: number;
  quantity: number;
}

export interface WastageOrderDetailResponse {
  order_id: number;
  order_code: string;
  order_date: string | null;
  delivery_date: string | null;
  buyer_id: number;
  buyer_name: string;
  style_id: number;
  style_code: string;
  quantity: number | null;
  bom_lines: WastageOrderDetailBomLine[];
  total_expected_value: number;
  total_actual_value: number;
  total_wastage_value: number;
  linked_alert_ids: number[];
  reason_breakdown: WastageReasonBreakdownItem[];
  process_stage_breakdown: WastageProcessStageBreakdownItem[];
}

export interface WastageThresholdRuleResponse {
  id: number;
  scope_type: string;
  scope_id: number | null;
  allowed_pct: number;
  critical_pct: number;
}

export interface WastageSavedViewResponse {
  id: number;
  name: string;
  description: string | null;
  filter_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string | null;
}

export interface WastageManagementSummaryResponse {
  top_orders: Array<{
    order_id: number;
    order_code: string;
    buyer_name: string;
    total_wastage_value: number;
  }>;
  top_materials: Array<{
    item_id: number;
    item_code: string;
    item_name: string;
    total_wastage_value: number;
  }>;
  top_reasons: Array<{
    reason_code: string;
    reason_name: string;
    value: number;
    count: number;
  }>;
  mom_change: {
    current_total: number;
    previous_total: number;
    current_above_threshold: number;
    previous_above_threshold: number;
  };
  suggested_actions: string[];
}

export interface MerchCriticalAlertsResponse {
  summary: {
    critical: number;
    warning: number;
    total: number;
  };
  alerts: MerchCriticalAlert[];
}

/** Advanced Critical Alerts (Phase 1 persisted engine) */
export interface MerchAlertItem {
  id: number;
  natural_key: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  alert_type: string;
  assigned_to_id: number | null;
  entity_type?: string | null;
  entity_id?: number | null;
  order_id: number | null;
  order_code: string | null;
  reason_text: string | null;
  recommended_action: string | null;
  /** Structured rule output: schema_version, rule_key, evaluated_at, thresholds, facts */
  evidence_json?: Record<string, unknown> | null;
  priority_score?: number;
  sla_bucket?: "at_risk" | "breach" | "met";
  snoozed_until: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MerchAlertsListResponse {
  items: MerchAlertItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface MerchAlertsSummaryResponse {
  by_severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
  total: number;
  /** ISO timestamp of last completed alert scan for this tenant (optional). */
  last_completed_scan_at?: string | null;
}

export interface MerchAlertDetailResponse extends MerchAlertItem {
  resolved_at: string | null;
  escalated_at?: string | null;
  escalation_level?: number | null;
}

export interface MerchAlertCommentItem {
  id: number;
  user_id: number;
  body: string;
  is_internal: boolean;
  created_at: string | null;
}

export interface MerchAlertHistoryItem {
  id: number;
  user_id: number | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string | null;
}

export interface MerchAlertSavedView {
  id: number;
  name: string;
  description: string | null;
  filter_json: Record<string, unknown>;
  is_default: boolean;
  created_at: string | null;
}

/** Advanced order pipeline: stage config with win probability */
export interface PipelineStageOut {
  stage_key: string;
  label: string;
  document_type: string;
  status_value: string;
  win_probability: number;
  sort_order: number;
}

/** Single card in pipeline (inquiry, quotation, or order) */
export interface PipelineItemOut {
  document_type: "inquiry" | "quotation" | "order";
  id: number;
  code: string;
  stage_key: string;
  customer_id: number;
  customer_name: string;
  style_ref: string | null;
  style_name: string | null;
  quantity: number | null;
  total_amount: string | null;
  created_at: string;
  detail_path: string;
  next_status_options: string[];
}

export interface MerchControlTowerCountAndDate {
  count: number;
  oldest_date: string | null;
}

export interface MerchControlTowerQuotationsAtRisk {
  incomplete_count: number;
  anomaly_count: number;
  expiring_soon_count: number;
}

export interface MerchControlTowerBomStatus {
  draft_count: number;
  submitted_count: number;
  approved_count: number;
  frozen_count: number;
}

export interface MerchControlTowerTnaOverdue {
  count: number;
  critical_count: number;
}

export interface MerchSampleOut {
  id: number;
  tenant_id: number;
  style_id: number;
  inquiry_id: number | null;
  order_id: number | null;
  sample_code: string;
  sample_type: string;
  sample_subtype?: string | null;
  status: string;
  revision_no: number;
  target_date: string | null;
  actual_date: string | null;
  assigned_to_id: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  style_code?: string | null;
  style_name?: string | null;
  inquiry_code?: string | null;
  order_code?: string | null;
}

export interface MerchSampleCreate {
  style_id: number;
  inquiry_id?: number | null;
  order_id?: number | null;
  sample_type: string;
  sample_subtype?: string | null;
  target_date?: string | null;
  assigned_to_id?: number | null;
  remarks?: string | null;
}

export interface MerchSampleUpdate {
  status?: string | null;
  sample_type?: string | null;
  sample_subtype?: string | null;
  revision_no?: number | null;
  target_date?: string | null;
  actual_date?: string | null;
  assigned_to_id?: number | null;
  remarks?: string | null;
}

export interface MerchSampleMetricsOut {
  lead_time_days: number | null;
  planned_vs_actual_days: number | null;
  task_count: number;
  avg_task_pct_complete: number | null;
  planned_span_days_sum: number;
  bottleneck_step: string | null;
  total_cost_amount: string;
}

export interface MerchSampleTaskOut {
  id: number;
  sample_request_id: number;
  sort_order: number;
  step_name: string;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  assigned_to_id: number | null;
  pct_complete: string;
  notes: string | null;
}

export interface MerchSampleTaskCreate {
  step_name: string;
  sort_order?: number;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  assigned_to_id?: number | null;
  pct_complete?: string | null;
  notes?: string | null;
}

export interface MerchSampleTaskUpdate {
  sort_order?: number;
  step_name?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  assigned_to_id?: number | null;
  pct_complete?: string | null;
  notes?: string | null;
}

export interface MerchSampleCostLineOut {
  id: number;
  sample_request_id: number;
  line_type: string;
  label: string;
  qty: string | null;
  unit: string | null;
  rate: string | null;
  amount: string | null;
  currency_code: string | null;
}

export interface MerchSampleCostLineCreate {
  line_type: string;
  label: string;
  qty?: string | null;
  unit?: string | null;
  rate?: string | null;
  amount?: string | null;
  currency_code?: string | null;
}

export interface MerchSampleCostLineUpdate {
  line_type?: string | null;
  label?: string | null;
  qty?: string | null;
  unit?: string | null;
  rate?: string | null;
  amount?: string | null;
  currency_code?: string | null;
}

export interface MerchSampleMaterialLineOut {
  id: number;
  sample_request_id: number;
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  qty: string;
  uom: string | null;
  notes: string | null;
}

export interface MerchSampleMaterialLineCreate {
  item_id: number;
  qty: string;
  uom?: string | null;
  notes?: string | null;
}

export interface MerchSampleMaterialLineUpdate {
  qty?: string | null;
  uom?: string | null;
  notes?: string | null;
}

export interface MerchSampleAiProposalOut {
  id: number;
  sample_request_id: number;
  status: string;
  proposal_json: Record<string, unknown>;
  created_at: string;
  applied_at: string | null;
}

export interface MerchSampleAiPlanTaskItem {
  step_name: string;
  sort_order: number;
  days_from_start: number;
  duration_days: number;
}

export interface MerchSampleAiPlanPreview {
  tasks: MerchSampleAiPlanTaskItem[];
  risk_notes: string[];
}

export interface MerchSampleAiPlanProposalResponse {
  proposal: MerchSampleAiProposalOut;
  preview: MerchSampleAiPlanPreview;
}

export interface MerchSampleAiPlanApplyBody {
  proposal_id: number;
  schedule_start?: string | null;
}

export interface MerchSampleCommentOut {
  id: number;
  sample_request_id: number;
  comment: string;
  attachment_url: string | null;
  created_by_id: number | null;
  created_at: string;
}

export interface MerchSampleCommentCreate {
  comment: string;
  attachment_url?: string | null;
}

export interface MerchControlTowerSummaryResponse {
  generated_at: string;
  inquiries_needing_action: MerchControlTowerCountAndDate;
  quotations_at_risk: MerchControlTowerQuotationsAtRisk;
  orders_with_drift: number;
  pending_change_requests: number;
  bom_status: MerchControlTowerBomStatus;
  tna_overdue: MerchControlTowerTnaOverdue;
  planning_risk: number;
  sample_pending: number;
  sample_overdue_target: number;
}

/** Stable index of merchandising KPI/report surfaces (GET /merch/reports/catalog). */
export interface MerchReportCatalogEntry {
  key: string;
  title: string;
  api_path: string;
  ui_path: string;
}

export interface MerchReportsCatalogResponse {
  tenant_id: number;
  reports: MerchReportCatalogEntry[];
}

export interface MerchPipelineFullResponse {
  stages: PipelineStageOut[];
  items: PipelineItemOut[];
  summary: { inquiries: number; quotations: number; orders: number };
}

/** One period (month or quarter) for pipeline analytics */
export interface PipelineAnalyticsBucket {
  period_key: string;
  period_label: string;
  year: number;
  month: number | null;
  quarter: number | null;
  inquiries_received: number;
  confirmed_orders_count: number;
  confirmed_orders_quantity: number;
  inquiry_under_processing: number;
  potential_orders_count: number;
}

export interface PipelineAnalyticsResponse {
  by_month: PipelineAnalyticsBucket[];
  by_quarter: PipelineAnalyticsBucket[];
  summary: {
    inquiries_received_total: number;
    confirmed_orders_total: number;
    confirmed_orders_quantity_total: number;
    inquiry_under_processing_total: number;
    potential_orders_total: number;
  };
}

export interface InquiryEventResponse {
  id: number;
  tenant_id: number;
  inquiry_id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  notes: string | null;
  created_at: string;
}

export interface ConsumptionReconciliationRow {
  item_id: number;
  item_code: string;
  item_name: string;
  material_type: string;
  uom: string | null;
  planned_qty: number;
  actual_qty: number;
  variance: number;
  variance_pct: number;
  unit_cost?: number | null;
  planned_cost?: number | null;
  actual_cost?: number | null;
  cost_variance?: number | null;
  last_issued_at?: string | null;
  movement_count?: number;
  quoted_consumption_per_unit?: number | null;
  bom_net_consumption_per_unit?: number | null;
  bom_gross_consumption_per_unit?: number | null;
  wastage_pct?: number | null;
  process_loss_pct?: number | null;
  quoted_planned_qty?: number | null;
  quoted_planned_cost?: number | null;
  bom_planned_cost?: number | null;
  quoted_vs_bom_variance_pct?: number | null;
  bom_vs_actual_variance_pct?: number | null;
  quoted_vs_actual_variance_pct?: number | null;
  planned_wastage_qty?: number | null;
  planned_process_loss_qty?: number | null;
  planned_loss_vs_actual_loss?: number | null;
  cost_impact_quoted_vs_bom?: number | null;
  cost_impact_bom_vs_actual?: number | null;
  cost_impact_quoted_vs_actual?: number | null;
}

export interface ConsumptionReconciliationResponse {
  order: {
    id: number;
    order_code: string;
    style_code: string;
    quantity: number | null;
  };
  items: ConsumptionReconciliationRow[];
  summary: {
    total_planned: number;
    total_actual: number;
    variance: number;
    overall_variance_pct: number;
    items_exceeding_tolerance: number;
    total_planned_cost?: number;
    total_actual_cost?: number;
    cost_variance?: number;
    cost_variance_pct?: number;
    total_quoted_planned_qty?: number;
    total_quoted_planned_cost?: number;
    total_bom_planned_cost?: number;
    quoted_vs_bom_cost_variance?: number;
    quoted_vs_actual_cost_variance?: number;
  };
  bom_version?: string | null;
  bom_status?: string | null;
  order_status?: string | null;
  consumption_plan_status?: string | null;
}

export interface ConsumptionReconciliationDashboardParams {
  buyer_id?: number;
  style_id?: number;
  date_from?: string;
  date_to?: string;
  status?: string;
  material_type?: string;
  tolerance_pct?: number;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_dir?: string;
}

export interface ConsumptionReconciliationDashboardOrderRow {
  order_id: number;
  order_code: string;
  style_code: string;
  style_id?: number | null;
  buyer_name: string | null;
  order_qty: number | null;
  total_planned: number;
  total_actual: number;
  variance: number;
  overall_variance_pct: number;
  items_exceeding_tolerance: number;
  total_items: number;
  worst_item_name: string | null;
  worst_item_variance_pct: number;
  status: string;
}

export interface ConsumptionReconciliationCategoryBreakdown {
  material_type: string;
  total_planned: number;
  total_actual: number;
  variance_pct: number;
}

export interface ConsumptionReconciliationDashboardSummary {
  total_orders: number;
  orders_on_target: number;
  orders_minor: number;
  orders_exceeding: number;
  avg_variance_pct: number;
  total_planned_qty: number;
  total_actual_qty: number;
}

export interface ConsumptionReconciliationDashboardResponse {
  orders: ConsumptionReconciliationDashboardOrderRow[];
  summary: ConsumptionReconciliationDashboardSummary;
  category_breakdown: ConsumptionReconciliationCategoryBreakdown[];
  total_count: number;
}

export interface ConsumptionReconciliationTrendPoint {
  period: string;
  orders_count: number;
  avg_variance_pct: number;
  total_planned: number;
  total_actual: number;
  exceeding_count: number;
}

export interface ConsumptionReconciliationTrendsResponse {
  points: ConsumptionReconciliationTrendPoint[];
  tolerance_pct: number;
}

export interface ConsumptionReconciliationMovementRow {
  movement_id: number;
  movement_date: string | null;
  quantity: number;
  warehouse_name: string | null;
  issued_by: string | null;
  reference_code?: string | null;
  notes: string | null;
}

export interface ConsumptionReconciliationMovementsResponse {
  item_id: number;
  item_code: string;
  item_name: string;
  planned_qty: number;
  total_issued: number;
  movements: ConsumptionReconciliationMovementRow[];
}

export interface AccountGroupCreate {
  name: string;
  code?: string | null;
  parent_group_id?: number | null;
  nature: string;
  affects_gross_profit?: boolean;
  is_bank_group?: boolean;
  sort_order?: number;
  is_active?: boolean;
  description?: string | null;
  reporting_code?: string | null;
  default_normal_balance?: "debit" | "credit";
  allow_posting?: boolean;
  is_summary_group?: boolean;
  last_reviewed_at?: string | null;
}

export interface AccountGroupResponse extends AccountGroupCreate {
  id: number;
  tenant_id: number;
  code: string;
}

export interface AccountGroupHierarchyNode {
  id: number;
  code: string;
  name: string;
  nature: string;
  parent_group_id: number | null;
  sort_order: number;
  is_active: boolean;
  children: AccountGroupHierarchyNode[];
  account_count: number;
  description?: string | null;
  reporting_code?: string | null;
  default_normal_balance?: string;
  allow_posting?: boolean;
  is_summary_group?: boolean;
  last_reviewed_at?: string | null;
  depth?: number;
}

/** Financier / contract rollup bucket for GL accounts and optional per-voucher-line override. */
export const FINANCE_COST_NATURE_CODES = ["MATERIAL", "CM", "OTHER", "NON_OPERATING"] as const;
export type FinanceCostNature = (typeof FINANCE_COST_NATURE_CODES)[number];

export interface ChartOfAccountCreate {
  account_number?: string;
  name: string;
  group_id: number;
  normal_balance?: "debit" | "credit";
  opening_balance?: string;
  account_currency?: string | null;
  maintain_fc_balance?: boolean;
  description?: string | null;
  is_active?: boolean;
  is_bank_account?: boolean;
  account_type?: "posting" | "statistical" | "header";
  reporting_code?: string | null;
  display_order?: number;
  statistical_unit?: string | null;
  statistical_formula?: string | null;
  parent_account_id?: number | null;
  last_reviewed_at?: string | null;
  enable_bill_wise?: boolean;
  /** Default cost bucket for reporting; null = inherit none / unknown. */
  cost_nature?: FinanceCostNature | null;
}

export interface ChartOfAccountResponse extends ChartOfAccountCreate {
  id: number;
  tenant_id: number;
  balance: string;
  enable_bill_wise: boolean;
  /** Row version for optimistic locking (GL balance updates increment this). */
  version: number;
}

export interface CoAConfigResponse {
  id: number;
  tenant_id: number;
  account_number_prefix: string;
  account_number_width: number;
  group_code_prefix: string;
  group_code_width: number;
  allow_manual_account_number: boolean;
  max_group_depth: number | null;
  max_account_depth: number | null;
  validate_normal_balance: boolean;
  inventory_stock_account_id?: number | null;
  inventory_clearing_account_id?: number | null;
}

export interface CoAConfigUpdate {
  account_number_prefix?: string;
  account_number_width?: number;
  group_code_prefix?: string;
  group_code_width?: number;
  allow_manual_account_number?: boolean;
  max_group_depth?: number | null;
  max_account_depth?: number | null;
  validate_normal_balance?: boolean;
  inventory_stock_account_id?: number | null;
  inventory_clearing_account_id?: number | null;
}

export interface ReportingImpactResponse {
  group_id: number;
  reports: { id: string; label: string }[];
}

export interface CoAImportResult {
  ok: boolean;
  groups_created: number;
  groups_updated: number;
  accounts_created: number;
  accounts_updated: number;
  errors: string[];
}

export interface VoucherLineCreate {
  account_id: number;
  cost_center_id?: number | null;
  currency?: string | null;
  exchange_rate?: string | null;
  base_amount?: string | null;
  is_rate_overridden?: boolean;
  rate_source?: string | null;
  entry_type: "DEBIT" | "CREDIT";
  amount: string;
  notes?: string;
  /** When set, overrides chart_of_accounts.cost_nature for this line. */
  cost_nature_override?: FinanceCostNature | null;
}

export interface VoucherCreate {
  voucher_number?: string;
  voucher_type: string;
  voucher_date: string;
  description?: string;
  reference?: string;
  branch_code?: string | null;
  instrument_reference?: string | null;
  bank_reconciliation_id?: number | null;
  currency?: string;
  base_currency?: string;
  exchange_rate?: string | null;
  exchange_rate_source?: string | null;
  trade_case_id?: number | null;
  btb_lc_id?: number | null;
  lines: VoucherLineCreate[];
}

export interface VoucherUpdate {
  voucher_type: string;
  voucher_date: string;
  description?: string;
  reference?: string;
  branch_code?: string | null;
  instrument_reference?: string | null;
  bank_reconciliation_id?: number | null;
  currency?: string;
  base_currency?: string;
  exchange_rate?: string | null;
  lines: VoucherLineCreate[];
}

export interface VoucherLineResponse extends VoucherLineCreate {
  id: number;
  voucher_id: number;
  tenant_id: number;
}

export interface VoucherResponse {
  id: number;
  tenant_id: number;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  status: string;
  description: string | null;
  reference: string | null;
  branch_code?: string | null;
  fiscal_year?: number | null;
  series_sequence?: number | null;
  number_series_key?: string | null;
  source_module?: string | null;
  source_module_ref?: string | null;
  allow_manual_edit?: boolean;
  reverses_voucher_id?: number | null;
  reversed_by_voucher_id?: number | null;
  reversal_reason?: string | null;
  reversal_recorded_at?: string | null;
  reversal_recorded_by_user_id?: number | null;
  posted_snapshot?: Record<string, unknown> | null;
  instrument_reference?: string | null;
  duplicate_risk_hash?: string | null;
  bank_reconciliation_id?: number | null;
  currency: string;
  base_currency: string;
  exchange_rate: string;
  exchange_rate_source: string;
  exchange_rate_fetched_at: string | null;
  verification_id: string | null;
  signature_hash: string | null;
  signed_at: string | null;
  signed_by_system: boolean;
  trade_case_id?: number | null;
  btb_lc_id?: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  lines: VoucherLineResponse[];
  control_warnings?: string[] | null;
}

export interface DayBookResponse {
  rows: Array<{
    id: number;
    voucher_number: string;
    voucher_type: string;
    voucher_date: string;
    status: string;
    description: string | null;
    amount: number;
  }>;
  total_amount: number;
}

export interface TrialBalanceResponse {
  as_of_date?: string;
  rows: Array<{
    account_id: number;
    account_number: string;
    account_name: string;
    group_name: string;
    nature: string;
    debit: number;
    credit: number;
  }>;
  total_debit: number;
  total_credit: number;
}

export interface FinancialStatementsResponse {
  as_of_date?: string;
  group_id?: number | null;
  profit_and_loss: {
    income: number;
    expense: number;
    net_profit: number;
  };
  balance_sheet: {
    assets: number;
    liabilities: number;
    equity: number;
  };
}

export interface LedgerActivityResponse {
  account_id: number;
  account_number: string;
  account_name: string;
  from_date: string;
  to_date: string;
  opening_balance: number;
  closing_balance: number;
  rows: Array<{
    voucher_id: number;
    voucher_number: string;
    voucher_date: string;
    entry_type: string;
    amount: number;
    reference: string | null;
    description: string | null;
    running_balance: number;
  }>;
}

export interface VoucherReportSummaryResponse {
  total_vouchers: number;
  status_counts: Record<string, number>;
}

export interface VoucherReportMonthlyResponse {
  months: Array<{
    month: string;
    count: number;
    posted_count: number;
  }>;
}

export interface VoucherReportTopPreparersResponse {
  rows: Array<{
    user_id: number;
    username: string;
    count: number;
  }>;
}

export interface CashForecastScenarioCreate {
  name: string;
  start_date: string;
  months?: number;
}

export interface CashForecastScenarioUpdate {
  name?: string;
  start_date?: string;
  months?: number;
  status?: string;
}

export interface CashForecastLineResponse {
  id: number;
  scenario_id: number;
  month_label: string;
  inflow: string;
  outflow: string;
  net: string;
  cumulative: string;
}

export interface CashForecastScenarioResponse {
  id: number;
  tenant_id: number;
  name: string;
  start_date: string;
  months: number;
  status: string;
  lines: CashForecastLineResponse[];
}

export interface CashForecastSummaryResponse {
  expected_inflows: number;
  expected_outflows: number;
  net_cash_flow: number;
  scenarios_count: number;
}

export interface CashFlowStatementRow {
  voucher_id: number;
  voucher_number: string;
  voucher_date: string;
  description: string | null;
  inflow: number;
  outflow: number;
  net: number;
}

export interface CashFlowStatementSection {
  inflow: number;
  outflow: number;
  net: number;
  rows: CashFlowStatementRow[];
}

export interface CashFlowStatementResponse {
  from_date: string;
  to_date: string;
  opening_cash_balance: number;
  closing_cash_balance: number;
  sections: {
    operating: CashFlowStatementSection;
    investing: CashFlowStatementSection;
    financing: CashFlowStatementSection;
  };
  totals: {
    inflow: number;
    outflow: number;
    net_cash_flow: number;
  };
}

export interface FxReceiptCreate {
  receipt_no?: string;
  receipt_date: string;
  source_ref?: string;
  currency?: string;
  fc_amount: string;
  rate_to_base?: string;
  notes?: string;
}

export interface FxReceiptResponse {
  id: number;
  tenant_id: number;
  receipt_no: string;
  receipt_date: string;
  source_ref: string | null;
  currency: string;
  fc_amount: string;
  rate_to_base: string;
  base_amount: string;
  settled_amount: string;
  status: string;
  notes: string | null;
}

export interface FxUnsettledSummaryResponse {
  total_base_amount: number;
  total_settled_amount: number;
  total_unsettled_amount: number;
}

export interface ProfitabilityResponse {
  [key: string]: string | number;
}

export interface MultiCurrencyRevaluationRow {
  receipt_id: number;
  receipt_no: string;
  currency: string;
  fc_amount: number;
  old_rate: number;
  latest_rate: number;
  old_base_amount: number;
  new_base_amount: number;
  gain_loss: number;
}

export interface MultiCurrencyRevaluationResponse {
  rows: MultiCurrencyRevaluationRow[];
  total_old_base_amount: number;
  total_new_base_amount: number;
  total_gain_loss: number;
}

export interface OutstandingBillCreate {
  bill_no?: string;
  party_name: string;
  bill_type: "PAYABLE" | "RECEIVABLE";
  bill_date: string;
  due_date: string;
  amount: string;
  paid_amount?: string;
  currency?: string;
  notes?: string;
}

export interface OutstandingBillResponse {
  id: number;
  tenant_id: number;
  bill_no: string;
  party_name: string;
  bill_type: "PAYABLE" | "RECEIVABLE";
  bill_date: string;
  due_date: string;
  amount: string;
  paid_amount: string;
  currency: string;
  status: string;
  notes: string | null;
}

export interface BillsAgingResponse {
  as_of_date: string;
  bill_type: "PAYABLE" | "RECEIVABLE";
  buckets: Record<string, number>;
  rows: Array<{
    bill_id: number;
    bill_no: string;
    party_name: string;
    due_date: string;
    outstanding_amount: number;
    overdue_days: number;
    bucket: string;
  }>;
}

export interface CostCenterCreate {
  center_code?: string;
  name: string;
  department?: string | null;
  is_active?: boolean;
}

export interface CostCenterResponse {
  id: number;
  tenant_id: number;
  center_code: string;
  name: string;
  department: string | null;
  is_active: boolean;
}

export interface CostCenterDashboardRow {
  cost_center_id: number;
  center_code: string;
  name: string;
  department: string | null;
  debit_total: number;
  credit_total: number;
  net: number;
}

export interface BudgetLineCreate {
  cost_center_id?: number | null;
  account_id?: number | null;
  period_month: string;
  amount: string;
  notes?: string | null;
}

export interface BudgetCreate {
  budget_name: string;
  fiscal_year: string;
  status?: "DRAFT" | "FINAL";
  lines: BudgetLineCreate[];
}

export interface BudgetLineResponse extends BudgetLineCreate {
  id: number;
  budget_id: number;
  tenant_id: number;
}

export interface BudgetResponse {
  id: number;
  tenant_id: number;
  budget_name: string;
  fiscal_year: string;
  status: string;
  created_by: number | null;
  lines: BudgetLineResponse[];
}

export interface BudgetVsActualResponse {
  budget_id: number;
  budget_name: string;
  fiscal_year: string;
  rows: Array<{
    line_id: number;
    period_month: string;
    account_id: number | null;
    cost_center_id: number | null;
    budget_amount: number;
    actual_amount: number;
    variance: number;
    variance_pct: number;
  }>;
  total_budget: number;
  total_actual: number;
  total_variance: number;
}

export interface BankAccountCreate {
  account_name: string;
  bank_name: string;
  account_number: string;
  branch_name?: string | null;
  swift_code?: string | null;
  routing_number?: string | null;
  currency?: string;
  gl_account_id?: number | null;
  opening_balance?: string;
  current_balance?: string;
  is_active?: boolean;
}

export interface BankAccountResponse {
  id: number;
  tenant_id: number;
  account_name: string;
  bank_name: string;
  account_number: string;
  branch_name: string | null;
  swift_code: string | null;
  routing_number: string | null;
  currency: string;
  gl_account_id: number | null;
  opening_balance: string;
  current_balance: string;
  is_active: boolean;
}

export interface BankReconciliationCreate {
  bank_account_id: number;
  statement_date: string;
  statement_balance: string;
  notes?: string | null;
}

export interface BankReconciliationResponse {
  id: number;
  tenant_id: number;
  bank_account_id: number;
  statement_date: string;
  statement_balance: string;
  book_balance: string;
  difference_amount: string;
  status: string;
  notes: string | null;
  is_finalized: boolean;
  finalized_at: string | null;
  finalized_by: number | null;
  finalize_reason: string | null;
  created_by: number | null;
}

export interface BankStatementLineCreate {
  transaction_date: string;
  description?: string | null;
  reference?: string | null;
  debit_amount?: string;
  credit_amount?: string;
  running_balance?: string | null;
}

export interface BankStatementLineResponse {
  id: number;
  tenant_id: number;
  reconciliation_id: number;
  transaction_date: string;
  description: string | null;
  reference: string | null;
  debit_amount: string;
  credit_amount: string;
  running_balance: string | null;
  matched_payment_run_id: number | null;
  matched_status: string;
}

export interface BankReconciliationSummaryResponse {
  reconciliation_id: number;
  line_count: number;
  matched_count: number;
  unmatched_count: number;
  matched_amount: number;
  unmatched_amount: number;
  statement_balance: number;
  book_balance: number;
  difference_amount: number;
}

export interface BankStatementMatchLogResponse {
  id: number;
  tenant_id: number;
  reconciliation_id: number;
  statement_line_id: number;
  action: string;
  payment_run_id: number | null;
  note: string | null;
  created_by: number | null;
  created_at: string;
}

export interface PaymentRunItemCreate {
  bill_id?: number | null;
  party_name: string;
  amount: string;
  source_currency?: string | null;
  fx_rate_to_base?: string | null;
  base_amount?: string | null;
  reference?: string | null;
}

export interface PaymentRunCreate {
  run_code?: string;
  run_date: string;
  bank_account_id?: number | null;
  base_currency?: string | null;
  remarks?: string | null;
  items: PaymentRunItemCreate[];
}

export interface PaymentRunItemResponse {
  id: number;
  tenant_id: number;
  payment_run_id: number;
  bill_id: number | null;
  party_name: string;
  amount: string;
  source_currency: string;
  fx_rate_to_base: string;
  base_amount: string;
  status: string;
  reference: string | null;
}

export interface PaymentRunResponse {
  id: number;
  tenant_id: number;
  run_code: string;
  run_date: string;
  bank_account_id: number | null;
  base_currency: string;
  status: string;
  total_amount: string;
  executed_voucher_id: number | null;
  remarks: string | null;
  created_by: number | null;
  items: PaymentRunItemResponse[];
}

export interface PaymentRunAdviceResponse {
  header: {
    run_id: number;
    run_code: string;
    run_date: string;
    status: string;
    bank_name: string | null;
    bank_account_name: string | null;
    base_currency: string;
    executed_voucher_id: number | null;
  };
  items: Array<{
    item_id: number;
    party_name: string;
    reference: string | null;
    amount: number;
    source_currency: string;
    fx_rate_to_base: number;
    base_amount: number;
    status: string;
  }>;
  totals: {
    item_count: number;
    total_amount: number;
    base_currency: string;
  };
}

export interface SettlementAuditRow {
  item_id: number;
  run_id: number;
  run_code: string;
  run_date: string;
  run_status: string;
  party_name: string;
  bill_no: string | null;
  source_currency: string;
  source_amount: number;
  fx_rate_to_base: number;
  base_amount: number;
  base_currency: string;
}

export interface SettlementAuditResponse {
  rows: SettlementAuditRow[];
  totals: {
    row_count: number;
    source_total: number;
    base_total: number;
  };
}

export interface SettlementAuditPresetCreate {
  name: string;
  from_date?: string | null;
  to_date?: string | null;
  status_filter?: string | null;
  source_currency?: string | null;
  party_query?: string | null;
}

export interface SettlementAuditPresetResponse {
  id: number;
  tenant_id: number;
  name: string;
  from_date: string | null;
  to_date: string | null;
  status_filter: string | null;
  source_currency: string | null;
  party_query: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseApOverviewResponse {
  payable_bills_count: number;
  open_payable_count: number;
  open_payable_amount: number;
  due_next_7_days_amount: number;
}

export interface VoucherPrintResponse {
  voucher: {
    id: number;
    voucher_number: string;
    voucher_type: string;
    voucher_date: string;
    status: string;
    description: string | null;
    reference: string | null;
    currency: string;
    base_currency: string;
    exchange_rate: string;
    verification_id: string | null;
    signature_hash: string | null;
    signed_at: string | null;
    created_by: number | null;
    created_by_name: string;
    created_at: string | null;
  };
  tenant: {
    name: string;
    company_code: string | null;
    domain: string | null;
  };
  lines: Array<{
    line_id: number;
    account_id: number;
    account_code: string;
    account_name: string;
    cost_center_id: number | null;
    cost_center_name: string;
    /** Override, or account default with "(acct)" suffix, or "—". */
    cost_nature: string;
    entry_type: string;
    currency: string;
    exchange_rate: string;
    amount: number;
    base_amount: number;
    notes: string | null;
  }>;
  totals: {
    debit_total: number;
    credit_total: number;
    is_balanced: boolean;
  };
  print_meta?: {
    copy_labels: string[];
    verification_url: string | null;
    generated_at: string;
  };
}

export interface VoucherVerificationResponse {
  voucher_id: number;
  voucher_number: string;
  verification_id: string | null;
  status: string;
  signed_at: string | null;
  is_valid: boolean;
  signature_hash: string | null;
  recalculated_hash: string;
}

export interface AccountingPeriodCreate {
  period_name: string;
  start_date: string;
  end_date: string;
}

export interface AccountingPeriodResponse {
  id: number;
  tenant_id: number;
  period_name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: number | null;
}

// Commercial module (export cases, proforma invoices, BTB LCs)
export interface ExportCaseRow {
  id: number;
  reference?: string;
  case_code?: string;
  status?: string;
  case_date?: string | null;
  amount?: number | null;
  order_id?: number | null;
  trade_case_id?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface ProformaInvoiceRow {
  id: number;
  reference?: string;
  invoice_number?: string;
  status?: string;
  direction?: "EXPORT" | "IMPORT" | string;
  vendor_id?: number | null;
  master_contract_id?: number | null;
  purchase_order_id?: number | null;
  invoice_date?: string | null;
  amount?: number | null;
  order_id?: number | null;
  order_ids?: number[];
  currency?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
  buyer_bank_details?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  notify_party_name?: string | null;
  notify_party_address?: string | null;
  beneficiary_name?: string | null;
  beneficiary_address?: string | null;
  terms_of_shipping?: string | null;
  terms_of_payment?: string | null;
  shipping_country?: string | null;
  destination_port_or_airport?: string | null;
  shipment_port?: string | null;
  documents_to_provide?: string[] | null;
  terms_and_conditions?: string[] | null;
  shipper_bank_account_id?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface ProformaInvoiceCreate {
  order_ids: number[];
  direction?: "EXPORT" | "IMPORT" | string;
  vendor_id?: number | null;
  master_contract_id?: number | null;
  purchase_order_id?: number | null;
  reference?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  amount?: number | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
  buyer_bank_details?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  notify_party_name?: string | null;
  notify_party_address?: string | null;
  beneficiary_name?: string | null;
  beneficiary_address?: string | null;
  terms_of_shipping?: string | null;
  terms_of_payment?: string | null;
  shipping_country?: string | null;
  destination_port_or_airport?: string | null;
  shipment_port?: string | null;
  documents_to_provide?: string[] | null;
  terms_and_conditions?: string[] | null;
  currency?: string | null;
  shipper_bank_account_id?: number | null;
  shipper_bank_account_number?: string | null;
  shipper_bank_branch?: string | null;
  shipper_bank_name?: string | null;
  shipper_bank_account_name?: string | null;
  shipper_bank_address?: string | null;
  shipper_bank_swift?: string | null;
}

export type ProformaInvoiceUpdate = Partial<ProformaInvoiceCreate>;

export interface ProformaInvoiceForPrintOrder {
  id: number;
  order_code: string;
  style_ref?: string | null;
  quantity?: number | null;
  amount?: number | string | null;
  [key: string]: unknown;
}

export interface ProformaInvoiceForPrintCustomer {
  id: number;
  name: string;
  [key: string]: unknown;
}

export interface ProformaInvoiceShipperBank {
  account_number?: string | null;
  branch?: string | null;
  bank_name?: string | null;
  account_name?: string | null;
  bank_address?: string | null;
  swift_code?: string | null;
  [key: string]: unknown;
}

export interface ProformaInvoiceForPrint {
  id: number;
  reference?: string | null;
  invoice_number?: string | null;
  status?: string | null;
  invoice_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  buyer_name?: string | null;
  buyer_address?: string | null;
  buyer_bank_details?: string | null;
  consignee_name?: string | null;
  consignee_address?: string | null;
  notify_party_name?: string | null;
  notify_party_address?: string | null;
  beneficiary_name?: string | null;
  beneficiary_address?: string | null;
  terms_of_shipping?: string | null;
  terms_of_payment?: string | null;
  shipping_country?: string | null;
  destination_port_or_airport?: string | null;
  shipment_port?: string | null;
  documents_to_provide?: string[] | null;
  terms_and_conditions?: string[] | null;
  verification_token?: string | null;
  orders: ProformaInvoiceForPrintOrder[];
  customers: ProformaInvoiceForPrintCustomer[];
  company_name?: string | null;
  logo?: string | null;
  shipper_bank?: ProformaInvoiceShipperBank | null;
}

export interface ProformaVerifyResponse {
  valid: boolean;
  company_name?: string | null;
  reference?: string | null;
  invoice_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  message?: string | null;
}

export interface BtbLcRow {
  id: number;
  reference?: string;
  lc_number?: string;
  status?: string;
  lc_date?: string | null;
  bank?: string | null;
  amount?: number | null;
  master_contract_id?: number | null;
  proforma_invoice_id?: number | null;
  vendor_proforma_invoice_id?: number | null;
  purchase_order_id?: number | null;
  vendor_id?: number | null;
  bank_account_id?: number | null;
  currency?: string | null;
  exchange_rate_to_base?: number | null;
  base_currency_amount?: number | null;
  open_date?: string | null;
  expiry_date?: string | null;
  maturity_date?: string | null;
  maturity_amount?: number | null;
  master_cost_center_id?: number | null;
  accounting_status?: "OPEN" | "DOCUMENTS_ACCEPTED" | "REALIZED" | string | null;
  lc_open_voucher_id?: number | null;
  import_bill_voucher_id?: number | null;
  realization_voucher_id?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface BtbLcCreate {
  reference: string;
  status?: string | null;
  lc_date?: string | null;
  amount?: number | null;
  master_contract_id?: number | null;
  proforma_invoice_id?: number | null;
  vendor_proforma_invoice_id?: number | null;
  purchase_order_id?: number | null;
  vendor_id?: number | null;
  bank_account_id?: number | null;
  currency?: string | null;
  exchange_rate_to_base?: number | null;
  base_currency_amount?: number | null;
  open_date?: string | null;
  expiry_date?: string | null;
  maturity_date?: string | null;
  maturity_amount?: number | null;
}

export type BtbLcUpdate = Partial<BtbLcCreate>;

export interface BtbLcAccountingRow {
  id: number;
  tenant_id: number;
  btb_lc_id: number;
  lc_open_voucher_id?: number | null;
  import_bill_voucher_id?: number | null;
  maturity_date?: string | null;
  realization_voucher_id?: number | null;
  status: "OPEN" | "DOCUMENTS_ACCEPTED" | "REALIZED" | string;
  created_at: string;
  updated_at: string;
}

export interface BtbLcRecordOpeningBody {
  /** Omit to use system ledger BTB_NON_ACCEPTED_LC_LIABILITY */
  upcoming_lc_liability_account_id?: number | null;
  /** Omit to use system ledger BTB_CREDIT_LINE_UTILIZATION_CONTROL */
  blocked_credit_facility_account_id?: number | null;
  voucher_date?: string | null;
  amount?: number | null;
  description?: string | null;
  reference?: string | null;
}

export interface BtbLcRecordDocumentsAcceptanceBody {
  /** Omit to use system ledger BTB_NON_ACCEPTED_LC_LIABILITY */
  lc_liability_account_id?: number | null;
  /** Omit to use system ledger BTB_ACCEPTED_LC_LIABILITY */
  import_bill_liability_account_id?: number | null;
  maturity_date?: string | null;
  voucher_date?: string | null;
  amount?: number | null;
  description?: string | null;
  reference?: string | null;
}

export interface BtbLcRecordRealizationBody {
  /** Omit to use system ledger BTB_ACCEPTED_LC_LIABILITY */
  import_bill_liability_account_id?: number | null;
  /** Omit if BTB LC bank account has gl_account_id configured */
  payment_account_id?: number | null;
  voucher_date?: string | null;
  amount?: number | null;
  description?: string | null;
  reference?: string | null;
}

export interface MasterContractRow {
  id: number;
  tenant_id?: number;
  contract_type?: "SALES_CONTRACT" | "EXPORT_LC" | string;
  reference?: string;
  status?: string;
  contract_date?: string | null;
  amount?: number | null;
  btb_utilized_amount?: number | null;
  currency?: string | null;
  buyer_name?: string | null;
  bank_name?: string | null;
  expiry_date?: string | null;
  /** Cost center for payments and COGS under this contract */
  cost_center_id?: number | null;
  btb_utilization_pct?: number | null;
  btb_warning_band?: "VERY_GOOD" | "GOOD" | "SATISFACTORY" | "NO_CREDIT" | "RED_FLAG" | string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MasterContractCreate {
  contract_type?: "SALES_CONTRACT" | "EXPORT_LC" | string;
  reference: string;
  status?: string | null;
  contract_date?: string | null;
  amount?: number | null;
  currency?: string | null;
  buyer_name?: string | null;
  bank_name?: string | null;
  expiry_date?: string | null;
  /** Cost center for payments and COGS; optional, can be auto-created when contract is opened */
  cost_center_id?: number | null;
}

export type MasterContractUpdate = Partial<MasterContractCreate>;

export interface TradeCaseRow {
  id: number;
  tenant_id: number;
  direction: "EXPORT" | "IMPORT" | string;
  reference: string;
  status: string;
  current_stage: string;
  order_id?: number | null;
  customer_id?: number | null;
  vendor_id?: number | null;
  proforma_invoice_id?: number | null;
  master_contract_id?: number | null;
  btb_lc_id?: number | null;
  etd?: string | null;
  eta?: string | null;
  amount?: number | null;
  currency?: string | null;
  cost_amount?: number | null;
  margin_amount?: number | null;
  margin_pct?: number | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradeCaseCreate {
  direction?: "EXPORT" | "IMPORT" | string;
  reference: string;
  status?: string;
  current_stage?: string;
  order_id?: number | null;
  customer_id?: number | null;
  vendor_id?: number | null;
  proforma_invoice_id?: number | null;
  master_contract_id?: number | null;
  btb_lc_id?: number | null;
  etd?: string | null;
  eta?: string | null;
  amount?: number | null;
  currency?: string | null;
}

export type TradeCaseUpdate = Partial<TradeCaseCreate>;

export interface TradeCaseStageRow {
  id: number;
  tenant_id: number;
  stage_key: string;
  name: string;
  sort_order: number;
  required_doc_types?: string[] | null;
  next_stage_keys?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TradeCaseTransitionBody {
  to_stage: string;
  notes?: string | null;
}

export interface TradeCaseStageLogRow {
  id: number;
  tenant_id: number;
  trade_case_id: number;
  from_stage?: string | null;
  to_stage: string;
  user_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface ShipmentRow {
  id: number;
  tenant_id: number;
  trade_case_id: number;
  reference: string;
  status: string;
  carrier?: string | null;
  booking_ref?: string | null;
  bl_awb?: string | null;
  etd?: string | null;
  eta?: string | null;
  origin_port?: string | null;
  dest_port?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentCreate {
  trade_case_id: number;
  reference: string;
  status?: string | null;
  carrier?: string | null;
  booking_ref?: string | null;
  bl_awb?: string | null;
  etd?: string | null;
  eta?: string | null;
  origin_port?: string | null;
  dest_port?: string | null;
  notes?: string | null;
}

export type ShipmentUpdate = Partial<ShipmentCreate>;

export interface TradeDocumentRow {
  id: number;
  trade_case_id: number;
  shipment_id?: number | null;
  document_type: string;
  file_name: string;
  /** API-relative URL for authenticated download (same tenant as JWT). */
  file_url: string;
  version: number;
  linked_entity_type?: string | null;
  linked_entity_id?: number | null;
  uploaded_by_id?: number | null;
  created_at: string;
}

export interface TradeCaseMarginResponse {
  trade_case_id: number;
  amount?: number | null;
  estimated_cost?: number | null;
  margin_amount?: number | null;
  margin_pct?: number | null;
  currency?: string | null;
}

export interface TradeCaseDashboardResponse {
  total_cases: number;
  open_cases: number;
  shipped_cases: number;
  settled_cases: number;
  missing_docs_cases: number;
  overdue_shipments: number;
  at_risk_case_ids: number[];
}

// ── Bill-Wise Tracking ──
export interface BillReferenceRow {
  id: number;
  tenant_id: number;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  bill_type: "PAYABLE" | "RECEIVABLE";
  party_name: string;
  account_id: number;
  account_name: string | null;
  original_amount: string;
  pending_amount: string;
  source_voucher_id: number | null;
  source_doc_type: string | null;
  source_doc_number: string | null;
  status: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED";
  credit_period_days: number | null;
  is_overdue: boolean;
  notes: string | null;
  created_at: string | null;
}

export interface BillReferenceCreate {
  bill_number?: string | null;
  bill_date: string;
  due_date?: string | null;
  bill_type: "PAYABLE" | "RECEIVABLE";
  party_name: string;
  account_id: number;
  original_amount: string;
  credit_period_days?: number | null;
  source_voucher_id?: number | null;
  source_doc_type?: string | null;
  source_doc_number?: string | null;
  notes?: string | null;
}

export interface BillAllocationRow {
  id: number;
  allocation_type: string;
  amount: string;
  allocation_date: string;
  voucher_id: number;
  voucher_number: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface BillReferenceDetail {
  bill: BillReferenceRow;
  allocations: BillAllocationRow[];
}

export interface BillAllocationCreate {
  allocation_type: "AGAINST_REF" | "NEW_REF" | "ADVANCE" | "ON_ACCOUNT";
  bill_reference_id?: number | null;
  voucher_id: number;
  voucher_line_id?: number | null;
  account_id: number;
  amount: string;
  notes?: string | null;
}

export interface BillWiseOutstandingReport {
  receivable: { total: number; count: number };
  payable: { total: number; count: number };
  overdue_total: number;
}

export interface BillWiseAgingReport {
  bill_type: string;
  buckets: { "0_30": number; "31_60": number; "61_90": number; "91_120": number; "120_plus": number };
  rows: Array<{
    bill_number: string;
    party_name: string;
    bill_date: string;
    due_date: string | null;
    days_outstanding: number;
    pending_amount: number;
  }>;
}
