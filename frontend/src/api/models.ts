/**
 * Shared request/response types (and a few small helpers) for the internal ERP API.
 *
 * Moved out of `api/client.ts`, which now only re-exports. Keep importing from
 * `@/api/client` in pages; domain modules (`api/finance.ts`, `api/sales.ts`, …) import from here.
 */
import { request, requestPublic } from "@/api/core";
import { type CustomerExtractionResponse, type InquiryExtractionResponse, type VendorExtractionResponse } from "@/types/extraction";

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
  /** Only on sign-up (POST /tenants): one-time key for registering the first admin user. */
  bootstrap_token?: string | null;
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

export type BackupState = "requested" | "running" | "completed" | "failed" | "unavailable";

export interface BackupStatusResponse {
  enabled: boolean;
  provider: string;
  retention_days: number;
  last_backup_at: string | null;
  last_backup_status: string;
  last_backup_note: string | null;
  state?: BackupState;
  requested_at?: string | null;
  size_bytes?: number | null;
  checksum_recorded?: boolean;
  restore_available?: boolean;
}

export interface BackupHistoryRow {
  id: number;
  created_at: string;
  status: string;
  note: string | null;
  initiated_by_user_id: number | null;
  kind?: "server_backup" | "tenant_request";
  size_bytes?: number | null;
}

export interface StatutoryTaxConfigRow {
  id: number;
  tenant_id: number;
  tax_code: string;
  rate_pct: string;
  registration_no: string | null;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface StatutoryTaxConfigListResponse {
  items: StatutoryTaxConfigRow[];
}

export interface StatutoryTaxConfigBody {
  tax_code: string;
  rate_pct: string;
  registration_no?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

export interface StatutoryTaxLineCalcBody {
  line_amount: string;
  apply_vat?: boolean;
  apply_vds?: boolean;
  apply_tds?: boolean;
}

export interface StatutoryTaxLineCalcResponse {
  base_amount: string;
  vat_amount: string;
  vds_amount: string;
  tds_amount: string;
  total_tax: string;
  gross_with_tax: string;
  rates_used: Record<string, string>;
}

export interface BondedWarehouseEntryRow {
  id: number;
  tenant_id: number;
  reference_no: string;
  entry_type: string;
  ud_no: string | null;
  up_no: string | null;
  trade_case_id: number | null;
  btb_lc_id: number | null;
  item_description: string | null;
  quantity: string | null;
  value_bdt: string | null;
  status: string;
  entry_date: string | null;
  notes: string | null;
}

export interface BondedWarehouseListResponse {
  items: BondedWarehouseEntryRow[];
  limit: number;
  offset: number;
}

export interface BondedWarehouseEntryBody {
  reference_no: string;
  entry_type?: string;
  ud_no?: string | null;
  up_no?: string | null;
  trade_case_id?: number | null;
  btb_lc_id?: number | null;
  item_description?: string | null;
  quantity?: string | null;
  value_bdt?: string | null;
  status?: string;
  entry_date?: string | null;
  notes?: string | null;
}

export interface PayrollStatutoryCalcBody {
  gross_pay: string;
  ait_rate_pct?: string;
  pf_employee_rate_pct?: string;
  pf_employer_rate_pct?: string;
  period_year?: number | null;
  period_month?: number | null;
  payroll_run_id?: number | null;
  persist?: boolean;
}

export interface PayrollStatutoryCalcResponse {
  gross_total: string;
  ait_total: string;
  pf_employee_total: string;
  pf_employer_total: string;
  net_payable: string;
  summary_id?: number;
}

export interface DataMigrationTemplateEntity {
  entity_type: string;
  required_columns: string[];
}

export interface DataMigrationTemplatesResponse {
  entities: DataMigrationTemplateEntity[];
}

export interface DataMigrationImportRowResult {
  row_number: number;
  status: string;
  message: string;
  entity_id?: number | null;
}

export interface DataMigrationImportResponse {
  entity_type: string;
  dry_run: boolean;
  total_rows?: number;
  ok_count?: number;
  skip_count?: number;
  error_count?: number;
  rows?: DataMigrationImportRowResult[];
  errors?: string[];
  message?: string;
}

export interface PlatformAdminTokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
}

export interface PlatformAdminTenantBulkCreateItem {
  name: string;
  tenant_type: TenantType;
}

export interface PlatformAdminTenantBulkCreateBody {
  members: PlatformAdminTenantBulkCreateItem[];
  plan_id?: number | null;
}

export interface PlatformAdminTenantCreatedRow {
  id: number;
  company_code: string | null;
  name: string;
}

export interface PlatformAdminTenantBulkCreateResponse {
  created_count: number;
  items: PlatformAdminTenantCreatedRow[];
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

export interface HrComplianceFramework {
  id: number;
  tenant_id: number | null;
  framework_name: string;
  version: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at?: string | null;
  /** Present on system templates: tenant copy id after Activate, else null. */
  activated_tenant_framework_id?: number | null;
}

export interface HrComplianceRequirement {
  id: number;
  tenant_id: number | null;
  framework_id: number;
  requirement_code: string;
  title: string;
  description: string | null;
  category: string;
  verification_method: string | null;
  required_documents: string[] | null;
  is_active: boolean;
}

export interface HrEmployeeComplianceRecord {
  id: number;
  tenant_id: number;
  employee_id: number;
  requirement_id: number;
  status: string;
  evidence_document_id: number | null;
  verified_by: number | null;
  verified_at: string | null;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrComplianceScore {
  framework_id: number;
  framework_name: string;
  total_requirements: number;
  compliant_count: number;
  non_compliant_count: number;
  pending_count: number;
  score_percent: number;
  employee_count: number;
  weighted_score_percent: number | null;
}

export interface HrAuditReadinessGap {
  employee_id: number;
  employee_code: string | null;
  employee_name: string | null;
  requirement_id: number;
  requirement_code: string;
  title: string;
  status: string;
  missing_documents: string[];
  evidence_document_id: number | null;
}

export interface HrAuditReadiness {
  framework_id: number;
  framework_name: string;
  score_percent: number;
  gaps: HrAuditReadinessGap[];
  non_compliant_summary: Record<string, unknown>[];
  action_plan: string[];
}

export interface HrAgeVerification {
  id: number;
  tenant_id: number;
  employee_id: number;
  verification_method: string;
  document_id: number | null;
  date_of_birth: string;
  age_at_verification: number;
  status: string;
  is_bsci_compliant: boolean;
  verified_by: number;
  verified_at: string;
  notes: string | null;
}

export interface HrMedicalRecord {
  id: number;
  tenant_id: number;
  employee_id: number;
  certificate_number: string | null;
  examination_date: string;
  expiry_date: string | null;
  doctor_name: string | null;
  doctor_registration: string | null;
  hospital_clinic: string | null;
  fitness_status: string;
  conditions: string[] | null;
  restrictions: string[] | null;
  document_id: number | null;
  reminder_sent: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface HrDocExtractionResponse {
  success: boolean;
  document_type: string;
  fields: Record<string, unknown>;
  unmapped_text: string[];
  warnings: string[];
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
  calculation_source?: string;
  created_at: string;
  updated_at: string;
}

export interface HrPayrollAssignmentCreate {
  employee_id: number;
  structure_id: number;
  effective_from: string;
  effective_to?: string | null;
  base_salary?: string | null;
  component_overrides?: Record<string, string | { amount: string | number; formula_type?: string }> | null;
}

export interface HrPayrollAssignmentResponse {
  id: number;
  tenant_id: number;
  employee_id: number;
  structure_id: number;
  effective_from: string;
  effective_to: string | null;
  base_salary: string | null;
  component_overrides: Record<string, unknown> | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface HrPayrollAutoCalcComponent {
  component_id: number;
  component_code: string;
  component_name: string;
  component_type: string;
  calculation_type: string;
  amount: string;
  source_amount: string;
  is_statutory?: boolean;
  statutory_kind?: string | null;
}

export interface HrPayrollAutoCalcEmployee {
  employee_id: number;
  employee_code: string;
  employee_name?: string;
  structure_id: number | null;
  assignment_id: number | null;
  base_salary: string;
  days_present: string;
  absent_days?: string;
  late_days?: string;
  ot_hours: string;
  paid_leave_days: string;
  unpaid_leave_days: string;
  gross_pay: string;
  deductions: string;
  net_pay: string;
  overtime_amount: string;
  components: HrPayrollAutoCalcComponent[];
  warnings: string[];
  skipped: boolean;
  skip_reason: string | null;
  status?: string;
  has_manual_override?: boolean;
  calculation_source?: string;
  /** SALARY | DAILY | PIECE — derived from the structure's component types. */
  pay_basis?: string;
  /** Pieces scanned at the shop-floor station (operator code = employee code) in the period. */
  pieces?: string;
  /** Standard minutes earned (pieces × SMV) in the period. */
  earned_minutes?: string;
}

export interface HrPayrollAutoCalcPreview {
  run_id: number;
  period_id: number;
  as_of: string;
  existing_line_count: number;
  requires_overwrite_confirm: boolean;
  employees: HrPayrollAutoCalcEmployee[];
  missing_assignment_employee_ids: number[];
  warnings: string[];
}

export interface HrPayrollAutoCalcApplyResult {
  run_id: number;
  applied: number;
  skipped: number;
  gross_total: string;
  deduction_total: string;
  net_total: string;
  preview_warnings?: string[];
  missing_assignment_employee_ids?: number[];
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


export interface PackingCartonLine {
  carton_from: number;
  carton_to: number;
  color_name: string;
  size: string;
  pcs_per_carton: number;
  net_kg_per_carton?: string | null;
  gross_kg_per_carton?: string | null;
  length_cm?: string | null;
  width_cm?: string | null;
  height_cm?: string | null;
}

export interface PackingCartons {
  enabled: boolean;
  packing_list_id: number;
  order_id: number | null;
  order_code: string | null;
  status: string;
  locked: boolean;
  lines: PackingCartonLine[];
  summary: { total_cartons: number; total_pcs: number; net_kg: string; gross_kg: string; cbm: string };
  breakdown: {
    color_name: string;
    size: string;
    packed_this_list: number;
    packed_all_lists: number;
    ordered_qty: number | null;
    balance_to_pack: number | null;
  }[];
}

export type CertificateType = "GOTS" | "OCS" | "GRS" | "RCS" | "OEKO_TEX_100" | "BCI" | "FSC" | "OTHER";

export interface MaterialCertificate {
  id: number;
  cert_type: CertificateType;
  certificate_number: string;
  issuer: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  item_id: number | null;
  item_name: string | null;
  valid_from: string | null;
  valid_until: string | null;
  status: "valid" | "expiring" | "expired" | "not_yet_valid";
  notes: string | null;
}

export interface CutTicketFabricLot {
  id: number;
  cut_ticket_id: number;
  stock_batch_id: number;
  batch_number: string;
  item_code: string | null;
  item_name: string | null;
  qty_used: string | null;
  roll_numbers: string | null;
  grn_code: string | null;
  received_date: string | null;
  supplier_name: string | null;
}

export interface OrderTraceabilityReport {
  order_id: number;
  order_code: string;
  customer_name: string | null;
  style_ref: string | null;
  cut_tickets: { id: number; ticket_code: string; cut_date: string | null; total_pcs_cut: number | null; bundle_count: number; bundle_pcs: number }[];
  fabric_lots: (CutTicketFabricLot & {
    cut_ticket_code: string;
    certificates: { cert_type: string; certificate_number: string; issuer: string | null; valid_until: string | null; status_on_receipt: string }[];
  })[];
  packing_lists: { packing_list_number: string; packing_date: string | null; total_cartons: number; status: string }[];
  gaps: string[];
}

export type CommissionDirection = "RECEIVABLE" | "PAYABLE";

export interface CommissionSettings {
  enabled: boolean;
  tds_rate_pct: string;
  vds_rate_pct: string;
  income_account_id: number | null;
  receivable_account_id: number | null;
  expense_account_id: number | null;
  payable_account_id: number | null;
  tds_receivable_account_id: number | null;
  tds_payable_account_id: number | null;
  vds_receivable_account_id: number | null;
  vds_payable_account_id: number | null;
}

export interface CommissionRule {
  id: number;
  direction: CommissionDirection;
  scope: "DEFAULT" | "CUSTOMER" | "VENDOR" | "INTERMEDIARY";
  customer_id: number | null;
  vendor_id: number | null;
  intermediary_id: number | null;
  target_name: string | null;
  rate_type: "PERCENTAGE" | "FIXED";
  rate: string;
  is_active: boolean;
  notes: string | null;
}

export interface CommissionEntry {
  id: number;
  shipment_id: number;
  shipment_ref: string | null;
  order_code: string | null;
  direction: CommissionDirection;
  counterparty_type: "CUSTOMER" | "VENDOR" | "INTERMEDIARY";
  counterparty_id: number;
  counterparty_name: string | null;
  rate_type: string;
  rate: string;
  rate_source: string;
  base_amount: string;
  gross_amount: string;
  tds_amount: string;
  vds_amount: string;
  net_amount: string;
  currency: string;
  status: "PENDING" | "STATEMENTED";
  statement_id: number | null;
}

export interface CommissionShipment {
  id: number;
  order_id: number;
  order_code: string | null;
  vendor_id: number | null;
  vendor_name: string | null;
  shipment_ref: string;
  shipment_date: string;
  shipped_qty: number | null;
  shipped_value: string;
  currency: string;
  exchange_rate_to_base: string;
  notes: string | null;
  entries: CommissionEntry[];
}

export interface CommissionStatement {
  id: number;
  statement_code: string;
  direction: CommissionDirection;
  counterparty_type: CommissionEntry["counterparty_type"];
  counterparty_id: number;
  counterparty_name: string | null;
  statement_date: string;
  currency: string;
  gross_total: string;
  tds_total: string;
  vds_total: string;
  net_total: string;
  base_gross_total: string;
  status: "DRAFT" | "ISSUED" | "CANCELLED";
  voucher_id: number | null;
  voucher_number: string | null;
  notes: string | null;
  issued_at: string | null;
  entries: CommissionEntry[];
  warning: string | null;
}

export interface OrderColorSizeMatrix {
  enabled: boolean;
  order_id: number;
  order_quantity: number | null;
  /** Order is CONFIRMED / IN_PROGRESS / COMPLETED: total must stay equal to the confirmed quantity. */
  locked: boolean;
  colors: { name: string; code?: string | null }[];
  sizes: string[];
  cells: { color: string; size: string; quantity: number }[];
  total: number;
  matches_order_quantity: boolean | null;
  suggested_colors: { name: string; code?: string | null }[];
  suggested_sizes: string[];
}

/** Quantities are decimal strings (e.g. "20.5"). */
export interface PoColorSizeLine {
  po_item_id: number;
  item_code: string;
  item_name: string;
  quantity: string;
  colors: { name: string; code?: string | null }[];
  sizes: string[];
  cells: { color: string; size: string; quantity: string }[];
  total: string;
  matches_quantity: boolean | null;
}

export interface PoColorSizeGrid {
  enabled: boolean;
  purchase_order_id: number;
  po_code: string;
  po_status: string;
  read_only: boolean;
  /** Non-draft POs: a saved grid must total exactly the line quantity. */
  must_match_quantity: boolean;
  lines: PoColorSizeLine[];
  suggested_colors: { name: string; code?: string | null }[];
  suggested_sizes: string[];
}

export type UdStatus = "DRAFT" | "APPROVED" | "CLOSED";

export interface UdEntitlementInput {
  id?: number | null;
  item_description: string;
  hs_code?: string | null;
  uom?: string | null;
  entitled_qty: string;
  entitled_value_usd?: string | null;
}

export interface UdHeader {
  id: number;
  ud_no: string;
  amendment_no: number;
  ud_date: string | null;
  issuer: string;
  trade_case_id: number | null;
  trade_case_reference?: string | null;
  export_lc_no: string | null;
  buyer_name: string | null;
  export_value_usd: string | null;
  garment_qty: string | null;
  expiry_date: string | null;
  status: UdStatus;
  notes: string | null;
}

export interface UdListItem extends UdHeader {
  entitlement_count: number;
  days_to_expiry: number | null;
}

export interface UdUtilizationLine {
  entitlement_id: number;
  item_description: string;
  hs_code: string | null;
  uom: string | null;
  entitled_qty: string;
  imported_qty: string;
  consumed_qty: string;
  remaining_entitlement_qty: string;
  in_bond_qty: string;
  utilization_pct: number | null;
  entry_count: number;
}

export interface UdDetail extends UdHeader {
  entitlements: (UdEntitlementInput & { id: number })[];
  utilization: {
    lines: UdUtilizationLine[];
    warnings: { kind: string; message: string }[];
    total_entitled_value_usd: string;
    total_imported_value_bdt: string;
  };
}

export interface UdBodyInput {
  ud_no: string;
  amendment_no?: number;
  ud_date?: string | null;
  issuer: string;
  trade_case_id?: number | null;
  export_lc_no?: string | null;
  buyer_name?: string | null;
  export_value_usd?: string | null;
  garment_qty?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  entitlements: UdEntitlementInput[];
}

export interface BondRegisterRow {
  id: number;
  entry_date: string | null;
  reference_no: string | null;
  entry_type: string;
  ud_no: string | null;
  up_no: string | null;
  item_description: string | null;
  in_qty: string;
  out_qty: string;
  value_bdt: string;
  balance_qty: string;
  status: string | null;
}

export interface BondRegister {
  rows: BondRegisterRow[];
  opening_items: number;
  opening_balance_qty: string;
  closing_balance_qty: string;
}

export interface MushakRegister {
  register: "6.1" | "6.2";
  title: string;
  period: string;
  rows: Record<string, string | number | null>[];
  totals: Record<string, string>;
  note: string;
}

export type LcPerformanceFlag = "EXPIRED_UNSHIPPED" | "EXPIRING_UNSHIPPED" | "OVER_SHIPPED" | "BTB_ABOVE_75PCT";

export interface LcPerformanceRow {
  master_contract_id: number;
  reference: string;
  lc_number: string | null;
  contract_type: string;
  status: string;
  buyer_name: string | null;
  currency: string;
  lc_value: string;
  shipped: string;
  shipped_pct: number | null;
  realised: string;
  realised_pct_of_shipped: number | null;
  realisation_pending: string;
  outstanding: string;
  unshipped: string;
  btb_opened: string;
  btb_count: number;
  btb_pct_of_lc: number | null;
  expiry_date: string | null;
  days_to_expiry: number | null;
  last_shipment_date: string | null;
  invoice_count: number;
  flags: LcPerformanceFlag[];
}

export interface LcPerformanceResponse {
  as_of: string;
  rows: LcPerformanceRow[];
  totals_by_currency: { currency: string; lc_value: string; shipped: string; realised: string; outstanding: string; unshipped: string; btb_opened: string }[];
}

/** Purchases / sales above BDT 2 lakh in a month. */
export interface Mushak610 {
  form: "6.10";
  period: string;
  threshold_bdt: string;
  purchases: Record<string, string | number | null>[];
  sales: Record<string, string | number | null>[];
  note: string;
}

/** Draft monthly VAT return summary built from 6.1 / 6.2. */
export interface Mushak91Summary {
  return: "9.1";
  period: string;
  title: string;
  seller_name: string;
  seller_bin: string | null;
  lines: { section: string; label: string; value: string; vat: string }[];
  counts: { sales_invoices: number; purchase_bills: number };
  net_vat_payable: string;
  carry_forward_credit: string;
  due_by: string;
  note: string;
}

/** Tax invoice data for one commercial invoice. */
export interface Mushak63 {
  form: "6.3";
  title: string;
  seller: { name: string; bin: string | null; address: string | null };
  buyer: { name: string; bin: string | null; address: string | null };
  invoice_code: string;
  invoice_date: string | null;
  issued_at: string | null;
  currency: string | null;
  exchange_rate_to_base: string | null;
  supply_type: string;
  lines: {
    sl: number;
    description: string;
    quantity: string;
    unit_price: string;
    value_fc: string;
    value_bdt: string;
    sd_amount: string;
    vat_rate_pct: string;
    vat_amount: string;
    total_bdt: string;
  }[];
  totals: { value_bdt: string; sd: string; vat: string; total_bdt: string };
  status: string;
  note: string;
}

export interface GovernedFinding {
  agent: "tna_delay" | "lc_expiry" | "bom_shortfall" | string;
  agent_label: string;
  key: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  title: string;
  detail: string;
  recommended_action: string;
  href: string | null;
  order_id: number | null;
  suggested_action: { type: "notify"; label: string };
}

export interface GovernedExceptions {
  agents: { id: string; label: string; count: number }[];
  can_confirm: boolean;
  hidden_recently: number;
  items: GovernedFinding[];
}

export interface OwnerBrief {
  metrics: Record<string, number>;
  exception_counts: Record<string, number>;
  highlights: { title: string; detail: string; href: string | null; severity: string }[];
  narrative: string;
  source: "ai" | "rules";
  generated_at: string;
}

export interface MetricMeta {
  id: string;
  label: string;
  description: string;
  unit: string;
  href: string;
}

export interface MetricValue extends MetricMeta {
  value: number;
  breakdown?: { label: string; value: number }[];
}

export type MetricAnswer =
  | { matched: true; method: "keywords" | "ai"; metric: MetricValue; suggestions: MetricMeta[] }
  | { matched: false; message: string; suggestions: MetricMeta[] };

export interface OnboardingChecklist {
  steps: { key: string; title: string; description: string; href: string; done: boolean }[];
  completed: number;
  total: number;
}

export interface AppNotification {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  created_at: string;
}

export interface NotificationList {
  items: AppNotification[];
  unread_count: number;
}

export interface GlobalSearchHit {
  kind: string;
  id: number;
  title: string;
  subtitle?: string | null;
  href: string;
}

export interface GlobalSearchResponse {
  query: string;
  groups: { kind: string; label: string; hits: GlobalSearchHit[] }[];
}

/** What a saved list view remembers: URL filters, sort, visible columns, density. */
export interface SavedViewConfig {
  query?: string;
  sort?: { id: string; desc: boolean }[];
  hidden_columns?: string[];
  density?: "compact" | "comfortable";
}

export interface SavedView {
  id: number;
  table_key: string;
  name: string;
  config: SavedViewConfig;
  is_shared: boolean;
  is_mine: boolean;
  updated_at: string;
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

export interface AiFinanceForecastResponse {
  success: boolean;
  source: string;
  horizon_days: number;
  projection: {
    forecast_points?: Array<Record<string, unknown>>;
    history?: Array<Record<string, unknown>>;
    assumptions?: Record<string, unknown>;
    confidence_score?: number | null;
  };
  narrative: string;
  narrative_source: string;
  limitations: string[];
  forecast?: Record<string, Record<string, number>>;
  break_even?: { monthly_revenue_required?: number; current_runway_months?: number };
  risks?: Array<{ severity?: string; description?: string; mitigation?: string }>;
  budget_variance_insights?: Array<{
    category?: string;
    message?: string;
    recommended_action?: string;
  }>;
}

export interface PredictiveHeuristicResponse {
  success: boolean;
  source: string;
  lookback_days: number;
  items: Array<Record<string, unknown>>;
  limitations: string[];
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



export interface DashboardKpi {
  id: string;
  label: string;
  value: number;
  /** Optional hint under the KPI value (e.g. "From quotations (not GL)"). */
  subtitle?: string;
}

export interface DashboardAttentionSummary {
  pending_approvals: number;
  tna_open: number;
  tna_overdue: number;
  critical_alerts: number;
  total_alerts: number;
  promise_blocked: number;
  commercial_pending: number;
  post_dated_due_today?: number;
  links: {
    pending_approvals: string;
    tna_overdue: string;
    critical_alerts: string;
    promise_blocked: string;
    commercial_pending: string;
    post_dated_due_today?: string;
  };
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
  /** Honest count of orders created in the bucket (same as output when backend is honest). */
  orders_created?: number;
  /** Optional series label, e.g. "Orders created". */
  label?: string;
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
export function inquiryWriteBodyForApi(data: InquiryCreate | InquiryUpdate): Record<string, unknown> {
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
  /** Revision lineage: null on the first version (v1). */
  root_quotation_id?: number | null;
  revision_of_id?: number | null;
  /** Set when a newer revision replaced this one (read-only). */
  superseded_at?: string | null;
  is_latest_revision?: boolean;
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
  base_unit?: string | null;
  alternate_unit?: string | null;
  conversion_factor?: string | null;
  standard_price?: string | null;
  current_stock?: string;
  current_value?: string;
  avg_cost?: string;
  batch_tracking?: boolean;
  expiry_tracking?: boolean;
  gst_applicable?: boolean;
  gst_rate?: string | null;
  hsn_code?: string | null;
  default_valuation_method?: string | null;
  reorder_level?: string | null;
  auto_reorder_enabled?: boolean;
  reorder_qty?: string | null;
  safety_stock?: string | null;
  lead_time_days?: number | null;
  lot_size_method?: string | null;
  fixed_lot_size?: string | null;
  preferred_vendor_id?: number | null;
  planning_time_fence_days?: number | null;
  abc_class?: string | null;
}

/** Sprint I1 MRP / IDT types */
export interface PlannedOrderResponse {
  id: number;
  planned_order_number: string;
  source_type: string;
  source_order_id?: number | null;
  source_bom_id?: number | null;
  item_id: number;
  required_qty: string;
  planned_qty: string;
  requirement_date: string;
  release_date: string;
  action: string;
  status: string;
  generated_po_id?: number | null;
  generated_mo_id?: number | null;
  created_at?: string | null;
}

export interface MrpRunResult {
  planned_orders: PlannedOrderResponse[];
  exceptions: {
    severity: string;
    code: string;
    message: string;
    item_id?: number | null;
    order_id?: number | null;
  }[];
  explosion: {
    level: number;
    item_id: number;
    item_code?: string | null;
    parent_item_id?: number | null;
    qty_per: string;
    required_qty: string;
    bom_id?: number | null;
    source_order_id?: number | null;
  }[];
}

export interface PlannedOrderReleaseResult {
  planned_order: PlannedOrderResponse;
  generated_po_id?: number | null;
  generated_mo_id?: number | null;
  document_type?: string | null;
  document_number?: string | null;
}

export interface ReorderSuggestionResponse {
  id: number;
  item_id: number;
  warehouse_id?: number | null;
  current_stock: string;
  reorder_level: string;
  suggested_qty: string;
  preferred_vendor_id?: number | null;
  estimated_cost?: string | null;
  status: string;
  generated_po_id?: number | null;
  created_at?: string | null;
}

export interface ReorderCheckResult {
  suggestions_created: number;
  items_checked: number;
  suggestions: ReorderSuggestionResponse[];
}

export interface ReorderConvertResult {
  suggestion: ReorderSuggestionResponse;
  purchase_order_id: number;
  po_code?: string | null;
}

export interface InterDepartmentTransferResponse {
  id: number;
  idt_number: string;
  idt_date: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  process_name: string;
  source_item_id: number;
  source_qty_issued: string;
  source_qty_unit: string;
  source_batch_id?: number | null;
  target_item_id: number;
  target_qty_expected: string;
  target_qty_received?: string | null;
  target_qty_unit: string;
  process_loss_qty?: string | null;
  process_loss_percent?: string | null;
  standard_process_loss_percent?: string | null;
  loss_exception: boolean;
  is_job_work: boolean;
  job_work_vendor_id?: number | null;
  job_work_cost_per_unit?: string | null;
  job_work_total_cost?: string | null;
  transport_cost: string;
  other_charges: string;
  status: string;
  source_item_cost?: string | null;
  target_item_value?: string | null;
  linked_order_id?: number | null;
  narration?: string | null;
  lines: {
    id: number;
    source_item_id: number;
    source_qty: string;
    source_batch_id?: number | null;
    source_unit_cost?: string | null;
  }[];
  created_at?: string | null;
}

export interface InterDepartmentTransferCreate {
  from_warehouse_id: number;
  to_warehouse_id: number;
  process_name: string;
  source_item_id: number;
  source_qty: string;
  source_qty_unit?: string;
  target_item_id: number;
  target_qty_expected: string;
  target_qty_unit?: string;
  idt_date?: string | null;
  is_job_work?: boolean;
  job_work_vendor_id?: number | null;
  job_work_cost_per_unit?: string | null;
  transport_cost?: string | null;
  other_charges?: string | null;
  linked_order_id?: number | null;
  narration?: string | null;
}

export interface ProcessLossStandardResponse {
  id: number;
  process_name: string;
  standard_loss_percent: string;
  warning_threshold_percent: string;
  item_category_id?: number | null;
  is_active: boolean;
}

export interface ProcessLossReportResponse {
  from_date: string;
  to_date: string;
  rows: {
    process_name: string;
    total_issued: string;
    total_received: string;
    total_loss: string;
    loss_percent: string;
    standard_percent: string;
    variance_percent: string;
    status: string;
    exception_count: number;
  }[];
}

export interface PostCostingReportResponse {
  order_id: number;
  order_code?: string | null;
  order_qty?: number | null;
  stages: {
    stage: string;
    input_qty?: string | null;
    output_qty?: string | null;
    loss_percent?: string | null;
    input_cost?: string | null;
    job_work?: string | null;
    output_cost_per_unit?: string | null;
    idt_id?: number | null;
    loss_exception: boolean;
  }[];
  final_unit_cost?: string | null;
  standard_unit_cost?: string | null;
  cost_variance?: string | null;
  cost_variance_pct?: string | null;
  variance_drivers: string[];
}

export interface GrnQualityInspection {
  id: number;
  grn_id: number;
  grn_item_id: number;
  item_id?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  lot_number?: string | null;
  grn_code?: string | null;
  vendor_id?: number | null;
  inspection_date?: string | null;
  inspected_by?: number | null;
  received_qty: string;
  accepted_qty: string;
  rejected_qty: string;
  hold_qty: string;
  parameters?: Record<string, unknown> | null;
  result?: string | null;
  status: string;
  notes?: string | null;
  photos?: string[] | Record<string, unknown> | null;
  target_warehouse_id?: number | null;
  quarantine_warehouse_id?: number | null;
  rejected_warehouse_id?: number | null;
  debit_note_suggested?: boolean;
  created_at?: string | null;
}

export interface VendorScorecardRow {
  vendor_id: number;
  vendor_name?: string | null;
  inspection_count: number;
  received_qty: string;
  rejected_qty: string;
  accepted_qty: string;
  rejection_rate_pct: number;
  alert: boolean;
}

export interface InventoryQualityDashboardResponse {
  pending_count: number;
  pass_rate_pct: number;
  fail_rate_pct: number;
  completed_last_30_days: number;
  top_rejected_items: {
    item_id: number;
    item_code?: string | null;
    item_name?: string | null;
    rejected_qty: string;
  }[];
  vendor_alerts: VendorScorecardRow[];
}

export interface AbcAnalysisItemRow {
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  category_id?: number | null;
  consumption_qty: string;
  avg_cost: string;
  consumption_value: string;
  abc_class: string;
  pct_of_total: number;
  cumulative_pct?: number;
}

export interface AbcAnalysisReport {
  period_months?: number | null;
  cutoff_date?: string | null;
  total_items: number;
  total_value: string;
  classes: Record<
    string,
    { class: string; item_count: number; total_value: string; items: AbcAnalysisItemRow[] }
  >;
  items: AbcAnalysisItemRow[];
}

export interface EoqResult {
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  abc_class?: string | null;
  unit_cost: string;
  holding_cost_rate: number;
  current_order_qty: string;
  differs_significantly: boolean;
  estimated_annual_savings: string;
  eoq: string;
  annual_demand: string;
  ordering_cost: string;
  holding_cost_per_unit: string;
  order_frequency_per_year: number;
  orders_per_year: number;
  total_annual_cost: string;
}

export interface StockAgingReport {
  as_of: string;
  line_count: number;
  total_value: string;
  slow_moving_value_180_plus: string;
  over_365_value: string;
  alert?: string | null;
  buckets: { bucket: string; batch_count: number; qty: string; value: string }[];
  lines: {
    batch_id: number;
    item_id: number;
    item_code?: string | null;
    item_name?: string | null;
    warehouse_id?: number | null;
    warehouse_name?: string | null;
    batch_number: string;
    receipt_date: string;
    days_in_stock: number;
    qty: string;
    unit_cost: string;
    value: string;
    bucket: string;
  }[];
}

export interface CycleCountTask {
  id: number;
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  warehouse_id: number;
  warehouse_name?: string | null;
  scheduled_date?: string | null;
  status: string;
  system_qty: string;
  counted_qty?: string | null;
  variance_qty?: string | null;
  variance_value?: string | null;
  abc_class?: string | null;
  adjustment_suggested?: boolean;
  notes?: string | null;
  counted_by?: number | null;
  counted_at?: string | null;
  adjustment_href?: string | null;
}

export interface StockSerialRow {
  id: number;
  serial_number: string;
  status: string;
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  grn_item_id?: number | null;
  grn_code?: string | null;
  dc_item_id?: number | null;
  dc_code?: string | null;
  warranty_start?: string | null;
  warranty_end?: string | null;
  created_at?: string | null;
}

export interface SerialTrace extends StockSerialRow {
  grn_id?: number | null;
  dc_id?: number | null;
  movements?: Array<{
    id: number;
    movement_type: string;
    quantity: string;
    movement_date?: string | null;
    reference_type?: string | null;
    movement_kind?: string | null;
  }>;
  lifecycle?: Array<{ event: string; at?: string | null; ref?: string | null }>;
}

export interface ItemKitResponse {
  id: number;
  kit_code: string;
  name: string;
  kit_price: string;
  is_active: boolean;
  notes?: string | null;
  component_cost: string;
  margin: string;
  margin_pct: number;
  components: Array<{
    id?: number;
    item_id: number;
    quantity: string;
    item_code?: string | null;
    item_name?: string | null;
    unit_cost?: string | null;
  }>;
}

export interface ConsignmentStockRow {
  id: number;
  vendor_id: number;
  vendor_name?: string | null;
  item_id: number;
  item_code?: string | null;
  item_name?: string | null;
  warehouse_id: number;
  warehouse_name?: string | null;
  consigned_qty: string;
  consumed_qty: string;
  remaining_qty: string;
  billed_qty: string;
  unbilled_consumed_qty: string;
  is_billed: boolean;
  unit_cost?: string | null;
  agreement_date?: string | null;
  settlement_terms_days?: number | null;
  notes?: string | null;
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
  base_unit?: string | null;
  alternate_unit?: string | null;
  conversion_factor?: string | null;
  standard_price?: string | null;
  batch_tracking?: boolean;
  expiry_tracking?: boolean;
  gst_applicable?: boolean;
  gst_rate?: string | null;
  hsn_code?: string | null;
  default_valuation_method?: string | null;
  reorder_level?: string | null;
  auto_reorder_enabled?: boolean;
  reorder_qty?: string | null;
  safety_stock?: string | null;
  lead_time_days?: number | null;
  lot_size_method?: string | null;
  fixed_lot_size?: string | null;
  preferred_vendor_id?: number | null;
  planning_time_fence_days?: number | null;
  abc_class?: string | null;
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
  base_unit?: string | null;
  alternate_unit?: string | null;
  conversion_factor?: string | null;
  standard_price?: string | null;
  batch_tracking?: boolean;
  expiry_tracking?: boolean;
  gst_applicable?: boolean;
  gst_rate?: string | null;
  hsn_code?: string | null;
  default_valuation_method?: string | null;
  reorder_level?: string | null;
  auto_reorder_enabled?: boolean;
  reorder_qty?: string | null;
  safety_stock?: string | null;
  lead_time_days?: number | null;
  lot_size_method?: string | null;
  fixed_lot_size?: string | null;
  preferred_vendor_id?: number | null;
  planning_time_fence_days?: number | null;
  abc_class?: string | null;
}

export interface WarehouseResponse {
  id: number;
  tenant_id: number;
  warehouse_code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  is_production_floor?: boolean;
  is_store?: boolean;
  is_rejected?: boolean;
  is_quarantine?: boolean;
}

export interface WarehouseCreate {
  /** Omit to auto-generate (e.g. WH-0001). */
  warehouse_code?: string;
  name: string;
  address?: string;
  is_active?: boolean;
  is_production_floor?: boolean;
  is_store?: boolean;
  is_rejected?: boolean;
  is_quarantine?: boolean;
}

export interface WarehouseUpdate {
  name?: string;
  address?: string | null;
  is_active?: boolean;
  is_production_floor?: boolean;
  is_store?: boolean;
  is_rejected?: boolean;
  is_quarantine?: boolean;
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
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  default_valuation_method?: string;
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
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  default_valuation_method?: string;
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
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  default_valuation_method?: string;
}

export interface StockGroupTreeNode {
  id: number;
  group_code: string;
  name: string;
  parent_id: number | null;
  is_active: boolean;
  default_valuation_method: string;
  inventory_account_id?: number | null;
  sales_account_id?: number | null;
  purchase_account_id?: number | null;
  item_count: number;
  total_stock_value: string;
  children: StockGroupTreeNode[];
}

export interface StockItemListRow {
  id: number;
  item_code: string;
  name: string;
  stock_group_id?: number | null;
  stock_group_name?: string | null;
  base_unit?: string | null;
  current_stock: string;
  avg_cost: string;
  standard_price?: string | null;
  batch_tracking?: boolean;
  reorder_level?: string | null;
}

export interface StockItemListResponse {
  items: StockItemListRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface StockItemPriceRow {
  id: number;
  price_list_name: string;
  price: string;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
}

export interface StockItemPriceUpsert {
  price_list_name: string;
  price: string | number;
  currency?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
}

export interface StockBatchRow {
  id?: number;
  batch_id?: number;
  stock_item_id?: number;
  batch_number?: string;
  current_qty: string;
  cost_per_unit?: string;
  godown_id?: number | null;
  godown_name?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
  status?: string;
  item_code?: string;
  item_name?: string;
}

export interface StockItemDetailResponse {
  id: number;
  item_code: string;
  name: string;
  stock_group_id: number | null;
  base_unit: string | null;
  alternate_unit: string | null;
  conversion_factor: string | null;
  standard_price: string | null;
  current_stock: string;
  current_value: string;
  avg_cost: string;
  batch_tracking: boolean;
  expiry_tracking: boolean;
  gst_applicable: boolean;
  gst_rate: string | null;
  hsn_code: string | null;
  default_valuation_method: string | null;
  reorder_level: string | null;
  valuation: StockValuationResult;
  batches: StockBatchRow[];
  prices: StockItemPriceRow[];
  godown_stock: { godown_id: number | null; godown_name: string | null; qty: string }[];
  ledger: {
    id: number;
    date: string | null;
    type: string;
    qty: string;
    warehouse_id: number | null;
    batch_id: number | null;
    lot_number: string | null;
    reference_type: string | null;
    reference_id: number | null;
    notes: string | null;
  }[];
}

export interface StockItemCreateBody {
  name: string;
  category_id: number;
  unit_id: number;
  stock_group_id?: number | null;
  item_code?: string;
  description?: string;
  subcategory_id?: number | null;
  default_warehouse_id?: number | null;
  default_cost?: string;
  base_unit?: string | null;
  alternate_unit?: string | null;
  conversion_factor?: string | null;
  standard_price?: string | null;
  batch_tracking?: boolean;
  expiry_tracking?: boolean;
  gst_applicable?: boolean;
  gst_rate?: string | null;
  hsn_code?: string | null;
  default_valuation_method?: string | null;
  reorder_level?: string | null;
  is_active?: boolean;
}

export interface GodownStockResponse {
  godown_id: number;
  godown_name: string;
  items: { item_id: number; item_code: string | null; name: string | null; qty: string }[];
}

export interface StockByGodownMatrixResponse {
  godowns: {
    id: number;
    code: string;
    name: string;
    is_store?: boolean;
    is_production_floor?: boolean;
    is_rejected?: boolean;
  }[];
  rows: {
    item_id: number;
    item_code: string;
    name: string;
    stock_group_id: number | null;
    cells: Record<string, string>;
  }[];
}

export interface StockTransferCreateBody {
  from_godown_id: number;
  to_godown_id: number;
  items: { stock_item_id: number; batch_id?: number | null; qty: string | number }[];
  notes?: string | null;
  auto_fifo?: boolean;
}

export interface StockTransferResult {
  id: number;
  transfer_code: string;
  from_godown_id: number;
  to_godown_id: number;
  status: string;
  lines: { item_id: number; qty: string; batch_allocations: unknown[] }[];
}

export interface StockValuationResult {
  method?: string;
  qty?: string;
  unit_cost?: string;
  total_value?: string;
  [key: string]: unknown;
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
  /** Leave empty to let the API generate one (VEN-0001...). */
  vendor_code?: string;
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
  vendor_qc_rejection_rate_pct?: number | null;
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
  item_code?: string | null;
  item_name?: string | null;
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
  item_code?: string | null;
  item_name?: string | null;
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
  input_item_code?: string | null;
  input_item_name?: string | null;
  output_item_code?: string | null;
  output_item_name?: string | null;
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

/** One signature block on a printed document; `user_id` null means the stage is not signed yet. */
export interface DocumentSignatory {
  role_label: string;
  user_id: number | null;
  name: string | null;
  designation: string | null;
  signed_at: string | null;
  /** Embedded `data:image/...;base64,...` so it prints without an auth header. */
  signature_image_data_uri: string | null;
}

export interface MySignature {
  user_id: number;
  display_name: string;
  designation: string | null;
  /** Auth-protected `/api/v1/files/user_signatures/...` path; fetch with the API client. */
  signature_image_url: string | null;
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
  signatories?: DocumentSignatory[];
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
  root_quotation_id?: number | null;
  revision_of_id?: number | null;
  superseded_at?: string | null;
  is_latest_revision?: boolean;
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
  related_counts?: {
    bom_exists?: boolean;
    po_count?: number;
    production_plan_exists?: boolean;
    delivery_challan_count?: number;
    invoice_count?: number;
    packing_list_count?: number;
    tna_actions_count?: number;
    export_case_count?: number;
    export_case_id?: number | null;
  } | null;
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
  next_required_action?: {
    kind: string;
    label: string;
    href?: string | null;
    planned_date?: string | null;
    pipeline_stage?: string | null;
    action_id?: number | null;
  } | null;
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

export interface CostVarianceRow {
  line_key: string;
  description: string | null;
  item_code: string | null;
  item_id: number | null;
  bom_line_id: number | null;
  quotation_line_id: number | null;
  tentative_cost: number | null;
  actual_cost: number | null;
  variance_amount: number | null;
  variance_pct: number | null;
  status: string;
  source_tentative: string;
  source_actual: string;
}

export interface CostVarianceTotals {
  tentative_cost: number;
  actual_cost: number;
  variance_amount: number | null;
  variance_pct: number | null;
  status: string;
}

export interface CostVarianceMarginImpact {
  snapshot_total_cost: number | null;
  snapshot_quoted_price: number | null;
  snapshot_profit_percentage: number | null;
  tentative_material_total: number;
  actual_material_total: number;
  variance_amount: number | null;
  variance_pct: number | null;
  overall_status: string;
  estimated_margin_at_quote: number | null;
  estimated_margin_with_actuals: number | null;
  margin_quoted_percent?: number | null;
  margin_actual_percent?: number | null;
}

export interface VoucherPostPreflightResponse {
  ok: boolean;
  mode: string;
  remaining: number | null;
  warnings: string[];
  has_budget?: boolean;
  budget_amount?: number | null;
  used_amount?: number | null;
  pending_amount?: number | null;
  projected?: number | null;
  status?: string;
  enforcement_mode?: string;
  can_post?: boolean;
  warning_message?: string | null;
}

export interface DashboardPendingPriceAlert {
  id: string;
  type: string;
  severity: "warning" | "critical" | string;
  message: string;
  entity_type: string;
  entity_id: number | null;
  order_id: number | null;
  link: string;
  created_at: string | null;
  order_code?: string;
  variance_pct?: number | null;
  href?: string;
}

export interface DashboardPendingPriceVerificationsResponse {
  total_alerts: number;
  alerts: DashboardPendingPriceAlert[];
}

export interface OrderCostVarianceResponse {
  order_id: number;
  order_code: string;
  order_status: string;
  bom_id: number | null;
  quotation_id: number | null;
  rows: CostVarianceRow[];
  totals: CostVarianceTotals;
  margin_impact: CostVarianceMarginImpact;
  thresholds: Record<string, number>;
}

export interface OrderProfitabilitySummaryItem {
  order_id: number;
  order_code: string;
  order_status: string;
  status: string;
  tentative_cost: number | null;
  actual_cost: number | null;
  variance_pct: number | null;
  margin_impact: CostVarianceMarginImpact | null;
  quoted_margin_percent?: number | null;
  actual_margin_percent?: number | null;
  sparkline_data?: number[];
}

export interface OrderProfitabilitySummaryPage {
  items: OrderProfitabilitySummaryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PendingPriceVerificationItem {
  order_id: number;
  order_code: string;
  order_status: string;
  status: string;
  tentative_cost: number | null;
  actual_cost: number | null;
  variance_pct: number | null;
  href: string;
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
  /** Sprint 2: from item master cache when available */
  current_stock?: string | null;
  avg_cost?: string | null;
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
  otd_at_risk?: number;
  otd_overdue?: number;
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

/** Tenant financial year (feature flag fiscal_year_start_month; calendar year when not set). */
export interface FiscalYearInfo {
  fiscal_year: number;
  label: string;
  start_date: string;
  end_date: string;
  start_month: number;
}

/** Draft voucher sent to the entry assistant (read-only hints beside the voucher form). */
export interface VoucherEntryAssistRequest {
  voucher_type: string;
  voucher_date: string;
  reference?: string | null;
  exclude_voucher_id?: number | null;
  lines: Array<{ account_id: number; entry_type: "DEBIT" | "CREDIT"; amount: string; notes?: string | null }>;
}

export interface VoucherEntryAssistAccount {
  account_id: number;
  account_number: string;
  name: string;
  group_name: string;
  nature: string;
  normal_balance: string;
  is_cash_or_bank: boolean;
  enable_bill_wise: boolean;
  /** Signed in the account's normal direction: negative means the opposite side. */
  balance: string;
  projected_balance: string;
  times_used_last_year: number;
  average_amount: string | null;
  last_used_date: string | null;
  unusual_amount: boolean;
}

export interface VoucherEntryAssistResponse {
  fiscal_year: FiscalYearInfo;
  current_fiscal_year: FiscalYearInfo;
  accounts: VoucherEntryAssistAccount[];
  suggested_accounts: Array<{
    account_id: number;
    account_number: string;
    name: string;
    side: "DEBIT" | "CREDIT";
    times_used: number;
  }>;
  recent_narrations: string[];
  similar_posted_vouchers: Array<{ id: number; voucher_number: string }>;
  warnings: Array<{ level: "info" | "warning" | "danger"; message: string }>;
  history_voucher_count: number;
}

export interface VoucherNarrationSuggestion {
  narration: string;
  source: "ai" | "template";
}

/** cumulative = since inception (original); fy = Income/Expense for this financial year only. */
export type ReportBasis = "cumulative" | "fy";

export interface TrialBalanceResponse {
  as_of_date?: string;
  rows: Array<{
    /** 0 for the computed "Profit & Loss brought forward" row (basis=fy). */
    account_id: number;
    account_number: string;
    account_name: string;
    group_name: string;
    nature: string;
    debit: number;
    credit: number;
    is_computed?: boolean;
  }>;
  total_debit: number;
  total_credit: number;
  basis?: ReportBasis;
  fiscal_year?: FiscalYearInfo;
  profit_brought_forward?: number | null;
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
  basis?: ReportBasis;
  fiscal_year?: FiscalYearInfo;
  profit_brought_forward?: number | null;
}

/** Purchase requisition (procurement module, flag procurement_cs_enabled). */
export type RequisitionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CS_SELECTED" | "PO_CREATED" | "CANCELLED";

export interface RequisitionSummary {
  id: number;
  pr_code: string;
  department: string | null;
  purpose: string | null;
  required_date: string | null;
  status: RequisitionStatus;
  requested_by: number | null;
  approved_by: number | null;
  approved_at: string | null;
  selected_quotation_id: number | null;
  selection_reason: string | null;
  selected_at: string | null;
  purchase_order_id: number | null;
  created_at: string | null;
}

export interface RequisitionDetail extends RequisitionSummary {
  lines: { id: number; item_id: number; warehouse_id: number | null; quantity: number; estimated_unit_price: number | null; notes: string | null }[];
  quotations: {
    id: number;
    vendor_id: number;
    vendor_name: string | null;
    quote_ref: string | null;
    quote_date: string | null;
    valid_until: string | null;
    currency: string | null;
    delivery_days: number | null;
    payment_terms: string | null;
    notes: string | null;
    prices: { requisition_line_id: number; unit_price: number }[];
  }[];
  history: DocumentHistoryEvent[];
}

export interface RequisitionInput {
  department?: string | null;
  purpose?: string | null;
  required_date?: string | null;
  lines: { item_id: number; warehouse_id?: number | null; quantity: string; estimated_unit_price?: string | null; notes?: string | null }[];
}

export interface SupplierQuotationInput {
  vendor_id: number;
  quote_ref?: string | null;
  quote_date?: string | null;
  valid_until?: string | null;
  currency?: string | null;
  delivery_days?: number | null;
  payment_terms?: string | null;
  notes?: string | null;
  lines: { requisition_line_id: number; unit_price: string }[];
}

export interface ComparativeStatement {
  requisition_id: number;
  pr_code: string;
  status: RequisitionStatus;
  rows: {
    line_id: number;
    item_id: number;
    item_code: string | null;
    item_name: string;
    quantity: number;
    estimated_unit_price: number | null;
    prices: { quotation_id: number; unit_price: number; amount: number; is_lowest: boolean }[];
  }[];
  quotations: {
    quotation_id: number;
    vendor_id: number;
    vendor_name: string;
    vendor_code: string | null;
    quote_ref: string | null;
    quote_date: string | null;
    valid_until: string | null;
    currency: string | null;
    delivery_days: number | null;
    payment_terms: string | null;
    notes: string | null;
    total: number;
    lines_quoted: number;
    is_complete: boolean;
    rank: number | null;
  }[];
  lowest_quotation_id: number | null;
  selected_quotation_id: number | null;
  selection_reason: string | null;
  mixed_currency: boolean;
}

/** Generic document history row (PO, requisition, ...) from app/common/document_history.py. */
export interface DocumentHistoryEvent {
  id: number;
  event: string;
  at: string | null;
  user_id: number | null;
  username: string | null;
  summary: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  extra: Record<string, unknown> | null;
}

export interface VoucherHistoryEvent {
  id: number;
  /** created | updated | status | cancel_posting | reversed | deleted */
  event: string;
  at: string | null;
  user_id: number | null;
  username: string | null;
  summary: string | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  changes: Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }> | null;
}

export interface VoucherHistoryResponse {
  voucher_id: number;
  events: VoucherHistoryEvent[];
}

export type ExceptionCheckKey = "grn_not_billed" | "challan_not_invoiced" | "negative_cash_bank" | "negative_stock" | "overdue_bills";

export interface ExceptionSummaryResponse {
  as_of_date: string;
  /** null = that check failed on the server (logged); other checks still return. */
  counts: Record<ExceptionCheckKey, number | null>;
}

export interface ExceptionList<T> {
  rows: T[];
  total: number;
  as_of_date?: string;
}

export interface ExceptionGrnRow {
  grn_id: number;
  grn_code: string;
  received_date: string | null;
  days_waiting: number | null;
  vendor_name: string | null;
  purchase_order_id: number | null;
  po_code: string | null;
  supplier_invoice_no: string | null;
}

export interface ExceptionChallanRow {
  challan_id: number;
  challan_code: string;
  customer_name: string;
  delivery_date: string | null;
  days_waiting: number | null;
}

export interface ExceptionNegativeLedgerRow {
  account_id: number;
  account_number: string;
  account_name: string;
  group_name: string;
  balance: number;
}

export interface ExceptionNegativeStockRow {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  on_hand: number;
}

export interface ExceptionOverdueBillRow {
  source: "OUTSTANDING_BILL" | "BILL_REFERENCE";
  id: number;
  bill_number: string;
  party_name: string;
  bill_type: string;
  due_date: string | null;
  days_overdue: number | null;
  amount_due: number;
  source_voucher_id: number | null;
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

/** Sprint 6 MIS reports */
export interface MisRatioItem {
  name: string;
  label: string;
  category: string;
  value: number | null;
  benchmark: number | null;
  status: string;
  formula: string;
}

export interface MisRatioAnalysisResponse {
  as_of_date: string;
  prior_date: string;
  ratios: MisRatioItem[];
  by_category: Record<string, MisRatioItem[]>;
  snapshot: Record<string, number>;
}

export interface MisRatioTrendResponse {
  ratio_name: string;
  months: number;
  points: Array<{ date: string; value: number | null }>;
}

export interface FundFlowLineItem {
  item: string;
  amount: number;
  percent_of_total: number;
}

export interface FundFlowResponse {
  from_date: string;
  to_date: string;
  sources: FundFlowLineItem[];
  total_sources: number;
  applications: FundFlowLineItem[];
  total_application: number;
  net_change: number;
}

export interface ComparativeStatementRow {
  particulars: string;
  year1: number;
  year2: number;
  absolute_change: number;
  percent_change: number;
  significant: boolean;
}

export interface ComparativeStatementResponse {
  statement: string;
  year1: number;
  year2: number;
  rows: ComparativeStatementRow[];
  significant_count: number;
}

export interface CashScenarioItem {
  name: string;
  monthly_inflow: number;
  monthly_outflow: number;
  net_monthly: number;
  ending_cash_12m: number;
  runway_months: number | null;
  runway_label: string;
}

export interface CashScenarioAnalysisResponse {
  as_of: string;
  current_cash: number;
  baseline: Record<string, number>;
  scenarios: CashScenarioItem[];
  narrative: string;
}

export interface CashSensitivityResponse {
  variable: string;
  change_percent: number;
  baseline: CashScenarioItem;
  adjusted: {
    monthly_inflow: number;
    monthly_outflow: number;
    net_monthly: number;
    runway_months: number | null;
    ending_cash_12m: number;
  };
}

export interface CashBreakEvenResponse {
  monthly_fixed_costs_est: number;
  contribution_margin_ratio: number;
  break_even_monthly_revenue: number | null;
  current_monthly_revenue_est: number;
  gap: number | null;
  snapshot_expense: number;
}

export interface CashRunwayResponse {
  current_cash: number;
  net_monthly: number;
  runway_months: number | null;
  runway_label: string;
  narrative: string;
}

export interface MisHealthResponse {
  enabled: boolean;
  net_profit?: number;
  current_ratio?: MisRatioItem;
  cash?: number;
  ar?: number;
  receivables_turnover?: MisRatioItem;
  runway_months?: number | null;
  links?: Record<string, string>;
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

export interface PartyLedgerResponse {
  id: number;
  party_type: "CUSTOMER" | "VENDOR" | string;
  customer_id: number | null;
  vendor_id: number | null;
  party_name: string;
  ledger_account_id: number;
  ledger_account_name: string | null;
  ledger_account_number: string | null;
  credit_limit: string | null;
  credit_days: number | null;
  interest_rate_monthly: string | null;
  opening_balance: string;
  opening_balance_type: string;
  opening_balance_date: string | null;
  current_balance: string;
  current_balance_type: string;
  total_dr_amount: string;
  total_cr_amount: string;
  available_credit: string | null;
  overdue_amount: string;
  bill_wise_tracking: boolean;
  is_active: boolean;
  tds_section_id?: number | null;
  bill_summary?: Record<string, number>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PartyLedgerListResponse {
  items: PartyLedgerResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface PartyLedgerCreate {
  party_type: "CUSTOMER" | "VENDOR";
  customer_id?: number | null;
  vendor_id?: number | null;
  ledger_account_id?: number | null;
  credit_limit?: string | number | null;
  credit_days?: number;
  interest_rate_monthly?: string | number | null;
  opening_balance?: string | number;
  opening_balance_type?: "DR" | "CR";
  opening_balance_date?: string | null;
  bill_wise_tracking?: boolean;
}

export interface TaxLedgerResponse {
  id: number;
  tenant_id: number;
  chart_account_id: number;
  tax_type: string;
  tax_rate: string;
  gst_type: string;
  nature_of_transaction: string | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
}

export interface TaxLedgerCreate {
  chart_account_id: number;
  tax_type: string;
  tax_rate: string | number;
  gst_type?: string;
  nature_of_transaction?: string | null;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface TaxLedgerUpdate {
  chart_account_id?: number | null;
  nature_of_transaction?: string | null;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface TaxPreviewRequest {
  taxable_lines: { taxable_amount: string | number; gst_rate: string | number; hsn_code?: string | null }[];
  place_of_supply_state?: string | null;
  direction?: "OUTWARD" | "INWARD";
  is_union_territory?: boolean;
}

export interface TaxPreviewResponse {
  supply_kind?: string;
  direction?: string;
  taxable_total?: string;
  tax_total?: string;
  grand_total?: string;
  lines?: {
    tax_type: string;
    tax_rate: string;
    taxable_amount: string;
    tax_amount: string;
    hsn_code?: string | null;
    tax_ledger_id?: number | null;
  }[];
  missing_tax_ledgers?: string[];
  warnings?: string[];
  applied?: boolean;
  [key: string]: unknown;
}

export interface VoucherTaxLineResponse {
  id: number;
  voucher_id: number;
  tax_ledger_id: number;
  taxable_amount: string;
  tax_amount: string;
  tax_rate_applied: string;
  hsn_code: string | null;
  is_itc_eligible: boolean;
  direction: string;
  tax_type?: string | null;
}

export interface GstSettings {
  registration_type?: "Regular" | "Composition" | "SEZ" | string | null;
  gstin?: string | null;
  state_code?: string | null;
  state?: string | null;
  default_place_of_supply?: string | null;
  is_union_territory?: boolean;
  default_gst_rate?: string | null;
  reverse_charge_enabled?: boolean;
}

export interface PtSlabRow {
  from: number;
  to: number | null;
  amount: number;
}

export interface PayrollStatutoryConfigResponse {
  id: number;
  pf_employee_rate: string;
  pf_employer_rate: string;
  esi_employee_rate: string;
  esi_employer_rate: string;
  pf_wage_ceiling: string;
  esi_wage_ceiling: string;
  pt_state: string | null;
  pt_slabs: PtSlabRow[];
  gratuity_days_per_year: string;
  is_active: boolean;
}

export interface PayrollStatutoryConfigBody {
  pf_employee_rate?: string | number;
  pf_employer_rate?: string | number;
  esi_employee_rate?: string | number;
  esi_employer_rate?: string | number;
  pf_wage_ceiling?: string | number;
  esi_wage_ceiling?: string | number;
  pt_state?: string | null;
  pt_slabs?: PtSlabRow[];
  gratuity_days_per_year?: string | number;
  is_active?: boolean;
}

export interface PayrollStatutoryPreviewBody {
  basic_salary: string | number;
  gross_salary: string | number;
  years_of_service?: string | number | null;
}

export interface PayrollStatutoryPreviewResponse {
  pf: Record<string, string>;
  esi: Record<string, string>;
  pt_amount: string;
  pt_state: string | null;
  gratuity: string;
  employee_statutory_deductions: string;
  employer_contributions: string;
}

export interface TdsSectionResponse {
  id: number;
  section_code: string;
  description: string | null;
  threshold_amount: string;
  tds_rate: string;
  rate_company: string | null;
  rate_non_company: string | null;
  is_active: boolean;
}

export interface TdsSectionsListResponse {
  rows: TdsSectionResponse[];
}

export interface TdsSectionBody {
  section_code: string;
  description?: string | null;
  threshold_amount?: string | number;
  tds_rate?: string | number;
  rate_company?: string | number | null;
  rate_non_company?: string | number | null;
  is_active?: boolean;
}

export interface TdsSettingsResponse {
  tds_payable_account_id: number | null;
}

export interface TdsSettingsBody {
  tds_payable_account_id?: number | null;
}

export interface TdsCalcBody {
  party_ledger_id: number;
  payment_amount: string | number;
  section_code?: string | null;
  is_company?: boolean;
}

export interface TdsCalcResponse {
  party_ledger_id: number;
  tds_section_id?: number | null;
  section_code: string | null;
  threshold_amount?: string;
  tds_rate?: string;
  taxable_amount: string;
  tds_amount: string;
  net_payment: string;
  applicable: boolean;
  message?: string;
}

export interface TdsDeductionResponse {
  id: number;
  party_ledger_id: number;
  voucher_id: number | null;
  tds_section_id: number;
  taxable_amount: string;
  tds_amount: string;
  net_payment: string | null;
  tds_liability_voucher_id: number | null;
  certificate_number: string | null;
  certificate_date: string | null;
  status: string;
  deduction_date: string | null;
}

export interface TdsDeductionsListResponse {
  rows: TdsDeductionResponse[];
}

export interface TdsReturnLine {
  deduction_id: number;
  deduction_date: string | null;
  section_code: string;
  party_ledger_id: number;
  party_type: string;
  taxable_amount: string;
  tds_amount: string;
  status: string;
  certificate_number: string | null;
  voucher_id: number | null;
}

export interface TdsReturnResponse {
  form: string;
  year: number;
  quarter: number;
  from_date: string;
  to_date: string;
  rows: TdsReturnLine[];
  summary: {
    count: number;
    total_taxable: string;
    total_tds: string;
    pending_count: number;
    deposited_count: number;
  };
}

export interface TdsReturnExportResponse extends TdsReturnResponse {
  format: string;
  filename: string;
}

export interface AdvancedVoucherFeatureFlags {
  credit_debit_note_enabled: boolean;
  stock_transfer_voucher_enabled: boolean;
  memorandum_voucher_enabled: boolean;
  optional_voucher_enabled: boolean;
  post_dated_voucher_enabled: boolean;
  recurring_voucher_enabled: boolean;
  voucher_class_enabled: boolean;
}

export interface AdvancedVoucherTypeRow {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  is_system?: boolean;
  is_credit_note: boolean;
  is_debit_note: boolean;
  is_memorandum: boolean;
  is_optional: boolean;
  is_post_dated: boolean;
  is_stock_transfer: boolean;
  voucher_class_id: number | null;
}

export interface AdvancedVoucherTypesResponse {
  rows: AdvancedVoucherTypeRow[];
  feature_flags: AdvancedVoucherFeatureFlags;
}

export interface VoucherClassLineTemplate {
  account_id: number;
  entry_type: "DEBIT" | "CREDIT";
  amount: string | number;
  notes?: string | null;
}

export interface VoucherClassBody {
  name: string;
  voucher_type: string;
  default_ledger_id?: number | null;
  default_narration?: string | null;
  default_cost_center_id?: number | null;
  line_templates?: VoucherClassLineTemplate[];
  auto_tax?: boolean;
  auto_round_off?: boolean;
  auto_bill_allocation?: boolean;
  is_active?: boolean;
}

export interface VoucherClassResponse extends VoucherClassBody {
  id: number;
  line_templates: VoucherClassLineTemplate[];
  auto_tax: boolean;
  auto_round_off: boolean;
  auto_bill_allocation: boolean;
  is_active: boolean;
}

export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface RecurringVoucherBody {
  name: string;
  voucher_type: string;
  voucher_class_id?: number | null;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  next_due_date?: string | null;
  voucher_template: Record<string, unknown>;
  generate_as_status?: "DRAFT" | "POSTED";
  is_active?: boolean;
}

export interface RecurringVoucherResponse extends RecurringVoucherBody {
  id: number;
  last_generated_date: string | null;
  is_active: boolean;
  generate_as_status: "DRAFT" | "POSTED";
}

export interface RecurringVoucherHistoryRow {
  id: number;
  voucher_number: string;
  voucher_date: string;
  status: string;
  description: string | null;
}

export interface PostDatedRegisterRow {
  id: number;
  voucher_number: string;
  voucher_date: string;
  voucher_type: string;
  status: string;
  description: string | null;
  amount: string;
  days_until_active: number;
}

export interface MemorandumRegisterRow {
  id: number;
  voucher_number: string;
  voucher_date: string;
  status: string;
  description: string | null;
  voucher_type: string;
}

export interface CreditDebitNoteBody {
  voucher_date: string;
  description?: string;
  party_ledger_id: number;
  original_bill_id: number;
  amount: string | number;
  revenue_or_purchase_account_id: number;
  party_account_id?: number | null;
  tax_account_id?: number | null;
  tax_amount?: string | number;
  currency?: string;
  post?: boolean;
}

export interface CreditDebitNoteResult {
  id: number;
  voucher_number: string;
  voucher_type: string;
  status: string;
  original_party_bill_id: number | null;
}

export interface FinanceStockTransferVoucherBody {
  from_godown_id: number;
  to_godown_id: number;
  items: { stock_item_id: number; qty: string | number; batch_id?: number | null }[];
  notes?: string | null;
  auto_fifo?: boolean;
}

export interface GstReturnPayload {
  period_from?: string;
  period_to?: string;
  supplies?: Record<string, unknown>[];
  lines?: Record<string, unknown>[];
  summary?: Record<string, unknown>;
  validations?: string[];
  outward_tax?: string;
  inward_itc?: string;
  net_tax_payable?: string;
  [key: string]: unknown;
}

export interface PartyLedgerBillResponse {
  id: number;
  party_ledger_id: number;
  bill_number: string;
  bill_date: string | null;
  bill_type: string;
  original_amount: string;
  amount_type: string;
  pending_amount: string;
  settled_amount: string;
  status: string;
  due_date: string | null;
  days_overdue: number | null;
  interest_accrued: string;
  narration: string | null;
  voucher_id: number | null;
  commercial_invoice_id?: number | null;
  vendor_bill_id?: number | null;
  allocations?: PartyLedgerAllocationResponse[];
}

export interface PartyLedgerAllocationResponse {
  id: number;
  bill_id: number;
  voucher_id: number;
  allocated_amount: string;
  allocated_date: string | null;
  bill_balance_after: string;
  notes: string | null;
  bill_number?: string | null;
  voucher_number?: string | null;
}

export interface PartyLedgerStatementResponse {
  party_ledger_id: number;
  party_name: string;
  party_type: string;
  from_date: string;
  to_date: string;
  opening_balance: string;
  opening_balance_type: string;
  transactions: Array<{
    date: string;
    bill_number: string;
    bill_type: string;
    narration: string;
    debit: string;
    credit: string;
    balance: string;
    balance_type: string;
  }>;
  closing_balance: string;
  closing_balance_type: string;
}

export interface PartyLedgerAgingResponse {
  as_of_date: string;
  parties: Array<{
    party_ledger_id: number;
    party_name: string;
    party_type: string;
    current_balance: string;
    balance_type: string;
    not_due: string;
    days_1_30: string;
    days_31_60: string;
    days_61_90: string;
    days_91_plus: string;
    total_overdue: string;
  }>;
  grand_total: Record<string, string>;
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
  signatories?: DocumentSignatory[];
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

export interface ExportCaseCreate {
  reference: string;
  status?: string | null;
  case_date?: string | null;
  amount?: number | null;
  trade_case_id?: number | null;
  order_id?: number | null;
  export_license_number?: string | null;
  destination_country?: string | null;
  shipping_mode?: string | null;
  incoterms?: string | null;
  expected_shipment_date?: string | null;
  actual_shipment_date?: string | null;
  customs_agent?: string | null;
}

export interface ExportCaseUpdate {
  reference?: string | null;
  status?: string | null;
  case_date?: string | null;
  amount?: number | null;
  trade_case_id?: number | null;
  order_id?: number | null;
  export_license_number?: string | null;
  destination_country?: string | null;
  shipping_mode?: string | null;
  incoterms?: string | null;
  expected_shipment_date?: string | null;
  actual_shipment_date?: string | null;
  customs_agent?: string | null;
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

export interface ProformaReceiptAllocationRow {
  id: number;
  proforma_invoice_id: number;
  voucher_id: number;
  order_id?: number | null;
  allocated_amount: number;
  allocated_base_amount: number;
  currency?: string | null;
  exchange_rate_to_base?: number | null;
  status: string;
  idempotency_key?: string | null;
  voucher_number?: string | null;
  voucher_status?: string | null;
  created_at: string;
}

export interface ProformaPaymentSummary {
  pi_id: number;
  pi_amount: number;
  currency?: string | null;
  paid_active: number;
  paid_posted: number;
  outstanding_for_new: number;
  outstanding_posted: number;
  allocations: ProformaReceiptAllocationRow[];
}

export interface ProformaCreateReceiptBody {
  amount: number;
  receipt_date?: string | null;
  bank_ledger_id: number;
  receivable_ledger_id: number;
  currency?: string | null;
  exchange_rate_to_base: number;
  idempotency_key: string;
}

export interface ProformaCreateReceiptResponse {
  voucher_id: number;
  voucher_number?: string | null;
  allocation_id: number;
  remaining_balance: number;
  paid_so_far: number;
  pi_amount: number;
  was_created: boolean;
}

export interface CommercialInvoiceLineRow {
  id: number;
  order_id: number;
  order_code?: string | null;
  item_id?: number | null;
  delivery_challan_item_id?: number | null;
  description?: string | null;
  quantity: number;
  unit_price: number;
  line_amount: number;
  currency?: string | null;
  price_source: string;
  price_source_ref?: Record<string, unknown> | unknown[] | null;
  sort_order: number;
}

export interface CommercialInvoiceRow {
  id: number;
  invoice_code: string;
  status: string;
  customer_id: number;
  customer_name?: string | null;
  source_delivery_challan_id?: number | null;
  challan_code?: string | null;
  primary_order_id?: number | null;
  primary_order_code?: string | null;
  invoice_date?: string | null;
  currency?: string | null;
  exchange_rate_to_base?: number | null;
  total_amount: number;
  base_total_amount: number;
  ar_voucher_id?: number | null;
  price_review_required: boolean;
  notes?: string | null;
  lines: CommercialInvoiceLineRow[];
  issued_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommercialInvoiceListResponse {
  items: CommercialInvoiceRow[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CommercialInvoiceFromChallanBody {
  idempotency_key: string;
  exchange_rate_to_base?: number;
  confirm_quotation_fallback?: boolean;
  allow_split?: boolean;
  invoice_date?: string | null;
}

export interface CommercialInvoiceFromChallanResponse {
  invoices: CommercialInvoiceRow[];
  was_created: boolean;
}

export interface CommercialInvoicePaymentSummary {
  invoice_id: number;
  invoice_amount: number;
  currency?: string | null;
  paid_active: number;
  paid_posted: number;
  outstanding_for_new: number;
  outstanding_posted: number;
  allocations: Array<{
    id: number;
    commercial_invoice_id: number;
    voucher_id: number;
    order_id?: number | null;
    allocated_amount: number;
    allocated_base_amount: number;
    currency?: string | null;
    exchange_rate_to_base?: number | null;
    status: string;
    voucher_number?: string | null;
    voucher_status?: string | null;
    created_at: string;
  }>;
}

export interface CommercialInvoiceCreateReceiptResponse {
  voucher_id: number;
  voucher_number?: string | null;
  allocation_id: number;
  remaining_balance: number;
  paid_so_far: number;
  invoice_amount: number;
  was_created: boolean;
}

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

export interface PackingListRow {
  id: number;
  tenant_id: number;
  packing_list_number: string;
  shipment_id?: number | null;
  shipment_reference?: string | null;
  order_id?: number | null;
  order_code?: string | null;
  delivery_challan_id?: number | null;
  challan_code?: string | null;
  packing_date?: string | null;
  total_cartons: number;
  gross_weight?: number | null;
  net_weight?: number | null;
  gross_weight_kg?: number | null;
  net_weight_kg?: number | null;
  status: string;
  notes?: string | null;
  container_count?: number;
  containers?: ShipmentContainerRow[];
  created_at: string;
  updated_at: string;
}

export interface PackingListCreate {
  packing_list_number?: string | null;
  shipment_id?: number | null;
  order_id?: number | null;
  delivery_challan_id?: number | null;
  packing_date?: string | null;
  total_cartons?: number;
  gross_weight?: number | null;
  net_weight?: number | null;
  gross_weight_kg?: number | null;
  net_weight_kg?: number | null;
  status?: string | null;
  notes?: string | null;
}

export type PackingListUpdate = Partial<PackingListCreate>;

export interface PackingListContainerCreate {
  container_number: string;
  container_type?: string | null;
  seal_number?: string | null;
  tare_weight_kg?: number | null;
  max_weight_kg?: number | null;
  loading_status?: string | null;
  notes?: string | null;
}

export interface ShipmentContainerRow {
  id: number;
  tenant_id: number;
  shipment_id: number;
  packing_list_id?: number | null;
  container_number: string;
  container_type?: string | null;
  seal_number?: string | null;
  tare_weight_kg?: number | null;
  max_weight_kg?: number | null;
  remaining_capacity_kg?: number | null;
  loading_status: string;
  loaded_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentContainerCreate {
  shipment_id: number;
  packing_list_id?: number | null;
  container_number: string;
  container_type?: string | null;
  seal_number?: string | null;
  tare_weight_kg?: number | null;
  max_weight_kg?: number | null;
  loading_status?: string | null;
  notes?: string | null;
}

export type ShipmentContainerUpdate = Partial<Omit<ShipmentContainerCreate, "shipment_id">>;

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
