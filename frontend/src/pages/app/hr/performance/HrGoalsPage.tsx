import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type HrGoalResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

type GoalForm = { cycle_id: number | null; employee_id: number | null; title: string; description: string; weight: string; target_value: string };
const EMPTY_FORM: GoalForm = { cycle_id: null, employee_id: null, title: "", description: "", weight: "", target_value: "" };

export function HrGoalsPage() {
  const { me } = useAuth();
  const isManager = canExportHrData(me?.role_name);
  const [rows, setRows] = useState<HrGoalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<GoalForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const cycles = useHrOptions(
    "performanceCycles",
    () => api.listHrPerformanceCycles(),
    (c) => ({ value: c.id, label: `${c.name} (${c.start_date} – ${c.end_date})${c.status === "closed" ? " · closed" : ""}` }),
  );
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrGoals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The server submits your own goal, but a manager's submit on someone else's goal approves it.
  // undefined = still checking (no Submit/Approve yet), null = login not linked to an employee.
  const [myEmployeeId, setMyEmployeeId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    api
      .getHrEssMyProfile()
      .then((p) => {
        if (!cancelled) setMyEmployeeId(p.employee_id);
      })
      .catch(() => {
        if (!cancelled) setMyEmployeeId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (id: number) => {
    if (busyId != null) return;
    setBusyId(id);
    setInfo("");
    setActionError("");
    try {
      const updated = await api.submitHrGoal(id, {});
      setInfo(updated.status === "approved" ? "Goal approved." : "Goal submitted.");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusyId(null);
    }
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setCreateOpen(true);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.cycle_id || !form.employee_id || !form.title.trim()) {
      setFormError("Choose the cycle and employee, and enter a title.");
      return;
    }
    const weightText = form.weight.trim();
    const weight = weightText === "" ? null : Number(weightText);
    if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > 100)) {
      setFormError("Weight must be a number from 0 to 100.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.createHrGoal({
        cycle_id: form.cycle_id,
        employee_id: form.employee_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        weight,
        target_value: form.target_value.trim() || null,
      });
      setCreateOpen(false);
      setInfo("Goal created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrGoalResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const emp = lookup(r.employee_id);
        return emp ? `${emp.full_name} ${emp.employee_code}` : `#${r.employee_id}`;
      },
    },
    { key: "title", header: "Goal", render: (r) => <span className="font-medium text-text-primary">{r.title}</span>, value: (r) => r.title },
    { key: "cycle", header: "Cycle", render: (r) => cycles.labelOf(r.cycle_id), value: (r) => cycles.labelOf(r.cycle_id), hideOnMobile: true },
    { key: "weight", header: "Weight %", align: "right", render: (r) => (r.weight == null ? "-" : r.weight), value: (r) => r.weight, hideOnMobile: true },
    { key: "target", header: "Target", render: (r) => r.target_value || "-", value: (r) => r.target_value, hideOnMobile: true },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add goal
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Performance goals"
          description="Create goals in a cycle, then submit them for manager review."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Goals" }]}
        />
        {addButton}
      </div>
      {info ? (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
        </div>
      ) : null}
      {actionError ? (
        <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {actionError}
        </div>
      ) : null}
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No goals yet"
        emptyHint="Create a performance cycle first, then add goals for employees in that cycle."
        emptyAction={addButton}
        searchPlaceholder="Search employee, goal or cycle…"
        statusOf={(r) => r.status}
        exportFileName="hr-performance-goals"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => {
          if (myEmployeeId === undefined) return [];
          const own = myEmployeeId === r.employee_id;
          // Same roles as hr_performance `_require_manager_or_admin`; others would only get a 403.
          const canApprove = !own && isManager && (r.status === "draft" || r.status === "submitted");
          if (!(own && r.status === "draft") && !canApprove) return [];
          return [
            {
              key: "submit",
              label: own ? "Submit" : "Approve",
              primary: true,
              tone: "positive",
              disabled: busyId != null,
              onClick: () => void submit(r.id),
            },
          ];
        }}
      />

      <HrFormDrawer
        open={createOpen}
        title="Add goal"
        description="Goals cannot be added to a closed cycle."
        onClose={() => setCreateOpen(false)}
        onSubmit={(e) => void create(e)}
        submitLabel="Add goal"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="goal-cycle">Cycle **</label>
          <select
            id="goal-cycle"
            className={inputClass}
            value={form.cycle_id ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, cycle_id: e.target.value ? Number(e.target.value) : null }))}
            required
          >
            <option value="">Choose a cycle…</option>
            {cycles.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="goal-employee">Employee **</label>
          <HrEmployeeSelect id="goal-employee" value={form.employee_id} onChange={(v) => setForm((f) => ({ ...f, employee_id: v }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="goal-title">Title **</label>
          <input id="goal-title" className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="goal-desc">Description</label>
          <textarea id="goal-desc" rows={3} className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="goal-weight">Weight % (0–100)</label>
            <input
              id="goal-weight"
              type="number"
              min={0}
              max={100}
              step="any"
              className={inputClass}
              value={form.weight}
              onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="goal-target">Target value</label>
            <input id="goal-target" className={inputClass} value={form.target_value} onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))} />
          </div>
        </div>
      </HrFormDrawer>
    </div>
  );
}
