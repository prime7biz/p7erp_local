/**
 * Turn AI document extraction values (CV / NID / birth certificate) into values the employee forms accept.
 * The API sends `{ value, confidence, ... }` per key; keys differ by document (an NID says `address`,
 * a CV says `address_line`), so each form field lists the keys it may come from.
 */

/** Form field -> extraction keys, first non-empty wins. */
export const HR_EXTRACTION_SOURCES = {
  first_name: ["first_name"],
  last_name: ["last_name"],
  email: ["email"],
  phone: ["phone", "mobile"],
  date_of_birth: ["date_of_birth"],
  gender: ["gender"],
  blood_group: ["blood_group"],
  national_id: ["national_id"],
  birth_registration_no: ["birth_registration_no", "birth_registration_number"],
  father_name: ["father_name"],
  mother_name: ["mother_name"],
  address_line: ["address_line", "address"],
  city: ["city"],
  country: ["country"],
  joining_date: ["joining_date"],
  employment_type: ["employment_type"],
} as const;

export type HrExtractionTarget = keyof typeof HR_EXTRACTION_SOURCES;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'" };

/** The API HTML-escapes text; form inputs need the plain characters back. */
export function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m) => ENTITIES[m] ?? m);
}

function rawValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    const v = (raw as { value: unknown }).value;
    if (v == null || typeof v === "object") return "";
    return String(v).trim();
  }
  if (typeof raw === "object") return "";
  return String(raw).trim();
}

function canonicalGender(value: string): string {
  const v = value.trim().toLowerCase();
  if (["m", "male", "man", "পুরুষ"].includes(v)) return "Male";
  if (["f", "female", "woman", "মহিলা", "নারী"].includes(v)) return "Female";
  if (["other", "o", "third gender", "hijra", "তৃতীয় লিঙ্গ"].includes(v)) return "Other";
  return "";
}

function canonicalBloodGroup(value: string): string {
  const v = value.toUpperCase().replace(/\s+/g, "").replace(/[()]/g, "").replace("−", "-");
  const m = /^(AB|A|B|O)(\+|-|POSITIVE|NEGATIVE|POS|NEG|\+VE|-VE|VE\+|VE-)$/.exec(v);
  if (!m) return "";
  const sign = m[2]!.includes("+") || m[2]!.startsWith("POS") ? "+" : "-";
  return `${m[1]}${sign}`;
}

/** Digits-only for ID numbers ("1234 5678 90" -> "1234567890"); anything else stays as read. */
function idDigits(value: string): string {
  const compact = value.replace(/[\s-]+/g, "");
  return /^\d+$/.test(compact) ? compact : value;
}

/** Clean one extracted value for a form field; "" means "nothing usable" (the field is left alone). */
export function cleanExtractedValue(target: HrExtractionTarget, value: string): string {
  const v = decodeEntities(value).trim();
  if (!v) return "";
  if (target === "gender") return canonicalGender(v);
  if (target === "blood_group") return canonicalBloodGroup(v);
  if (target === "national_id" || target === "birth_registration_no") return idDigits(v);
  return v;
}

/** The cleaned value for one form field from an extraction response's `fields`. */
export function readExtractedField(fields: Record<string, unknown>, target: HrExtractionTarget): string {
  for (const key of HR_EXTRACTION_SOURCES[target]) {
    const value = cleanExtractedValue(target, rawValue(fields[key]));
    if (value) return value;
  }
  return "";
}
