import type { InquiryCreate } from "@/api/client";
import type {
  CustomerExtractionResponse,
  FieldApplyState,
  FieldConfidence,
  InquiryExtractionResponse,
} from "@/types/extraction";

export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MEDIUM = 0.6;

export function deriveConfidenceLevel(score: number): FieldConfidence {
  if (score >= CONFIDENCE_HIGH) return "high";
  if (score >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

export function formatExtractedValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}

export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  legalEntityName: "Legal entity name",
  tradeName: "Trade name",
  taxIdVatNumber: "Tax ID / VAT",
  website: "Website",
  primaryContactName: "Primary contact",
  designation: "Designation",
  contactEmail: "Contact email",
  countryCode: "Country code",
  contactPhone: "Phone",
  billingAddressLine1: "Billing address",
  billingCity: "Billing city",
  billingPostalCode: "Billing postal code",
  billingCountry: "Billing country",
  shippingAddressLine1: "Shipping address",
  shippingCity: "Shipping city",
  shippingPostalCode: "Shipping postal code",
  shippingCountry: "Shipping country",
};

export const INQUIRY_FIELD_LABELS: Record<string, string> = {
  customer_name_candidate: "Customer (extracted text)",
  customer_code_candidate: "Customer code (extracted)",
  style_name_candidate: "Style name (extracted)",
  style_ref: "Style ref",
  season: "Season",
  department: "Department",
  quantity: "Quantity",
  target_price: "Target price",
  target_price_currency: "Target price currency",
  currency: "Currency",
  exchange_rate: "Exchange rate",
  expected_delivery_date: "Expected delivery",
  shipping_term: "Shipping term",
  intermediary_name: "Intermediary",
  commission_mode: "Commission mode",
  commission_type: "Commission type",
  commission_value: "Commission value",
  notes: "Notes",
};

const CUSTOMER_KEYS = Object.keys(CUSTOMER_FIELD_LABELS);
const INQUIRY_KEYS = Object.keys(INQUIRY_FIELD_LABELS);

export function buildCustomerFieldApplyStates(
  res: CustomerExtractionResponse,
  current: Record<string, string>,
): FieldApplyState[] {
  const out: FieldApplyState[] = [];
  for (const key of CUSTOMER_KEYS) {
    const ef = res.fields[key];
    if (!ef || ef.value === null || ef.value === undefined) continue;
    const extractedDisplay = formatExtractedValue(ef.value);
    if (!extractedDisplay.trim()) continue;
    const cur = current[key] ?? "";
    const conf = typeof ef.confidence === "number" ? ef.confidence : 0;
    const level = deriveConfidenceLevel(conf);
    const hasConflict = cur.trim().length > 0 && cur.trim() !== extractedDisplay.trim();
    out.push({
      fieldKey: key,
      label: CUSTOMER_FIELD_LABELS[key] ?? key,
      extractedValue: extractedDisplay,
      extractedDisplay,
      currentValue: cur,
      applied: false,
      skipped: false,
      hasConflict,
      confidence: conf,
      confidenceLevel: level,
    });
  }
  return out;
}

export function buildInquiryFieldApplyStates(
  res: InquiryExtractionResponse,
  current: Record<string, string>,
): FieldApplyState[] {
  const out: FieldApplyState[] = [];
  for (const key of INQUIRY_KEYS) {
    const ef = res.fields[key];
    if (!ef || ef.value === null || ef.value === undefined) continue;
    const extractedDisplay = formatExtractedValue(ef.value);
    if (!extractedDisplay.trim() && key !== "notes") continue;
    const cur = current[key] ?? "";
    const conf = typeof ef.confidence === "number" ? ef.confidence : 0;
    const level = deriveConfidenceLevel(conf);
    const hasConflict = cur.trim().length > 0 && cur.trim() !== extractedDisplay.trim();
    out.push({
      fieldKey: key,
      label: INQUIRY_FIELD_LABELS[key] ?? key,
      extractedValue: extractedDisplay,
      extractedDisplay,
      currentValue: cur,
      applied: false,
      skipped: false,
      hasConflict,
      confidence: conf,
      confidenceLevel: level,
    });
  }
  return out;
}

/** Snapshot of inquiry form fields comparable to extraction field keys (candidates not stored on form). */
export function inquiryFormSnapshot(form: InquiryCreate): Record<string, string> {
  return {
    customer_name_candidate: "",
    customer_code_candidate: "",
    style_name_candidate: "",
    style_ref: form.style_ref ?? "",
    season: form.season ?? "",
    department: form.department ?? "",
    quantity: form.quantity != null ? String(form.quantity) : "",
    target_price: form.target_price ?? "",
    target_price_currency: form.target_price_currency ?? "",
    currency: form.currency ?? "",
    exchange_rate: form.exchange_rate ?? "",
    expected_delivery_date: form.expected_delivery_date ?? "",
    shipping_term: form.shipping_term ?? "",
    intermediary_name: "",
    commission_mode: form.commission_mode ?? "",
    commission_type: form.commission_type ?? "",
    commission_value: form.commission_value != null ? String(form.commission_value) : "",
    notes: form.notes ?? "",
  };
}
