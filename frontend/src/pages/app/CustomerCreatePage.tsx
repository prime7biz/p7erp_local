import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Mail, MapPin, PlusCircle, Save, Upload } from "lucide-react";
import { api, type CustomerCreate } from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { ExtractionStatusBanner } from "@/components/ai-extract/ExtractionStatusBanner";
import { FileImportCard } from "@/components/ai-extract/FileImportCard";
import { FormCitySelect, FormCountrySelect } from "@/components/customers/CustomerLocationFields";
import { citiesForCountry } from "@/data/formLocations";
import { useDocumentExtraction } from "@/hooks/useDocumentExtraction";
import { useSecureImage } from "@/hooks/useSecureImage";
import { cn } from "@/lib/utils";
import type { ConflictResolutionChoice, FieldApplyState, FieldConfidence } from "@/types/extraction";
import {
  buildCustomerFieldApplyStates,
  deriveConfidenceLevel,
  formatExtractedValue,
} from "@/utils/extractionHelpers";

type CustomerFormState = {
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

const INITIAL_FORM: CustomerFormState = {
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

const BASE_INPUT =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

function autofillBorder(level?: FieldConfidence): string {
  if (!level) return "";
  if (level === "high") return "border-l-[3px] border-l-status-success pl-2";
  if (level === "medium") return "border-l-[3px] border-l-status-warning pl-2";
  return "border-l-[3px] border-l-status-danger pl-2";
}

function customerFormSnapshot(f: CustomerFormState): Record<string, string> {
  return {
    legalEntityName: f.legalEntityName,
    tradeName: f.tradeName,
    taxIdVatNumber: f.taxIdVatNumber,
    website: f.website,
    primaryContactName: f.primaryContactName,
    designation: f.designation,
    contactEmail: f.contactEmail,
    countryCode: f.countryCode,
    contactPhone: f.contactPhone,
    billingAddressLine1: f.billingAddressLine1,
    billingCity: f.billingCity,
    billingPostalCode: f.billingPostalCode,
    billingCountry: f.billingCountry,
    shippingAddressLine1: f.shippingAddressLine1,
    shippingCity: f.shippingCity,
    shippingPostalCode: f.shippingPostalCode,
    shippingCountry: f.shippingCountry,
  };
}

function normalizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isValidWebsite(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  if (!value.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function CustomerCreatePage() {
  const [form, setForm] = useState<CustomerFormState>(INITIAL_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const companyLogoDisplayUrl = useSecureImage(form.companyLogoUrl);

  const extraction = useDocumentExtraction("customer");
  const [autofilled, setAutofilled] = useState<Partial<Record<string, FieldConfidence>>>({});
  const [reviewRows, setReviewRows] = useState<FieldApplyState[]>([]);

  useEffect(() => {
    const res = extraction.customerResponse;
    if (!res) {
      setReviewRows([]);
      return;
    }
    const next = buildCustomerFieldApplyStates(res, customerFormSnapshot(form));
    setReviewRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [extraction.customerResponse, form]);

  const suggestSameAsBilling = useMemo(() => {
    const res = extraction.customerResponse;
    if (!res?.success) return false;
    const b1 = res.fields.billingAddressLine1?.value;
    const s1 = res.fields.shippingAddressLine1?.value;
    const hasBilling = Boolean(b1 && String(b1).trim());
    const hasShipping = Boolean(s1 && String(s1).trim());
    return hasBilling && !hasShipping;
  }, [extraction.customerResponse]);

  const shippingValues = useMemo(() => {
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
  }, [form]);

  const validate = (): string | null => {
    if (!form.legalEntityName.trim()) return "Legal entity name is required.";
    if (!form.primaryContactName.trim()) return "Primary contact name is required.";
    if (!isValidEmail(form.contactEmail)) return "Please enter a valid contact email.";
    if (!isValidWebsite(form.website)) return "Please provide a valid website URL (https://...).";
    if (!form.billingAddressLine1.trim()) return "Billing address is required.";
    if (!form.billingCity.trim()) return "Billing city is required.";
    if (!form.billingCountry.trim()) return "Billing country is required.";
    if (!shippingValues.shippingAddressLine1.trim()) return "Shipping address is required.";
    if (!shippingValues.shippingCity.trim()) return "Shipping city is required.";
    if (!shippingValues.shippingCountry.trim()) return "Shipping country is required.";
    return null;
  };

  const toPayload = (): CustomerCreate => {
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
  };

  const patchForm = (patch: Partial<CustomerFormState>) => {
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of Object.keys(patch)) {
        delete n[k];
      }
      return n;
    });
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const applyExtractedPatch = (
    patch: Partial<CustomerFormState>,
    levels: Partial<Record<string, FieldConfidence>>,
  ) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setAutofilled((prev) => ({ ...prev, ...levels }));
  };

  const clearAutofillKeys = (...keys: string[]) => {
    setAutofilled((af) => {
      const n = { ...af };
      for (const k of keys) delete n[k];
      return n;
    });
  };

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setError("");
    extraction.clear();
    setAutofilled({});
    setReviewRows([]);
  };

  const handleExtractFile = async (file: File) => {
    await extraction.extract(file);
  };

  const handleClearImport = () => {
    extraction.clear();
    setReviewRows([]);
  };

  const handleApplyField = (key: string) => {
    const res = extraction.customerResponse;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    const level = deriveConfidenceLevel(typeof ef.confidence === "number" ? ef.confidence : 0);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
    );
  };

  const handleApplyAllHigh = () => {
    const res = extraction.customerResponse;
    if (!res) return;
    const toApply = reviewRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    const patch: Partial<CustomerFormState> = {};
    const levels: Partial<Record<string, FieldConfidence>> = {};
    for (const row of toApply) {
      const ef = res.fields[row.fieldKey];
      if (!ef) continue;
      (patch as Record<string, string>)[row.fieldKey] = formatExtractedValue(ef.value);
      levels[row.fieldKey] = deriveConfidenceLevel(ef.confidence);
    }
    applyExtractedPatch(patch, levels);
    setReviewRows((rs) =>
      rs.map((r) =>
        toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
      ),
    );
  };

  const handleSkipField = (key: string) => {
    setReviewRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleResolveConflict = (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      handleSkipField(key);
      return;
    }
    const res = extraction.customerResponse;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    const level: FieldConfidence = choice === "merge" ? "low" : deriveConfidenceLevel(ef.confidence);
    applyExtractedPatch({ [key]: v } as Partial<CustomerFormState>, { [key]: level });
    setReviewRows((rs) =>
      rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
    );
  };

  const handleLogoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);
    if (!allowedTypes.has(selected.type)) {
      setError("Unsupported logo type. Use PNG, JPG, GIF, or WEBP.");
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setError("Logo file is too large. Maximum size is 2MB.");
      return;
    }
    setError("");
    setLogoUploading(true);
    try {
      const result = await api.uploadCustomerLogo(selected);
      setForm((prev) => ({ ...prev, companyLogoUrl: result.logo_url }));
      setSuccess("Logo uploaded successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async (mode: "close" | "addAnother") => {
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      await api.createCustomer(toPayload());
      if (mode === "addAnother") {
        resetForm();
        setSuccess("Customer created. You can now add another one.");
      } else {
        navigate("/app/customers");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create customer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/app/customers" className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Customer Profile</h1>
          <p className="mt-1 text-sm text-text-muted">
            Provide comprehensive details for the new business entity to streamline invoicing and communication.
          </p>
          <p className="mt-1 text-xs text-text-muted">Fields marked with ** are mandatory.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}
      {success && (
        <div className="rounded-xl border border-status-success/30 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        </div>
      )}

      <FileImportCard
        title="Import Customer Info"
        subtitle="Upload a business card, company profile, letterhead, form, email screenshot, or registration document to auto-fill known fields."
        status={extraction.status}
        error={extraction.error}
        onExtract={handleExtractFile}
        onClear={handleClearImport}
      />

      <ExtractionStatusBanner
        status={extraction.status}
        extractedCount={Object.values(extraction.customerResponse?.fields ?? {}).filter(
          (f) => f.value !== null && f.value !== undefined && String(f.value).trim() !== "",
        ).length}
        warnings={[
          ...(extraction.customerResponse?.warnings ?? []),
          ...(extraction.customerResponse?.unmapped_text?.map((t) => `Unmapped: ${t}`) ?? []),
        ]}
        error={extraction.error}
      />

      {extraction.customerResponse && extraction.customerResponse.duplicate_warnings.length > 0 ? (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
          <p className="font-medium text-text-primary">Possible duplicate customers</p>
          <ul className="text-text-secondary mt-1 list-inside list-disc">
            {extraction.customerResponse.duplicate_warnings.map((d) => (
              <li key={`${d.field}-${d.existing_id}`}>
                {d.field}: similar to “{d.existing_value}” (ID {d.existing_id})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestSameAsBilling ? (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-primary/25 bg-brand-primary/5 px-3 py-3 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between">
          <p>
            Billing address was detected but shipping was not. If delivery is the same, enable{" "}
            <strong>Same as billing</strong> for shipping.
          </p>
          <button
            type="button"
            onClick={() => patchForm({ sameAsBilling: true })}
            className="shrink-0 rounded-lg border border-brand-primary/40 bg-surface-base px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/10"
          >
            Enable same as billing
          </button>
        </div>
      ) : null}

      {reviewRows.length > 0 && extraction.customerResponse ? (
        <AutofillReviewPanel
          fields={reviewRows}
          onApply={handleApplyField}
          onApplyAllHigh={handleApplyAllHigh}
          onSkip={handleSkipField}
          onResolveConflict={handleResolveConflict}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit("close");
        }}
        className="space-y-6"
      >
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
                placeholder="e.g. Acme Corp Industries Ltd."
                className={cn(BASE_INPUT, autofillBorder(autofilled.legalEntityName))}
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
                className={cn(BASE_INPUT, autofillBorder(autofilled.tradeName))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Tax ID / VAT Number</label>
              <input
                type="text"
                value={form.taxIdVatNumber}
                onChange={(e) => patchForm({ taxIdVatNumber: e.target.value })}
                placeholder="TX-992031"
                className={cn(BASE_INPUT, autofillBorder(autofilled.taxIdVatNumber))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Website URL</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => patchForm({ website: e.target.value })}
                placeholder="https://www.acme.com"
                className={cn(BASE_INPUT, autofillBorder(autofilled.website))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Customer Type</label>
              <select
                value={form.customerType}
                onChange={(e) => patchForm({ customerType: e.target.value })}
                className={cn(BASE_INPUT, autofillBorder(autofilled.customerType))}
              >
                <option value="enterprise">Enterprise</option>
                <option value="sme">SME</option>
                <option value="startup">Startup</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as "active" | "inactive" }))}
                className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                >
                  <Upload className="h-4 w-4" />
                  {logoUploading ? "Uploading..." : "Upload"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                onChange={handleLogoPick}
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
              <label className="mb-1 block text-sm font-medium text-text-secondary">Primary Contact Name **</label>
              <input
                type="text"
                value={form.primaryContactName}
                onChange={(e) => patchForm({ primaryContactName: e.target.value })}
                placeholder="Full name of person in charge"
                className={cn(BASE_INPUT, autofillBorder(autofilled.primaryContactName))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Designation / Role</label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => patchForm({ designation: e.target.value })}
                placeholder="e.g. Procurement Manager"
                className={cn(BASE_INPUT, autofillBorder(autofilled.designation))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Email Address **</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => patchForm({ contactEmail: e.target.value })}
                placeholder="contact@company.com"
                className={cn(BASE_INPUT, autofillBorder(autofilled.contactEmail))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.countryCode}
                  onChange={(e) => patchForm({ countryCode: e.target.value })}
                  className={cn(BASE_INPUT, "w-20", autofillBorder(autofilled.countryCode))}
                />
                <input
                  type="text"
                  value={form.contactPhone}
                  onChange={(e) => patchForm({ contactPhone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className={cn(BASE_INPUT, "flex-1", autofillBorder(autofilled.contactPhone))}
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
                <label className="mb-1 block text-sm font-medium text-text-secondary">Street Address **</label>
                <input
                  type="text"
                  value={form.billingAddressLine1}
                  onChange={(e) => patchForm({ billingAddressLine1: e.target.value })}
                  className={cn(BASE_INPUT, autofillBorder(autofilled.billingAddressLine1))}
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-secondary">City **</label>
                  <FormCitySelect
                    country={form.billingCountry}
                    value={form.billingCity}
                    onChange={(next) => patchForm({ billingCity: next })}
                    className={autofillBorder(autofilled.billingCity)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-secondary">Postal Code</label>
                  <input
                    type="text"
                    value={form.billingPostalCode}
                    onChange={(e) => patchForm({ billingPostalCode: e.target.value })}
                    className={cn(BASE_INPUT, autofillBorder(autofilled.billingPostalCode))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Country **</label>
                <FormCountrySelect
                  value={form.billingCountry}
                  onChange={(next) =>
                    setForm((prev) => {
                      const cities = citiesForCountry(next);
                      const keep = cities.includes(prev.billingCity);
                      return { ...prev, billingCountry: next, billingCity: keep ? prev.billingCity : "" };
                    })
                  }
                  required
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
                <label className="mb-1 block text-sm font-medium text-text-secondary">Street Address **</label>
                <input
                  type="text"
                  value={shippingValues.shippingAddressLine1}
                  onChange={(e) => patchForm({ shippingAddressLine1: e.target.value })}
                  disabled={form.sameAsBilling}
                  className={cn(BASE_INPUT, "disabled:bg-surface-subtle", autofillBorder(autofilled.shippingAddressLine1))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-text-secondary">City **</label>
                  <FormCitySelect
                    country={shippingValues.shippingCountry}
                    value={shippingValues.shippingCity}
                    onChange={(next) => patchForm({ shippingCity: next })}
                    disabled={form.sameAsBilling}
                    className={autofillBorder(autofilled.shippingCity)}
                    required={!form.sameAsBilling}
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
                      BASE_INPUT,
                      "disabled:bg-surface-subtle",
                      autofillBorder(autofilled.shippingPostalCode),
                    )}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-secondary">Country **</label>
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
                  required={!form.sameAsBilling}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            to="/app/customers"
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => void submit("addAnother")}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/10 disabled:opacity-60"
          >
            <PlusCircle className="h-4 w-4" />
            Save & Add Another
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Saving..." : "Save Customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
