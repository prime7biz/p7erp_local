/**
 * Tenant file downloads use GET /{api_v1_prefix}/files/{module}/{filename} with JWT.
 * Paths must not be used as raw <img src> — use useSecureImage + blob fetch instead.
 */

function getApiV1Prefix(): string {
  const fromEnv = import.meta.env.VITE_API_V1_PREFIX;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "") || "/api/v1";
  }
  return "/api/v1";
}

export function getTenantFilesPathPrefix(): string {
  return `${getApiV1Prefix()}/files/`;
}

function apiBaseOrigin(): string | null {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

/** Full URL is allowed for authenticated blob fetch only if it targets our API host (or same-origin when API base is unset). */
function isAllowedFileFetchOrigin(origin: string): boolean {
  const ao = apiBaseOrigin();
  if (ao) return origin === ao;
  if (typeof window !== "undefined" && window.location?.origin) {
    return origin === window.location.origin;
  }
  return false;
}

/**
 * Returns `/api/v1/files/...` path for requestBlob, or null if not a tenant file URL / not allowed.
 */
export function toApiPathForBlobFetch(pathOrUrl: string | null | undefined): string | null {
  const raw = (pathOrUrl ?? "").trim();
  if (!raw) return null;

  const filesPrefix = getTenantFilesPathPrefix();

  if (raw.startsWith("/")) {
    return raw.startsWith(filesPrefix) ? raw : null;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const path = `${u.pathname}${u.search || ""}`;
      if (!path.startsWith(filesPrefix)) return null;
      if (!isAllowedFileFetchOrigin(u.origin)) return null;
      return path;
    } catch {
      return null;
    }
  }

  return null;
}

export function isSecureTenantFileUrl(pathOrUrl: string | null | undefined): boolean {
  return toApiPathForBlobFetch(pathOrUrl) != null;
}
