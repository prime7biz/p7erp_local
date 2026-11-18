/**
 * HR → Manpower → Daily attendance: present / late / absent buckets by group.
 */
import { useCallback, useEffect, useState } from "react";
import { hrManpowerApi, type ManpowerDailyAttendance } from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { saveBlob } from "@/lib/fileSave";
import { logApiError } from "@/utils/logApiError";

type GroupBy = "department" | "section" | "line" | "category";

export function HrManpowerDailyAttendancePage() {
  const [dateOn, setDateOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  const [data, setData] = useState<ManpowerDailyAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await hrManpowerApi.dailyAttendance({ date: dateOn, group_by: groupBy });
      setData(d);
    } catch (e) {
      logApiError("HrManpowerDailyAttendancePage.load", e);
      setError(e instanceof Error ? e.message : "Could not load daily attendance.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateOn, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const header = [
      "group",
      "standing",
      "present",
      "late",
      "half_day",
      "absent",
      "leave",
      "not_marked",
      "on_floor",
      "absent_pct",
    ];
    const lines = [header.join(",")];
    for (const r of data.rows) {
      lines.push(
        [
          JSON.stringify(r.group_key),
          r.standing,
          r.present,
          r.late,
          r.half_day,
          r.absent,
          r.leave,
          r.not_marked,
          r.on_floor,
          r.absent_pct ?? "",
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    void saveBlob(blob, `daily-attendance-${data.date}-${data.group_by}.csv`);
  };

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Daily attendance"
        description="Headcount by status for one day. Absent % = (absent + not marked) ÷ standing."
      />
      <div className="flex flex-wrap items-center gap-3 text-sm no-print">
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Date</span>
          <input
            type="date"
            className="rounded border border-border bg-surface px-2 py-1"
            value={dateOn}
            onChange={(e) => setDateOn(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Group by</span>
          <select
            className="rounded border border-border bg-surface px-2 py-1"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          >
            <option value="department">Department</option>
            <option value="section">Section</option>
            <option value="line">Sewing line</option>
            <option value="category">Category</option>
          </select>
        </label>
        <button type="button" className="rounded border border-border px-3 py-1" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="rounded border border-border px-3 py-1" onClick={exportCsv} disabled={!data}>
          Export CSV
        </button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Group</th>
              <th className="py-2 pr-3">Standing</th>
              <th className="py-2 pr-3">Present</th>
              <th className="py-2 pr-3">Late</th>
              <th className="py-2 pr-3">Half day</th>
              <th className="py-2 pr-3">Absent</th>
              <th className="py-2 pr-3">Leave</th>
              <th className="py-2 pr-3">Not marked</th>
              <th className="py-2 pr-3">On floor</th>
              <th className="py-2 pr-3">Absent %</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.group_key} className="border-b border-border/60">
                <td className="py-1.5 pr-3">{r.group_key}</td>
                <td className="py-1.5 pr-3">{r.standing}</td>
                <td className="py-1.5 pr-3">{r.present}</td>
                <td className="py-1.5 pr-3">{r.late}</td>
                <td className="py-1.5 pr-3">{r.half_day}</td>
                <td className="py-1.5 pr-3">{r.absent}</td>
                <td className="py-1.5 pr-3">{r.leave}</td>
                <td className="py-1.5 pr-3">{r.not_marked}</td>
                <td className="py-1.5 pr-3">{r.on_floor}</td>
                <td className="py-1.5 pr-3">{r.absent_pct ?? "—"}</td>
              </tr>
            ))}
            {data ? (
              <tr className="border-t border-border font-medium">
                <td className="py-1.5 pr-3">Total</td>
                <td className="py-1.5 pr-3">{data.totals.standing}</td>
                <td className="py-1.5 pr-3">{data.totals.present}</td>
                <td className="py-1.5 pr-3">{data.totals.late}</td>
                <td className="py-1.5 pr-3">{data.totals.half_day}</td>
                <td className="py-1.5 pr-3">{data.totals.absent}</td>
                <td className="py-1.5 pr-3">{data.totals.leave}</td>
                <td className="py-1.5 pr-3">{data.totals.not_marked}</td>
                <td className="py-1.5 pr-3">{data.totals.on_floor}</td>
                <td className="py-1.5 pr-3">—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerDailyAttendancePage;
