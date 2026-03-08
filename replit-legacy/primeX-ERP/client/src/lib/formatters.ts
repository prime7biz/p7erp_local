/**
 * Utility functions for formatting values consistently across the application
 */

/**
 * Format a date as a localized string
 * @param date Date object or string representation of a date
 * @returns Formatted date string
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'N/A';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format a time as a localized string
 * @param time Date object or string representation of a time
 * @returns Formatted time string
 */
export const formatTime = (time: Date | string | null | undefined): string => {
  if (!time) return 'N/A';
  
  const timeObj = typeof time === 'string' ? new Date(time) : time;
  
  if (isNaN(timeObj.getTime())) {
    return 'Invalid time';
  }
  
  return timeObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format a datetime as a localized string
 * @param datetime Date object or string representation of a datetime
 * @returns Formatted datetime string
 */
export const formatDateTime = (datetime: Date | string | null | undefined): string => {
  if (!datetime) return 'N/A';
  
  const dateObj = typeof datetime === 'string' ? new Date(datetime) : datetime;
  
  if (isNaN(dateObj.getTime())) {
    return 'Invalid datetime';
  }
  
  return dateObj.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format a currency value with appropriate currency symbol
 * @param value Numeric value to format
 * @param currency Currency code (default: BDT)
 * @returns Formatted currency string
 */
export const formatCurrency = (value: number | string | null | undefined, currency: string = 'BDT'): string => {
  if (value === null || value === undefined) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return 'Invalid amount';
  }
  
  return formatMoney(numValue, currency);
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
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
  BRL: "R$",
  MXN: "MX$",
  ZAR: "R",
  PKR: "PKR",
  LKR: "Rs",
  NPR: "Rs",
  MMK: "K",
};

export function getCurrencyPrefix(currency: string): string {
  if (currency === "BDT") return "BDT ";
  return CURRENCY_SYMBOLS[currency] ? CURRENCY_SYMBOLS[currency] : `${currency} `;
}

export function formatMoney(amount: number | string | null | undefined, currency: string = "BDT"): string {
  if (amount === null || amount === undefined) return `${getCurrencyPrefix(currency)}0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${getCurrencyPrefix(currency)}0.00`;
  const formatted = num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${getCurrencyPrefix(currency)}${formatted}`;
}

export function formatMoneyShort(amount: number | string | null | undefined, currency: string = "BDT"): string {
  if (amount === null || amount === undefined) return `${getCurrencyPrefix(currency)}0`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${getCurrencyPrefix(currency)}0`;
  if (Math.abs(num) >= 1_000_000) {
    return `${getCurrencyPrefix(currency)}${(num / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `${getCurrencyPrefix(currency)}${(num / 1_000).toFixed(1)}K`;
  }
  return `${getCurrencyPrefix(currency)}${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Format a numeric value with commas for thousands
 * @param value Numeric value to format
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted number string
 */
export const formatNumber = (value: number | string | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return 'Invalid number';
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Format a percentage value
 * @param value Numeric percentage value (e.g. 0.25 for 25%)
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export const formatPercentage = (value: number | string | null | undefined, decimals: number = 2): string => {
  if (value === null || value === undefined) return 'N/A';
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return 'Invalid percentage';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(numValue);
};

/**
 * Truncate text to a specified length with ellipsis
 * @param text Text to truncate
 * @param maxLength Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = (text: string | null | undefined, maxLength: number = 50): string => {
  if (!text) return '';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return `${text.substring(0, maxLength)}...`;
};