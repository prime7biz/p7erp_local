import { useEffect, useRef } from "react";

/**
 * Re-runs `callback` on an interval. Skips if `enabled` is false.
 * Use `silent` inside callback to avoid flashing loading states on poll ticks.
 */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void cbRef.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
}
