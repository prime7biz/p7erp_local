/**
 * Log API/load failures instead of swallowing them silently.
 * See docs/PRE_PRODUCTION_AUDIT.md Finding #5.
 */
export function logApiError(scope: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[P7 API] ${scope}: ${msg}`, err);
}
