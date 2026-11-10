import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type HrRosterEntryResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

type RosterForm = { employee_id: number | null; roster_date: string; shift_id: number | null; is_week_off: boolean; note: string };
const EMPTY_FORM: RosterForm = { employee_id: null, roster_date: "", shift_id: null, is_week_off: false, note: "" };

export function HrRosterPage() {
  const [rows, setRows] = useState<HrRosterEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: HrRosterEntryResponse } | null>(null);
  const [form, setForm] = useState<RosterForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const shifts = useHrOptions(
    "shifts",
    () => api.listHrShifts(),
    (s) => ({ value: s.id, label: `${s.code} · ${s.name} (${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)})` }),
  );
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrRosterEntries());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setDrawer({ mode: "create" });
  };
  const openEdit = (row: HrRosterEntryResponse) => {
    setForm({
      employee_id: row.employee_id,
      roster_date: row.roster_date,
      shift_id: row.shift_id,
      is_week_off: Boolean(row.is_week_off),
      note: row.note ?? "",
    });
    setFormError("");
    setDrawer({ mode: "edit", row });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (drawer.mode === "create" && (!form.employee_id || !form.roster_date || !form.shift_id)) {
      setFormError("Choose the employee, date and shift.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "create") {
        await api.createHrRosterEntry({
          employee_id: form.employee_id!,
          roster_date: form.roster_date,
          shift_id: form.shift_id!,
          is_week_off: form.is_week_off,
          note: form.note.trim() || null,
        });
      } else {
        await api.updateHrRosterEntry(drawer.row.id, {
          shift_id: form.shift_id,
          is_week_off: form.is_week_off,
          note: form.note.trim() || null,
        });
      }
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrRosterEntryResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const e = lookup(r.employee_id);
        return e ? `${e.full_name} ${e.employee_code}` : `#${r.employee_id}`;
      },
    },
    { key: "date", header: "Date", render: (r) => r.roster_date, value: (r) => r.roster_date },
    { key: "shift", header: "Shift", render: (r) => (r.shift_id == null ? "—" : shifts.labelOf(r.shift_id)), value: (r) => shifts.labelOf(r.shift_id) },
    {
      key: "weekoff",
      header: "Week off",
      render: (r) =>
        r.is_week_off ? (
          <span className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900">Week off</span>
        ) : (
          <span className="text-text-muted">No</span>
        ),
      value: (r) => (r.is_week_off ? "Week off" : "No"),
    },
    { key: "note", header: "Note", render: (r) => r.note || "-", value: (r) => r.note, hideOnMobile: true },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add roster entry
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="HR Roster" description="Assign employees to shifts by day, and mark week-off days." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Roster" }]} />
        {addButton}
      </div>
      <HrDataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No roster entries"
        emptyHint="Create shifts first, then assign people to a shift for each day."
        emptyAction={addButton}
        searchPlaceholder="Search employee, date or shift…"
        initialSort={{ key: "date", dir: "desc" }}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit roster entry" : "Add roster entry"}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="roster-employee">Employee **</label>
          {drawer?.mode === "edit" ? (
            <HrEmployeeCell id={form.employee_id} lookup={lookup} link={false} />
          ) : (
            <HrEmployeeSelect id="roster-employee" value={form.employee_id} onChange={(v) => setForm((f) => ({ ...f, employee_id: v }))} required />
          )}
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="roster-date">Date **</label>
          <input
            id="roster-date"
            type="date"
            className={inputClass}
            value={form.roster_date}
            disabled={drawer?.mode === "edit"}
            onChange={(e) => setForm((f) => ({ ...f, roster_date: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="roster-shift">Shift **</label>
          <select
            id="roster-shift"
            className={inputClass}
            value={form.shift_id ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, shift_id: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">Choose a shift…</option>
            {shifts.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_week_off} onChange={(e) => setForm((f) => ({ ...f, is_week_off: e.target.checked }))} />
          Week off on this day
        </label>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="roster-note">Note</label>
          <textarea id="roster-note" rows={2} className={inputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </HrFormDrawer>
    </div>
  );
}
