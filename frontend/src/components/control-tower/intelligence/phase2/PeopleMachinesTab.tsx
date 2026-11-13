import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "@/api/client";
import {
  mfgPlanningApi as mp,
  type AssignmentKind,
  type AssignmentRole,
  type EmployeeAssignment,
  type LineAssignment,
  type MachineAssignment,
} from "@/api/mfgPlanning";
import { RemoteSearchSelect, type RemoteSelectOption } from "@/components/app/RemoteSearchSelect";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

import { formatDate } from "../formatDecimal";
import { Chip, PanelCard } from "../IntelligenceUi";
import { ASSIGNMENT_ROLE_LABEL } from "../reasonLabels";
import { assignmentDraftErrors, assignmentPatch, friendlyError, isStaleError, type AssignmentDraft } from "./phase2Logic";
import {
  ConfirmDialog,
  EmptyState,
  ErrorList,
  inputCls,
  labelCls,
  NoticeBox,
  secondaryBtn,
  SelectField,
  TextField,
} from "./Phase2Ui";
import { usePlanningMasters } from "./usePlanningMasters";
import { StyleSmvEditor } from "./StyleSmvEditor";

const PAGE = 100;
const ROLES: AssignmentRole[] = ["OPERATOR", "HELPER", "SUPERVISOR", "QC", "IRON", "FINISHING"];

const emptyDraft = (): AssignmentDraft => ({
  owner_id: null,
  sewing_line_id: "",
  shift_id: "",
  role: "OPERATOR",
  valid_from: todayLocalISO(),
  valid_to: "",
  notes: "",
});

const isEmployee = (a: LineAssignment): a is EmployeeAssignment => "employee_id" in a;

/** People & machines: who / which machine works on which sewing line, from which date.
 * `canWrite` / `canEditSmv` come from GET /planning-permissions (UI hints; the backend still checks). */
export function PeopleMachinesTab({ canWrite = true, canEditSmv = true }: { canWrite?: boolean; canEditSmv?: boolean } = {}) {
  const masters = usePlanningMasters(true);
  const [kind, setKind] = useState<AssignmentKind>("employees");
  const [lineFilter, setLineFilter] = useState("");
  const [activeOn, setActiveOn] = useState(() => todayLocalISO());
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [openActions, setOpenActions] = useState<string | number | null>(null);
  const [flash, setFlash] = useState("");

  const list = useMfgResource(
    "PeopleMachinesTab.list",
    `${kind}|${lineFilter}|${activeOn}|${includeInactive}|${offset}`,
    () =>
      mp.listAssignments(kind, {
        line_id: lineFilter ? Number(lineFilter) : undefined,
        active_on: activeOn || undefined,
        include_inactive: includeInactive || undefined,
        limit: PAGE,
        offset,
      }) as Promise<{ items: LineAssignment[]; total: number }>,
  );

  // machines for the picker
  const [machines, setMachines] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    if (kind !== "machines" || machines.length) return;
    let alive = true;
    api
      .listDepartmentMachines()
      .then((rows) => {
        if (alive) setMachines(rows.filter((m) => m.is_active).map((m) => ({ value: String(m.id), label: `${m.machine_code} · ${m.name}${m.machine_type ? ` (${m.machine_type})` : ""}` })));
      })
      .catch((e: unknown) => logApiError("PeopleMachinesTab.machines", e));
    return () => {
      alive = false;
    };
  }, [kind, machines.length]);

  // ---- drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LineAssignment | null>(null);
  const [draft, setDraft] = useState<AssignmentDraft>(emptyDraft);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<AssignmentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setErrors([]);
    setSaveError("");
    setDrawerOpen(true);
  };

  const openEdit = (a: LineAssignment) => {
    setEditing(a);
    setDraft({
      owner_id: isEmployee(a) ? a.employee_id : a.machine_id,
      sewing_line_id: String(a.sewing_line_id),
      shift_id: isEmployee(a) && a.shift_id ? String(a.shift_id) : "",
      role: isEmployee(a) ? String(a.role) : "",
      valid_from: a.valid_from,
      valid_to: a.valid_to ?? "",
      notes: a.notes ?? "",
    });
    setErrors([]);
    setSaveError("");
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errs = assignmentDraftErrors(draft, kind, editing == null);
    let patch: ReturnType<typeof assignmentPatch> = null;
    if (!errs.length && editing) {
      patch = assignmentPatch({ ...editing, shift_id: isEmployee(editing) ? editing.shift_id : null, role: isEmployee(editing) ? String(editing.role) : undefined }, draft, kind);
      if (!patch) errs.push("Nothing changed yet.");
    }
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    setSaveError("");
    try {
      if (editing && patch) {
        await mp.updateAssignment(kind, editing.id, patch);
        setFlash("Assignment updated.");
      } else if (kind === "employees") {
        await mp.createEmployeeAssignment({
          employee_id: draft.owner_id!,
          sewing_line_id: Number(draft.sewing_line_id),
          role: draft.role as AssignmentRole,
          valid_from: draft.valid_from,
          ...(draft.shift_id ? { shift_id: Number(draft.shift_id) } : {}),
          ...(draft.valid_to ? { valid_to: draft.valid_to } : {}),
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        });
        setFlash("Employee assigned to the line.");
      } else {
        await mp.createMachineAssignment({
          machine_id: draft.owner_id!,
          sewing_line_id: Number(draft.sewing_line_id),
          valid_from: draft.valid_from,
          ...(draft.valid_to ? { valid_to: draft.valid_to } : {}),
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        });
        setFlash("Machine assigned to the line.");
      }
      setDrawerOpen(false);
      list.reload();
    } catch (err) {
      logApiError("PeopleMachinesTab.save", err);
      if (editing && isStaleError(err)) {
        setDrawerOpen(false);
        setFlash("This assignment changed since you opened it; the list was reloaded - please try again.");
        list.reload();
        return;
      }
      setSaveError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  // ---- end / deactivate
  const [action, setAction] = useState<{ type: "end" | "deactivate"; row: LineAssignment } | null>(null);
  const [endDate, setEndDate] = useState(() => todayLocalISO());
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const doAction = async (reason: string) => {
    if (!action) return;
    if (action.type === "end" && (!endDate || endDate < action.row.valid_from)) {
      setActionError("The last day must be on or after the first day of the assignment.");
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      if (action.type === "end") {
        await mp.endAssignment(kind, action.row.id, { expected_lock_version: action.row.lock_version, valid_to: endDate });
        setFlash("Assignment ended.");
      } else {
        await mp.deactivateAssignment(kind, action.row.id, { expected_lock_version: action.row.lock_version, reason: reason || undefined });
        setFlash("Assignment deactivated.");
      }
      setAction(null);
      list.reload();
    } catch (err) {
      logApiError("PeopleMachinesTab.action", err);
      if (isStaleError(err)) {
        setAction(null);
        setFlash("This assignment changed since you opened it; the list was reloaded - please try again.");
        list.reload();
        return;
      }
      setActionError(friendlyError(err));
    } finally {
      setActionBusy(false);
    }
  };

  const rowActions = (a: LineAssignment): RowActionItem[] => [
    { key: "edit", label: "Edit", disabled: !a.is_active, onClick: () => openEdit(a) },
    {
      key: "end",
      label: "End assignment",
      disabled: !a.is_active,
      onClick: () => {
        setActionError("");
        setEndDate(todayLocalISO());
        setAction({ type: "end", row: a });
      },
    },
    {
      key: "deactivate",
      label: "Deactivate",
      danger: true,
      disabled: !a.is_active,
      onClick: () => {
        setActionError("");
        setAction({ type: "deactivate", row: a });
      },
    },
  ];

  const lineOptions = useMemo(() => masters.lines.filter((l) => l.active).map((l) => ({ value: String(l.id), label: l.label })), [masters.lines]);
  const shiftOptions = useMemo(() => masters.shifts.filter((s) => s.active).map((s) => ({ value: String(s.id), label: s.label })), [masters.shifts]);
  const rows = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const ownerLabel = (a: LineAssignment) =>
    isEmployee(a)
      ? `${a.employee_code ?? `#${a.employee_id}`} · ${a.employee_name ?? ""}`
      : `${a.machine_code ?? `#${a.machine_id}`} · ${a.machine_name ?? ""}`;

  return (
    <div className="space-y-3" data-testid="mfg-people-tab">
      <NoticeBox>
        Assign people and machines to sewing lines with a start date (and an end date when known). Capacity then counts operators from these
        assignments (and today's attendance when it is recorded) instead of the line default.
      </NoticeBox>
      {masters.error ? <NoticeBox tone="warn">{masters.error}</NoticeBox> : null}
      {flash ? <NoticeBox tone="good">{flash}</NoticeBox> : null}

      <PanelCard testId="mfg-assignments" title="Line assignments" loading={list.loading} error={list.error}>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(["employees", "machines"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${kind === k ? "border-brand-primary bg-brand-primary/10 text-text-primary" : "border-border text-text-secondary"}`}
              onClick={() => {
                setKind(k);
                setOffset(0);
              }}
            >
              {k === "employees" ? "People" : "Machines"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField id="mfg-asg-line" label="Sewing line" value={lineFilter} onChange={(v) => { setLineFilter(v); setOffset(0); }} options={lineOptions} placeholder="All lines" />
          <TextField id="mfg-asg-on" label="Working on (empty = any date)" type="date" value={activeOn} onChange={(v) => { setActiveOn(v); setOffset(0); }} />
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input type="checkbox" checked={includeInactive} onChange={(e) => { setIncludeInactive(e.target.checked); setOffset(0); }} />
            Show deactivated
          </label>
          {canWrite ? (
            <button type="button" className={secondaryBtn} onClick={openCreate}>
              {kind === "employees" ? "Assign a person" : "Assign a machine"}
            </button>
          ) : null}
        </div>
        {list.data && rows.length === 0 ? <EmptyState>No assignments match.</EmptyState> : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" aria-label={kind === "employees" ? "People on lines" : "Machines on lines"}>
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">{kind === "employees" ? "Person" : "Machine"}</th>
                  <th className="px-2 py-1 font-medium">{kind === "employees" ? "Role" : "Type"}</th>
                  <th className="px-2 py-1 font-medium">Line</th>
                  {kind === "employees" ? <th className="px-2 py-1 font-medium">Shift</th> : null}
                  <th className="px-2 py-1 font-medium">From</th>
                  <th className="px-2 py-1 font-medium">To</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="px-2 py-1 font-medium">{ownerLabel(a)}</td>
                    <td className="px-2 py-1">{isEmployee(a) ? (ASSIGNMENT_ROLE_LABEL[a.role] ?? a.role) : ((a as MachineAssignment).machine_type ?? "—")}</td>
                    <td className="px-2 py-1">{a.line_code ?? masters.lineLabel(a.sewing_line_id)}</td>
                    {kind === "employees" ? <td className="px-2 py-1">{isEmployee(a) ? (a.shift_code ?? "Any") : ""}</td> : null}
                    <td className="px-2 py-1">{formatDate(a.valid_from)}</td>
                    <td className="px-2 py-1">{a.valid_to ? formatDate(a.valid_to) : "Open"}</td>
                    <td className="px-2 py-1">
                      <Chip tone={a.is_active ? "good" : "neutral"}>{a.is_active ? "Active" : "Deactivated"}</Chip>
                    </td>
                    <td className="px-2 py-1 text-right">
                      {canWrite ? (
                        <RowActionsMenu rowId={`${kind}-${a.id}`} openId={openActions} onOpenChange={setOpenActions} items={rowActions(a)} menuPortal />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {total > PAGE ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" className={secondaryBtn} disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <button type="button" className={secondaryBtn} disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>
              Next
            </button>
          </div>
        ) : null}
      </PanelCard>

      <StyleSmvCard canEdit={canEditSmv} />

      <HrFormDrawer
        open={drawerOpen}
        title={editing ? "Edit assignment" : kind === "employees" ? "Assign a person to a line" : "Assign a machine to a line"}
        description="One active assignment per person / machine for the same dates."
        submitLabel={editing ? "Save changes" : "Assign"}
        submitting={saving}
        error={saveError}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(e) => void submit(e)}
      >
        {editing ? (
          <p className="text-xs font-medium text-text-primary">{ownerLabel(editing)}</p>
        ) : kind === "employees" ? (
          <div>
            <label htmlFor="mfg-asg-emp" className={labelCls}>
              Person *
            </label>
            <PlannerEmployeeSelect id="mfg-asg-emp" value={draft.owner_id} onChange={(id) => set({ owner_id: id })} />
          </div>
        ) : (
          <SelectField
            id="mfg-asg-machine"
            label="Machine"
            required
            value={draft.owner_id ? String(draft.owner_id) : ""}
            onChange={(v) => set({ owner_id: v ? Number(v) : null })}
            options={machines}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="mfg-asg-form-line" label="Sewing line" required value={draft.sewing_line_id} onChange={(v) => set({ sewing_line_id: v })} options={lineOptions} />
          {kind === "employees" ? (
            <>
              <SelectField
                id="mfg-asg-role"
                label="Role"
                required
                value={draft.role}
                onChange={(v) => set({ role: v })}
                options={ROLES.map((r) => ({ value: r, label: ASSIGNMENT_ROLE_LABEL[r] ?? r }))}
              />
              <SelectField id="mfg-asg-shift" label="Shift" value={draft.shift_id} onChange={(v) => set({ shift_id: v })} options={shiftOptions} placeholder="Any shift" />
            </>
          ) : null}
          <TextField id="mfg-asg-from" label="First day" type="date" required value={draft.valid_from} onChange={(v) => set({ valid_from: v })} />
          <TextField id="mfg-asg-to" label="Last day (optional)" type="date" value={draft.valid_to} onChange={(v) => set({ valid_to: v })} />
        </div>
        <div>
          <label htmlFor="mfg-asg-notes" className={labelCls}>
            Notes
          </label>
          <textarea id="mfg-asg-notes" rows={2} className={inputCls} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <ErrorList errors={errors} />
      </HrFormDrawer>

      <ConfirmDialog
        open={action != null}
        title={action?.type === "end" ? "End this assignment?" : "Deactivate this assignment?"}
        confirmLabel={action?.type === "end" ? "End assignment" : "Deactivate"}
        danger={action?.type === "deactivate"}
        reasonLabel={action?.type === "deactivate" ? "Reason" : undefined}
        pending={actionBusy}
        error={actionError}
        onClose={() => setAction(null)}
        onConfirm={(r) => void doAction(r)}
      >
        {action?.type === "end" ? (
          <div>
            <p>The assignment stays in history and stops after the last day.</p>
            <label htmlFor="mfg-asg-end" className={labelCls}>
              Last day
            </label>
            <input id="mfg-asg-end" type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        ) : (
          <p>Use this for a wrong entry. The assignment no longer counts for any date.</p>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Active employees (code + name only) from the planner-safe search, so planners need no HR access. */
function PlannerEmployeeSelect({ id, value, onChange }: { id: string; value: number | null; onChange: (id: number | null) => void }) {
  const fetchPage = useCallback(async (query: string, page: number, pageSize: number) => {
    // the picker endpoint returns at most 50 matches: one page, refine the search for more
    if (page > 1) return { options: [], total: 0 };
    const res = await mp.pickEmployees(query, Math.min(pageSize, 50));
    const options: RemoteSelectOption[] = res.items.map((e) => ({ value: e.id, label: `${e.employee_code} · ${e.employee_name}` }));
    return { options, total: options.length };
  }, []);
  return (
    <RemoteSearchSelect
      id={id}
      value={value ?? ""}
      onChange={(next) => onChange(next === "" ? null : next)}
      fetchPage={fetchPage}
      placeholder="Search employee code or name…"
      aria-label="Person"
      menuPortal
      className="mt-1 w-full"
    />
  );
}

function StyleSmvCard({ canEdit }: { canEdit: boolean }) {
  const [styleId, setStyleId] = useState<number | null>(null);
  const [styleLabel, setStyleLabel] = useState("");
  const fetchPage = useCallback(async (query: string, page: number, pageSize: number) => {
    const offset = (page - 1) * pageSize;
    const rows = await api.listStyles({ search: query || undefined, limit: pageSize, offset });
    const options: RemoteSelectOption[] = rows.map((s) => ({ value: s.id, label: `${s.style_code} · ${s.name}` }));
    return { options, total: rows.length < pageSize ? offset + rows.length : page * pageSize + 1 };
  }, []);
  return (
    <PanelCard testId="mfg-style-smv-card" title="Style standard SMV" subtitle="Approve the minutes per piece planning should use for a style.">
      <div>
        <label htmlFor="mfg-smv-style" className={labelCls}>
          Style
        </label>
        <RemoteSearchSelect
          id="mfg-smv-style"
          value={styleId ?? ""}
          onChange={(next, opt) => {
            setStyleId(next === "" ? null : next);
            setStyleLabel(opt?.label ?? "");
          }}
          fetchPage={fetchPage}
          placeholder="Search style code or name…"
          aria-label="Style"
          menuPortal
          className="mt-1 w-full max-w-md"
        />
      </div>
      {styleId != null ? <StyleSmvEditor key={styleId} styleId={styleId} styleLabel={styleLabel} canEdit={canEdit} /> : <EmptyState>Pick a style to see or approve its SMV.</EmptyState>}
    </PanelCard>
  );
}
