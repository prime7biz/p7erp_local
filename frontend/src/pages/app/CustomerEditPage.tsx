import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Mail, MapPin, Save, Upload } from "lucide-react";
import { api, type CustomerUpdate } from "@/api/client";

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

function resolveAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  return `${base}${pathOrUrl}`;
}

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<CustomerFormState | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError("Invalid customer id.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const customer = await api.getCustomer(Number(id));
        setForm({
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
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load customer.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  const shippingValues = useMemo(() => {
    if (!form) {
      return {
        shippingAddressLine1: "",
        shippingCity: "",
        shippingPostalCode: "",
        shippingCountry: "",
      };
    }
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
    if (!form) return "Form is not ready.";
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

  const toPayload = (): CustomerUpdate => {
    if (!form) return {};
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

  const handleLogoPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected || !form) return;
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
      setForm((prev) => (prev ? { ...prev, companyLogoUrl: result.logo_url } : prev));
      setSuccess("Logo uploaded successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
      if (event.target) event.target.value = "";
    }
  };

  const submit = async () => {
    if (!id || !form) return;
    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      await api.updateCustomer(Number(id), toPayload());
      setSuccess("Customer updated successfully.");
      navigate(`/app/customers/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update customer.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-500">Loading customer for edit...</div>;
  }

  if (!form) {
    return (
      <div className="space-y-3 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Customer not found."}
        </div>
        <Link to="/app/customers" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to={`/app/customers/${id}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Back to customer details
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Edit Customer Profile</h1>
          <p className="mt-1 text-sm text-slate-500">Update full customer profile details using the advanced form.</p>
          <p className="mt-1 text-xs text-slate-500">Fields marked with ** are mandatory.</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-6"
      >
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <Building2 className="h-4 w-4" />
            General Information
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Legal Entity Name **</label>
              <input
                type="text"
                value={form.legalEntityName}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, legalEntityName: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Trade Name / Brand</label>
              <input
                type="text"
                value={form.tradeName}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, tradeName: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tax ID / VAT Number</label>
              <input
                type="text"
                value={form.taxIdVatNumber}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, taxIdVatNumber: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Website URL</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, website: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Customer Type</label>
              <select
                value={form.customerType}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, customerType: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="enterprise">Enterprise</option>
                <option value="sme">SME</option>
                <option value="startup">Startup</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, status: e.target.value as "active" | "inactive" } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Company Logo (Optional)</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={form.companyLogoUrl}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, companyLogoUrl: e.target.value } : prev))}
                  placeholder="Upload a logo or paste URL"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
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
                <div className="mt-3 inline-flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <img src={resolveAssetUrl(form.companyLogoUrl)} alt="Company logo preview" className="h-10 w-10 rounded object-cover" />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => (prev ? { ...prev, companyLogoUrl: "" } : prev))}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">Accepted: PNG, JPG, GIF, WEBP (max 2MB).</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <Mail className="h-4 w-4" />
            Contact & Communication
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Primary Contact Name **</label>
              <input
                type="text"
                value={form.primaryContactName}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, primaryContactName: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Designation / Role</label>
              <input
                type="text"
                value={form.designation}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, designation: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email Address **</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, contactEmail: e.target.value } : prev))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.countryCode}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, countryCode: e.target.value } : prev))}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={form.contactPhone}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, contactPhone: e.target.value } : prev))}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={form.subscribeNewsletter}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, subscribeNewsletter: e.target.checked } : prev))}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                Subscribe to newsletter & updates
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-orange-500">
            <MapPin className="h-4 w-4" />
            Addresses
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Billing Address</h3>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Street Address **</label>
                <input
                  type="text"
                  value={form.billingAddressLine1}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, billingAddressLine1: e.target.value } : prev))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">City **</label>
                  <input
                    type="text"
                    value={form.billingCity}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, billingCity: e.target.value } : prev))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Postal Code</label>
                  <input
                    type="text"
                    value={form.billingPostalCode}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, billingPostalCode: e.target.value } : prev))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country **</label>
                <input
                  type="text"
                  value={form.billingCountry}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, billingCountry: e.target.value } : prev))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Shipping Address</h3>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-orange-500">
                  <input
                    type="checkbox"
                    checked={form.sameAsBilling}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, sameAsBilling: e.target.checked } : prev))}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  Same as billing
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Street Address **</label>
                <input
                  type="text"
                  value={shippingValues.shippingAddressLine1}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, shippingAddressLine1: e.target.value } : prev))}
                  disabled={form.sameAsBilling}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">City **</label>
                  <input
                    type="text"
                    value={shippingValues.shippingCity}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, shippingCity: e.target.value } : prev))}
                    disabled={form.sameAsBilling}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Postal Code</label>
                  <input
                    type="text"
                    value={shippingValues.shippingPostalCode}
                    onChange={(e) => setForm((prev) => (prev ? { ...prev, shippingPostalCode: e.target.value } : prev))}
                    disabled={form.sameAsBilling}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Country **</label>
                <input
                  type="text"
                  value={shippingValues.shippingCountry}
                  onChange={(e) => setForm((prev) => (prev ? { ...prev, shippingCountry: e.target.value } : prev))}
                  disabled={form.sameAsBilling}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to={`/app/customers/${id}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {submitting ? "Updating..." : "Update Customer"}
          </button>
        </div>
      </form>
    </div>
  );
}
