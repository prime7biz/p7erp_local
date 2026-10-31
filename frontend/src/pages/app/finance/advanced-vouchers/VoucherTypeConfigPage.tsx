import { useEffect, useState } from "react";
import {
  api,
  type AdvancedVoucherFeatureFlags,
  type AdvancedVoucherTypeRow,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

const FLAG_LABELS: { key: keyof AdvancedVoucherFeatureFlags; label: string }[] = [
  { key: "voucher_class_enabled", label: "Voucher classes" },
  { key: "recurring_voucher_enabled", label: "Recurring vouchers" },
  { key: "post_dated_voucher_enabled", label: "Post-dated" },
  { key: "memorandum_voucher_enabled", label: "Memorandum" },
  { key: "optional_voucher_enabled", label: "Optional" },
  { key: "credit_debit_note_enabled", label: "Credit / debit notes" },
  { key: "stock_transfer_voucher_enabled", label: "Stock transfer vouchers" },
];

const KIND_FLAGS: { key: keyof AdvancedVoucherTypeRow; label: string }[] = [
  { key: "is_credit_note", label: "Credit note" },
  { key: "is_debit_note", label: "Debit note" },
  { key: "is_memorandum", label: "Memorandum" },
  { key: "is_optional", label: "Optional" },
  { key: "is_post_dated", label: "Post-dated" },
  { key: "is_stock_transfer", label: "Stock transfer" },
];

export function VoucherTypeConfigPage() {
  const [rows, setRows] = useState<AdvancedVoucherTypeRow[]>([]);
  const [featureFlags, setFeatureFlags] = useState<AdvancedVoucherFeatureFlags | null>(null);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    try {
      setError("");
      const res = await api.listAdvancedVoucherTypes();
      setRows(res.rows);
      setFeatureFlags(res.feature_flags);
    } catch (e) {
      logApiError("VoucherTypeConfigPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function patchRow(id: number, patch: Partial<AdvancedVoucherTypeRow>) {
    try {
      setSavingId(id);
      setError("");
      await api.patchAdvancedVoucherType(id, patch);
      await load();
    } catch (e) {
      logApiError("VoucherTypeConfigPage.patch", e);
      setError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Voucher types (advanced)"
        description="Configure voucher type flags. Tenant feature flags control whether each workflow is available."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {featureFlags ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tenant feature flags</p>
          <div className="flex flex-wrap gap-2">
            {FLAG_LABELS.map(({ key, label }) => (
              <span
                key={key}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  featureFlags[key] ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                }`}
              >
                {label}: {featureFlags[key] ? "On" : "Off"}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Enable flags in Settings → Configuration. Types can be toggled here regardless of flags.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Active</th>
              {KIND_FLAGS.map((f) => (
                <th key={f.key} className="px-3 py-2">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    disabled={savingId === r.id}
                    onChange={(e) => void patchRow(r.id, { is_active: e.target.checked })}
                  />
                </td>
                {KIND_FLAGS.map((f) => (
                  <td key={f.key} className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(r[f.key])}
                      disabled={savingId === r.id}
                      onChange={(e) => void patchRow(r.id, { [f.key]: e.target.checked })}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  No voucher types found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
