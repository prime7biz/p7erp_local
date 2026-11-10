import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrShiftCreate, type HrShiftResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

const EMPTY_FORM: HrShiftCreate = { code: "", name: "", start_time: "", end_time: "", is_night_shift: false, is_active: true };
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export function HrShiftsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrShiftResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: HrShiftResponse } | null>(null);
  const [form, setForm] = useState<HrShiftCreate>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrShifts({ active_only: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
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

  const openEdit = (row: HrShiftResponse) => {
    setForm({
      code: row.code,
      name: row.name,
      start_time: hhmm(row.start_time),
      end_time: hhmm(row.end_time),
      is_night_shift: row.is_night_shift,
      is_active: row.is_active,
    });
    setFormError("");
    setDrawer({ mode: "edit", row });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (!form.code.trim() || !form.name.trim() || !form.start_time || !form.end_time) {
      setFormError("Code, name, start time and end time are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "edit") await api.updateHrShift(drawer.row.id, form);
      else await api.createHrShift(form);
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrShiftResponse>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-medium text-text-primary">{r.code}</span>, value: (r) => r.code },
    { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
    { key: "start", header: "Start", render: (r) => hhmm(r.start_time), value: (r) => hhmm(r.start_time) },
    { key: "end", header: "End", render: (r) => hhmm(r.end_time), value: (r) => hhmm(r.end_time) },
    { key: "night", header: "Night", render: (r) => (r.is_night_shift ? "Yes" : "No"), value: (r) => (r.is_night_shift ? "Yes" : "No"), hideOnMobile: true },
    { key: "active", header: "Status", render: (r) => <ActiveBadge active={r.is_active} />, value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add shift
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Shifts" description="Shift templates for roster and attendance." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Shifts" }]} />
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
        emptyTitle="No shifts yet"
        emptyHint="Add a shift (for example General 08:00–17:00) so it can be used in the roster."
        emptyAction={addButton}
        searchPlaceholder="Search code or name…"
        initialSort={{ key: "code", dir: "asc" }}
        exportFileName="hr-shifts"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit shift" : "Add shift"}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="shift-code">Code **</label>
          <input id="shift-code" className={inputClass} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="shift-name">Name **</label>
          <input id="shift-name" className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="shift-start">Start time **</label>
            <input id="shift-start" type="time" className={inputClass} value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="shift-end">End time **</label>
            <input id="shift-end" type="time" className={inputClass} value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} required />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_night_shift ?? false} onChange={(e) => setForm((p) => ({ ...p, is_night_shift: e.target.checked }))} />
          Night shift
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          Active
        </label>
      </HrFormDrawer>
    </div>
  );
}
