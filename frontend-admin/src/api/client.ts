const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const KEY = "p7_platform_admin_token";

export function getAdminToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setAdminToken(t: string) {
  localStorage.setItem(KEY, t);
}

export function clearAdminToken() {
  localStorage.removeItem(KEY);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const tok = getAdminToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const tok = getAdminToken();
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = (err as { detail?: string | unknown }).detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? JSON.stringify(detail)
          : res.statusText;
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Download binary (backup file). */
export async function downloadBlob(path: string, filenameHint?: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let name = filenameHint || "download";
  if (cd) {
    const m = /filename="?([^";]+)"?/i.exec(cd);
    if (m) name = m[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetch CSV/text as blob and trigger download. */
export async function downloadTextFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  const text = await res.text();
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Auth ---

export type AdminTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in_minutes: number;
};

export type AdminMeResponse = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  capabilities: Record<string, boolean>;
};

export async function adminLogin(username: string, password: string) {
  return request<AdminTokenResponse>("/api/v1/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function adminMe() {
  return request<AdminMeResponse>("/api/v1/admin/auth/me");
}

export async function adminChangePassword(current_password: string, new_password: string) {
  return request<void>("/api/v1/admin/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

// --- Dashboard ---

export type DashboardSummaryResponse = {
  total_tenants: number;
  active_tenants: number;
  inactive_tenants: number;
  mrr_approx_usd: number;
  overdue_invoices: number;
  failed_backups_24h: number;
  throttled_ai_tenants: number;
  gemini_kill_switch: boolean;
  maintenance_mode: boolean;
  open_tickets: number;
  active_subscriptions: number;
  platform_admin_count: number;
  pending_announcements: number;
};

export async function getDashboardSummary() {
  return request<DashboardSummaryResponse>("/api/v1/admin/dashboard/summary");
}

export type DashboardAiAnalyzeResponse = {
  severity: "ok" | "warning" | "critical";
  analysis: string;
  generated_at: string;
};

export async function postDashboardAiAnalyze() {
  return request<DashboardAiAnalyzeResponse>("/api/v1/admin/dashboard/ai-analyze", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export type MaintenanceTaskItem = {
  id: string;
  name: string;
  description: string;
};

export type MaintenanceTasksResponse = {
  scheduler_note: string;
  tasks: MaintenanceTaskItem[];
};

export async function getMaintenanceTasks() {
  return request<MaintenanceTasksResponse>("/api/v1/admin/dashboard/maintenance-tasks");
}

// --- Tenants ---

export type PaginatedMeta = { total: number; page: number; page_size: number };

export type TenantListItem = {
  id: number;
  name: string;
  company_code: string | null;
  tenant_type: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type TenantListResponse = { items: TenantListItem[]; meta: PaginatedMeta };

export type TenantDetailResponse = {
  id: number;
  name: string;
  company_code: string | null;
  domain: string | null;
  tenant_type: string;
  is_active: boolean;
  deleted_at: string | null;
  feature_flags: Record<string, unknown> | null;
  country_code: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantUserListItem = {
  id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  last_login: string | null;
  role_name: string | null;
};

export type TenantUsersResponse = { items: TenantUserListItem[] };

export type TenantCreateBody = {
  name: string;
  tenant_type?: string;
  domain?: string | null;
};

export type TenantUpdateBody = {
  name?: string;
  domain?: string | null;
  tenant_type?: string;
  is_active?: boolean;
  feature_flags?: Record<string, unknown> | null;
};

export type TenantHealthResponse = {
  tenant_id: number;
  is_active: boolean;
  deleted_at: string | null;
  last_user_login: string | null;
  recent_5xx_request_logs: number;
};

export type TenantStatsResponse = {
  user_count: number;
  order_count: number;
  customer_count: number;
  storage_bytes_used: number;
};

export function listTenants(params: {
  page?: number;
  page_size?: number;
  search?: string;
  is_active?: boolean;
  include_deleted?: boolean;
  tenant_type?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.page_size != null) q.set("page_size", String(params.page_size));
  if (params.search) q.set("search", params.search);
  if (params.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params.include_deleted) q.set("include_deleted", "true");
  if (params.tenant_type) q.set("tenant_type", params.tenant_type);
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);
  return request<TenantListResponse>(`/api/v1/admin/tenants?${q.toString()}`);
}

export async function getTenant(id: number) {
  return request<TenantDetailResponse>(`/api/v1/admin/tenants/${id}`);
}

export async function createTenant(body: TenantCreateBody) {
  return request<{ id: number; company_code: string; name: string }>("/api/v1/admin/tenants", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchTenant(id: number, body: TenantUpdateBody) {
  return request<{ ok: boolean }>(`/api/v1/admin/tenants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function suspendTenant(id: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/tenants/${id}/suspend`, { method: "POST" });
}

export async function reactivateTenant(id: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/tenants/${id}/reactivate`, { method: "POST" });
}

export async function deleteTenant(id: number) {
  return request<void>(`/api/v1/admin/tenants/${id}`, { method: "DELETE" });
}

export async function getTenantHealth(id: number) {
  return request<TenantHealthResponse>(`/api/v1/admin/tenants/${id}/health`);
}

export async function getTenantStats(id: number) {
  return request<TenantStatsResponse>(`/api/v1/admin/tenants/${id}/stats`);
}

export type TenantEntitlementsResponse = {
  tenant_id: number;
  subscription: {
    id: number;
    plan_id: number;
    status: string;
    billing_cycle: string;
  } | null;
  plan: {
    id: number;
    code: string;
    name: string;
    max_users: number;
    max_storage_gb: number;
    max_ai_tokens_monthly: number;
    support_level: string;
    features_included: unknown;
    optional_addons: unknown;
    overage_rules: unknown;
  } | null;
  tenant_feature_flags: Record<string, unknown>;
  effective_modules: Record<string, unknown>;
};

export async function getTenantEntitlements(id: number) {
  return request<TenantEntitlementsResponse>(`/api/v1/admin/tenants/${id}/entitlements`);
}

export async function listTenantUsers(tenantId: number) {
  return request<TenantUsersResponse>(`/api/v1/admin/tenants/${tenantId}/users`);
}

export async function resetTenantUserPassword(tenantId: number, userId: number) {
  return request<{ temporary_password: string }>(
    `/api/v1/admin/tenants/${tenantId}/users/${userId}/reset-password`,
    { method: "POST" },
  );
}

export async function deactivateTenantUser(tenantId: number, userId: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/tenants/${tenantId}/users/${userId}/deactivate`, {
    method: "POST",
  });
}

export async function activateTenantUser(tenantId: number, userId: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/tenants/${tenantId}/users/${userId}/activate`, {
    method: "POST",
  });
}

export type ImpersonateResponse = {
  access_token: string;
  tenant_id: number;
  expires_in_minutes: number;
};

export async function impersonateTenantUser(tenantId: number, userId: number) {
  return request<ImpersonateResponse>(`/api/v1/admin/tenants/${tenantId}/users/${userId}/impersonate`, {
    method: "POST",
  });
}

// --- Support (tenant inspector) ---

export async function getTenantSupportConfig(tid: number) {
  return request<{
    tenant: Record<string, unknown>;
    roles: { id: number; name: string; permissions: unknown }[];
  }>(`/api/v1/admin/support/tenants/${tid}/config`);
}

export async function getTenantDataSummary(tid: number) {
  return request<{ orders: number; customers: number; users: number }>(
    `/api/v1/admin/support/tenants/${tid}/data-summary`,
  );
}

export type TenantErrorItem = { id: number; path: string | null; status: number; created_at: string };

export async function getTenantErrors(tid: number) {
  return request<{ items: TenantErrorItem[] }>(`/api/v1/admin/support/tenants/${tid}/errors`);
}

export type TenantNoteItem = {
  id: number;
  tenant_id: number;
  admin_id: number;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export async function listTenantNotes(tid: number) {
  return request<{ items: TenantNoteItem[] }>(`/api/v1/admin/support/tenants/${tid}/notes`);
}

export async function addTenantNote(tid: number, body: { content: string; is_pinned?: boolean }) {
  return request<{ id: number }>(`/api/v1/admin/support/tenants/${tid}/notes`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchTenantNote(nid: number, body: { content?: string; is_pinned?: boolean }) {
  return request<{ ok: boolean }>(`/api/v1/admin/support/notes/${nid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteTenantNote(nid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/support/notes/${nid}`, { method: "DELETE" });
}

// --- Monitoring ---

export type AuditLogItem = {
  id: number;
  tenant_id: number | null;
  user_id: number | null;
  action: string;
  resource: string | null;
  details: string | null;
  ip_address: string | null;
  request_path: string | null;
  response_status: number | null;
  duration_ms: number | null;
  created_at: string;
};

export type AuditLogResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
};

export type SystemHealthResponse = {
  disk: { total_bytes: number; used_bytes: number; free_bytes: number };
  gemini_enabled: boolean;
  api_env: string;
};

export type UsageDailyItem = {
  id: number;
  tenant_id: number;
  date: string | null;
  api_calls_count: number;
  api_errors_count: number;
  active_users_count: number;
  login_count: number;
  storage_bytes_used: number;
  ai_calls_count: number;
  ai_tokens_used: number;
};

export type DbStatsResponse = { tables: { table_name: string; total_bytes: number }[] };

export type SlowQueryItem = { query: string; calls: number; mean_ms: number; total_ms: number };

export async function getMonitoringAudit(params: {
  page?: number;
  page_size?: number;
  tenant_id?: number;
  action?: string;
  date_from?: string;
  date_to?: string;
  ip?: string;
}) {
  const q = new URLSearchParams();
  if (params.page != null) q.set("page", String(params.page));
  if (params.page_size != null) q.set("page_size", String(params.page_size));
  if (params.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  if (params.action) q.set("action", params.action);
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  if (params.ip) q.set("ip", params.ip);
  return request<AuditLogResponse>(`/api/v1/admin/monitoring/audit?${q.toString()}`);
}

export async function exportMonitoringAuditCsv(params?: {
  tenant_id?: number;
  date_from?: string;
  date_to?: string;
}) {
  const q = new URLSearchParams();
  if (params?.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  await downloadTextFile(`/api/v1/admin/monitoring/audit/export?${q.toString()}`, "audit-export.csv");
}

export async function getMonitoringUsage(params?: {
  date_from?: string;
  date_to?: string;
  tenant_id?: number;
}) {
  const q = new URLSearchParams();
  if (params?.date_from) q.set("date_from", params.date_from);
  if (params?.date_to) q.set("date_to", params.date_to);
  if (params?.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  return request<{ items: UsageDailyItem[] }>(`/api/v1/admin/monitoring/usage?${q.toString()}`);
}

export async function getMonitoringUsageForTenant(tid: number, limit = 90) {
  return request<{ tenant_id: number; items: UsageDailyItem[] }>(
    `/api/v1/admin/monitoring/usage/${tid}?limit=${limit}`,
  );
}

export async function getSystemHealth() {
  return request<SystemHealthResponse>("/api/v1/admin/monitoring/system/health");
}

export async function getSystemResources() {
  return request<SystemResourcesResponse>("/api/v1/admin/monitoring/system/resources");
}

export async function getDbStats() {
  return request<DbStatsResponse>("/api/v1/admin/monitoring/system/db-stats");
}

export async function getSlowQueries() {
  return request<{ items: SlowQueryItem[]; note?: string }>("/api/v1/admin/monitoring/system/slow-queries");
}

// --- Backup ---

export type BackupJobItem = {
  id: number;
  tenant_id: number | null;
  backup_type: string;
  status: string;
  file_name: string | null;
  size_bytes: number | null;
  created_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export type BackupJobsResponse = { items: BackupJobItem[] };

export type BackupScheduleItem = {
  id: number;
  tenant_id: number | null;
  frequency: string;
  is_active: boolean;
  next_run_at: string | null;
};

export async function listBackupJobs(page = 1, page_size = 50, status_filter?: string) {
  const q = new URLSearchParams({ page: String(page), page_size: String(page_size) });
  if (status_filter) q.set("status_filter", status_filter);
  return request<BackupJobsResponse>(`/api/v1/admin/backup/jobs?${q.toString()}`);
}

export async function triggerFullBackup() {
  return request<{ job_id: number; status: string }>("/api/v1/admin/backup/full", { method: "POST" });
}

export async function triggerTenantBackup(tenantId: number) {
  return request<{ job_id: number; status: string }>(`/api/v1/admin/backup/tenant/${tenantId}`, {
    method: "POST",
  });
}

export async function downloadBackupJob(jobId: number, filenameHint?: string) {
  await downloadBlob(`/api/v1/admin/backup/jobs/${jobId}/download`, filenameHint);
}

export async function listBackupSchedules() {
  return request<{ items: BackupScheduleItem[] }>("/api/v1/admin/backup/schedules");
}

export async function createBackupSchedule(body: {
  frequency?: string;
  tenant_id?: number | null;
  retention_days?: number;
  is_active?: boolean;
}) {
  return request<{ id: number }>("/api/v1/admin/backup/schedules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchBackupSchedule(
  sid: number,
  body: { is_active?: boolean; next_run_at?: string },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/backup/schedules/${sid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteBackupSchedule(sid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/backup/schedules/${sid}`, { method: "DELETE" });
}

// --- AI ---

export type AiUsageItem = {
  id: number;
  tenant_id: number | null;
  user_id: number | null;
  model: string | null;
  feature: string | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string | null;
};

export type AiUsageResponse = { items: AiUsageItem[] };

export type AiBudgetItem = {
  tenant_id: number;
  monthly_token_limit: number;
  monthly_cost_limit_usd: number;
  current_month_tokens: number;
  current_month_cost_usd: number;
  is_throttled: boolean;
  reset_day: number;
};

export type AiCostsResponse = {
  by_tenant: { tenant_id: number; total_cost_usd: number; calls: number }[];
};

export async function listAiUsage(params?: { tenant_id?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  if (params?.limit != null) q.set("limit", String(params.limit));
  return request<AiUsageResponse>(`/api/v1/admin/ai/usage?${q.toString()}`);
}

export async function listAiUsageForTenant(tid: number, limit = 500) {
  return request<{ tenant_id: number; items: { id: number; feature: string | null; total_tokens: number | null }[] }>(
    `/api/v1/admin/ai/usage/${tid}?limit=${limit}`,
  );
}

export async function listAiBudgets() {
  return request<{ items: AiBudgetItem[] }>("/api/v1/admin/ai/budgets");
}

export async function putAiBudget(
  tenantId: number,
  body: {
    monthly_token_limit?: number;
    monthly_cost_limit_usd?: number;
    reset_day?: number;
    alert_threshold_pct?: number;
  },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/ai/budgets/${tenantId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function resetAiBudget(tenantId: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/ai/budgets/${tenantId}/reset`, { method: "POST" });
}

export async function getAiCosts() {
  return request<AiCostsResponse>("/api/v1/admin/ai/costs");
}

export async function setAiKillSwitch(enabled: boolean) {
  return request<{ gemini_kill_switch: boolean }>("/api/v1/admin/ai/kill-switch", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function exportAiUsageCsv() {
  await downloadTextFile("/api/v1/admin/ai/usage/export", "ai-usage.csv");
}

// --- Billing ---

export type BillingPlanItem = {
  id: number;
  name: string;
  code: string | null;
  max_users: number | null;
  max_storage_gb?: number;
  max_ai_tokens_monthly?: number;
  features_included?: unknown;
  support_level?: string;
  optional_addons?: unknown;
  overage_rules?: unknown;
  price_monthly_usd: number;
  price_yearly_usd?: number;
  is_active: boolean;
  sort_order?: number;
};

export type BillingPlansResponse = { items: BillingPlanItem[] };

export type SubscriptionItem = {
  id: number;
  tenant_id: number;
  plan_id: number;
  status: string;
  billing_cycle: string;
};

export type InvoiceItem = {
  id: number;
  tenant_id: number;
  invoice_number: string;
  total: number;
  status: string;
  due_date: string | null;
};

export type PaymentItem = {
  id: number;
  invoice_id: number;
  tenant_id: number;
  amount: number;
  method: string;
  paid_at: string | null;
};

export async function listBillingPlans() {
  return request<BillingPlansResponse>("/api/v1/admin/billing/plans");
}

export async function createBillingPlan(body: Record<string, unknown>) {
  return request<{ id: number }>("/api/v1/admin/billing/plans", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchBillingPlan(pid: number, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/plans/${pid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function listSubscriptions(params?: { status?: string; tenant_id?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  const qs = q.toString();
  return request<{ items: SubscriptionItem[] }>(
    `/api/v1/admin/billing/subscriptions${qs ? `?${qs}` : ""}`,
  );
}

export async function putTenantSubscription(
  tid: number,
  body: { plan_id: number; status?: string },
) {
  return request<{ id: number }>(`/api/v1/admin/billing/tenants/${tid}/subscription`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function cancelTenantSubscription(tid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/tenants/${tid}/subscription/cancel`, {
    method: "POST",
  });
}

export async function listInvoices() {
  return request<{ items: InvoiceItem[] }>("/api/v1/admin/billing/invoices");
}

export async function createInvoice(body: Record<string, unknown>) {
  return request<{ id: number; invoice_number: string }>("/api/v1/admin/billing/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchInvoice(iid: number, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/invoices/${iid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function sendInvoice(iid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/invoices/${iid}/send`, { method: "POST" });
}

export async function markInvoicePaid(
  iid: number,
  body?: { method?: string; reference?: string },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/invoices/${iid}/mark-paid`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function voidInvoice(iid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/billing/invoices/${iid}/void`, { method: "POST" });
}

export async function listPayments() {
  return request<{ items: PaymentItem[] }>("/api/v1/admin/billing/payments");
}

export async function getRevenue() {
  return request<{ mrr_approx_usd: number; note?: string }>("/api/v1/admin/billing/revenue");
}

export async function exportRevenueCsv() {
  await downloadTextFile("/api/v1/admin/billing/revenue/export", "revenue-paid-invoices.csv");
}

// --- Announcements ---

export type AnnouncementItem = {
  id: number;
  title: string;
  content: string;
  type: string;
  target: string;
  target_tenant_id: number | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_by: number | null;
  created_at: string;
};

export type AnnouncementsResponse = { items: AnnouncementItem[] };

export async function listAnnouncements() {
  return request<AnnouncementsResponse>("/api/v1/admin/support/announcements");
}

export async function createAnnouncement(body: Record<string, unknown>) {
  return request<{ id: number }>("/api/v1/admin/support/announcements", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchAnnouncement(aid: number, body: Record<string, unknown>) {
  return request<{ ok: boolean }>(`/api/v1/admin/support/announcements/${aid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteAnnouncement(aid: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/support/announcements/${aid}`, { method: "DELETE" });
}

// --- Security ---

export type PlatformAdminItem = {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
};

export type PlatformAdminsResponse = { items: PlatformAdminItem[] };

export type PlatformAdminAuditItem = {
  id: number;
  admin_id: number;
  action: string;
  target_tenant_id: number | null;
  resource: string | null;
  details: string | null;
  created_at: string;
};

export type RateLimitItem = {
  tenant_id: number;
  requests_per_minute: number;
  requests_per_hour: number;
  is_custom: boolean;
};

export type ImpersonationSessionItem = {
  id: number;
  admin_id: number;
  tenant_id: number;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

export type AdminSessionItem = {
  id: number;
  admin_id: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export async function listPlatformAdmins() {
  return request<PlatformAdminsResponse>("/api/v1/admin/security/admins");
}

export async function createPlatformAdmin(body: {
  username: string;
  email: string;
  password: string;
  role: string;
}) {
  return request<{ id: number }>("/api/v1/admin/security/admins", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchPlatformAdmin(
  id: number,
  body: { role?: string; is_active?: boolean; email?: string },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/security/admins/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deletePlatformAdmin(id: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/security/admins/${id}`, { method: "DELETE" });
}

export async function listPlatformAudit(page = 1, page_size = 100) {
  return request<{
    items: PlatformAdminAuditItem[];
    total: number;
    page: number;
    page_size: number;
  }>(`/api/v1/admin/security/audit?page=${page}&page_size=${page_size}`);
}

export async function listRateLimits() {
  return request<{ items: RateLimitItem[] }>("/api/v1/admin/security/rate-limits");
}

export async function putRateLimit(
  tenantId: number,
  body: { requests_per_minute?: number; requests_per_hour?: number },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/security/rate-limits/${tenantId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listImpersonationSessions(page = 1, page_size = 100) {
  return request<{ items: ImpersonationSessionItem[]; total: number }>(
    `/api/v1/admin/security/impersonation-sessions?page=${page}&page_size=${page_size}`,
  );
}

export async function listAdminSessions(page = 1, page_size = 100) {
  return request<{ items: AdminSessionItem[]; total: number }>(
    `/api/v1/admin/security/sessions?page=${page}&page_size=${page_size}`,
  );
}

export async function revokeAdminSession(sessionId: number) {
  return request<{ ok: boolean }>(`/api/v1/admin/security/sessions/${sessionId}/revoke`, {
    method: "POST",
  });
}

// --- Platform settings ---

export type PlatformSettingsResponse = {
  gemini_kill_switch: boolean;
  maintenance_mode: boolean;
};

export async function getPlatformSettings() {
  return request<PlatformSettingsResponse>("/api/v1/admin/settings");
}

export async function putPlatformSettings(body: { gemini_kill_switch?: boolean; maintenance_mode?: boolean }) {
  return request<PlatformSettingsResponse>("/api/v1/admin/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// --- Support tickets ---

export type SupportTicketItem = {
  id: number;
  tenant_id: number | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  source: string;
  assigned_admin_id: number | null;
  sla_first_response_due_at?: string | null;
  sla_resolution_due_at?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  escalated_at?: string | null;
  escalation_level?: number;
  created_at: string;
  updated_at: string;
};

export type SupportTicketMessageItem = {
  id: number;
  ticket_id: number;
  author_type: string;
  author_id: number;
  content: string;
  is_internal_note: boolean;
  created_at: string;
};

export async function listSupportTickets(params?: { status?: string; tenant_id?: number }) {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.tenant_id != null) q.set("tenant_id", String(params.tenant_id));
  return request<{ items: SupportTicketItem[] }>(`/api/v1/admin/support/tickets?${q.toString()}`);
}

export async function getSupportTicket(id: number) {
  return request<SupportTicketItem & { messages: SupportTicketMessageItem[] }>(
    `/api/v1/admin/support/tickets/${id}`,
  );
}

export async function createSupportTicket(body: {
  title: string;
  description: string;
  tenant_id?: number | null;
  category?: string;
  priority?: string;
}) {
  return request<{ id: number }>("/api/v1/admin/support/tickets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchSupportTicket(
  id: number,
  body: {
    status?: string;
    priority?: string;
    assigned_admin_id?: number | null;
    escalate?: boolean;
  },
) {
  return request<{ ok: boolean }>(`/api/v1/admin/support/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function addSupportTicketMessage(
  ticketId: number,
  body: { content: string; is_internal_note?: boolean },
) {
  return request<{ id: number }>(`/api/v1/admin/support/tickets/${ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
