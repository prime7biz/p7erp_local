/**
 * Where login tokens live in the browser, and how to wipe them.
 *
 * Internal ERP staff and external portal users (customer / financier / supplier) have separate
 * tokens. Signing in as one must remove the other, so a shared computer never keeps a previous
 * person's session alive in the background.
 */
import { queryClient } from "@/lib/queryClient";

export const INTERNAL_TOKEN_KEY = "p7_token";
export const INTERNAL_TENANT_KEY = "p7_tenant_id";
export const EXTERNAL_TOKEN_KEY = "p7_ext_token";
export const EXTERNAL_REFRESH_TOKEN_KEY = "p7_ext_refresh_token";
export const EXTERNAL_TENANT_KEY = "p7_ext_tenant_id";
export const EXTERNAL_PRINCIPAL_KEY = "p7_ext_principal_type";
/** Platform admin token (bulk onboarding). Kept in sessionStorage so it dies with the tab. */
export const PLATFORM_ADMIN_TOKEN_KEY = "p7_platform_admin_token";
const AI_LAST_SESSION_KEY = "p7_ai_last_session_id";

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
  removeKeys(localStorage, [EXTERNAL_TOKEN_KEY, EXTERNAL_REFRESH_TOKEN_KEY, EXTERNAL_TENANT_KEY, EXTERNAL_PRINCIPAL_KEY]);
}

/** Called right before storing a NEW login (internal or portal): wipe every older session and cached data. */
export function clearAllSessionsForNewLogin(): void {
  clearInternalSessionStorage();
  clearExternalSessionStorage();
  queryClient.clear();
}
