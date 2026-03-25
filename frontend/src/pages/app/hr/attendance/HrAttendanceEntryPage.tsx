import { useCallback, useEffect, useState } from "react";
import { api, type HrAttendanceEntryCreate, type HrAttendanceEntryResponse, type HrAttendanceEntryUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrAttendanceEntryPage() {
  const [rows, setRows] = useState<HrAttendanceEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrAttendanceEntryUpdate>({});
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrAttendanceEntryCreate>({
    employee_id: 0,
    attendance_date: "",
    in_time: "",
    out_time: "",
    status: "PRESENT",
    remarks: "",
    source: "MANUAL",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrAttendanceEntries());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.attendance_date || !form.employee_id) return;
    setError("");
    try {
      await api.createHrAttendanceEntry({
        ...form,
        employee_id: Number(form.employee_id),
        source: form.source || "MANUAL",
      });
      setForm({
        employee_id: 0,
        attendance_date: "",
        in_time: "",
        out_time: "",
        status: "PRESENT",
        remarks: "",
        source: "MANUAL",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const openEdit = (row: HrAttendanceEntryResponse) => {
    setEditId(row.id);
    setEditForm({
      in_time: row.in_time,
      out_time: row.out_time,
      status: row.status,
      remarks: row.remarks,
      source: row.source,
    });
    setOpenActionsId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null) return;
    try {
      await api.updateHrAttendanceEntry(editId, editForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const onBulk = async () => {
    setBulkMsg("");
    try {
      const parsed = JSON.parse(bulkJson) as { rows?: Record<string, unknown>[] };
      const rowsPayload = parsed.rows ?? (Array.isArray(parsed) ? parsed : []);
      const r = await api.postHrAttendanceEntriesBulk({ rows: rowsPayload });
      setBulkMsg(`Created ${r.created} entries.`);
      await load();
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "Bulk import failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Daily attendance entry"
        description="Manual or device-sourced attendance. Use bulk JSON for biometric batch upload."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Daily entry" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}

      <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
        <input
          type="number"
          className="rounded border px-2 py-1 text-sm"
          placeholder="Employee ID"
          value={form.employee_id || ""}
          onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}
          required
        />
        <input
          type="date"
          className="rounded border px-2 py-1 text-sm"
          value={form.attendance_date}
          onChange={(e) => setForm((p) => ({ ...p, attendance_date: e.target.value }))}
          required
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="In time (HH:MM:SS)"
          value={form.in_time ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, in_time: e.target.value || null }))}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Out time (HH:MM:SS)"
          value={form.out_time ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, out_time: e.target.value || null }))}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Status (PRESENT, ABSENT, LATE...)"
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
          required
        />
        <select
          className="rounded border px-2 py-1 text-sm"
          value={form.source ?? "MANUAL"}
          onChange={(e) => setForm((p) => ({ ...p, source: e.target.value }))}
        >
          <option value="MANUAL">MANUAL</option>
          <option value="BIOMETRIC">BIOMETRIC</option>
          <option value="CARD_READER">CARD_READER</option>
          <option value="MOBILE_APP">MOBILE_APP</option>
        </select>
        <input
          className="sm:col-span-2 rounded border px-2 py-1 text-sm"
          placeholder="Remarks"
          value={form.remarks ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value || null }))}
        />
        <div className="flex items-end">
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Save entry
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h3 className="text-sm font-semibold text-text-primary">Bulk import (JSON)</h3>
        <p className="text-xs text-text-muted mt-1">
          Body shape: <code className="text-xs">{"{ \"rows\": [ { employee_id, attendance_date, in_time, out_time, status, source } ] }"}</code> — field names must match API
          (see backend <code className="text-xs">AttendanceBulkEntryBody</code>).
        </p>
        <textarea
          className="mt-2 w-full rounded border px-2 py-2 font-mono text-xs"
          rows={5}
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
          placeholder='{"rows":[]}'
        />
        {bulkMsg && <p className="mt-2 text-sm text-text-secondary">{bulkMsg}</p>}
        <button type="button" className="mt-2 rounded border px-3 py-1.5 text-xs" onClick={() => void onBulk()}>
          Upload batch
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Emp</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs uppercase">In</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Out</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2">{row.employee_id}</td>
                  <td className="px-4 py-2">{row.attendance_date}</td>
                  <td className="px-4 py-2">{row.in_time ?? "—"}</td>
                  <td className="px-4 py-2">{row.out_time ?? "—"}</td>
                  <td className="px-4 py-2">{row.status}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xl space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Edit attendance</h3>
            <label className="block text-sm">
              In time
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="HH:MM:SS"
                value={editForm.in_time ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, in_time: e.target.value || null }))}
              />
            </label>
            <label className="block text-sm">
              Out time
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                placeholder="HH:MM:SS"
                value={editForm.out_time ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, out_time: e.target.value || null }))}
              />
            </label>
            <label className="block text-sm">
              Status
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.status ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Remarks
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.remarks ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value || null }))}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setEditId(null)}>
                Cancel
              </button>
              <button type="submit" className="rounded bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
