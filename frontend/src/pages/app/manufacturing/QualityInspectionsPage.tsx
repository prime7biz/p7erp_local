import { useEffect, useState } from "react";

import { api } from "@/api/client";

export function QualityInspectionsPage() {
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof api.listMfgQualityChecks>>>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    work_order_id: 0,
    work_order_operation_id: "",
    check_type: "in_process",
    result: "pass",
    defect_code: "",
    remarks: "",
  });

  const load = async () => {
    setError("");
    try {
      const rows = await api.listMfgQualityChecks();
      setChecks(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load quality checks");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.work_order_id) {
      setError("Work order ID is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createMfgQualityCheck({
        work_order_id: form.work_order_id,
        work_order_operation_id: form.work_order_operation_id ? Number(form.work_order_operation_id) : null,
        check_type: form.check_type,
        result: form.result,
        defect_code: form.defect_code || undefined,
        remarks: form.remarks || undefined,
      });
      setForm({
        work_order_id: 0,
        work_order_operation_id: "",
        check_type: "in_process",
        result: "pass",
        defect_code: "",
        remarks: "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create quality check");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quality Inspections</h1>
        <p className="text-sm text-slate-500">Capture in-process and final quality checks for manufacturing.</p>
      </div>
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">New Inspection</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={submit}>
          <input className="rounded border px-3 py-2 text-sm" type="number" min={1} placeholder="Work Order ID" value={form.work_order_id || ""} onChange={(e) => setForm((prev) => ({ ...prev, work_order_id: Number(e.target.value) }))} />
          <input className="rounded border px-3 py-2 text-sm" type="number" min={1} placeholder="Operation ID (optional)" value={form.work_order_operation_id} onChange={(e) => setForm((prev) => ({ ...prev, work_order_operation_id: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.check_type} onChange={(e) => setForm((prev) => ({ ...prev, check_type: e.target.value }))}>
            <option value="in_process">In Process</option>
            <option value="final">Final</option>
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={form.result} onChange={(e) => setForm((prev) => ({ ...prev, result: e.target.value }))}>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="reject">Reject</option>
          </select>
          <input className="rounded border px-3 py-2 text-sm" placeholder="Defect code (optional)" value={form.defect_code} onChange={(e) => setForm((prev) => ({ ...prev, defect_code: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Remarks" value={form.remarks} onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))} />
          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60" disabled={saving} type="submit">
            {saving ? "Saving..." : "Create"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-4 py-2">ID</th><th className="px-4 py-2">WO</th><th className="px-4 py-2">Operation</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Result</th><th className="px-4 py-2">Defect</th></tr>
          </thead>
          <tbody>
            {checks.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{row.work_order_id}</td>
                <td className="px-4 py-2">{row.work_order_operation_id ?? "-"}</td>
                <td className="px-4 py-2">{row.check_type}</td>
                <td className="px-4 py-2">{row.result}</td>
                <td className="px-4 py-2">{row.defect_code ?? "-"}</td>
              </tr>
            ))}
            {checks.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No inspections found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
