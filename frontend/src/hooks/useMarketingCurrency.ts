import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "p7_mkt_currency";
const EVENT = "p7:marketing-currency";
const DEFAULT_CURRENCY = "BDT";

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

// useLayoutEffect only exists in the browser; the build-time pre-render (Node) uses useEffect to avoid a warning.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** One currency choice shared by the public header picker and the pricing page (persists per browser). */
export function useMarketingCurrency(): [string, (code: string) => void] {
  // First render always uses the default, like the pre-rendered HTML (src/lib/prerenderSnapshot.ts);
  // the saved choice is applied before the browser paints.
  const [currency, setLocal] = useState<string>(DEFAULT_CURRENCY);

  useBrowserLayoutEffect(() => {
    setLocal(read());
  }, []);

  useEffect(() => {
    const sync = () => setLocal(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setCurrency = useCallback((code: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* private mode: still update in-memory below */
    }
    setLocal(code);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [currency, setCurrency];
}
