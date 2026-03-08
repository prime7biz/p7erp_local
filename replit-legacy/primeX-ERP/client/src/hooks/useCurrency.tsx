import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { currencyMap } from "@/seo/keywords";

interface CurrencyContextType {
  currency: string;
  locale: string;
  country: string;
  setCurrency: (currency: string, locale: string) => void;
  formatPrice: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: "USD",
  locale: "en-US",
  country: "US",
  setCurrency: () => {},
  formatPrice: () => "",
});

export { CurrencyContext };

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ currency: "BDT", locale: "bn-BD", country: "BD" });

  useEffect(() => {
    const override = document.cookie.split("; ").find(c => c.startsWith("p7_currency="));
    if (override) {
      const val = override.split("=")[1];
      const [currency, locale] = val.split("|");
      if (currency && locale) {
        setState(prev => ({ ...prev, currency, locale }));
        return;
      }
    }

    fetch("/api/geo/detect")
      .then(r => r.json())
      .then(data => {
        if (data.country && currencyMap[data.country]) {
          const mapped = currencyMap[data.country];
          setState({ currency: mapped.currency, locale: mapped.locale, country: data.country });
        }
      })
      .catch(() => {});
  }, []);

  const setCurrency = useCallback((currency: string, locale: string) => {
    document.cookie = `p7_currency=${currency}|${locale}; path=/; max-age=${365 * 24 * 60 * 60}`;
    setState(prev => ({ ...prev, currency, locale }));
  }, []);

  const formatPrice = useCallback((amount: number) => {
    try {
      return new Intl.NumberFormat(state.locale, {
        style: "currency",
        currency: state.currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${state.currency} ${amount.toLocaleString()}`;
    }
  }, [state.currency, state.locale]);

  return (
    <CurrencyContext.Provider value={{ ...state, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
