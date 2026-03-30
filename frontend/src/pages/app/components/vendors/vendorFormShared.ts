/**
 * Shared vendor / supplier form helpers for Vendors UI and future Supplier AI snapshots.
 * Keeps camelCase keys aligned with likely server-side allowlist field names in a later phase.
 */

import type { VendorCreate, VendorResponse, VendorUpdate } from "@/api/client";

/** Flat snapshot for validate / enrich / dedupe context (Supplier AI phase). */
export type VendorFormSnapshot = Record<string, string | null>;

export const VENDOR_FORM_BASE_INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

function s(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

/** Sync drawer edit form from API row (after AI apply or reload). */
export function vendorResponseToVendorUpdate(v: VendorResponse): VendorUpdate {
  return {
    vendor_code: v.vendor_code,
    name: v.name,
    contact_person: v.contact_person ?? undefined,
    email: v.email ?? undefined,
    phone: v.phone ?? undefined,
    address: v.address ?? undefined,
    is_active: v.is_active,
    ledger_id: v.ledger_id ?? undefined,
    default_currency: v.default_currency ?? undefined,
    payment_terms_days: v.payment_terms_days ?? undefined,
    vendor_type: v.vendor_type ?? undefined,
    country: v.country ?? undefined,
    city: v.city ?? undefined,
    tax_id: v.tax_id ?? undefined,
    bank_name: v.bank_name ?? undefined,
    bank_account_no: v.bank_account_no ?? undefined,
    swift_code: v.swift_code ?? undefined,
    credit_limit: v.credit_limit ?? undefined,
    legal_name: v.legal_name ?? undefined,
    trade_name: v.trade_name ?? undefined,
    website: v.website ?? undefined,
    mobile: v.mobile ?? undefined,
    designation: v.designation ?? undefined,
    address_line1: v.address_line1 ?? undefined,
    state_or_region: v.state_or_region ?? undefined,
    postal_code: v.postal_code ?? undefined,
    registration_number: v.registration_number ?? undefined,
    bank_account_title: v.bank_account_title ?? undefined,
    iban: v.iban ?? undefined,
    payment_terms: v.payment_terms ?? undefined,
    incoterms: v.incoterms ?? undefined,
    shipping_terms: v.shipping_terms ?? undefined,
    lead_time_notes: v.lead_time_notes ?? undefined,
    compliance_status: v.compliance_status ?? undefined,
    compliance_reference_numbers: v.compliance_reference_numbers ?? undefined,
    certifications_summary: v.certifications_summary ?? undefined,
    onboarding_status: v.onboarding_status ?? undefined,
    remarks: v.remarks ?? undefined,
    internal_notes: v.internal_notes ?? undefined,
  };
}

/** Map API vendor row to a stable snapshot for AI context. */
export function vendorResponseToSnapshot(v: VendorResponse): VendorFormSnapshot {
  return {
    vendorCode: v.vendor_code,
    name: v.name,
    legalName: s(v.legal_name),
    tradeName: s(v.trade_name),
    contactPerson: s(v.contact_person),
    designation: s(v.designation),
    email: s(v.email),
    phone: s(v.phone),
    mobile: s(v.mobile),
    website: s(v.website),
    address: s(v.address),
    addressLine1: s(v.address_line1),
    city: s(v.city),
    stateOrRegion: s(v.state_or_region),
    postalCode: s(v.postal_code),
    country: s(v.country),
    taxId: s(v.tax_id),
    registrationNumber: s(v.registration_number),
    vendorType: s(v.vendor_type),
    defaultCurrency: s(v.default_currency),
    paymentTermsDays: v.payment_terms_days != null ? String(v.payment_terms_days) : null,
    paymentTerms: s(v.payment_terms),
    incoterms: s(v.incoterms),
    shippingTerms: s(v.shipping_terms),
    leadTimeNotes: s(v.lead_time_notes),
    bankName: s(v.bank_name),
    bankAccountTitle: s(v.bank_account_title),
    bankAccountNo: s(v.bank_account_no),
    iban: s(v.iban),
    swiftCode: s(v.swift_code),
    complianceStatus: s(v.compliance_status),
    complianceReferenceNumbers: s(v.compliance_reference_numbers),
    certificationsSummary: s(v.certifications_summary),
    onboardingStatus: s(v.onboarding_status),
    remarks: s(v.remarks),
    isActive: v.is_active ? "true" : "false",
  };
}

/** Build VendorUpdate patch from partial snapshot keys (future AI apply). */
export function vendorSnapshotKeysToUpdate(
  keys: Partial<VendorFormSnapshot>,
): VendorUpdate {
  const u: VendorUpdate = {};
  if (keys.vendorDisplayName !== undefined) u.name = keys.vendorDisplayName ?? undefined;
  if (keys.legalName !== undefined) u.legal_name = keys.legalName ?? undefined;
  if (keys.tradeName !== undefined) u.trade_name = keys.tradeName ?? undefined;
  if (keys.contactPerson !== undefined) u.contact_person = keys.contactPerson ?? undefined;
  if (keys.designation !== undefined) u.designation = keys.designation ?? undefined;
  if (keys.email !== undefined) u.email = keys.email ?? undefined;
  if (keys.phone !== undefined) u.phone = keys.phone ?? undefined;
  if (keys.mobile !== undefined) u.mobile = keys.mobile ?? undefined;
  if (keys.website !== undefined) u.website = keys.website ?? undefined;
  if (keys.address !== undefined) u.address = keys.address ?? undefined;
  if (keys.addressLine1 !== undefined) u.address_line1 = keys.addressLine1 ?? undefined;
  if (keys.city !== undefined) u.city = keys.city ?? undefined;
  if (keys.stateOrRegion !== undefined) u.state_or_region = keys.stateOrRegion ?? undefined;
  if (keys.postalCode !== undefined) u.postal_code = keys.postalCode ?? undefined;
  if (keys.country !== undefined) u.country = keys.country ?? undefined;
  if (keys.taxId !== undefined) u.tax_id = keys.taxId ?? undefined;
  if (keys.registrationNumber !== undefined) u.registration_number = keys.registrationNumber ?? undefined;
  if (keys.vendorType !== undefined) u.vendor_type = keys.vendorType ?? undefined;
  if (keys.defaultCurrency !== undefined) u.default_currency = keys.defaultCurrency ?? undefined;
  if (keys.paymentTerms !== undefined) u.payment_terms = keys.paymentTerms ?? undefined;
  if (keys.paymentTermsDays !== undefined) {
    const raw = keys.paymentTermsDays;
    if (raw == null || raw === "") u.payment_terms_days = undefined;
    else {
      const n = Number.parseInt(String(raw), 10);
      u.payment_terms_days = Number.isFinite(n) ? n : undefined;
    }
  }
  if (keys.incoterms !== undefined) u.incoterms = keys.incoterms ?? undefined;
  if (keys.shippingTerms !== undefined) u.shipping_terms = keys.shippingTerms ?? undefined;
  if (keys.leadTimeNotes !== undefined) u.lead_time_notes = keys.leadTimeNotes ?? undefined;
  if (keys.bankName !== undefined) u.bank_name = keys.bankName ?? undefined;
  if (keys.bankAccountTitle !== undefined) u.bank_account_title = keys.bankAccountTitle ?? undefined;
  if (keys.bankAccountNo !== undefined) u.bank_account_no = keys.bankAccountNo ?? undefined;
  if (keys.iban !== undefined) u.iban = keys.iban ?? undefined;
  if (keys.swiftCode !== undefined) u.swift_code = keys.swiftCode ?? undefined;
  if (keys.complianceStatus !== undefined) u.compliance_status = keys.complianceStatus ?? undefined;
  if (keys.complianceReferenceNumbers !== undefined) {
    u.compliance_reference_numbers = keys.complianceReferenceNumbers ?? undefined;
  }
  if (keys.certificationsSummary !== undefined) {
    u.certifications_summary = keys.certificationsSummary ?? undefined;
  }
  if (keys.onboardingStatus !== undefined) u.onboarding_status = keys.onboardingStatus ?? undefined;
  if (keys.remarks !== undefined) u.remarks = keys.remarks ?? undefined;
  return u;
}

/** Full defaults for “Add vendor” drawer (code + name still required in UI). */
export function emptyVendorCreate(): VendorCreate {
  return {
    vendor_code: "",
    name: "",
    ...emptyVendorCreateBase(),
  };
}

export const emptyVendorCreateBase = (): Omit<VendorCreate, "vendor_code" | "name"> => ({
  contact_person: null,
  email: null,
  phone: null,
  address: null,
  is_active: true,
  ledger_id: null,
  default_currency: "USD",
  payment_terms_days: null,
  vendor_type: "foreign",
  country: null,
  city: null,
  tax_id: null,
  bank_name: null,
  bank_account_no: null,
  swift_code: null,
  credit_limit: null,
  legal_name: null,
  trade_name: null,
  website: null,
  mobile: null,
  designation: null,
  address_line1: null,
  state_or_region: null,
  postal_code: null,
  registration_number: null,
  bank_account_title: null,
  iban: null,
  payment_terms: null,
  incoterms: null,
  shipping_terms: null,
  lead_time_notes: null,
  compliance_status: null,
  compliance_reference_numbers: null,
  certifications_summary: null,
  onboarding_status: null,
  remarks: null,
  internal_notes: null,
});

/** camelCase keys matching backend vendor AI allowlist + current-value compare. */
export function vendorSnapshotToAiFieldCurrent(s: VendorFormSnapshot): Record<string, string> {
  const z = (v: string | null | undefined) => (v == null ? "" : String(v));
  return {
    vendorDisplayName: z(s.name),
    legalName: z(s.legalName),
    tradeName: z(s.tradeName),
    contactPerson: z(s.contactPerson),
    designation: z(s.designation),
    email: z(s.email),
    phone: z(s.phone),
    mobile: z(s.mobile),
    website: z(s.website),
    address: z(s.address),
    addressLine1: z(s.addressLine1),
    city: z(s.city),
    stateOrRegion: z(s.stateOrRegion),
    postalCode: z(s.postalCode),
    country: z(s.country),
    taxId: z(s.taxId),
    registrationNumber: z(s.registrationNumber),
    vendorType: z(s.vendorType),
    defaultCurrency: z(s.defaultCurrency),
    paymentTermsDays: z(s.paymentTermsDays),
    paymentTerms: z(s.paymentTerms),
    incoterms: z(s.incoterms),
    shippingTerms: z(s.shippingTerms),
    leadTimeNotes: z(s.leadTimeNotes),
    bankName: z(s.bankName),
    bankAccountTitle: z(s.bankAccountTitle),
    bankAccountNo: z(s.bankAccountNo),
    swiftCode: z(s.swiftCode),
    iban: z(s.iban),
    complianceStatus: z(s.complianceStatus),
    complianceReferenceNumbers: z(s.complianceReferenceNumbers),
    certificationsSummary: z(s.certificationsSummary),
    onboardingStatus: z(s.onboardingStatus),
    remarks: z(s.remarks),
  };
}

export function vendorCreateToAiFieldCurrent(c: VendorCreate): Record<string, string> {
  return vendorSnapshotToAiFieldCurrent({
    vendorCode: c.vendor_code,
    name: c.name,
    legalName: s(c.legal_name),
    tradeName: s(c.trade_name),
    contactPerson: s(c.contact_person),
    designation: s(c.designation),
    email: s(c.email),
    phone: s(c.phone),
    mobile: s(c.mobile),
    website: s(c.website),
    address: s(c.address),
    addressLine1: s(c.address_line1),
    city: s(c.city),
    stateOrRegion: s(c.state_or_region),
    postalCode: s(c.postal_code),
    country: s(c.country),
    taxId: s(c.tax_id),
    registrationNumber: s(c.registration_number),
    vendorType: s(c.vendor_type),
    defaultCurrency: s(c.default_currency),
    paymentTermsDays: c.payment_terms_days != null ? String(c.payment_terms_days) : null,
    paymentTerms: s(c.payment_terms),
    incoterms: s(c.incoterms),
    shippingTerms: s(c.shipping_terms),
    leadTimeNotes: s(c.lead_time_notes),
    bankName: s(c.bank_name),
    bankAccountTitle: s(c.bank_account_title),
    bankAccountNo: s(c.bank_account_no),
    iban: s(c.iban),
    swiftCode: s(c.swift_code),
    complianceStatus: s(c.compliance_status),
    complianceReferenceNumbers: s(c.compliance_reference_numbers),
    certificationsSummary: s(c.certifications_summary),
    onboardingStatus: s(c.onboarding_status),
    remarks: s(c.remarks),
    isActive: c.is_active ? "true" : "false",
  });
}
