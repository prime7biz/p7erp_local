/**
 * HR → Manpower → Floor plan: suggested headcount by line/role + machine:operator ratio.
 * Needs tenant flag manpower_floor_suggested_v1 (and master manpower_control_v1).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  productionManpowerApi,
  type FloorSuggestedItem,
  type MachineRatioRow,
} from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

export function HrManpowerFloorPage() {
  const [items, setItems] = useState<FloorSuggestedItem[]>([]);
  const [ratios, setRatios] = useState<MachineRatioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dept, setDept] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [floor, mr] = await Promise.all([
        productionManpowerApi.floorSuggested({
          department_type: dept || undefined,
        }),
        productionManpowerApi.machineRatio(),
      ]);
      setItems(floor.items);
      setRatios(mr.items);
    } catch (e) {
      logApiError("HrManpowerFloorPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load floor suggested manpower.");
      setItems([]);
      setRatios([]);
    } finally {
      setLoading(false);
    }
  }, [dept]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Floor plan"
        description="Suggested headcount from crew templates, line defaults, or IE line-balance (advisory)."
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Department</span>
          <select
            className="rounded border border-border bg-surface px-2 py-1"
            value={dept}
            onChange={(e) => setDept(e.target.value)}
          >
            <option value="">All</option>
            <option value="sewing">Sewing</option>
            <option value="cutting">Cutting</option>
            <option value="finishing">Finishing</option>
          </select>
        </label>
        <Link className="text-primary underline" to="/app/production/crew-daily">
          Daily crew
        </Link>
        <Link className="text-primary underline" to="/app/production/ie/line-balance">
          IE / line balance
        </Link>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {loading ? <p className="text-sm text-text-secondary">Loading…</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No sewing lines or unit templates yet. Set crew templates or line default operator counts first.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Line / unit</th>
              <th className="py-2 pr-3">Dept</th>
              <th className="py-2 pr-3">Machines</th>
              <th className="py-2 pr-3">Suggested ops</th>
              <th className="py-2 pr-3">Roles</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={`${row.scope}-${row.sewing_line_id ?? row.department_type}`}
                className="border-b border-border/60 align-top"
              >
                <td className="py-2 pr-3">
                  {row.scope === "line"
                    ? `${row.line_code ?? ""} — ${row.line_name ?? ""}`
                    : `${row.department_type} (unit)`}
                  {row.factory_unit ? (
                    <div className="text-xs text-text-secondary">{row.factory_unit}</div>
                  ) : null}
                </td>
                <td className="py-2 pr-3 capitalize">{row.department_type}</td>
                <td className="py-2 pr-3">{row.running_machine_count}</td>
                <td className="py-2 pr-3">{row.suggested_operators}</td>
                <td className="py-2 pr-3">
                  <ul className="space-y-0.5">
                    {row.roles
                      .filter((r) => r.suggested_count > 0)
                      .map((r) => (
                        <li key={r.crew_role_id}>
                          {r.role_name}: <strong>{r.suggested_count}</strong>{" "}
                          <span className="text-xs text-text-secondary">
                            ({r.source}
                            {r.advisory_label ? ` — ${r.advisory_label}` : ""})
                          </span>
                        </li>
                      ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-base font-medium text-text-primary">Machine : operator ratio</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-2 pr-3">Line</th>
              <th className="py-2 pr-3">Machines</th>
              <th className="py-2 pr-3">Suggested ops</th>
              <th className="py-2 pr-3">Actual</th>
              <th className="py-2 pr-3">Target</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {ratios.map((row) => (
              <tr key={row.sewing_line_id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  {row.line_code} — {row.line_name}
                </td>
                <td className="py-2 pr-3">{row.running_machine_count}</td>
                <td className="py-2 pr-3">{row.suggested_operators}</td>
                <td className="py-2 pr-3">{row.actual_machines_per_operator ?? "—"}</td>
                <td className="py-2 pr-3">{row.target_machines_per_operator ?? "—"}</td>
                <td className="py-2 pr-3">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerFloorPage;
