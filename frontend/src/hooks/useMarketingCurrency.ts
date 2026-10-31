import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "p7_mkt_currency";
const EVENT = "p7:marketing-currency";

function read(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "BDT";
  } catch {
    return "BDT";
  }
}

/** One currency choice shared by the public header picker and the pricing page (persists per browser). */
export function useMarketingCurrency(): [string, (code: string) => void] {
  const [currency, setLocal] = useState<string>(read);

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
