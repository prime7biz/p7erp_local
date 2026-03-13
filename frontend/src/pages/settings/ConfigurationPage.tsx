import { useEffect, useState } from "react";
import { api, type SettingsConfigUpdate, type TenantType } from "@/api/client";

const TENANT_TYPE_OPTIONS: Array<{ value: TenantType; label: string }> = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "buying_house", label: "Buying House" },
  { value: "both", label: "Both" },
];

export function ConfigurationPage() {
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
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
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
      });
      setForm({
        company_name: updated.company_name,
        domain: updated.domain ?? "",
        logo: updated.logo ?? "",
        tenant_type: updated.tenant_type,
      });
      setSuccess("Configuration updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading configuration...</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Configuration</h2>
        <p className="text-sm text-gray-600">
          Update basic company settings for this tenant.
        </p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}
        </div>
      )}

      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        Company code: <span className="font-semibold">{companyCode}</span>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Company name **</label>
          <input
            value={form.company_name}
            onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Domain (optional)</label>
          <input
            value={form.domain ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL (optional)</label>
          <input
            value={form.logo ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, logo: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tenant type</label>
          <select
            value={form.tenant_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tenant_type: e.target.value as TenantType }))
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {TENANT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save configuration"}
        </button>
      </form>
    </div>
  );
}

