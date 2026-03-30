import { useCallback, useState } from "react";
import { api, type CostBenchmarkResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function useQuotationCostBenchmark() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CostBenchmarkResponse | null>(null);

  const run = useCallback(async (quotationId: number, opts?: { same_customer_only?: boolean; months_back?: number }) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.quotationCostBenchmark({
        quotation_id: quotationId,
        same_customer_only: opts?.same_customer_only,
        months_back: opts?.months_back,
      });
      setResult(r);
      return r;
    } catch (e) {
      logApiError("quotationCostBenchmark", e);
      setError(e instanceof Error ? e.message : "Benchmark failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { busy, error, result, run, clear };
}
