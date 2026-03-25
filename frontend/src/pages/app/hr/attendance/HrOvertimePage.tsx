import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrOvertimePage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrOvertimeEntries());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <HrPageHeader title="Overtime entries" description="Review and approve OT." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Overtime" }]} />
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Emp</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Hours</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-2">{String(r.employee_id)}</td>
                  <td className="px-4 py-2">{String(r.work_date)}</td>
                  <td className="px-4 py-2">{String(r.ot_hours)}</td>
                  <td className="px-4 py-2">{String(r.status)}</td>
                  <td className="px-4 py-2 text-right">
                    {r.status === "PENDING" ? (
                      <button
                        type="button"
                        className="rounded border border-border-strong px-2 py-1 text-xs"
                        onClick={() => void api.approveHrOvertimeEntry(Number(r.id)).then(() => load())}
                      >
                        Approve
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
