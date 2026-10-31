/**
 * Docker main UI is served on :5173 with nginx proxying `/api` to the backend. If an older build
 * inlined `http://localhost:8000`, the browser would cross-call :8000 and often show a misleading
 * CORS error when the connection drops. Force same-origin `/api` for that case.
 */
export function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
  if (typeof window === "undefined") return configured;
  const { hostname, port } = window.location;
  if ((hostname !== "localhost" && hostname !== "127.0.0.1") || port !== "5173") return configured;
  if (!configured) return configured;
  try {
    const u = new URL(configured);
    if ((u.hostname === "localhost" || u.hostname === "127.0.0.1") && u.port === "8000") {
      return "";
    }
  } catch {
    if (configured.startsWith("/")) return configured;
  }
  return configured;
}

/** Shared base URL for internal (`/api/v1`) and external portal (`/api/external`) clients. */
export const API_BASE = resolveApiBase();
