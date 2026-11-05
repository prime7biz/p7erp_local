/**
 * Amount in words for cheques, using the South Asian system (thousand, lakh, crore):
 *   125000.5 -> "Taka One Lakh Twenty Five Thousand and Fifty Paisa Only"
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = ONES[n % 10] ?? "";
  return o ? `${t} ${o}` : t;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(below100(rest));
  return parts.join(" ");
}

/** Whole number in words with crore / lakh / thousand grouping (supports up to 99,999 crore). */
export function integerInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${crore >= 100 ? integerInWords(crore) : below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

const CURRENCY_WORDS: Record<string, { major: string; minor: string }> = {
  BDT: { major: "Taka", minor: "Paisa" },
  INR: { major: "Rupees", minor: "Paise" },
  USD: { major: "US Dollars", minor: "Cents" },
  EUR: { major: "Euros", minor: "Cents" },
};

export function amountInWords(amount: number, currency = "BDT"): string {
  const words = CURRENCY_WORDS[currency.toUpperCase()] ?? { major: currency.toUpperCase(), minor: "Cents" };
  const total = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(total / 100);
  const minor = total % 100;
  let text = `${words.major} ${integerInWords(whole)}`;
  if (minor) text += ` and ${below100(minor)} ${words.minor}`;
  return `${text} Only`;
}

/** 1250000.5 -> "12,50,000.50" (lakh-style grouping used on Bangladeshi cheques). */
export function formatLakh(amount: number): string {
  const [intPart, dec] = Math.abs(amount).toFixed(2).split(".");
  const digits = intPart ?? "0";
  const last3 = digits.slice(-3);
  const head = digits.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return `${amount < 0 ? "-" : ""}${grouped}.${dec}`;
}
