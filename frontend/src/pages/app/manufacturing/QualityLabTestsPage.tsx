import { useEffect, useState } from "react";
import { api, type MfgQualityCheckResponse } from "@/api/client";

export function QualityLabTestsPage() {
  const [checks, setChecks] = useState<MfgQualityCheckResponse[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    work_order_id: 0,
    work_order_operation_id: "",
    check_type: "lab",
    result: "pass",
    defect_code: "",
    remarks: "",
  });

  const load = async () => {
    setError("");
    try {
      const rows = await api.listMfgQualityChecks({ check_type: "lab" });
      setChecks(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lab tests");
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
        check_type: "lab",
        result: "pass",
        defect_code: "",
        remarks: "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lab test");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Lab Tests</h1>
        <p className="text-sm text-text-muted">
          Record and view lab test results (fabric, trim, or finished goods) linked to work orders.
        </p>
      </div>
      {error ? (
        <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">New Lab Test</h2>
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
          onSubmit={submit}
        >
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            type="number"
            min={1}
            placeholder="Work Order ID"
            value={form.work_order_id || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, work_order_id: Number(e.target.value) }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            type="number"
            min={0}
            placeholder="Operation ID (optional)"
            value={form.work_order_operation_id}
            onChange={(e) => setForm((prev) => ({ ...prev, work_order_operation_id: e.target.value }))}
          />
          <select
            className="rounded border border-border px-3 py-2 text-sm"
            value={form.result}
            onChange={(e) => setForm((prev) => ({ ...prev, result: e.target.value }))}
          >
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="reject">Reject</option>
          </select>
          <input
            className="rounded border border-border px-3 py-2 text-sm"
            placeholder="Defect code (optional)"
            value={form.defect_code}
            onChange={(e) => setForm((prev) => ({ ...prev, defect_code: e.target.value }))}
          />
          <input
            className="rounded border border-border px-3 py-2 text-sm md:col-span-2"
            placeholder="Remarks"
            value={form.remarks}
            onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
          />
          <button
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Work Order</th>
              <th className="px-4 py-2">Operation</th>
              <th className="px-4 py-2">Result</th>
              <th className="px-4 py-2">Defect</th>
              <th className="px-4 py-2">Remarks</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((row) => (
              <tr key={row.id} className="border-t border-border-subtle">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{row.work_order_id}</td>
                <td className="px-4 py-2">{row.work_order_operation_id ?? "–"}</td>
                <td className="px-4 py-2">{row.result}</td>
                <td className="px-4 py-2">{row.defect_code ?? "–"}</td>
                <td className="px-4 py-2 max-w-[200px] truncate" title={row.remarks ?? ""}>
                  {row.remarks ?? "–"}
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {row.created_at ? new Date(row.created_at).toLocaleDateString() : "–"}
                </td>
              </tr>
            ))}
            {checks.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={7}>
                  No lab tests found. Create one above or ensure checks use type &quot;lab&quot;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
