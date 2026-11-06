/**
 * Core HTTP helpers for the internal ERP API (`/api/v1/*`): tokens, errors and fetch wrappers.
 *
 * Kept separate from the big `api/client.ts` so the login page and app shell can load without
 * downloading every API method. `api/client.ts` re-exports everything here, so existing
 * `import { ApiError } from "@/api/client"` imports keep working.
 */
import { parseFastApiErrorDetail } from "@/utils/fastApiDetail";
import { API_BASE } from "@/api/apiBase";
import {
  INTERNAL_TENANT_KEY,
  INTERNAL_TOKEN_KEY,
  clearAllSessionsForNewLogin,
  clearInternalSessionStorage,
  revokeExternalCookieSession,
} from "@/api/authStorage";
import { queryClient } from "@/lib/queryClient";

export function getToken(): string | null {
  return localStorage.getItem(INTERNAL_TOKEN_KEY);
}

export function getTenantId(): string | null {
  return localStorage.getItem(INTERNAL_TENANT_KEY);
}

/** Store a new staff login. Any older staff or portal session in this browser is removed first. */
export function setAuth(token: string, tenantId: number): void {
  revokeExternalCookieSession();
  clearAllSessionsForNewLogin();
  localStorage.setItem(INTERNAL_TOKEN_KEY, token);
  localStorage.setItem(INTERNAL_TENANT_KEY, String(tenantId));
}

/** Remove stored credentials and drop cached API data so the next user cannot see it. */
export function clearAuth(): void {
  clearInternalSessionStorage();
  queryClient.clear();
}

/**
 * JWT expired or rejected while a token was sent. Clears auth; redirects to login when on `/app/*`.
 * Does not redirect on `/login` or `/signup` (wrong password / stale token during sign-in).
 * See docs/PRE_PRODUCTION_AUDIT.md Finding #5.
 */
export function handleSessionExpiredUnauthorized(sentAuthorization: boolean, code?: string | null): void {
  if (!sentAuthorization) return;
  clearAuth();
  try {
    const path = window.location.pathname;
    if (path === "/login" || path === "/signup") return;
    if (!path.startsWith("/app")) return;
    const next = path + window.location.search;
    const reason = code === "session_superseded" ? "session_replaced" : "session_expired";
    window.location.replace(`/login?reason=${reason}&next=${encodeURIComponent(next)}`);
  } catch {
    const reason = code === "session_superseded" ? "session_replaced" : "session_expired";
    window.location.replace(`/login?reason=${reason}`);
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

export async function fetchAllPaginated<T>(
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

export async function request<T>(
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization, parsed.code);
    const fallback = typeof raw.message === "string" ? raw.message : null;
    const message = parsed.message !== "Request failed" ? parsed.message : fallback ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId, parsed.code);
  }
  forgetMasterListsAfterWrite(path, init.method);
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

/** API path prefix -> cached dropdown list in lib/masterData.ts that a write there makes stale. */
const MASTER_LIST_PREFIXES: [string, string][] = [
  ["/api/v1/customers", "customers"],
  ["/api/v1/inventory/vendors", "vendors"],
  ["/api/v1/inventory/items", "inventory-items"],
  ["/api/v1/inventory/warehouses", "warehouses"],
];

/** After a successful create/update/delete (or a data import), drop the cached dropdown lists. */
function forgetMasterListsAfterWrite(path: string, method: string | undefined): void {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD") return;
  if (path.startsWith("/api/v1/data-migration/")) {
    void queryClient.invalidateQueries({ queryKey: ["master"] });
    return;
  }
  for (const [prefix, kind] of MASTER_LIST_PREFIXES) {
    if (path.startsWith(prefix)) void queryClient.invalidateQueries({ queryKey: ["master", kind] });
  }
}

export async function requestPlatformAdmin<T>(
  path: string,
  options: RequestInit & { adminToken?: string | null } = {},
): Promise<T> {
  const { adminToken, ...init } = options;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(init.headers as Record<string, string>),
  };
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
  const res = await fetch(`${API_BASE}/api/v1/admin${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    const fallback = typeof raw.message === "string" ? raw.message : null;
    const message = parsed.message !== "Request failed" ? parsed.message : fallback ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId, parsed.code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function requestWithTotal<T>(
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization, parsed.code);
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
export async function requestPublic<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export async function requestBlob(
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization, parsed.code);
    const message = typeof raw.detail === "string" ? raw.detail : "Export failed";
    throw new ApiError(message, res.status);
  }
  return res.blob();
}

export async function requestText(
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    if (res.status === 401) handleSessionExpiredUnauthorized(sentAuthorization, parsed.code);
    const d = raw.detail as string | { msg?: string }[] | undefined;
    const message = typeof d === "string" ? d : Array.isArray(d) && d[0]?.msg ? d[0].msg : raw.message ?? "Request failed";
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(message, res.status, requestId);
  }
  return res.text();
}
