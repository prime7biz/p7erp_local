import { useEffect, useState } from "react";
import { api, type SettingsConfigUpdate, type TenantType } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const TENANT_TYPE_OPTIONS: Array<{ value: TenantType; label: string }> = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "buying_house", label: "Buying House" },
  { value: "both", label: "Both" },
];

export function ConfigurationPage() {
  const { refetch: refetchMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string | number | null>>({});
  const [form, setForm] = useState<SettingsConfigUpdate>({
    company_name: "",
    domain: "",
    logo: "",
    tenant_type: "both",
    country_code: null,
    timezone: null,
  });

  useEffect(() => {
    api
      .getSettingsConfig()
      .then((data) => {
        setCompanyCode(data.company_code ?? "N/A");
        setFeatureFlags(
          data.feature_flags && typeof data.feature_flags === "object" && !Array.isArray(data.feature_flags)
            ? { ...data.feature_flags }
            : {},
        );
        setForm({
          company_name: data.company_name,
          domain: data.domain ?? "",
          logo: data.logo ?? "",
          tenant_type: data.tenant_type,
          country_code: data.country_code ?? null,
          timezone: data.timezone ?? null,
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
        feature_flags: { ...featureFlags },
        country_code: form.country_code?.trim() || null,
        timezone: form.timezone?.trim() || null,
      });
      setFeatureFlags(
        updated.feature_flags && typeof updated.feature_flags === "object" && !Array.isArray(updated.feature_flags)
          ? { ...updated.feature_flags }
          : {},
      );
      setForm({
        company_name: updated.company_name,
        domain: updated.domain ?? "",
        logo: updated.logo ?? "",
        tenant_type: updated.tenant_type,
        country_code: updated.country_code ?? null,
        timezone: updated.timezone ?? null,
      });
      await refetchMe();
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
        <h2 className="text-xl font-bold text-text-primary">Configuration</h2>
        <p className="text-sm text-text-secondary">
          Update basic company settings for this tenant.
        </p>
        <p className="text-xs text-text-muted mt-1">Fields marked with ** are mandatory.</p>
      </div>

      {(error || success) && (
        <div className="space-y-2">
          {error && <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div>}
          {success && <div className="rounded border border-status-success/20 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div>}
        </div>
      )}

      <div className="rounded border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary">
        Company code: <span className="font-semibold">{companyCode}</span>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-border bg-surface-raised p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Company name **</label>
          <input
            value={form.company_name}
            onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Domain (optional)</label>
          <input
            value={form.domain ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, domain: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="example.com"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Logo URL (optional)</label>
          <input
            value={form.logo ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, logo: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Tenant type</label>
          <select
            value={form.tenant_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, tenant_type: e.target.value as TenantType }))
            }
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          >
            {TENANT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Country code (ISO)</label>
          <input
            value={form.country_code ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, country_code: e.target.value || null }))}
            className="w-full max-w-[140px] rounded-lg border border-border px-3 py-2 text-sm uppercase"
            placeholder="e.g. BD"
            maxLength={4}
          />
          <p className="mt-1 text-xs text-text-muted">Used for factory calendar public holiday import.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-secondary">Timezone (IANA)</label>
          <input
            value={form.timezone ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value || null }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="e.g. Asia/Dhaka"
            maxLength={64}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.trade_enabled !== false}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  trade_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable Trade module</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When unchecked, Trade Cases, Trade dashboard, Logistics, and trade reports are hidden for this tenant
                (requires <code className="rounded bg-surface-raised px-1">buying_house</code> or{" "}
                <code className="rounded bg-surface-raised px-1">both</code> tenant type). Leave checked for default
                behaviour.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.control_tower_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  control_tower_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Enable Operations Control Tower</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Shows the <strong>Operations → Control Tower</strong> screen and allows related read APIs (order grid,
                master LC snapshot, capacity heatmap, finance exposure). Off by default during rollout.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1 rounded border-border-strong"
              checked={featureFlags.auto_line_booking_enabled === true}
              onChange={(e) =>
                setFeatureFlags((prev) => ({
                  ...prev,
                  auto_line_booking_enabled: e.target.checked,
                }))
              }
            />
            <span>
              <span className="font-medium text-text-primary">Auto-propose line bookings</span>
              <span className="mt-0.5 block text-xs text-text-muted">
                When enabled, the system may create a <strong>DRAFT</strong> sewing-line reservation as orders move
                through the pipeline (requires planning data). Manual planning still works when off.
              </span>
            </span>
          </label>
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

