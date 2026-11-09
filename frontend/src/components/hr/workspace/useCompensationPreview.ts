import { useEffect, useRef, useState } from "react";
import { api, type HrCompensationInput } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { IDLE_PREVIEW, previewKey, type SalaryPreviewState } from "./employeeWorkspaceLogic";

/**
 * Live basic / gross check against the legal minimum (POST /hr/compensation/preview).
 * Only the newest request may set the result, so a slow older answer can never mark newer input as valid.
 * `refreshKey` forces a new check for the same input (e.g. after the joining date was saved).
 */
export function useCompensationPreview(
  request: HrCompensationInput | null,
  enabled: boolean,
  refreshKey = 0,
  delayMs = 400,
): SalaryPreviewState {
  const key = enabled ? previewKey(request) : null;
  const [state, setState] = useState<SalaryPreviewState>(IDLE_PREVIEW);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!key) {
      setState(IDLE_PREVIEW);
      return;
    }
    setState({ status: "pending", key, preview: null, message: null });
    const body = JSON.parse(key) as HrCompensationInput;
    const timer = window.setTimeout(() => {
      api
        .previewHrCompensation(body)
        .then((preview) => {
          if (mine !== seq.current) return;
          setState({ status: preview.meets_minimum ? "valid" : "invalid", key, preview, message: preview.message });
        })
        .catch((e) => {
          if (mine !== seq.current) return;
          logApiError("useCompensationPreview", e);
          setState({ status: "error", key, preview: null, message: e instanceof Error ? e.message : "Could not check the salary" });
        });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [key, refreshKey, delayMs]);

  return state;
}
