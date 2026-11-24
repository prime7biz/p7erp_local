/** Shared customer form shape for Create / Edit pages (no React components — safe for fast refresh). */

import type { CustomerCreate, CustomerResponse, CustomerUpdate } from "@/api/client";
import { buildTargetOptions } from "@/components/ai-extract/extraDetailsLogic";
import { CUSTOMER_FIELD_LABELS } from "@/utils/extractionHelpers";

/** Fields a "More details" item from an imported document can be put into. */
export const CUSTOMER_EXTRA_TARGETS = buildTargetOptions(CUSTOMER_FIELD_LABELS, Object.keys(CUSTOMER_FIELD_LABELS));

/** Form patch for a detail the user placed from the "More details" panel. */
export function customerExtraDetailPatch(target: string, value: string | number): Partial<CustomerFormState> {
  const patch = { [target]: String(value) } as Partial<CustomerFormState>;
  if (target.startsWith("shipping")) patch.sameAsBilling = false;
  return patch;
}

export type CustomerFormState = {
  legalEntityName: string;
  tradeName: string;
  taxIdVatNumber: string;
  website: string;
  customerType: string;
  status: "active" | "inactive";
  primaryContactName: string;
  designation: string;
  contactEmail: string;
  countryCode: string;
  contactPhone: string;
  subscribeNewsletter: boolean;
  companyLogoUrl: string;
  billingAddressLine1: string;
  billingCity: string;
  billingPostalCode: string;
  billingCountry: string;
  sameAsBilling: boolean;
  shippingAddressLine1: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  /** ISO currency code for quotations (e.g. USD) */
  preferredCurrency: string;
  /** Phase 2 commercial defaults (optional) */
  paymentTerms: string;
  defaultIncoterm: string;
  /** Kept as string in the form for easy typing; sent as number when valid */
  typicalLeadTimeDays: string;
  industrySegment: string;
  complianceLevel: string;
  /** Informational decimal string */
  creditLimit: string;
  notes: string;
};

export const CUSTOMER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "brand", label: "Brand / Buyer" },
  { value: "retailer", label: "Retailer / Importer" },
  { value: "buying_house", label: "Buying House / Agent" },
  { value: "local_buyer", label: "Local / CMT Buyer" },
  { value: "other", label: "Other" },
];

/** Legacy SaaS labels kept so old rows still display cleanly in the select. */
const LEGACY_CUSTOMER_TYPES = new Set(["enterprise", "sme", "startup"]);

export function normalizeCustomerTypeForForm(raw: string | null | undefined): string {
  const v = (raw || "").trim();
  if (!v) return "brand";
  if (CUSTOMER_TYPE_OPTIONS.some((o) => o.value === v) || LEGACY_CUSTOMER_TYPES.has(v)) return v;
  return "other";
}

export const INITIAL_CUSTOMER_FORM: CustomerFormState = {
  legalEntityName: "",
  tradeName: "",
  taxIdVatNumber: "",
  website: "",
  customerType: "brand",
  status: "active",
  primaryContactName: "",
  designation: "",
  contactEmail: "",
  countryCode: "+880",
  contactPhone: "",
  subscribeNewsletter: false,
  companyLogoUrl: "",
  billingAddressLine1: "",
  billingCity: "",
  billingPostalCode: "",
  billingCountry: "Bangladesh",
  sameAsBilling: true,
  shippingAddressLine1: "",
  shippingCity: "",
  shippingPostalCode: "",
  shippingCountry: "Bangladesh",
  preferredCurrency: "USD",
  paymentTerms: "",
  defaultIncoterm: "",
  typicalLeadTimeDays: "",
  industrySegment: "",
  complianceLevel: "",
  creditLimit: "",
  notes: "",
};

export const CUSTOMER_FORM_BASE_INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0";

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Parse lead-time days from the form string; empty → undefined, invalid → undefined. */
function normalizeLeadTimeDays(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

export function shippingValuesFromForm(form: CustomerFormState): {
  shippingAddressLine1: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
} {
  if (!form.sameAsBilling) {
    return {
      shippingAddressLine1: form.shippingAddressLine1,
      shippingCity: form.shippingCity,
      shippingPostalCode: form.shippingPostalCode,
      shippingCountry: form.shippingCountry,
    };
  }
  return {
    shippingAddressLine1: form.billingAddressLine1,
    shippingCity: form.billingCity,
    shippingPostalCode: form.billingPostalCode,
    shippingCountry: form.billingCountry,
  };
}

/** Map GET customer API shape into the shared form (create/edit pages). */
export function customerFromApiToFormState(customer: CustomerResponse): CustomerFormState {
  return {
    legalEntityName: customer.legal_entity_name ?? customer.name,
    tradeName: customer.trade_name ?? "",
    taxIdVatNumber: customer.tax_id_vat_number ?? "",
    website: customer.website ?? "",
    customerType: normalizeCustomerTypeForForm(customer.customer_type),
    status: (customer.status?.toLowerCase() === "inactive" ? "inactive" : "active") as "active" | "inactive",
    primaryContactName: customer.primary_contact_name ?? "",
    designation: customer.designation ?? "",
    contactEmail: customer.contact_email ?? customer.email ?? "",
    countryCode: customer.phone_country_code ?? "+880",
    contactPhone: customer.contact_phone ?? customer.phone ?? "",
    subscribeNewsletter: customer.subscribe_newsletter,
    companyLogoUrl: customer.company_logo_url ?? "",
    billingAddressLine1: customer.billing_address_line1 ?? "",
    billingCity: customer.billing_city ?? "",
    billingPostalCode: customer.billing_postal_code ?? "",
    billingCountry: customer.billing_country ?? customer.country ?? "Bangladesh",
    sameAsBilling: customer.same_as_billing,
    shippingAddressLine1: customer.shipping_address_line1 ?? "",
    shippingCity: customer.shipping_city ?? "",
    shippingPostalCode: customer.shipping_postal_code ?? "",
    shippingCountry: customer.shipping_country ?? "",
    preferredCurrency: customer.preferred_currency?.trim() || "USD",
    paymentTerms: customer.payment_terms ?? "",
    defaultIncoterm: customer.default_incoterm ?? "",
    typicalLeadTimeDays:
      customer.typical_lead_time_days != null && Number.isFinite(customer.typical_lead_time_days)
        ? String(customer.typical_lead_time_days)
        : "",
    industrySegment: customer.industry_segment ?? "",
    complianceLevel: customer.compliance_level ?? "",
    creditLimit: customer.credit_limit ?? "",
    notes: customer.notes ?? "",
  };
}

/** Soft completeness hints — only Legal Entity / Name is hard-required to save. */
export function customerRecommendedMissing(form: CustomerFormState): string[] {
  const missing: string[] = [];
  if (!form.primaryContactName.trim()) missing.push("Primary contact");
  if (!form.contactEmail.trim()) missing.push("Contact email");
  if (!form.billingAddressLine1.trim()) missing.push("Billing street");
  if (!form.billingCity.trim()) missing.push("Billing city");
  if (!form.billingCountry.trim()) missing.push("Billing country");
  return missing;
}

/** Build PATCH payload from form + resolved shipping (same rules as create/edit pages). */
export function buildCustomerCreatePayload(
  form: CustomerFormState,
  shippingValues: ReturnType<typeof shippingValuesFromForm>,
): CustomerCreate {
  return {
    name: form.legalEntityName.trim(),
    legal_entity_name: form.legalEntityName.trim(),
    trade_name: normalizeOptional(form.tradeName),
    tax_id_vat_number: normalizeOptional(form.taxIdVatNumber),
    website: normalizeOptional(form.website),
    customer_type: normalizeOptional(form.customerType),
    status: form.status,
    primary_contact_name: normalizeOptional(form.primaryContactName),
    designation: normalizeOptional(form.designation),
    contact_email: normalizeOptional(form.contactEmail),
    email: normalizeOptional(form.contactEmail),
    phone_country_code: normalizeOptional(form.countryCode),
    contact_phone: normalizeOptional(form.contactPhone),
    phone: normalizeOptional(`${form.countryCode} ${form.contactPhone}`),
    subscribe_newsletter: form.subscribeNewsletter,
    company_logo_url: normalizeOptional(form.companyLogoUrl),
    billing_address_line1: normalizeOptional(form.billingAddressLine1),
    billing_city: normalizeOptional(form.billingCity),
    billing_postal_code: normalizeOptional(form.billingPostalCode),
    billing_country: normalizeOptional(form.billingCountry),
    shipping_address_line1: normalizeOptional(shippingValues.shippingAddressLine1),
    shipping_city: normalizeOptional(shippingValues.shippingCity),
    shipping_postal_code: normalizeOptional(shippingValues.shippingPostalCode),
    shipping_country: normalizeOptional(shippingValues.shippingCountry),
    same_as_billing: form.sameAsBilling,
    address: normalizeOptional(form.billingAddressLine1),
    country: normalizeOptional(form.billingCountry),
    preferred_currency: normalizeOptional(form.preferredCurrency) ?? "USD",
    payment_terms: normalizeOptional(form.paymentTerms),
    default_incoterm: normalizeOptional(form.defaultIncoterm),
    typical_lead_time_days: normalizeLeadTimeDays(form.typicalLeadTimeDays) ?? null,
    industry_segment: normalizeOptional(form.industrySegment),
    compliance_level: normalizeOptional(form.complianceLevel),
    credit_limit: normalizeOptional(form.creditLimit),
    notes: normalizeOptional(form.notes),
  };
}

export function buildCustomerUpdatePayload(
  form: CustomerFormState,
  shippingValues: ReturnType<typeof shippingValuesFromForm>,
): CustomerUpdate {
  return {
    name: form.legalEntityName.trim(),
    legal_entity_name: form.legalEntityName.trim(),
    trade_name: normalizeOptional(form.tradeName),
    tax_id_vat_number: normalizeOptional(form.taxIdVatNumber),
    website: normalizeOptional(form.website),
    customer_type: normalizeOptional(form.customerType),
    status: form.status,
    primary_contact_name: normalizeOptional(form.primaryContactName),
    designation: normalizeOptional(form.designation),
    contact_email: normalizeOptional(form.contactEmail),
    email: normalizeOptional(form.contactEmail),
    phone_country_code: normalizeOptional(form.countryCode),
    contact_phone: normalizeOptional(form.contactPhone),
    phone: normalizeOptional(`${form.countryCode} ${form.contactPhone}`),
    subscribe_newsletter: form.subscribeNewsletter,
    company_logo_url: normalizeOptional(form.companyLogoUrl),
    billing_address_line1: normalizeOptional(form.billingAddressLine1),
    billing_city: normalizeOptional(form.billingCity),
    billing_postal_code: normalizeOptional(form.billingPostalCode),
    billing_country: normalizeOptional(form.billingCountry),
    shipping_address_line1: normalizeOptional(shippingValues.shippingAddressLine1),
    shipping_city: normalizeOptional(shippingValues.shippingCity),
    shipping_postal_code: normalizeOptional(shippingValues.shippingPostalCode),
    shipping_country: normalizeOptional(shippingValues.shippingCountry),
    same_as_billing: form.sameAsBilling,
    address: normalizeOptional(form.billingAddressLine1),
    country: normalizeOptional(form.billingCountry),
    preferred_currency: normalizeOptional(form.preferredCurrency) ?? "USD",
    payment_terms: normalizeOptional(form.paymentTerms),
    default_incoterm: normalizeOptional(form.defaultIncoterm),
    typical_lead_time_days: normalizeLeadTimeDays(form.typicalLeadTimeDays) ?? null,
    industry_segment: normalizeOptional(form.industrySegment),
    compliance_level: normalizeOptional(form.complianceLevel),
    credit_limit: normalizeOptional(form.creditLimit),
    notes: normalizeOptional(form.notes),
  };
}
