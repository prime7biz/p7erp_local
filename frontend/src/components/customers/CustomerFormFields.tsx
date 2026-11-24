import { type ChangeEvent, type Ref, type RefObject, type SetStateAction } from "react";
import { Building2, ClipboardList, Mail, MapPin, Upload } from "lucide-react";
import { FormCitySelect, FormCountrySelect } from "@/components/customers/CustomerLocationFields";
import {
  CUSTOMER_FORM_BASE_INPUT,
  CUSTOMER_TYPE_OPTIONS,
  type CustomerFormState,
} from "@/components/customers/customerFormShared";
import { citiesForCountry } from "@/data/formLocations";
import { cn } from "@/lib/utils";
import type { FieldConfidence } from "@/types/extraction";

const INCOTERM_OPTIONS = ["EXW", "FOB", "CIF", "CFR", "DDP", "DAP", "FCA"] as const;

export type CustomerFormFieldsProps = {
  /** Active currency codes from costing master (fallback to USD-only if empty) */
  currencyOptions?: { code: string; name: string }[];
  form: CustomerFormState;
  patchForm: (p: Partial<CustomerFormState>) => void;
  setForm: (update: SetStateAction<CustomerFormState>) => void;
  shippingValues: {
    shippingAddressLine1: string;
    shippingCity: string;
    shippingPostalCode: string;
    shippingCountry: string;
  };
  clearAutofillKeys: (...keys: string[]) => void;
  autofilled: Partial<Record<string, FieldConfidence>>;
  autofillBorder: (level?: FieldConfidence) => string;
  logoFileInputRef: RefObject<HTMLInputElement | null>;
  companyLogoDisplayUrl: string | null | undefined;
  logoUploading: boolean;
  onLogoPick: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Soft duplicate check when leaving Legal Entity Name */
  onLegalEntityNameBlur?: () => void;
  /** Soft duplicate check when leaving Contact Email */
  onContactEmailBlur?: () => void;
};

export function CustomerFormFields({
  currencyOptions = [],
  form,
  patchForm,
  setForm,
  shippingValues,
  clearAutofillKeys,
  autofilled,
  autofillBorder,
  logoFileInputRef,
  companyLogoDisplayUrl,
  logoUploading,
  onLogoPick,
  onLegalEntityNameBlur,
  onContactEmailBlur,
}: CustomerFormFieldsProps) {
  const currencySelectOptions =
    currencyOptions.length > 0
      ? currencyOptions
      : [{ code: "USD", name: "US Dollar" }, { code: "EUR", name: "Euro" }, { code: "BDT", name: "Bangladesh Taka" }];

  return (
    <>
      <section className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
          <Building2 className="h-4 w-4" />
          General Information
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-text-secondary">Legal Entity Name **</label>
            <input
              type="text"
              value={form.legalEntityName}
              onChange={(e) => patchForm({ legalEntityName: e.target.value })}
              onBlur={() => onLegalEntityNameBlur?.()}
              placeholder="e.g. Acme Corp Industries Ltd."
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.legalEntityName))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Trade Name / Brand</label>
            <input
              type="text"
              value={form.tradeName}
              onChange={(e) => patchForm({ tradeName: e.target.value })}
              placeholder="e.g. Acme Retail"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.tradeName))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Tax ID / VAT Number</label>
            <input
              type="text"
              value={form.taxIdVatNumber}
              onChange={(e) => patchForm({ taxIdVatNumber: e.target.value })}
              placeholder="TX-992031"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.taxIdVatNumber))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Website URL</label>
            <input
              type="url"
              value={form.website}
              onChange={(e) => patchForm({ website: e.target.value })}
              placeholder="https://www.acme.com"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.website))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Customer Type</label>
            <select
              value={form.customerType}
              onChange={(e) => patchForm({ customerType: e.target.value })}
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.customerType))}
            >
              {CUSTOMER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {["enterprise", "sme", "startup"].includes(form.customerType) ? (
                <option value={form.customerType}>
                  {form.customerType === "enterprise"
                    ? "Enterprise (legacy)"
                    : form.customerType === "sme"
                      ? "SME (legacy)"
                      : "Startup (legacy)"}
                </option>
              ) : null}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as "active" | "inactive" }))}
              className={CUSTOMER_FORM_BASE_INPUT}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Preferred quotation currency</label>
            <select
              value={form.preferredCurrency}
              onChange={(e) => patchForm({ preferredCurrency: e.target.value })}
              className={CUSTOMER_FORM_BASE_INPUT}
            >
              {currencySelectOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                  {c.name ? ` — ${c.name}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-text-muted">Used as default document currency on new quotations.</p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-text-secondary">Company Logo (Optional)</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={form.companyLogoUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, companyLogoUrl: e.target.value }))}
                placeholder="Upload a logo or paste URL"
                className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              />
              <button
                type="button"
                onClick={() => logoFileInputRef.current?.click()}
                disabled={logoUploading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
              >
                <Upload className="h-4 w-4" />
                {logoUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            <input
              ref={logoFileInputRef as Ref<HTMLInputElement>}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              onChange={onLogoPick}
              className="hidden"
            />
            {form.companyLogoUrl ? (
              <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-2">
                <img
                  src={companyLogoDisplayUrl ?? undefined}
                  alt="Company logo preview"
                  className="h-10 w-10 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, companyLogoUrl: "" }))}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  Remove
                </button>
              </div>
            ) : null}
            <p className="mt-1 text-xs text-text-muted">Accepted: PNG, JPG, GIF, WEBP (max 2MB).</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
          <Mail className="h-4 w-4" />
          Contact & Communication
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Primary Contact Name <span className="font-normal text-text-muted">(recommended)</span>
            </label>
            <input
              type="text"
              value={form.primaryContactName}
              onChange={(e) => patchForm({ primaryContactName: e.target.value })}
              placeholder="Full name of person in charge"
              className={cn(
                CUSTOMER_FORM_BASE_INPUT,
                !form.primaryContactName.trim() && "border-status-warning/50 bg-status-warning-subtle/30",
                autofillBorder(autofilled.primaryContactName),
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Designation / Role</label>
            <input
              type="text"
              value={form.designation}
              onChange={(e) => patchForm({ designation: e.target.value })}
              placeholder="e.g. Procurement Manager"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.designation))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Email Address <span className="font-normal text-text-muted">(recommended)</span>
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => patchForm({ contactEmail: e.target.value })}
              onBlur={() => onContactEmailBlur?.()}
              placeholder="contact@company.com"
              className={cn(
                CUSTOMER_FORM_BASE_INPUT,
                !form.contactEmail.trim() && "border-status-warning/50 bg-status-warning-subtle/30",
                autofillBorder(autofilled.contactEmail),
              )}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Phone Number</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.countryCode}
                onChange={(e) => patchForm({ countryCode: e.target.value })}
                className={cn(CUSTOMER_FORM_BASE_INPUT, "w-20", autofillBorder(autofilled.countryCode))}
              />
              <input
                type="text"
                value={form.contactPhone}
                onChange={(e) => patchForm({ contactPhone: e.target.value })}
                placeholder="(555) 000-0000"
                className={cn(CUSTOMER_FORM_BASE_INPUT, "flex-1", autofillBorder(autofilled.contactPhone))}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle">
              <input
                type="checkbox"
                checked={form.subscribeNewsletter}
                onChange={(e) => setForm((prev) => ({ ...prev, subscribeNewsletter: e.target.checked }))}
                className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-focus-ring"
              />
              Subscribe to newsletter & updates
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
          <MapPin className="h-4 w-4" />
          Addresses
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold text-text-primary">Billing Address</h3>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Street Address <span className="font-normal text-text-muted">(recommended)</span>
              </label>
              <input
                type="text"
                value={form.billingAddressLine1}
                onChange={(e) => patchForm({ billingAddressLine1: e.target.value })}
                className={cn(
                  CUSTOMER_FORM_BASE_INPUT,
                  !form.billingAddressLine1.trim() && "border-status-warning/50 bg-status-warning-subtle/30",
                  autofillBorder(autofilled.billingAddressLine1),
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">
                  City <span className="font-normal text-text-muted">(recommended)</span>
                </label>
                <FormCitySelect
                  country={form.billingCountry}
                  value={form.billingCity}
                  onChange={(next) => patchForm({ billingCity: next })}
                  className={cn(
                    !form.billingCity.trim() && "border-status-warning/50 bg-status-warning-subtle/30",
                    autofillBorder(autofilled.billingCity),
                  )}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Postal Code</label>
                <input
                  type="text"
                  value={form.billingPostalCode}
                  onChange={(e) => patchForm({ billingPostalCode: e.target.value })}
                  className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.billingPostalCode))}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Country <span className="font-normal text-text-muted">(recommended)</span>
              </label>
              <FormCountrySelect
                value={form.billingCountry}
                onChange={(next) =>
                  setForm((prev) => {
                    const cities = citiesForCountry(next);
                    const keep = cities.includes(prev.billingCity);
                    return { ...prev, billingCountry: next, billingCity: keep ? prev.billingCity : "" };
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Shipping Address</h3>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-status-warning">
                <input
                  type="checkbox"
                  checked={form.sameAsBilling}
                  onChange={(e) => setForm((prev) => ({ ...prev, sameAsBilling: e.target.checked }))}
                  className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-focus-ring"
                />
                Same as billing
              </label>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Street Address</label>
              <input
                type="text"
                value={shippingValues.shippingAddressLine1}
                onChange={(e) => patchForm({ shippingAddressLine1: e.target.value })}
                disabled={form.sameAsBilling}
                className={cn(
                  CUSTOMER_FORM_BASE_INPUT,
                  "disabled:bg-surface-subtle",
                  autofillBorder(autofilled.shippingAddressLine1),
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">City</label>
                <FormCitySelect
                  country={shippingValues.shippingCountry}
                  value={shippingValues.shippingCity}
                  onChange={(next) => patchForm({ shippingCity: next })}
                  disabled={form.sameAsBilling}
                  className={autofillBorder(autofilled.shippingCity)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Postal Code</label>
                <input
                  type="text"
                  value={shippingValues.shippingPostalCode}
                  onChange={(e) => patchForm({ shippingPostalCode: e.target.value })}
                  disabled={form.sameAsBilling}
                  className={cn(
                    CUSTOMER_FORM_BASE_INPUT,
                    "disabled:bg-surface-subtle",
                    autofillBorder(autofilled.shippingPostalCode),
                  )}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Country</label>
              <FormCountrySelect
                value={shippingValues.shippingCountry}
                onChange={(next) => {
                  if (form.sameAsBilling) return;
                  clearAutofillKeys("shippingCountry", "shippingCity");
                  setForm((prev) => {
                    const cities = citiesForCountry(next);
                    const keep = cities.includes(prev.shippingCity);
                    return { ...prev, shippingCountry: next, shippingCity: keep ? prev.shippingCity : "" };
                  });
                }}
                disabled={form.sameAsBilling}
                className={autofillBorder(autofilled.shippingCountry)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-status-warning">
          <ClipboardList className="h-4 w-4" />
          Commercial defaults
        </div>
        <p className="mb-4 text-xs text-text-muted">
          Optional. Used as hints on new quotations and orders — not hard credit control.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Payment terms</label>
            <input
              type="text"
              value={form.paymentTerms}
              onChange={(e) => patchForm({ paymentTerms: e.target.value })}
              placeholder="e.g. Net 30, LC at sight"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.paymentTerms))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Default Incoterm</label>
            <select
              value={form.defaultIncoterm}
              onChange={(e) => patchForm({ defaultIncoterm: e.target.value })}
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.defaultIncoterm))}
            >
              <option value="">— Select —</option>
              {INCOTERM_OPTIONS.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
              {form.defaultIncoterm &&
              !(INCOTERM_OPTIONS as readonly string[]).includes(form.defaultIncoterm) ? (
                <option value={form.defaultIncoterm}>{form.defaultIncoterm}</option>
              ) : null}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Typical lead time (days)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.typicalLeadTimeDays}
              onChange={(e) => patchForm({ typicalLeadTimeDays: e.target.value })}
              placeholder="e.g. 45"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.typicalLeadTimeDays))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Industry segment</label>
            <input
              type="text"
              value={form.industrySegment}
              onChange={(e) => patchForm({ industrySegment: e.target.value })}
              placeholder="e.g. Knitwear, Denim"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.industrySegment))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Compliance level</label>
            <input
              type="text"
              value={form.complianceLevel}
              onChange={(e) => patchForm({ complianceLevel: e.target.value })}
              placeholder="e.g. Standard, High"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.complianceLevel))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">
              Credit limit <span className="font-normal text-text-muted">(informational)</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form.creditLimit}
              onChange={(e) => patchForm({ creditLimit: e.target.value })}
              placeholder="e.g. 100000.00"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.creditLimit))}
            />
            <p className="mt-1 text-xs text-text-muted">Stored for reference only — not enforced on orders.</p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-text-secondary">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.target.value })}
              rows={3}
              placeholder="Internal notes about this customer"
              className={cn(CUSTOMER_FORM_BASE_INPUT, autofillBorder(autofilled.notes))}
            />
          </div>
        </div>
      </section>
    </>
  );
}
