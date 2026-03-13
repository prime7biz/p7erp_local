/**
 * Currency utilities (PrimeX parity).
 * Formatting, symbols, and conversion helpers for multi-currency support.
 */

export interface CurrencyRate {
  id: number;
  from_currency: string;
  to_currency: string;
  exchange_rate: string | number;
  effective_date: string;
  source: string;
  is_active: boolean;
}

/** Format amount with currency (e.g. USD 1,234.56). */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = getCurrencySymbol(currency);
    return `${symbol}${amount.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

/** Convert amount between currencies using a list of rates (from_currency → to_currency). */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: CurrencyRate[]
): number {
  if (fromCurrency === toCurrency) return amount;

  const direct = exchangeRates.find(
    (r) =>
      r.from_currency === fromCurrency &&
      r.to_currency === toCurrency &&
      r.is_active
  );
  if (direct) return amount * Number(direct.exchange_rate);

  const reverse = exchangeRates.find(
    (r) =>
      r.from_currency === toCurrency &&
      r.to_currency === fromCurrency &&
      r.is_active
  );
  if (reverse) return amount / Number(reverse.exchange_rate);

  return amount;
}

/** Get display symbol for a currency code. */
export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    USD: "$",
    BDT: "৳",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CNY: "¥",
    INR: "₹",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
    SEK: "kr",
    NOK: "kr",
    DKK: "kr",
    PLN: "zł",
    CZK: "Kč",
    HUF: "Ft",
    RUB: "₽",
    ZAR: "R",
    BRL: "R$",
    MXN: "$",
    SGD: "S$",
    HKD: "HK$",
    KRW: "₩",
    THB: "฿",
    MYR: "RM",
    PHP: "₱",
    IDR: "Rp",
    VND: "₫",
    TRY: "₺",
    AED: "د.إ",
    SAR: "﷼",
    EGP: "£",
    PKR: "₨",
    LKR: "Rs",
    NPR: "Rs",
    AFN: "؋",
    MMK: "K",
    KHR: "៛",
    LAK: "₭",
  };
  return symbols[currency] ?? currency;
}

/** Common currency codes for dropdowns (PrimeX-style list). */
export const CURRENCY_CODES = [
  "USD",
  "BDT",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "INR",
  "AUD",
  "CAD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RUB",
  "ZAR",
  "BRL",
  "MXN",
  "SGD",
  "HKD",
  "KRW",
  "THB",
  "MYR",
  "PHP",
  "IDR",
  "VND",
  "TRY",
  "AED",
  "SAR",
  "EGP",
  "PKR",
  "LKR",
  "NPR",
  "AFN",
  "MMK",
  "KHR",
  "LAK",
] as const;
