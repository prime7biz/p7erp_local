interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

const rateCache = new Map<string, CachedRates>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface LiveRateResult {
  liveRate: number | null;
  liveSource: string;
  liveUpdated: string | null;
  error?: string;
}

export async function fetchLiveRate(fromCurrency: string, toCurrency: string): Promise<LiveRateResult> {
  try {
    const base = fromCurrency.toUpperCase();
    const target = toCurrency.toUpperCase();

    const cached = rateCache.get(base);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      const rate = cached.rates[target];
      if (rate) {
        return {
          liveRate: parseFloat(rate.toFixed(6)),
          liveSource: "ExchangeRate-API (cached)",
          liveUpdated: new Date(cached.fetchedAt).toISOString(),
        };
      }
    }

    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const data = await res.json();

    if (data.result !== "success" || !data.rates) {
      throw new Error(data["error-type"] || "Invalid API response");
    }

    rateCache.set(base, {
      base,
      rates: data.rates,
      fetchedAt: Date.now(),
    });

    const rate = data.rates[target];
    if (!rate) {
      return {
        liveRate: null,
        liveSource: "ExchangeRate-API",
        liveUpdated: data.time_last_update_utc || null,
        error: `No rate found for ${target}`,
      };
    }

    return {
      liveRate: parseFloat(rate.toFixed(6)),
      liveSource: "ExchangeRate-API",
      liveUpdated: data.time_last_update_utc || new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("Live forex rate fetch failed:", err.message);
    return {
      liveRate: null,
      liveSource: "ExchangeRate-API",
      liveUpdated: null,
      error: err.message || "Failed to fetch live rate",
    };
  }
}
