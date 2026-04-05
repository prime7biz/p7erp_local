/**
 * HTTP client for `/api/external/*` — separate auth from internal ERP (`p7_token`).
 */
import { parseFastApiErrorDetail } from "@/utils/fastApiDetail";
import type {
  ExternalMeResponse,
  ExternalPrincipalType,
  ExternalTokenResponse,
} from "@/types/externalAccess";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const EXTERNAL_PREFIX = "/api/external";

export function getExtToken(): string | null {
  return localStorage.getItem("p7_ext_token");
}

export function getExtRefreshToken(): string | null {
  return localStorage.getItem("p7_ext_refresh_token");
}

export function getExtTenantId(): string | null {
  return localStorage.getItem("p7_ext_tenant_id");
}

export function getExtPrincipalType(): ExternalPrincipalType | null {
  const t = localStorage.getItem("p7_ext_principal_type");
  if (t === "customer" || t === "financier") return t;
  return null;
}

export function setExtAuth(accessToken: string, refreshToken: string, tenantId: number, principalType: ExternalPrincipalType) {
  localStorage.setItem("p7_ext_token", accessToken);
  localStorage.setItem("p7_ext_refresh_token", refreshToken);
  localStorage.setItem("p7_ext_tenant_id", String(tenantId));
  localStorage.setItem("p7_ext_principal_type", principalType);
}

export function clearExtAuth() {
  localStorage.removeItem("p7_ext_token");
  localStorage.removeItem("p7_ext_refresh_token");
  localStorage.removeItem("p7_ext_tenant_id");
  localStorage.removeItem("p7_ext_principal_type");
}

function extSessionExpiredRedirect(sentAuth: boolean) {
  if (!sentAuth) return;
  clearExtAuth();
  try {
    const path = window.location.pathname;
    if (path.startsWith("/portal/customer")) {
      window.location.replace("/portal/customer/login?reason=session_expired");
    } else if (path.startsWith("/portal/financier")) {
      window.location.replace("/portal/financier/login?reason=session_expired");
    }
  } catch {
    /* ignore */
  }
}

export class ExternalApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExternalApiError";
    this.status = status;
  }
}

/** POST /auth/refresh — no Bearer; uses refresh token body + X-Tenant-Id only. */
async function postRefreshTokens(refreshToken: string): Promise<ExternalTokenResponse> {
  const tid = getExtTenantId();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tid) headers["X-Tenant-Id"] = tid;
  const res = await fetch(`${API_BASE}${EXTERNAL_PREFIX}/auth/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    const message =
      parsed.message !== "Request failed"
        ? parsed.message
        : typeof raw.message === "string"
          ? raw.message
          : "Request failed";
    throw new ExternalApiError(message, res.status);
  }
  return res.json() as Promise<ExternalTokenResponse>;
}

async function extRequest<T>(path: string, init: RequestInit = {}, authRetryAfterRefresh = false): Promise<T> {
  const tid = getExtTenantId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (tid) headers["X-Tenant-Id"] = tid;
  const token = getExtToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const sentAuth = Boolean(token);
  const res = await fetch(`${API_BASE}${EXTERNAL_PREFIX}${path}`, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401 && sentAuth && !authRetryAfterRefresh) {
      const rt = getExtRefreshToken();
      if (rt) {
        try {
          const next = await postRefreshTokens(rt);
          setExtAuth(next.access_token, next.refresh_token, next.tenant_id, next.principal_type);
          return extRequest<T>(path, init, true);
        } catch {
          extSessionExpiredRedirect(true);
          throw new ExternalApiError("Session expired", 401);
        }
      }
      extSessionExpiredRedirect(sentAuth);
    } else if (res.status === 401 && sentAuth) {
      extSessionExpiredRedirect(sentAuth);
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const raw = err as { detail?: unknown; message?: string };
    const parsed = parseFastApiErrorDetail(raw.detail);
    const message =
      parsed.message !== "Request failed"
        ? parsed.message
        : typeof raw.message === "string"
          ? raw.message
          : "Request failed";
    throw new ExternalApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function externalLogin(body: {
  company_code: string;
  email: string;
  password: string;
  principal_type: ExternalPrincipalType;
}): Promise<ExternalTokenResponse> {
  return extRequest<ExternalTokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function externalAcceptInvite(body: {
  token: string;
  full_name: string;
  password: string;
  phone?: string | null;
}): Promise<ExternalTokenResponse> {
  return extRequest<ExternalTokenResponse>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function externalRefresh(refreshToken: string): Promise<ExternalTokenResponse> {
  return postRefreshTokens(refreshToken);
}

export async function externalMe(): Promise<ExternalMeResponse> {
  return extRequest<ExternalMeResponse>("/auth/me");
}

export async function externalLogout(): Promise<void> {
  await extRequest<void>("/auth/logout", { method: "POST" });
}

export async function externalGet<T>(path: string): Promise<T> {
  return extRequest<T>(path);
}

export async function externalPost<T>(path: string, body: unknown): Promise<T> {
  return extRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}
