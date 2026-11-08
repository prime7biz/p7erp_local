import { useCallback, useEffect, useState } from "react";
import { api, type HrAgeVerification } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { errorText, type RecordTabProps } from "./shared";

const EMPTY = { verification_method: "DOCUMENT", date_of_birth: "", notes: "" };

export function AgeVerificationTab({ employee, onError, onSuccess }: RecordTabProps) {
  const [rows, setRows] = useState<HrAgeVerification[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listHrAgeVerifications(employee.id));
    } catch (e) {
      logApiError("AgeVerificationTab.load", e);
      setRows([]);
    }
  }, [employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date_of_birth) return;
    setSaving(true);
    try {
      await api.createHrAgeVerification(employee.id, {
        verification_method: form.verification_method,
        date_of_birth: form.date_of_birth,
        notes: form.notes.trim() || null,
      });
      setForm(EMPTY);
      await load();
      onSuccess("Age verification recorded.");
    } catch (err) {
      onError(errorText(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
        <select className="rounded border px-2 py-1 text-sm" value={form.verification_method} onChange={(e) => setForm((p) => ({ ...p, verification_method: e.target.value }))}>
          <option value="DOCUMENT">Document</option>
          <option value="BIRTH_CERTIFICATE">Birth certificate</option>
          <option value="NID">National ID</option>
        </select>
        <input type="date" className="rounded border px-2 py-1 text-sm" value={form.date_of_birth} onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))} required />
        <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add verification
          </button>
        </div>
      </form>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase">Method</th>
              <th className="px-4 py-2 text-left text-xs uppercase">DOB</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Age</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs uppercase">BSCI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-border">
                <td className="px-4 py-2">{v.verification_method}</td>
                <td className="px-4 py-2">{v.date_of_birth}</td>
                <td className="px-4 py-2">{v.age_at_verification}</td>
                <td className="px-4 py-2">{v.status}</td>
                <td className="px-4 py-2">{v.is_bsci_compliant ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
