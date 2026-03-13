import { useEffect, useState } from "react";
import { api, type CommissionMode, type SettingsConfigUpdate, type TenantType } from "@/api/client";

const TENANT_TYPE_OPTIONS: Array<{ value: TenantType; label: string }> = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "buying_house", label: "Buying House" },
  { value: "both", label: "Both" },
];

const COMMISSION_MODE_OPTIONS: Array<{ value: CommissionMode; label: string }> = [
  { value: "INCLUDE", label: "INCLUDE" },
  { value: "EXCLUDE", label: "EXCLUDE" },
];

export function TenantSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [form, setForm] = useState<SettingsConfigUpdate>({
    company_name: "",
    domain: "",
    logo: "",
    tenant_type: "both",
    default_commission_mode: null,
  });

  useEffect(() => {
    api
      .getSettingsConfig()
      .then((data) => {
        setCompanyCode(data.company_code ?? "N/A");
        setForm({
          company_name: data.company_name,
          domain: data.domain ?? "",
          logo: data.logo ?? "",
          tenant_type: data.tenant_type,
          default_commission_mode: data.default_commission_mode ?? null,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tenant settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api.updateSettingsConfig({
        company_name: form.company_name.trim(),
        domain: form.domain?.trim() || null,
        logo: form.logo?.trim() || null,
        tenant_type: form.tenant_type,
        default_commission_mode: form.default_commission_mode ?? null,
      });
      setForm({
        company_name: updated.company_name,
        domain: updated.domain ?? "",
        logo: updated.logo ?? "",
        tenant_type: updated.tenant_type,
        default_commission_mode: updated.default_commission_mode ?? null,
      });
      setSuccess("Tenant settings updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading tenant settings...</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Tenant Settings</h2>
        <p className="text-sm text-gray-600">
          Company profile and tenant type for this organization.
        </p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
        </div>
      )}
      <form onSubmit={handleSave} className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company code</label>
          <p className="text-gray-900 font-mono">{companyCode}</p>
          <p className="text-xs text-gray-500 mt-0.5">Read-only; used for login.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company name **</label>
          <input
            type="text"
            value={form.company_name}
            onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Domain (optional)</label>
          <input
            type="text"
            value={form.domain ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value || null }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenant type</label>
          <select
            value={form.tenant_type}
            onChange={(e) => setForm((f) => ({ ...f, tenant_type: e.target.value as TenantType }))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {TENANT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default commission mode
          </label>
          <select
            value={form.default_commission_mode ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                default_commission_mode: (e.target.value || null) as CommissionMode | null,
              }))
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">No default</option>
            {COMMISSION_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Used as fallback on inquiry/quotation create when no customer link commission is set.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
