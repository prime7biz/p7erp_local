/**
 * HR → Manpower → Organogram: Suggested | Approved | Present columns on the reporting tree.
 */
import { useCallback, useEffect, useState } from "react";
import {
  hrManpowerApi,
  type ManpowerAttendanceBridge,
  type ManpowerOrganogram,
  type ManpowerOrgNode,
} from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

function OrgRows({ nodes }: { nodes: ManpowerOrgNode[] }) {
  return (
    <>
      {nodes.map((n) => (
        <tr key={n.employee_id} className="border-b border-border/60">
          <td className="py-1.5 pr-3" style={{ paddingLeft: `${n.depth * 16 + 4}px` }}>
            <span className="font-medium">{n.name}</span>{" "}
            <span className="text-xs text-text-secondary">({n.employee_code})</span>
            <div className="text-xs text-text-secondary">
              {[n.department_name, n.designation_title].filter(Boolean).join(" · ") || "—"}
            </div>
          </td>
          <td className="py-1.5 pr-3">{n.suggested ?? "—"}</td>
          <td className="py-1.5 pr-3">{n.approved_quota ?? "—"}</td>
          <td className="py-1.5 pr-3">{n.present_today ? "Yes" : "No"}</td>
        </tr>
      ))}
      {nodes.map((n) =>
        n.children.length ? <OrgRows key={`c-${n.employee_id}`} nodes={n.children} /> : null,
      )}
    </>
  );
}

export function HrManpowerOrganogramPage() {
  const [dateOn, setDateOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [org, setOrg] = useState<ManpowerOrganogram | null>(null);
  const [bridge, setBridge] = useState<ManpowerAttendanceBridge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, b] = await Promise.all([
        hrManpowerApi.organogram({ date: dateOn }),
        hrManpowerApi.attendanceBridge(dateOn),
      ]);
      setOrg(o);
      setBridge(b);
    } catch (e) {
      logApiError("HrManpowerOrganogramPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load organogram.");
      setOrg(null);
      setBridge(null);
    } finally {
      setLoading(false);
    }
  }, [dateOn]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Organogram"
        description="Reporting tree with Suggested (floor), Approved quota, and Present today."
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Date</span>
          <input
            type="date"
            className="rounded border border-border bg-surface px-2 py-1"
            value={dateOn}
            onChange={(e) => setDateOn(e.target.value)}
          />
        </label>
        {bridge ? (
          <span className="text-text-secondary">
            Standing {bridge.standing_active} · On floor {bridge.present_today} · Away/unmarked{" "}
            {bridge.absent_or_unmarked}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}
      {org?.truncated ? (
        <p className="text-sm text-amber-700">Tree truncated at depth/node caps for performance.</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Person</th>
              <th className="py-2 pr-3">Suggested</th>
              <th className="py-2 pr-3">Approved</th>
              <th className="py-2 pr-3">Present today</th>
            </tr>
          </thead>
          <tbody>{org ? <OrgRows nodes={org.roots} /> : null}</tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerOrganogramPage;
