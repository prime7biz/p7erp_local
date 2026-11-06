/**
 * Where login tokens live in the browser, and how to wipe them.
 *
 * Internal ERP staff and external portal users (customer / financier / supplier) have separate
 * tokens. Signing in as one must remove the other, so a shared computer never keeps a previous
 * person's session alive in the background.
 */
import { API_BASE } from "@/api/apiBase";
import { queryClient } from "@/lib/queryClient";

export const INTERNAL_TOKEN_KEY = "p7_token";
export const INTERNAL_TENANT_KEY = "p7_tenant_id";
export const EXTERNAL_TOKEN_KEY = "p7_ext_token";
export const EXTERNAL_REFRESH_TOKEN_KEY = "p7_ext_refresh_token";
/** "cookie" while the portal refresh token is kept in an HttpOnly cookie (no copy in localStorage). */
export const EXTERNAL_REFRESH_MODE_KEY = "p7_ext_refresh_mode";
export const EXTERNAL_TENANT_KEY = "p7_ext_tenant_id";
export const EXTERNAL_PRINCIPAL_KEY = "p7_ext_principal_type";
/** Platform admin token (bulk onboarding). Kept in sessionStorage so it dies with the tab. */
export const PLATFORM_ADMIN_TOKEN_KEY = "p7_platform_admin_token";
const AI_LAST_SESSION_KEY = "p7_ai_last_session_id";

/**
 * Sent on every portal auth call. Tells the API this client understands the HttpOnly refresh
 * cookie, and is the CSRF check the API requires before it accepts that cookie.
 */
export const PORTAL_AUTH_CLIENT_HEADERS: Readonly<Record<string, string>> = { "X-Requested-With": "p7" };

function removeKeys(storage: Storage, keys: string[]): void {
  for (const k of keys) {
    try {
      storage.removeItem(k);
    } catch {
      /* storage disabled: nothing stored to remove */
    }
  }
}

export function clearInternalSessionStorage(): void {
  removeKeys(localStorage, [INTERNAL_TOKEN_KEY, INTERNAL_TENANT_KEY, PLATFORM_ADMIN_TOKEN_KEY, AI_LAST_SESSION_KEY]);
  removeKeys(sessionStorage, [PLATFORM_ADMIN_TOKEN_KEY]);
}

export function clearExternalSessionStorage(): void {
  removeKeys(localStorage, [
    EXTERNAL_TOKEN_KEY,
    EXTERNAL_REFRESH_TOKEN_KEY,
    EXTERNAL_REFRESH_MODE_KEY,
    EXTERNAL_TENANT_KEY,
    EXTERNAL_PRINCIPAL_KEY,
  ]);
}

export function hasExternalCookieSession(): boolean {
  try {
    return localStorage.getItem(EXTERNAL_REFRESH_MODE_KEY) === "cookie";
  } catch {
    return false;
  }
}

/**
 * JavaScript cannot delete the HttpOnly portal cookie, so before a staff login replaces a portal
 * session we ask the API to revoke it and clear the cookie. Best effort: failures are ignored.
 */
export function revokeExternalCookieSession(): void {
  if (!hasExternalCookieSession()) return;
  const headers: Record<string, string> = { ...PORTAL_AUTH_CLIENT_HEADERS };
  const token = localStorage.getItem(EXTERNAL_TOKEN_KEY);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    void fetch(`${API_BASE}/api/external/auth/logout`, { method: "POST", headers, credentials: "include" }).catch(
      () => undefined,
    );
  } catch {
    /* fetch unavailable: the cookie simply expires on its own */
  }
}

/** Called right before storing a NEW login (internal or portal): wipe every older session and cached data. */
export function clearAllSessionsForNewLogin(): void {
  clearInternalSessionStorage();
  clearExternalSessionStorage();
  queryClient.clear();
}
