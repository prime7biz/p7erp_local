/**
 * HR → Manpower → Sanctioned strength: approved quota by department + designation vs present headcount.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type HrDepartmentResponse, type HrDesignationResponse } from "@/api/client";
import {
  hrManpowerApi,
  type ManpowerSanctionedRow,
  type ManpowerStandingSummary,
} from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrRowActions } from "@/components/hr/kit/HrRowActions";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { logApiError } from "@/utils/logApiError";

type FormState = {
  department_id: string;
  designation_id: string;
  approved_quota: string;
  effective_from: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  department_id: "",
  designation_id: "",
  approved_quota: "0",
  effective_from: new Date().toISOString().slice(0, 10),
  notes: "",
});

export function HrManpowerSanctionedPage() {
  const [summary, setSummary] = useState<ManpowerStandingSummary | null>(null);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<ManpowerSanctionedRow | null>(null);

  const load = useCallback(async (keepMessages = false) => {
    setLoading(true);
    if (!keepMessages) {
      setError("");
      setInfo("");
    }
    try {
      const [sum, deps, desigs] = await Promise.all([
        hrManpowerApi.standingSummary(),
        api.listHrDepartments({ limit: 500 }),
        api.listHrDesignations({ limit: 500 }),
      ]);
      setSummary(sum);
      setDepartments(deps);
      setDesignations(desigs);
    } catch (e) {
      logApiError("HrManpowerSanctionedPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load manpower quotas.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const designationsForDept = useMemo(() => {
    const deptId = Number(form.department_id);
    if (!deptId) return designations;
    return designations.filter((d) => d.department_id == null || d.department_id === deptId);
  }, [designations, form.department_id]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
  };

  const openEdit = (row: ManpowerSanctionedRow) => {
    setEditing(row);
    setForm({
      department_id: String(row.department_id),
      designation_id: String(row.designation_id),
      approved_quota: String(row.approved_quota),
      effective_from: row.effective_from,
      notes: row.notes ?? "",
    });
  };

  const save = async () => {
    const department_id = Number(form.department_id);
    const designation_id = Number(form.designation_id);
    const approved_quota = Number(form.approved_quota);
    if (!department_id || !designation_id || Number.isNaN(approved_quota) || approved_quota < 0) {
      setError("Choose a department, designation and a non-negative quota.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await hrManpowerApi.upsertSanctioned({
        department_id,
        designation_id,
        approved_quota,
        effective_from: form.effective_from,
        notes: form.notes.trim() || null,
      });
      setInfo(editing ? "Quota updated." : "Quota saved.");
      setEditing(null);
      setForm(emptyForm());
      await load(true);
    } catch (e) {
      logApiError("HrManpowerSanctionedPage.save", e);
      setError(e instanceof Error ? e.message : "Could not save quota.");
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    if (!window.confirm("Create missing quota rows equal to today's active headcount?")) return;
    setBusy(true);
    setError("");
    try {
      const result = await hrManpowerApi.seedFromCurrent();
      setInfo(
        `Seeded ${result.created} new quota cell(s); ${result.skipped_existing} already had a quota (${result.cells_seen} cells with people).`,
      );
      await load(true);
    } catch (e) {
      logApiError("HrManpowerSanctionedPage.seed", e);
      setError(e instanceof Error ? e.message : "Could not seed quotas.");
    } finally {
      setBusy(false);
    }
  };

  const rows = summary?.rows ?? [];

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Sanctioned strength"
        description="Approved manpower quota by department and designation, compared with people currently employed (active)."
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Total quota" value={summary?.total_quota} />
        <Kpi label="Present (active)" value={summary?.total_present} />
        <Kpi label="Cells over quota" value={summary?.cells_over} />
        <Kpi label="Cells under quota" value={summary?.cells_under} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-subtle"
          onClick={openCreate}
          disabled={busy}
        >
          Add / update quota
        </button>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-subtle"
          onClick={() => void seed()}
          disabled={busy}
        >
          Seed from current headcount
        </button>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-subtle"
          onClick={() => void load()}
          disabled={busy || loading}
        >
          Refresh
        </button>
      </div>

      {(editing !== null || form.department_id || form.designation_id) && (
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <p className="text-sm font-medium text-text-primary">{editing ? "Edit quota" : "New quota"}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-text-muted">
              Department
              <select
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={form.department_id}
                onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value, designation_id: "" }))}
                disabled={!!editing}
              >
                <option value="">Select…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted">
              Designation
              <select
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={form.designation_id}
                onChange={(e) => setForm((f) => ({ ...f, designation_id: e.target.value }))}
                disabled={!!editing}
              >
                <option value="">Select…</option>
                {designationsForDept.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted">
              Approved quota
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={form.approved_quota}
                onChange={(e) => setForm((f) => ({ ...f, approved_quota: e.target.value }))}
              />
            </label>
            <label className="text-xs text-text-muted">
              Effective from
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                value={form.effective_from}
                onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-xs text-text-muted">
            Notes
            <input
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => void save()}
              disabled={busy}
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm());
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2 text-right">Quota</th>
              <th className="px-3 py-2 text-right">Present</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-text-muted">
                  No sanctioned strength yet. Seed from current headcount or add a quota.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const actions: HrRowAction[] = [
                  { key: "edit", label: "Edit", onClick: () => openEdit(row), primary: true },
                ];
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{row.department_name ?? row.department_id}</td>
                    <td className="px-3 py-2">{row.designation_title ?? row.designation_id}</td>
                    <td className="px-3 py-2 text-right">{row.approved_quota}</td>
                    <td className="px-3 py-2 text-right">{row.present_active}</td>
                    <td
                      className={`px-3 py-2 text-right ${
                        row.variance > 0 ? "text-red-600" : row.variance < 0 ? "text-amber-700" : ""
                      }`}
                    >
                      {row.variance > 0 ? `+${row.variance}` : row.variance}
                    </td>
                    <td className="px-3 py-2">{row.effective_from}</td>
                    <td className="px-3 py-2">
                      <HrRowActions rowId={row.id} actions={actions} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text-primary">{value ?? "—"}</p>
    </div>
  );
}

export default HrManpowerSanctionedPage;
