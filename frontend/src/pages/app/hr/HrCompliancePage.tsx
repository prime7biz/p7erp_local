import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrCompliancePage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [checkType, setCheckType] = useState("AGE_VERIFICATION");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrComplianceChecks());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.createHrComplianceCheck({
        employee_id: Number(employeeId),
        check_type: checkType,
        status: "OPEN",
      });
      setEmployeeId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Compliance checks"
        description="Age verification, safety training, working hours — garments compliance."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Compliance" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <input className="rounded border px-2 py-1 text-sm" placeholder="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
        <select className="rounded border px-2 py-1 text-sm" value={checkType} onChange={(e) => setCheckType(e.target.value)}>
          <option value="AGE_VERIFICATION">Age verification</option>
          <option value="SAFETY_TRAINING">Safety training</option>
          <option value="WORKING_HOURS">Working hours</option>
        </select>
        <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add check
        </button>
      </form>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-2">{String(r.employee_id)}</td>
                  <td className="px-4 py-2">{String(r.check_type)}</td>
                  <td className="px-4 py-2">{String(r.status)}</td>
                  <td className="px-4 py-2">{String(r.due_date ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
