/** Match backend `INQUIRY_DEPARTMENT_OPTIONS` in `backend/app/modules/inquiries/schemas.py`. */
export const DEPARTMENT_OPTIONS = [
  "Infant",
  "Kids",
  "Boys",
  "Girls",
  "Men",
  "Ladies",
  "Knit",
  "Fleece",
  "Woven",
  "Denim",
  "Outerwear",
] as const;

export type InquiryDepartmentOption = (typeof DEPARTMENT_OPTIONS)[number];

/** Match backend `InquiryTypeLiteral`. */
export const INQUIRY_TYPE_OPTIONS = [
  { value: "SAMPLE_DEVELOPMENT", label: "Sample development" },
  { value: "SALESMAN_SAMPLE", label: "Salesman sample" },
  { value: "QUOTATION", label: "Quotation" },
  { value: "REPEAT_ORDER", label: "Repeat order" },
] as const;

export type InquiryTypeOptionValue = (typeof INQUIRY_TYPE_OPTIONS)[number]["value"];

export function inquiryTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const found = INQUIRY_TYPE_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value;
}
