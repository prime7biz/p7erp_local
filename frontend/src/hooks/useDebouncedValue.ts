import { useEffect, useState } from "react";

/** Returns `value` after it has stopped changing for `delayMs` (search boxes: one request, not one per key). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Re-exported so older imports from this file keep working; the hook lives in `useLatestRequest.ts`. */
export { useLatestRequest } from "./useLatestRequest";
