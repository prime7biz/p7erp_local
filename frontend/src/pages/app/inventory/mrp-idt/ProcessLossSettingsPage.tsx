import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type ProcessLossStandardResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function ProcessLossSettingsPage() {
  const [rows, setRows] = useState<ProcessLossStandardResponse[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    process_name: "Knitting",
    standard_loss_percent: "3",
    warning_threshold_percent: "5",
  });

  const load = useCallback(async () => {
    try {
      setError("");
      setRows(await api.listProcessLossStandards());
    } catch (e) {
      logApiError("ProcessLossSettingsPage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createProcessLossStandard(form);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Process Loss Standards"
        description="Configure standard loss % per process (Knitting, Dyeing, Cutting, …)"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Process
          <input
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.process_name}
            onChange={(e) => setForm({ ...form, process_name: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Standard %
          <input
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.standard_loss_percent}
            onChange={(e) => setForm({ ...form, standard_loss_percent: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Warning threshold %
          <input
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5"
            value={form.warning_threshold_percent}
            onChange={(e) => setForm({ ...form, warning_threshold_percent: e.target.value })}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Add / update
        </button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Process</th>
              <th className="px-3 py-2">Standard %</th>
              <th className="px-3 py-2">Warning threshold</th>
              <th className="px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">{r.process_name}</td>
                <td className="px-3 py-2">{r.standard_loss_percent}</td>
                <td className="px-3 py-2">{r.warning_threshold_percent}</td>
                <td className="px-3 py-2">{r.is_active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
