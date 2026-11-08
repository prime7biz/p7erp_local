import { useCallback, useEffect, useState } from "react";
import { api, type HrEmployeeStatusHistoryCreate } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { errorText, type RecordTabProps } from "./shared";

const EMPTY: HrEmployeeStatusHistoryCreate = { status: "ACTIVE", effective_date: "", remarks: "" };

export function StatusHistoryTab({ employee, onError, onSuccess }: RecordTabProps) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listHrEmployeeStatusHistory>>>([]);
  const [form, setForm] = useState<HrEmployeeStatusHistoryCreate>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listHrEmployeeStatusHistory(employee.id));
    } catch (e) {
      logApiError("StatusHistoryTab.load", e);
      setRows([]);
    }
  }, [employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.effective_date) return;
    setSaving(true);
    try {
      await api.createHrEmployeeStatusHistory(employee.id, {
        status: form.status.trim(),
        effective_date: form.effective_date,
        remarks: form.remarks?.trim() || null,
      });
      setForm(EMPTY);
      await load();
      onSuccess("Status history added.");
    } catch (err) {
      onError(errorText(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
        <input className="rounded border px-2 py-1 text-sm" placeholder="Status label" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} required />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={form.effective_date} onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))} required />
        <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Remarks" value={form.remarks ?? ""} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add status change
          </button>
        </div>
      </form>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase">Effective</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-4 py-2">{h.effective_date}</td>
                <td className="px-4 py-2">{h.status}</td>
                <td className="px-4 py-2">{h.remarks ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
