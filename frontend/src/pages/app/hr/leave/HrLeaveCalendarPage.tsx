import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrLeaveCalendarPage() {
  const d = new Date();
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState(d.getMonth() + 1);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await api.getHrLeaveCalendarData({ year, month });
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  return (
    <div className="space-y-6">
      <HrPageHeader title="Leave calendar" description="Approved leave across the team." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Calendar" }]} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-text-secondary">
          Year
          <input type="number" className="ml-2 w-24 rounded border px-2 py-1 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label className="text-sm text-text-secondary">
          Month
          <input type="number" min={1} max={12} className="ml-2 w-20 rounded border px-2 py-1 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))} />
        </label>
      </div>
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        {loading ? (
          "Loading..."
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted">No approved leave in this month.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={String(r.leave_request_id)} className="flex justify-between border-b border-border-subtle py-1">
                <span>Employee #{String(r.employee_id)}</span>
                <span>
                  {String(r.from_date)} → {String(r.to_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
