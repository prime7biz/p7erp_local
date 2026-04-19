/**
 * Tenant file downloads use GET /{api_v1_prefix}/files/{module}/{filename} with JWT.
 * Paths must not be used as raw `<img src>` — use useSecureImage + blob fetch instead.
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

/** True when path is under the configured files prefix or matches /api/v{N}/files/... */
function isTenantFilesApiPath(path: string, filesPrefix: string): boolean {
  if (path.startsWith(filesPrefix)) return true;
  return /^\/api\/v[^/]+\/files\//.test(path);
}

/**
 * Returns `/api/v1/files/...` path for requestBlob, or null if not a tenant file URL.
 * Absolute URLs: only the pathname is used with the API client (stored host may differ
 * from VITE_API_BASE_URL, e.g. localhost vs 127.0.0.1).
 */
export function toApiPathForBlobFetch(pathOrUrl: string | null | undefined): string | null {
  const raw = (pathOrUrl ?? "").trim();
  if (!raw) return null;

  const filesPrefix = getTenantFilesPathPrefix();

  if (raw.startsWith("/")) {
    return isTenantFilesApiPath(raw, filesPrefix) ? raw : null;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const path = `${u.pathname}${u.search || ""}`;
      if (!isTenantFilesApiPath(path, filesPrefix)) return null;
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
