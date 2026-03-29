/** Shared customer form shape for Create / Edit pages (no React components — safe for fast refresh). */

import type { CustomerCreate, CustomerResponse, CustomerUpdate } from "@/api/client";

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
};

export const INITIAL_CUSTOMER_FORM: CustomerFormState = {
  legalEntityName: "",
  tradeName: "",
  taxIdVatNumber: "",
  website: "",
  customerType: "enterprise",
  status: "active",
  primaryContactName: "",
  designation: "",
  contactEmail: "",
  countryCode: "+1",
  contactPhone: "",
  subscribeNewsletter: true,
  companyLogoUrl: "",
  billingAddressLine1: "",
  billingCity: "",
  billingPostalCode: "",
  billingCountry: "United States",
  sameAsBilling: true,
  shippingAddressLine1: "",
  shippingCity: "",
  shippingPostalCode: "",
  shippingCountry: "United States",
};

export const CUSTOMER_FORM_BASE_INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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
    customerType: customer.customer_type ?? "enterprise",
    status: (customer.status?.toLowerCase() === "inactive" ? "inactive" : "active") as "active" | "inactive",
    primaryContactName: customer.primary_contact_name ?? "",
    designation: customer.designation ?? "",
    contactEmail: customer.contact_email ?? customer.email ?? "",
    countryCode: customer.phone_country_code ?? "+1",
    contactPhone: customer.contact_phone ?? customer.phone ?? "",
    subscribeNewsletter: customer.subscribe_newsletter,
    companyLogoUrl: customer.company_logo_url ?? "",
    billingAddressLine1: customer.billing_address_line1 ?? "",
    billingCity: customer.billing_city ?? "",
    billingPostalCode: customer.billing_postal_code ?? "",
    billingCountry: customer.billing_country ?? customer.country ?? "",
    sameAsBilling: customer.same_as_billing,
    shippingAddressLine1: customer.shipping_address_line1 ?? "",
    shippingCity: customer.shipping_city ?? "",
    shippingPostalCode: customer.shipping_postal_code ?? "",
    shippingCountry: customer.shipping_country ?? "",
  };
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
    primary_contact_name: form.primaryContactName.trim(),
    designation: normalizeOptional(form.designation),
    contact_email: form.contactEmail.trim(),
    email: form.contactEmail.trim(),
    phone_country_code: normalizeOptional(form.countryCode),
    contact_phone: normalizeOptional(form.contactPhone),
    phone: normalizeOptional(`${form.countryCode} ${form.contactPhone}`),
    subscribe_newsletter: form.subscribeNewsletter,
    company_logo_url: normalizeOptional(form.companyLogoUrl),
    billing_address_line1: form.billingAddressLine1.trim(),
    billing_city: form.billingCity.trim(),
    billing_postal_code: normalizeOptional(form.billingPostalCode),
    billing_country: form.billingCountry.trim(),
    shipping_address_line1: shippingValues.shippingAddressLine1.trim(),
    shipping_city: shippingValues.shippingCity.trim(),
    shipping_postal_code: normalizeOptional(shippingValues.shippingPostalCode),
    shipping_country: shippingValues.shippingCountry.trim(),
    same_as_billing: form.sameAsBilling,
    address: form.billingAddressLine1.trim(),
    country: form.billingCountry.trim(),
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
    primary_contact_name: form.primaryContactName.trim(),
    designation: normalizeOptional(form.designation),
    contact_email: form.contactEmail.trim(),
    email: form.contactEmail.trim(),
    phone_country_code: normalizeOptional(form.countryCode),
    contact_phone: normalizeOptional(form.contactPhone),
    phone: normalizeOptional(`${form.countryCode} ${form.contactPhone}`),
    subscribe_newsletter: form.subscribeNewsletter,
    company_logo_url: normalizeOptional(form.companyLogoUrl),
    billing_address_line1: form.billingAddressLine1.trim(),
    billing_city: form.billingCity.trim(),
    billing_postal_code: normalizeOptional(form.billingPostalCode),
    billing_country: form.billingCountry.trim(),
    shipping_address_line1: shippingValues.shippingAddressLine1.trim(),
    shipping_city: shippingValues.shippingCity.trim(),
    shipping_postal_code: normalizeOptional(shippingValues.shippingPostalCode),
    shipping_country: shippingValues.shippingCountry.trim(),
    same_as_billing: form.sameAsBilling,
    address: form.billingAddressLine1.trim(),
    country: form.billingCountry.trim(),
  };
}
