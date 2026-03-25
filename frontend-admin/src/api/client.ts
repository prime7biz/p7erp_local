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
    throw new Error((err as { detail?: string }).detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function adminLogin(username: string, password: string) {
  return request<{ access_token: string; expires_in_minutes: number }>("/api/v1/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function adminMe() {
  return request<{ id: number; username: string; email: string; role: string }>("/api/v1/admin/auth/me");
}

export async function listTenants(page = 1) {
  return request<{ items: unknown[]; meta: { total: number } }>(
    `/api/v1/admin/tenants?page=${page}&page_size=50`,
  );
}

export async function getTenant(id: number) {
  return request<Record<string, unknown>>(`/api/v1/admin/tenants/${id}`);
}

export async function listTenantUsers(tenantId: number) {
  return request<{ items: unknown[] }>(`/api/v1/admin/tenants/${tenantId}/users`);
}

export async function getMonitoringAudit(page = 1) {
  return request<unknown>(`/api/v1/admin/monitoring/audit?page=${page}&page_size=50`);
}

export async function getSystemHealth() {
  return request<unknown>("/api/v1/admin/monitoring/system/health");
}

export async function listBackupJobs() {
  return request<{ items: unknown[] }>("/api/v1/admin/backup/jobs");
}

export async function listAiUsage() {
  return request<{ items: unknown[] }>("/api/v1/admin/ai/usage?limit=100");
}

export async function listBillingPlans() {
  return request<{ items: unknown[] }>("/api/v1/admin/billing/plans");
}

export async function listAnnouncements() {
  return request<{ items: unknown[] }>("/api/v1/admin/support/announcements");
}

export async function listPlatformAdmins() {
  return request<{ items: unknown[] }>("/api/v1/admin/security/admins");
}
