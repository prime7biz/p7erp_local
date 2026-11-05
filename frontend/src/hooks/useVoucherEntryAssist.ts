import { useEffect, useMemo, useRef, useState } from "react";
import { api, type VoucherEntryAssistRequest, type VoucherEntryAssistResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const DEBOUNCE_MS = 600;

/**
 * Fetches read-only hints for the voucher being typed (ledger balances, usual accounts, warnings).
 * Waits until typing pauses, and ignores replies that arrive after a newer request was sent.
 */
export function useVoucherEntryAssist(request: VoucherEntryAssistRequest | null) {
  const [data, setData] = useState<VoucherEntryAssistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const key = useMemo(() => (request ? JSON.stringify(request) : ""), [request]);

  useEffect(() => {
    if (!key) {
      seq.current++;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void api
        .voucherEntryAssist(JSON.parse(key) as VoucherEntryAssistRequest)
        .then((res) => {
          if (mySeq !== seq.current) return;
          setData(res);
          setError(null);
        })
        .catch((e) => {
          if (mySeq !== seq.current) return;
          logApiError("useVoucherEntryAssist", e);
          setError((e as Error).message || "Assistant unavailable");
        })
        .finally(() => {
          if (mySeq === seq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  return { data, loading, error };
}
