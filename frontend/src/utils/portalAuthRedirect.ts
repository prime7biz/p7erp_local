import type { ExternalPrincipalType } from "@/types/externalAccess";

/**
 * Full-page redirect to the unified `/login` with portal role.
 * Uses an absolute URL (`origin` + path) so the port is preserved (e.g. `http://localhost:5173`
 * for Docker frontend) instead of accidentally resolving against a bare `http://localhost`.
 * Always redirect the current window. Avoid touching `window.top` because browser
 * error-frame contexts (e.g. `chrome-error://chromewebdata`) can block cross-frame
 * navigation attempts and prevent the portal redirect from completing.
 */
export function redirectToUnifiedLogin(
  role: ExternalPrincipalType,
  extra?: Record<string, string | undefined>,
): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  params.set("role", role);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== "") params.set(k, v);
    }
  }
  const url = `${window.location.origin}/login?${params.toString()}`;
  window.location.replace(url);
}
