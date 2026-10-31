import { useEffect, useRef, useState } from "react";

/** Returns `value` after it has stopped changing for `delayMs` (search boxes: one request, not one per key). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Stale-response guard for list loaders: call `begin()` at the start of a request and
 * `isCurrent(token)` before applying its result, so a slow older response cannot
 * overwrite a newer one.
 */
export function useLatestRequest() {
  const seq = useRef(0);
  return {
    begin: () => ++seq.current,
    isCurrent: (token: number) => token === seq.current,
  };
}
