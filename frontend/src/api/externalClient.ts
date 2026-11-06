/**
 * HTTP client for `/api/external/*` — separate auth from internal ERP (`p7_token`).
 */
import { API_BASE } from "@/api/apiBase";
import {
  EXTERNAL_PRINCIPAL_KEY,
  EXTERNAL_REFRESH_TOKEN_KEY,
  EXTERNAL_TENANT_KEY,
  EXTERNAL_TOKEN_KEY,
  clearAllSessionsForNewLogin,
  clearExternalSessionStorage,
} from "@/api/authStorage";
import { parseFastApiErrorDetail } from "@/utils/fastApiDetail";
import { redirectToUnifiedLogin } from "@/utils/portalAuthRedirect";
import {
  isExternalPrincipalType,
  type ExternalMeResponse,
  type ExternalPrincipalType,
  type ExternalTokenResponse,
} from "@/types/externalAccess";

const EXTERNAL_PREFIX = "/api/external";

/** One refresh at a time: parallel 401s share it instead of each rotating tokens. */
let refreshInFlight: Promise<ExternalTokenResponse> | null = null;

function refreshOnce(refreshToken: string): Promise<ExternalTokenResponse> {
  if (!refreshInFlight) {
    refreshInFlight = postRefreshTokens(refreshToken)
      .then((next) => {
        storeExtTokens(next.access_token, next.refresh_token, next.tenant_id, next.principal_type);
        return next;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export function getExtToken(): string | null {
  return localStorage.getItem(EXTERNAL_TOKEN_KEY);
}

export function getExtRefreshToken(): string | null {
  return localStorage.getItem(EXTERNAL_REFRESH_TOKEN_KEY);
}

export function getExtTenantId(): string | null {
  return localStorage.getItem(EXTERNAL_TENANT_KEY);
}

export function getExtPrincipalType(): ExternalPrincipalType | null {
  const t = localStorage.getItem(EXTERNAL_PRINCIPAL_KEY);
  return isExternalPrincipalType(t) ? t : null;
}

function storeExtTokens(accessToken: string, refreshToken: string, tenantId: number, principalType: ExternalPrincipalType) {
  localStorage.setItem(EXTERNAL_TOKEN_KEY, accessToken);
  localStorage.setItem(EXTERNAL_REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(EXTERNAL_TENANT_KEY, String(tenantId));
  localStorage.setItem(EXTERNAL_PRINCIPAL_KEY, principalType);
}

/** Store a new portal login. Any older staff or portal session in this browser is removed first. */
export function setExtAuth(accessToken: string, refreshToken: string, tenantId: number, principalType: ExternalPrincipalType) {
  clearAllSessionsForNewLogin();
  storeExtTokens(accessToken, refreshToken, tenantId, principalType);
}

export function clearExtAuth() {
  clearExternalSessionStorage();
}

function extSessionExpiredRedirect(sentAuth: boolean) {
  if (!sentAuth) return;
  clearExtAuth();
  try {
    const path = window.location.pathname;
    if (path.startsWith("/portal/customer")) {
      redirectToUnifiedLogin("customer", { reason: "session_expired" });
    } else if (path.startsWith("/portal/financier")) {
      redirectToUnifiedLogin("financier", { reason: "session_expired" });
    }
  } catch (e) {
    console.error("[P7 API] externalClient.sessionExpiredRedirect", e);
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

/** Public external auth calls: no Bearer / X-Tenant-Id (avoids stale session interfering with login, invite, reset). */
async function extRequestPublic<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const res = await fetch(`${API_BASE}${EXTERNAL_PREFIX}${path}`, { ...init, headers });
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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
          await refreshOnce(rt);
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
  return extRequestPublic<ExternalTokenResponse>("/auth/login", {
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
  return extRequestPublic<ExternalTokenResponse>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ExternalMessageResponse = { message: string };

export async function externalRequestPasswordReset(body: {
  company_code: string;
  email: string;
  principal_type: ExternalPrincipalType;
}): Promise<ExternalMessageResponse> {
  return extRequestPublic<ExternalMessageResponse>("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function externalResetPassword(body: { token: string; new_password: string }): Promise<ExternalMessageResponse> {
  return extRequestPublic<ExternalMessageResponse>("/auth/reset-password", {
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
