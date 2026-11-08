import { useCallback, useEffect, useState } from "react";
import { api, type HrMedicalRecord } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { errorText, type RecordTabProps } from "./shared";

const EMPTY = {
  examination_date: "",
  fitness_status: "FIT",
  certificate_number: "",
  expiry_date: "",
  doctor_name: "",
  hospital_clinic: "",
};

export function MedicalRecordsTab({ employee, onError, onSuccess }: RecordTabProps) {
  const [rows, setRows] = useState<HrMedicalRecord[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.listHrMedicalRecords(employee.id));
    } catch (e) {
      logApiError("MedicalRecordsTab.load", e);
      setRows([]);
    }
  }, [employee.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.examination_date) return;
    setSaving(true);
    try {
      await api.createHrMedicalRecord(employee.id, {
        examination_date: form.examination_date,
        fitness_status: form.fitness_status,
        certificate_number: form.certificate_number.trim() || null,
        expiry_date: form.expiry_date || null,
        doctor_name: form.doctor_name.trim() || null,
        hospital_clinic: form.hospital_clinic.trim() || null,
      });
      setForm(EMPTY);
      await load();
      onSuccess("Medical record added.");
    } catch (err) {
      onError(errorText(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-xl border border-border bg-surface-raised p-4 grid gap-2 sm:grid-cols-2">
        <input type="date" className="rounded border px-2 py-1 text-sm" value={form.examination_date} onChange={set("examination_date")} required />
        <select className="rounded border px-2 py-1 text-sm" value={form.fitness_status} onChange={set("fitness_status")}>
          <option value="FIT">Fit</option>
          <option value="UNFIT">Unfit</option>
          <option value="PENDING">Pending</option>
          <option value="RESTRICTED">Restricted</option>
        </select>
        <input className="rounded border px-2 py-1 text-sm" placeholder="Certificate number" value={form.certificate_number} onChange={set("certificate_number")} />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={form.expiry_date} onChange={set("expiry_date")} />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Doctor name" value={form.doctor_name} onChange={set("doctor_name")} />
        <input className="rounded border px-2 py-1 text-sm" placeholder="Hospital / clinic" value={form.hospital_clinic} onChange={set("hospital_clinic")} />
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add medical record
          </button>
        </div>
      </form>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle">
            <tr>
              <th className="px-4 py-2 text-left text-xs uppercase">Exam date</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Fitness</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Certificate</th>
              <th className="px-4 py-2 text-left text-xs uppercase">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-2">{m.examination_date}</td>
                <td className="px-4 py-2">{m.fitness_status}</td>
                <td className="px-4 py-2">{m.certificate_number ?? "—"}</td>
                <td className="px-4 py-2">{m.expiry_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
