/**
 * Log API/load failures instead of swallowing them silently.
 * See docs/PRE_PRODUCTION_AUDIT.md Finding #5.
 *
 * Supports both `(scope, err)` and `(err, scope)` so older call sites stay valid.
 */
export function logApiError(scope: string, err: unknown): void;
export function logApiError(err: unknown, scope: string): void;
export function logApiError(a: string | unknown, b: unknown | string): void {
  const scope = typeof a === "string" ? a : typeof b === "string" ? b : "(unknown scope)";
  const err = typeof a === "string" ? b : a;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[P7 API] ${scope}: ${msg}`, err);
}
