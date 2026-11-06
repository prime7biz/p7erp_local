/** Hooks and small helpers shared by the Bangladesh HR screens. */
import { useCallback, useEffect, useState } from "react";
import { api, type HrEmployeeResponse } from "@/api/client";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

/** Run an async action with busy state and an error / success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      if (ok) setNotice(ok);
      return true;
    } catch (e) {
      logApiError("bangladesh hr action", e);
      setError(e instanceof Error ? e.message : "Something went wrong");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

/** Load data with loading / error state; ``reload`` re-runs the loader. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loader());
    } catch (e) {
      logApiError("bangladesh hr load", e);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}

/** Format a decimal string from the API for display only (never used for calculation). */
export function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value ?? "");
}

export function todayIso(): string {
  return todayLocalISO();
}

export function employeeLabel(e: Pick<HrEmployeeResponse, "employee_code" | "first_name" | "last_name">): string {
  return `${e.employee_code} - ${[e.first_name, e.last_name].filter(Boolean).join(" ")}`;
}

/** Active employees, loaded once per screen section. */
export function useEmployees() {
  return useLoad<HrEmployeeResponse[]>(() => api.listHrEmployees({ active_only: true }), []);
}
