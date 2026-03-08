import { useQuery } from "@tanstack/react-query";

export interface CurrencyRate {
  id: number;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: number;
  effectiveDate: string;
  source: string;
  isActive: boolean;
}

export interface TenantCurrencySettings {
  baseCurrency: string;
  localCurrency: string;
  displayCurrency: string;
  multiCurrencyEnabled: boolean;
}

// Currency formatting utility
export function formatCurrency(amount: number, currency: string = "BDT", locale: string = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback formatting if currency is not supported
    const symbols: Record<string, string> = {
      USD: "$",
      BDT: "BDT ",
      EUR: "€",
      GBP: "£",
      JPY: "¥",
      CNY: "¥",
      INR: "₹",
    };
    const symbol = symbols[currency] || currency;
    return `${symbol}${amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

// Currency conversion utility
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: CurrencyRate[]
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  // Find direct conversion rate
  const directRate = exchangeRates.find(
    rate => rate.fromCurrency === fromCurrency && 
           rate.toCurrency === toCurrency && 
           rate.isActive
  );

  if (directRate) {
    return amount * directRate.exchangeRate;
  }

  // Find reverse conversion rate
  const reverseRate = exchangeRates.find(
    rate => rate.fromCurrency === toCurrency && 
           rate.toCurrency === fromCurrency && 
           rate.isActive
  );

  if (reverseRate) {
    return amount / reverseRate.exchangeRate;
  }

  // If no direct conversion available, return original amount
  console.warn(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
  return amount;
}

// Multi-currency amount display utility
export function formatMultiCurrencyAmount(
  amount: number,
  originalCurrency: string,
  displayCurrency: string,
  exchangeRates: CurrencyRate[],
  showBoth: boolean = true
): string {
  if (originalCurrency === displayCurrency || !showBoth) {
    return formatCurrency(amount, displayCurrency);
  }

  const convertedAmount = convertCurrency(amount, originalCurrency, displayCurrency, exchangeRates);
  
  return `${formatCurrency(convertedAmount, displayCurrency)} (${formatCurrency(amount, originalCurrency)})`;
}

// Hook to get tenant currency settings
export function useTenantCurrencySettings() {
  return useQuery({
    queryKey: ["/api/settings/tenant-settings"],
    select: (data: any): TenantCurrencySettings => ({
      baseCurrency: data?.baseCurrency || "BDT",
      localCurrency: data?.localCurrency || "BDT",
      displayCurrency: data?.displayCurrency || "BDT",
      multiCurrencyEnabled: data?.multiCurrencyEnabled || false,
    }),
  });
}

// Hook to get exchange rates
export function useExchangeRates() {
  return useQuery({
    queryKey: ["/api/currency/exchange-rates"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get currency symbol
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
    LAK: "₭"
  };
  
  return symbols[currency] || currency;
}