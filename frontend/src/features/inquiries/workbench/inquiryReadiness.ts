/** Fields recommended before converting an inquiry to a quotation. */
export const RECOMMENDED_FIELDS = [
  { key: "style_id", label: "Style" },
  { key: "quantity", label: "Quantity" },
  { key: "target_price", label: "Target Price" },
  { key: "target_price_currency", label: "Target Currency" },
  { key: "exchange_rate", label: "Exchange Rate" },
] as const;

/** Extra product fields that raise readiness when filled. */
export const PRODUCT_FIELDS = [
  { key: "brand", label: "Brand" },
  { key: "season", label: "Season" },
  { key: "department", label: "Department" },
  { key: "material_composition", label: "Material composition" },
  { key: "size_range", label: "Size range" },
  { key: "color_options", label: "Color options" },
  { key: "country_of_origin", label: "Country of origin" },
  { key: "special_requirements", label: "Special requirements" },
  { key: "inquiry_type", label: "Inquiry type" },
  { key: "contact_person", label: "Contact person" },
] as const;

export type InquiryLike = {
  style_id?: number | null;
  quantity?: number | null;
  target_price?: string | number | null;
  target_price_currency?: string | null;
  exchange_rate?: string | number | null;
  brand?: string | null;
  season?: string | null;
  department?: string | null;
  material_composition?: string | null;
  size_range?: string | null;
  color_options?: string[] | string | null;
  country_of_origin?: string | null;
  special_requirements?: string | null;
  inquiry_type?: string | null;
  contact_person?: string | null;
};

function isFilled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.length > 0 && value.some((v) => String(v).trim() !== "");
  const s = String(value).trim();
  return s !== "" && s !== "0";
}

/** Human labels for recommended fields that are still empty. */
export function missingRecommendedFields(inquiry: InquiryLike): string[] {
  const missing: string[] = [];
  for (const field of RECOMMENDED_FIELDS) {
    const raw = inquiry[field.key as keyof InquiryLike];
    if (field.key === "style_id") {
      if (raw == null || Number(raw) <= 0) missing.push(field.label);
      continue;
    }
    if (field.key === "quantity") {
      if (raw == null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) missing.push(field.label);
      continue;
    }
    if (!isFilled(raw)) missing.push(field.label);
  }
  return missing;
}

/**
 * Readiness 0–100 from recommended + product fields.
 * Recommended fields weigh more so quotation-ready data scores higher.
 */
export function readinessScore(inquiry: InquiryLike): number {
  const recommendedFilled = RECOMMENDED_FIELDS.filter((field) => {
    const raw = inquiry[field.key as keyof InquiryLike];
    if (field.key === "style_id") return raw != null && Number(raw) > 0;
    if (field.key === "quantity") return raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0;
    return isFilled(raw);
  }).length;

  const productFilled = PRODUCT_FIELDS.filter((field) => {
    const raw = inquiry[field.key as keyof InquiryLike];
    return isFilled(raw);
  }).length;

  const recommendedWeight = 70;
  const productWeight = 30;
  const recommendedPart = (recommendedFilled / RECOMMENDED_FIELDS.length) * recommendedWeight;
  const productPart = (productFilled / PRODUCT_FIELDS.length) * productWeight;
  return Math.round(Math.min(100, Math.max(0, recommendedPart + productPart)));
}

/** qty × target_price as a plain decimal string (or "0" when invalid). */
export function estimatedValue(
  qty: number | null | undefined,
  targetPrice: string | number | null | undefined,
): string {
  if (qty == null || targetPrice == null || String(targetPrice).trim() === "") return "0";
  const q = Number(qty);
  const p = Number(targetPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p < 0) return "0";
  return (q * p).toFixed(4);
}

/**
 * Estimated Standard Allowed Hours: (qty × SMV) / 60.
 * Returns null when inputs are missing/invalid.
 */
export function estimatedSah(
  qty: number | null | undefined,
  standardSmv: string | number | null | undefined,
): string | null {
  const q = Number(qty);
  const smv = Number(standardSmv);
  if (!Number.isFinite(q) || !Number.isFinite(smv) || q <= 0 || smv <= 0) return null;
  return ((q * smv) / 60).toFixed(4);
}
