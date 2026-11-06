import { useEffect, useRef } from "react";

/** Wait before the next poll: the normal interval, doubled for each failure in a row (capped). */
export function nextPollDelay(intervalMs: number, consecutiveFailures: number, maxBackoffMs: number): number {
  if (consecutiveFailures <= 0) return intervalMs;
  return Math.min(intervalMs * 2 ** consecutiveFailures, Math.max(intervalMs, maxBackoffMs));
}

export interface PollingOptions {
  intervalMs: number;
  /** Polling only runs while true (e.g. only while a job is still running). Default true. */
  enabled?: boolean;
  /** Longest wait after repeated errors. Default 10 minutes. */
  maxBackoffMs?: number;
  /** Call `task` right away when polling starts (and when the tab becomes visible again). Default true. */
  runImmediately?: boolean;
}

/**
 * Calls `task` again `intervalMs` after the previous call FINISHED (never overlapping requests).
 *
 * - Pauses while the browser tab is hidden and polls once as soon as it is visible again.
 * - After an error (task throws) the wait doubles each time, up to `maxBackoffMs`.
 * - `task` can change every render; the latest one is always used.
 *
 * The task should handle/log its own errors and rethrow if it wants backoff.
 */
export function usePolling(task: () => Promise<unknown>, options: PollingOptions): void {
  const { intervalMs, enabled = true, maxBackoffMs = 10 * 60_000, runImmediately = true } = options;
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: number | undefined;

    const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (stopped || isHidden()) return;
      timer = window.setTimeout(tick, delay);
    };

    async function tick() {
      if (stopped || running) return;
      if (isHidden()) return;
      running = true;
      try {
        await taskRef.current();
        failures = 0;
      } catch {
        failures += 1;
      } finally {
        running = false;
      }
      schedule(nextPollDelay(intervalMs, failures, maxBackoffMs));
    }

    const onVisibility = () => {
      if (isHidden()) {
        window.clearTimeout(timer);
      } else if (!running) {
        void tick();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (runImmediately) void tick();
    else schedule(intervalMs);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, maxBackoffMs, runImmediately]);
}
