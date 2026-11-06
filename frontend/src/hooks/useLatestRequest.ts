import { useRef } from "react";

export interface LatestRequestGuard {
  /** Call at the start of a request; keep the returned token. */
  begin: () => number;
  /** True only if no newer request started since `token` was issued. */
  isCurrent: (token: number) => boolean;
}

/**
 * Stale-response guard for loaders (report pages, filtered lists).
 *
 * When a user changes a filter twice quickly, two requests run. If the first one answers last it
 * would overwrite the newer result. Pattern:
 *
 *   const latest = useLatestRequest();
 *   const load = useCallback(async () => {
 *     const token = latest.begin();
 *     const data = await api.something();
 *     if (!latest.isCurrent(token)) return; // a newer request owns the screen
 *     setRows(data);
 *   }, [latest, ...filters]);
 *
 * The returned object is stable across renders, so it is safe in hook dependency arrays.
 */
export function useLatestRequest(): LatestRequestGuard {
  const ref = useRef<LatestRequestGuard | null>(null);
  if (ref.current === null) {
    let seq = 0;
    ref.current = {
      begin: () => ++seq,
      isCurrent: (token: number) => token === seq,
    };
  }
  return ref.current;
}
