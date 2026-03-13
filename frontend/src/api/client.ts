const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export type TenantType = "manufacturer" | "buying_house" | "both";
export type CommissionMode = "INCLUDE" | "EXCLUDE";

export interface MeResponse {
  user_id: number;
  tenant_id: number;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  tenant_name: string;
  tenant_type: TenantType;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  tenant_id?: number; // Set by backend when logging in so we can set X-Tenant-Id
}

export interface TenantResponse {
  id: number;
  name: string;
  domain: string | null;
  tenant_type: TenantType;
  company_code: string | null;
  is_active: boolean;
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
}

export interface SettingsConfigUpdate {
  company_name: string;
  domain?: string | null;
  logo?: string | null;
  tenant_type: TenantType;
  default_commission_mode?: CommissionMode | null;
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
  reporting_manager_id?: number | null;
  user_id?: number | null;
  joining_date?: string | null;
  is_active?: boolean;
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
  note: string | null;
}

export interface HrRosterEntryCreate {
  employee_id: number;
  roster_date: string;
  shift_id?: number | null;
  note?: string | null;
}

export interface HrAttendanceEntryResponse {
  id: number;
  employee_id: number;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  note: string | null;
}

export interface HrAttendanceEntryCreate {
  employee_id: number;
  attendance_date: string;
  check_in?: string | null;
  check_out?: string | null;
  status: string;
  note?: string | null;
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
  annual_quota: number;
  is_paid: boolean;
  is_active: boolean;
}

export interface HrLeaveTypeCreate {
  code: string;
  name: string;
  annual_quota: number;
  is_paid?: boolean;
  is_active?: boolean;
}

export interface HrLeaveBalanceResponse {
  id: number;
  employee_id: number;
  leave_type_id: number;
  year: number;
  allocated: number;
  consumed: number;
  remaining: number;
}

export interface HrLeaveRequestResponse {
  id: number;
  employee_id: number;
  leave_type_id: number;
  from_date: string;
  to_date: string;
  total_days: number;
  reason: string | null;
  status: string;
}

export interface HrLeaveRequestCreate {
  employee_id: number;
  leave_type_id: number;
  from_date: string;
  to_date: string;
  reason?: string | null;
}

export interface HrPayrollPeriodResponse {
  id: number;
  code: string;
  period_start: string;
  period_end: string;
  status: string;
}

export interface HrPayrollPeriodCreate {
  code: string;
  period_start: string;
  period_end: string;
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
  payroll_period_id: number;
  run_code: string;
  run_date: string;
  status: string;
  total_employees: number;
  net_payable: number;
}

export interface HrPayrollRunCreate {
  payroll_period_id: number;
  run_code: string;
  run_date: string;
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
  req_code: string;
  title: string;
  department_id: number | null;
  openings: number;
  status: string;
}

export interface HrJobRequisitionCreate {
  req_code: string;
  title: string;
  department_id?: number | null;
  openings: number;
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

export class ApiError extends Error {
  status: number;
  requestId: string | null;
  constructor(message: string, status: number, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { tenantId?: number | null } = {}
): Promise<T> {
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
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: string | { msg?: string }[]; message?: string };
    const d = raw.detail;
    const message = typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? d[0].msg : raw.message ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
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
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
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

export interface AiChatResponse {
  session: AiSessionResponse;
  user_message: AiMessageResponse;
  assistant_message: AiMessageResponse;
  detected_intent: AiIntent;
  confidence: number;
  request_id: string;
  tool_results: AiToolInvocationResult[];
  blocked: boolean;
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
  events: Record<string, unknown>[];
  persisted_event_ids: number[];
  logic_version: string;
  scheduler_ready: boolean;
}

export interface AiOpsOverviewResponse {
  period_hours: number;
  total_events: number;
  blocked_events: number;
  error_events: number;
  avg_duration_ms: number;
  tool_success_rate: number;
}

export const api = {
  /** Reference-style: companyCode + username + password. Or tenant_id + email + password. */
  async login(params: {
    company_code?: string;
    tenant_id?: number;
    username?: string;
    email?: string;
    password: string;
  }): Promise<TokenResponse> {
    const { company_code, tenant_id, username, email, password } = params;
    // Send only non-empty fields so backend accepts company_code + username + password (no 422)
    const body: Record<string, unknown> = { password };
    if (company_code?.trim()) body.company_code = company_code.trim();
    if (tenant_id != null && Number.isFinite(tenant_id)) body.tenant_id = tenant_id;
    if (username?.trim()) body.username = username.trim();
    if (email?.trim()) body.email = email.trim();
    const res = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      tenantId: tenant_id ?? undefined,
    });
    return res;
  },
  async me(): Promise<MeResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<MeResponse>("/api/v1/auth/me", { tenantId: Number(tid) });
  },
  async register(data: {
    tenant_id: number;
    email: string;
    username: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }): Promise<unknown> {
    return request("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) });
  },
  async createTenant(data: {
    name: string;
    tenant_type: TenantType;
  }): Promise<TenantResponse> {
    return request<TenantResponse>("/api/v1/tenants", { method: "POST", body: JSON.stringify(data) });
  },
  async getTenantMe(): Promise<TenantResponse> {
    const tid = getTenantId();
    if (!tid) throw new Error("No tenant");
    return request<TenantResponse>("/api/v1/tenants/me", { tenantId: Number(tid) });
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
  async aiListForecastRuns(params?: { limit?: number }): Promise<AiForecastRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.limit != null) q.set("limit", String(params.limit));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<AiForecastRunResponse[]>(`/api/v1/ai-tool/forecast-runs${suffix}`);
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
  // Settings module
  async getSettingsConfig(): Promise<SettingsConfigResponse> {
    return request<SettingsConfigResponse>("/api/v1/settings/config");
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
  async listCustomers(): Promise<CustomerResponse[]> {
    return request<CustomerResponse[]>("/api/v1/customers");
  },
  async listCustomersPaginated(params?: {
    q?: string;
    status?: string;
    country?: string;
    customer_type?: string;
    page?: number;
    page_size?: number;
  }): Promise<CustomerListPageResponse> {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.status) q.set("status", params.status);
    if (params?.country) q.set("country", params.country);
    if (params?.customer_type) q.set("customer_type", params.customer_type);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.page_size != null) q.set("page_size", String(params.page_size));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CustomerListPageResponse>(`/api/v1/customers/paginated${suffix}`);
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
  async listHrRosterEntries(params?: { from_date?: string; to_date?: string; employee_id?: number }): Promise<HrRosterEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
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
  async listHrAttendanceEntries(params?: {
    from_date?: string;
    to_date?: string;
    employee_id?: number;
  }): Promise<HrAttendanceEntryResponse[]> {
    const q = new URLSearchParams();
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceEntryResponse[]>(`/api/v1/hr/attendance/entries${suffix}`);
  },
  async createHrAttendanceEntry(data: HrAttendanceEntryCreate): Promise<HrAttendanceEntryResponse> {
    return request<HrAttendanceEntryResponse>("/api/v1/hr/attendance/entries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async listHrAttendanceSummary(params?: { month?: string; department_id?: number }): Promise<HrAttendanceSummaryRow[]> {
    const q = new URLSearchParams();
    if (params?.month) q.set("month", params.month);
    if (params?.department_id != null) q.set("department_id", String(params.department_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrAttendanceSummaryRow[]>(`/api/v1/hr/attendance/summary${suffix}`);
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
  async listHrLeaveBalances(params?: { year?: number; employee_id?: number }): Promise<HrLeaveBalanceResponse[]> {
    const q = new URLSearchParams();
    if (params?.year != null) q.set("year", String(params.year));
    if (params?.employee_id != null) q.set("employee_id", String(params.employee_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<HrLeaveBalanceResponse[]>(`/api/v1/hr/leave/balances${suffix}`);
  },
  async listHrLeaveRequests(params?: { status?: string; employee_id?: number }): Promise<HrLeaveRequestResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
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
  async decideHrLeaveRequest(id: number, decision: "approved" | "rejected", note?: string): Promise<HrLeaveRequestResponse> {
    const actionPath = decision === "approved" ? "approve" : "reject";
    return request<HrLeaveRequestResponse>(`/api/v1/hr/leave/requests/${id}/${actionPath}`, {
      method: "POST",
      body: JSON.stringify({ note }),
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
  async listHrPayrollRuns(params?: { period_id?: number; status?: string }): Promise<HrPayrollRunResponse[]> {
    const q = new URLSearchParams();
    if (params?.period_id != null) q.set("period_id", String(params.period_id));
    if (params?.status) q.set("status", params.status);
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
  }): Promise<InquiryResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InquiryResponse[]>(`/api/v1/inquiries${suffix}`);
  },
  async getInquiry(id: number): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`);
  },
  async createInquiry(data: InquiryCreate): Promise<InquiryResponse> {
    return request<InquiryResponse>("/api/v1/inquiries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInquiry(id: number, data: InquiryUpdate): Promise<InquiryResponse> {
    return request<InquiryResponse>(`/api/v1/inquiries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
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
    limit?: number;
    offset?: number;
  }): Promise<QuotationResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<QuotationResponse[]>(`/api/v1/quotations${suffix}`);
  },
  async getQuotation(id: number): Promise<QuotationDetailResponse> {
    // Backend returns full detail (header + costing breakdown)
    return request<QuotationDetailResponse>(`/api/v1/quotations/${id}`);
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
    limit?: number;
    offset?: number;
  }): Promise<OrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.status) q.set("status", params.status);
    if (params?.created_from) q.set("created_from", params.created_from);
    if (params?.created_to) q.set("created_to", params.created_to);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<OrderResponse[]>(`/api/v1/orders${suffix}`);
  },
  async getOrder(id: number): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/${id}`);
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
  async updateOrderStatus(id: number, status: string): Promise<OrderResponse> {
    return request<OrderResponse>(`/api/v1/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
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
  async listCostingItems(params?: { category_id?: number }): Promise<CostingItemResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<CostingItemResponse[]>(`/api/v1/costing/items${suffix}`);
  },
  async listCurrencies(): Promise<CurrencyMasterResponse[]> {
    return request<CurrencyMasterResponse[]>("/api/v1/costing/currencies");
  },
  // Inventory module (legacy parity wave)
  async listInventoryItemCategories(): Promise<ItemCategoryResponse[]> {
    return request<ItemCategoryResponse[]>("/api/v1/inventory/item-categories");
  },
  async createInventoryItemCategory(data: ItemCategoryCreate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>("/api/v1/inventory/item-categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemCategory(id: number, data: ItemCategoryCreate): Promise<ItemCategoryResponse> {
    return request<ItemCategoryResponse>(`/api/v1/inventory/item-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemCategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-categories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemSubcategories(params?: { category_id?: number }): Promise<ItemSubcategoryResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ItemSubcategoryResponse[]>(`/api/v1/inventory/item-subcategories${suffix}`);
  },
  async createInventoryItemSubcategory(data: ItemSubcategoryCreate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>("/api/v1/inventory/item-subcategories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemSubcategory(id: number, data: ItemSubcategoryCreate): Promise<ItemSubcategoryResponse> {
    return request<ItemSubcategoryResponse>(`/api/v1/inventory/item-subcategories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemSubcategory(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-subcategories/${id}`, { method: "DELETE" });
  },
  async listInventoryItemUnits(): Promise<ItemUnitResponse[]> {
    return request<ItemUnitResponse[]>("/api/v1/inventory/item-units");
  },
  async createInventoryItemUnit(data: ItemUnitCreate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>("/api/v1/inventory/item-units", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItemUnit(id: number, data: ItemUnitCreate): Promise<ItemUnitResponse> {
    return request<ItemUnitResponse>(`/api/v1/inventory/item-units/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteInventoryItemUnit(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/item-units/${id}`, { method: "DELETE" });
  },
  async listInventoryItems(params?: { category_id?: number; subcategory_id?: number }): Promise<InventoryItemResponse[]> {
    const q = new URLSearchParams();
    if (params?.category_id != null) q.set("category_id", String(params.category_id));
    if (params?.subcategory_id != null) q.set("subcategory_id", String(params.subcategory_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<InventoryItemResponse[]>(`/api/v1/inventory/items${suffix}`);
  },
  async createInventoryItem(data: InventoryItemCreate): Promise<InventoryItemResponse> {
    return request<InventoryItemResponse>("/api/v1/inventory/items", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  async updateInventoryItem(id: number, data: InventoryItemCreate): Promise<InventoryItemResponse> {
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
  async updateWarehouse(id: number, data: WarehouseCreate): Promise<WarehouseResponse> {
    return request<WarehouseResponse>(`/api/v1/inventory/warehouses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteWarehouse(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/warehouses/${id}`, { method: "DELETE" });
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
  async updateStockGroup(id: number, data: StockGroupCreate): Promise<StockGroupResponse> {
    return request<StockGroupResponse>(`/api/v1/inventory/stock-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async deleteStockGroup(id: number): Promise<void> {
    return request<void>(`/api/v1/inventory/stock-groups/${id}`, { method: "DELETE" });
  },
  async listPurchaseOrders(params?: { status_filter?: string; date_from?: string; date_to?: string }): Promise<PurchaseOrderResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<PurchaseOrderResponse[]>(`/api/v1/inventory/purchase-orders${suffix}`);
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
  async listGoodsReceiving(params?: { status_filter?: string; date_from?: string; date_to?: string }): Promise<GoodsReceivingResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.date_from) q.set("date_from", params.date_from);
    if (params?.date_to) q.set("date_to", params.date_to);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<GoodsReceivingResponse[]>(`/api/v1/inventory/goods-receiving${suffix}`);
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
  async getStockSummary(): Promise<StockSummaryRow[]> {
    return request<StockSummaryRow[]>("/api/v1/inventory/stock-summary");
  },
  async getStockLedger(params?: { item_id?: number; warehouse_id?: number }): Promise<StockLedgerRow[]> {
    const q = new URLSearchParams();
    if (params?.item_id != null) q.set("item_id", String(params.item_id));
    if (params?.warehouse_id != null) q.set("warehouse_id", String(params.warehouse_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StockLedgerRow[]>(`/api/v1/inventory/stock-ledger${suffix}`);
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
  async listManufacturingOrders(): Promise<ManufacturingOrderResponse[]> {
    return request<ManufacturingOrderResponse[]>("/api/v1/inventory/manufacturing-orders");
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
  async listStyles(params?: { status?: string }): Promise<StyleResponse[]> {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<StyleResponse[]>(`/api/v1/merch/styles${suffix}`);
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
    return request<BomResponse[]>(`/api/v1/merch/boms${suffix}`);
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
  async listConsumptionPlans(params?: { order_id?: number }): Promise<ConsumptionPlanResponse[]> {
    const q = new URLSearchParams();
    if (params?.order_id != null) q.set("order_id", String(params.order_id));
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<ConsumptionPlanResponse[]>(`/api/v1/merch/consumption-plans${suffix}`);
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
    return request<FollowupResponse[]>(`/api/v1/merch/followups${suffix}`);
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
  async getMerchPipeline(): Promise<{ inquiries: number; quotations: number; orders: number }> {
    return request<{ inquiries: number; quotations: number; orders: number }>("/api/v1/merch/pipeline");
  },
  async getMerchCriticalAlerts(): Promise<MerchCriticalAlertsResponse> {
    return request<MerchCriticalAlertsResponse>("/api/v1/merch/critical-alerts");
  },
  async getConsumptionReconciliation(orderId: number): Promise<ConsumptionReconciliationResponse> {
    return request<ConsumptionReconciliationResponse>(`/api/v1/merch/consumption-reconciliation/${orderId}`);
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
  async listVouchers(params?: { status_filter?: string; from_date?: string; to_date?: string }): Promise<VoucherResponse[]> {
    const q = new URLSearchParams();
    if (params?.status_filter) q.set("status_filter", params.status_filter);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const suffix = q.toString() ? `?${q.toString()}` : "";
    return request<VoucherResponse[]>(`/api/v1/finance/vouchers${suffix}`);
  },
  async createVoucher(data: VoucherCreate): Promise<VoucherResponse> {
    return request<VoucherResponse>("/api/v1/finance/vouchers", {
      method: "POST",
      body: JSON.stringify(data),
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
  async reverseVoucher(id: number): Promise<VoucherResponse> {
    return request<VoucherResponse>(`/api/v1/finance/vouchers/${id}/reverse`, { method: "POST" });
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
  async generateCashForecastScenario(id: number): Promise<CashForecastScenarioResponse> {
    return request<CashForecastScenarioResponse>(`/api/v1/finance/cash-forecast/scenarios/${id}/generate`, {
      method: "POST",
    });
  },
  async getCashForecastSummary(): Promise<CashForecastSummaryResponse> {
    return request<CashForecastSummaryResponse>("/api/v1/finance/cash-forecast/summary");
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
  async getBudgetVsActual(budgetId: number): Promise<BudgetVsActualResponse> {
    return request<BudgetVsActualResponse>(`/api/v1/finance/budgets/${budgetId}/vs-actual`);
  },
  async getVoucherPrint(voucherId: number): Promise<VoucherPrintResponse> {
    return request<VoucherPrintResponse>(`/api/v1/finance/vouchers/${voucherId}/print`);
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
  async listProformaInvoices(): Promise<ProformaInvoiceRow[]> {
    return request<ProformaInvoiceRow[]>("/api/v1/commercial/proforma-invoices");
  },
  async listBtbLcs(): Promise<BtbLcRow[]> {
    return request<BtbLcRow[]>("/api/v1/commercial/btb-lcs");
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
  username: string;
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
  username: string;
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
  created_at: string;
  updated_at: string;
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
  customer_intermediary_id?: number | null;
  intermediary_name?: string | null;
  shipping_term?: string | null;
  commission_mode?: string | null;
  commission_type?: string | null;
  commission_value?: string | null;
  status: string;
  notes: string | null;
  items: InquiryItemResponse[];
  created_at: string;
  updated_at: string;
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
  customer_intermediary_id?: number;
  shipping_term?: string;
  commission_mode?: string;
  commission_type?: string;
  commission_value?: string;
  status?: string;
  notes?: string;
  items?: InquiryItemCreate[];
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
  version_no: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  category_code: string;
  name: string;
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
  subcategory_code: string;
  name: string;
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
  unit_code: string;
  name: string;
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
  default_cost: string;
  is_active: boolean;
}

export interface InventoryItemCreate {
  item_code: string;
  name: string;
  description?: string;
  category_id: number;
  subcategory_id?: number | null;
  unit_id: number;
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
  warehouse_code: string;
  name: string;
  address?: string;
  is_active?: boolean;
}

export interface StockGroupResponse {
  id: number;
  tenant_id: number;
  group_code: string;
  name: string;
  parent_id: number | null;
  is_active: boolean;
}

export interface StockGroupCreate {
  group_code: string;
  name: string;
  parent_id?: number | null;
  is_active?: boolean;
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

export interface PurchaseOrderCreate {
  po_code?: string;
  supplier_name: string;
  order_date?: string | null;
  expected_date?: string | null;
  notes?: string;
  status?: string;
  items: PurchaseOrderItemCreate[];
}

export interface PurchaseOrderResponse {
  id: number;
  tenant_id: number;
  po_code: string;
  supplier_name: string;
  order_date: string | null;
  expected_date: string | null;
  status: string;
  notes: string | null;
  items: PurchaseOrderItemResponse[];
}

export interface GoodsReceivingItemCreate {
  item_id: number;
  warehouse_id: number;
  quantity: string;
}

export interface GoodsReceivingItemResponse {
  id: number;
  goods_receiving_id: number;
  item_id: number;
  warehouse_id: number;
  quantity: string;
}

export interface GoodsReceivingCreate {
  grn_code?: string;
  purchase_order_id?: number | null;
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
  items: GoodsReceivingItemResponse[];
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
  remarks: string | null;
  created_at: string;
  updated_at: string;
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
  style_image_url?: string | null;
  buyer_customer_id: number | null;
  season: string | null;
  department: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StyleCreate {
  style_code?: string;
  name: string;
  style_image_url?: string | null;
  buyer_customer_id?: number | null;
  season?: string | null;
  department?: string | null;
  status?: string;
  notes?: string | null;
}

export interface StyleUpdate {
  style_code?: string;
  name?: string;
  style_image_url?: string | null;
  buyer_customer_id?: number | null;
  season?: string | null;
  department?: string | null;
  status?: string;
  notes?: string | null;
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
  category: string;
  item_code: string | null;
  description: string | null;
  uom: string | null;
  base_consumption: string;
  wastage_pct: string | null;
  created_at: string;
}

export interface BomItemCreate {
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

export interface MerchCriticalAlert {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  order_id?: number;
}

export interface MerchCriticalAlertsResponse {
  summary: {
    critical: number;
    warning: number;
    total: number;
  };
  alerts: MerchCriticalAlert[];
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
  item_code: string | null;
  planned_qty: number;
  actual_qty: number;
  variance: number;
  uom: string | null;
}

export interface ConsumptionReconciliationResponse {
  order_id: number;
  items: ConsumptionReconciliationRow[];
  summary: {
    total_planned: number;
    total_actual: number;
    variance: number;
  };
}

export interface AccountGroupCreate {
  name: string;
  code: string;
  parent_group_id?: number | null;
  nature: string;
  affects_gross_profit?: boolean;
  is_bank_group?: boolean;
  sort_order?: number;
  is_active?: boolean;
}

export interface AccountGroupResponse extends AccountGroupCreate {
  id: number;
  tenant_id: number;
}

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
}

export interface ChartOfAccountResponse extends ChartOfAccountCreate {
  id: number;
  tenant_id: number;
  balance: string;
}

export interface VoucherLineCreate {
  account_id: number;
  cost_center_id?: number | null;
  entry_type: "DEBIT" | "CREDIT";
  amount: string;
  notes?: string;
}

export interface VoucherCreate {
  voucher_number?: string;
  voucher_type: string;
  voucher_date: string;
  description?: string;
  reference?: string;
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
  created_by: number | null;
  lines: VoucherLineResponse[];
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
  reference?: string | null;
}

export interface PaymentRunCreate {
  run_code?: string;
  run_date: string;
  bank_account_id?: number | null;
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
  status: string;
  reference: string | null;
}

export interface PaymentRunResponse {
  id: number;
  tenant_id: number;
  run_code: string;
  run_date: string;
  bank_account_id: number | null;
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
    executed_voucher_id: number | null;
  };
  items: Array<{
    item_id: number;
    party_name: string;
    reference: string | null;
    amount: number;
    status: string;
  }>;
  totals: {
    item_count: number;
    total_amount: number;
  };
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
  };
  lines: Array<{
    line_id: number;
    account_id: number;
    account_name: string;
    entry_type: string;
    amount: number;
    notes: string | null;
  }>;
  totals: {
    debit_total: number;
    credit_total: number;
    is_balanced: boolean;
  };
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
  created_at?: string;
  [key: string]: unknown;
}

export interface ProformaInvoiceRow {
  id: number;
  reference?: string;
  invoice_number?: string;
  status?: string;
  invoice_date?: string | null;
  amount?: number | null;
  order_id?: number | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface BtbLcRow {
  id: number;
  reference?: string;
  lc_number?: string;
  status?: string;
  lc_date?: string | null;
  bank?: string | null;
  amount?: number | null;
  maturity_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
}
