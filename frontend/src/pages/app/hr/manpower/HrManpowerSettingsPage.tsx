/**
 * HR → Manpower → Settings: ratio targets and department → sewing/cutting/finishing groups.
 */
import { useCallback, useEffect, useState } from "react";
import { api, type HrDepartmentResponse } from "@/api/client";
import {
  hrManpowerApi,
  type DepartmentGroupKey,
  type ManpowerDepartmentGroup,
  type ManpowerSettings,
  type ManpowerTargets,
} from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

const GROUP_OPTIONS: { value: DepartmentGroupKey; label: string }[] = [
  { value: "SEWING", label: "Sewing" },
  { value: "CUTTING", label: "Cutting" },
  { value: "FINISHING", label: "Finishing" },
  { value: "OTHER", label: "Other" },
];

const TARGET_FIELDS: { key: keyof ManpowerTargets; label: string; help: string }[] = [
  { key: "operator_to_helper", label: "Operator : Helper", help: "Example: 4:1 (advisory only)" },
  {
    key: "sewing_cutting_finishing",
    label: "Sewing : Cutting : Finishing",
    help: "Example: 70:15:15 (advisory only)",
  },
  { key: "staff_to_workers", label: "Staff : Workers", help: "Example: 1:10 (advisory only)" },
  {
    key: "management_staff_workers",
    label: "Management : Staff : Workers",
    help: "Example: 1:5:50 (advisory only)",
  },
  {
    key: "running_machines_per_operator",
    label: "Running machines per operator",
    help: "Example: 1 (advisory only)",
  },
];

export function HrManpowerSettingsPage() {
  const [settings, setSettings] = useState<ManpowerSettings | null>(null);
  const [targets, setTargets] = useState<ManpowerTargets>({});
  const [allowUnmapped, setAllowUnmapped] = useState(false);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [groups, setGroups] = useState<ManpowerDepartmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [newDeptId, setNewDeptId] = useState("");
  const [newGroupKey, setNewGroupKey] = useState<DepartmentGroupKey>("SEWING");

  const load = useCallback(async (keepMessages = false) => {
    setLoading(true);
    if (!keepMessages) {
      setError("");
      setInfo("");
    }
    try {
      const [s, deps, g] = await Promise.all([
        hrManpowerApi.getSettings(),
        api.listHrDepartments({ limit: 500 }),
        hrManpowerApi.listDepartmentGroups(),
      ]);
      setSettings(s);
      setTargets({ ...s.targets });
      setAllowUnmapped(s.allow_unmapped_hire);
      setDepartments(deps);
      setGroups(g);
    } catch (e) {
      logApiError("HrManpowerSettingsPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load manpower settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setBusy(true);
    setError("");
    try {
      const s = await hrManpowerApi.putSettings({ targets, allow_unmapped_hire: allowUnmapped });
      setSettings(s);
      setTargets({ ...s.targets });
      setInfo("Settings saved.");
    } catch (e) {
      logApiError("HrManpowerSettingsPage.saveSettings", e);
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = async () => {
    const department_id = Number(newDeptId);
    if (!department_id) {
      setError("Choose a department for the group mapping.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await hrManpowerApi.upsertDepartmentGroup({ department_id, group_key: newGroupKey });
      setInfo("Department group saved.");
      setNewDeptId("");
      await load(true);
    } catch (e) {
      logApiError("HrManpowerSettingsPage.saveGroup", e);
      setError(e instanceof Error ? e.message : "Could not save department group.");
    } finally {
      setBusy(false);
    }
  };

  const groupByDept = new Map(groups.map((g) => [g.department_id, g]));

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Manpower settings"
        description="Optional ratio targets (never enforced as hard numbers) and which departments count as sewing, cutting or finishing."
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p> : null}

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : (
        <>
          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Ratio targets (advisory)</h2>
            <p className="text-xs text-text-muted">
              Leave blank to show actual ratios only. These never block hiring by themselves.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TARGET_FIELDS.map((f) => (
                <label key={f.key} className="text-xs text-text-muted">
                  {f.label}
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                    value={targets[f.key] ?? ""}
                    placeholder={f.help}
                    onChange={(e) => setTargets((t) => ({ ...t, [f.key]: e.target.value || null }))}
                  />
                </label>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                className="mt-1 rounded border-border-strong"
                checked={allowUnmapped}
                onChange={(e) => setAllowUnmapped(e.target.checked)}
              />
              <span>
                Allow hiring without department or designation when quota enforcement is on
                <span className="mt-0.5 block text-xs text-text-muted">
                  Default off. Recommended leave off so every hire is mapped to a quota cell.
                </span>
              </span>
            </label>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => void saveSettings()}
              disabled={busy}
            >
              Save settings
            </button>
            {settings?.updated_at ? (
              <p className="text-xs text-text-muted">Last updated {new Date(settings.updated_at).toLocaleString()}</p>
            ) : null}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text-primary">Department groups</h2>
            <p className="text-xs text-text-muted">
              Used later for sewing : cutting : finishing ratios. Unmapped departments show as &quot;Unassigned
              group&quot;.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-text-muted">
                Department
                <select
                  className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm"
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {groupByDept.has(d.id) ? ` (${groupByDept.get(d.id)!.group_key})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-text-muted">
                Group
                <select
                  className="mt-1 block rounded-lg border border-border px-2 py-1.5 text-sm"
                  value={newGroupKey}
                  onChange={(e) => setNewGroupKey(e.target.value as DepartmentGroupKey)}
                >
                  {GROUP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-subtle disabled:opacity-50"
                onClick={() => void saveGroup()}
                disabled={busy}
              >
                Save mapping
              </button>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {groups.length === 0 ? (
                <li className="px-3 py-3 text-text-muted">No department groups yet.</li>
              ) : (
                groups.map((g) => (
                  <li key={g.id} className="flex justify-between px-3 py-2">
                    <span>{g.department_name ?? g.department_id}</span>
                    <span className="text-text-muted">{g.group_key}</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export default HrManpowerSettingsPage;
