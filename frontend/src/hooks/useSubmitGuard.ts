import { useCallback, useRef, useState } from "react";

/**
 * Runs one save action at a time. A second click (or hotkey) while the first request is
 * still in flight is ignored, so double-clicks cannot create duplicate vouchers/GRNs/settlements.
 *
 * `busy` is for disabling buttons; the ref guard also covers clicks that arrive before React re-renders.
 */
export function useSubmitGuard() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
