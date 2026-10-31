import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type GstSettings } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function TaxSettingsPage() {
  const [form, setForm] = useState<GstSettings>({
    registration_type: "Regular",
    gstin: "",
    state_code: "",
    default_place_of_supply: "",
    is_union_territory: false,
    default_gst_rate: "18",
    reverse_charge_enabled: false,
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api
      .getGstSettings()
      .then((s) => setForm((p) => ({ ...p, ...s })))
      .catch((e) => {
        logApiError("TaxSettingsPage.load", e);
        setError((e as Error).message);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSaved(false);
      const updated = await api.updateGstSettings(form);
      setForm((p) => ({ ...p, ...updated }));
      setSaved(true);
    } catch (err) {
      logApiError("TaxSettingsPage.save", err);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Tax / GST Settings"
        description="GSTIN, state (intra vs inter), default rates, and reverse charge."
        actions={
          <Link
            to="/app/finance/tax-ledgers"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Tax ledgers
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {saved ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>
      ) : null}

      <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-xs text-gray-600">
          Registration type
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.registration_type || "Regular"}
            onChange={(e) => setForm((p) => ({ ...p, registration_type: e.target.value as GstSettings["registration_type"] }))}
          >
            <option value="Regular">Regular</option>
            <option value="Composition">Composition</option>
            <option value="SEZ">SEZ</option>
          </select>
        </label>
        <label className="block text-xs text-gray-600">
          GSTIN
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-mono"
            value={form.gstin || ""}
            onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))}
            placeholder="27AAAAA0000A1Z5"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Company state code
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.state_code || ""}
            onChange={(e) => setForm((p) => ({ ...p, state_code: e.target.value }))}
            placeholder="27"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Default place of supply
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.default_place_of_supply || ""}
            onChange={(e) => setForm((p) => ({ ...p, default_place_of_supply: e.target.value }))}
            placeholder="Same as state for intra-state"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Default GST rate %
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.default_gst_rate || "18"}
            onChange={(e) => setForm((p) => ({ ...p, default_gst_rate: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(form.is_union_territory)}
            onChange={(e) => setForm((p) => ({ ...p, is_union_territory: e.target.checked }))}
          />
          Union territory (CGST + UTGST)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(form.reverse_charge_enabled)}
            onChange={(e) => setForm((p) => ({ ...p, reverse_charge_enabled: e.target.checked }))}
          />
          Reverse charge enabled
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
