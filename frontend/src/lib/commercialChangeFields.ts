/** Mirrors backend `commercial_fields.py` for UI (propose-change dropdowns). */

export const ORDER_COMMERCIAL_LOCKED_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS", "COMPLETED"]);
export const QUOTATION_COMMERCIAL_LOCKED_STATUSES = new Set(["APPROVED", "SENT", "CONVERTED"]);

export function isOrderCommercialLocked(status: string): boolean {
  return ORDER_COMMERCIAL_LOCKED_STATUSES.has((status || "").toUpperCase());
}

export function isQuotationCommercialLocked(status: string): boolean {
  return QUOTATION_COMMERCIAL_LOCKED_STATUSES.has((status || "").toUpperCase());
}

export type CommercialFieldDef = {
  key: string;
  label: string;
  input: "date" | "number" | "text" | "select";
  options?: { value: string; label: string }[];
};

export const ORDER_PROTECTED_FIELD_DEFS: CommercialFieldDef[] = [
  { key: "delivery_date", label: "Delivery date", input: "date" },
  { key: "quantity", label: "Quantity", input: "number" },
  {
    key: "commission_mode",
    label: "Commission mode",
    input: "select",
    options: [
      { value: "INCLUDE", label: "Include" },
      { value: "EXCLUDE", label: "Exclude" },
    ],
  },
  {
    key: "commission_type",
    label: "Commission type",
    input: "select",
    options: [
      { value: "PERCENTAGE", label: "Percentage" },
      { value: "FIXED", label: "Fixed" },
    ],
  },
  { key: "commission_value", label: "Commission value", input: "number" },
  { key: "shipping_term", label: "Shipping / incoterm", input: "text" },
];

export const QUOTATION_PROTECTED_FIELD_DEFS: CommercialFieldDef[] = [
  { key: "target_price", label: "Target price", input: "text" },
  { key: "target_price_currency", label: "Target price currency", input: "text" },
  { key: "exchange_rate", label: "Exchange rate", input: "text" },
  { key: "quoted_price", label: "Quoted price", input: "text" },
  { key: "currency", label: "Currency", input: "text" },
  { key: "total_amount", label: "Total amount", input: "text" },
  { key: "shipping_term", label: "Shipping / incoterm", input: "text" },
  {
    key: "commission_mode",
    label: "Commission mode",
    input: "select",
    options: [
      { value: "INCLUDE", label: "Include" },
      { value: "EXCLUDE", label: "Exclude" },
    ],
  },
  {
    key: "commission_type",
    label: "Commission type",
    input: "select",
    options: [
      { value: "PERCENTAGE", label: "Percentage" },
      { value: "FIXED", label: "Fixed" },
    ],
  },
  { key: "commission_value", label: "Commission value", input: "number" },
  { key: "projected_quantity", label: "Projected quantity", input: "number" },
  { key: "projected_delivery_date", label: "Projected delivery date", input: "date" },
  { key: "valid_until", label: "Valid until", input: "date" },
];
