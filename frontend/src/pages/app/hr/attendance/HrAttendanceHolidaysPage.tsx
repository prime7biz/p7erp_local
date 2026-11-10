import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrHolidayResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

type HolidayForm = { holiday_date: string; name: string; is_optional: boolean; note: string };
const EMPTY_FORM: HolidayForm = { holiday_date: "", name: "", is_optional: false, note: "" };

export function HrAttendanceHolidaysPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrHolidayResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: HrHolidayResponse } | null>(null);
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrHolidays());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
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

  const openEdit = (r: HrHolidayResponse) => {
    setForm({ holiday_date: r.holiday_date, name: r.name, is_optional: r.is_optional, note: r.note ?? "" });
    setFormError("");
    setDrawer({ mode: "edit", row: r });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (!form.name.trim() || (drawer.mode === "create" && !form.holiday_date)) {
      setFormError("Date and name are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "create") {
        await api.createHrHoliday({
          holiday_date: form.holiday_date,
          name: form.name.trim(),
          is_optional: form.is_optional,
          note: form.note.trim() || null,
        });
      } else {
        await api.updateHrHoliday(drawer.row.id, { name: form.name.trim(), is_optional: form.is_optional, note: form.note.trim() || null });
      }
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : drawer.mode === "create" ? "Save failed" : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrHolidayResponse>[] = [
    { key: "date", header: "Date", render: (r) => <span className="font-medium text-text-primary">{r.holiday_date}</span>, value: (r) => r.holiday_date },
    { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
    {
      key: "optional",
      header: "Type",
      render: (r) =>
        r.is_optional ? (
          <span className="inline-flex rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900">Optional</span>
        ) : (
          <span className="text-text-secondary">Plant-wide</span>
        ),
      value: (r) => (r.is_optional ? "Optional" : "Plant-wide"),
    },
    { key: "note", header: "Note", render: (r) => r.note || "-", value: (r) => r.note, hideOnMobile: true },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add holiday
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Holidays" description="Plant-wide holidays for attendance and OT rules." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Holidays" }]} />
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
        emptyTitle="No holidays yet"
        emptyHint="Add public and factory holidays so attendance and overtime use the right day type."
        emptyAction={addButton}
        searchPlaceholder="Search date, name or note…"
        initialSort={{ key: "date", dir: "asc" }}
        exportFileName="hr-holidays"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit holiday" : "Add holiday"}
        description={drawer?.mode === "edit" ? "The date cannot be changed; add a new holiday instead." : undefined}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="holiday-date">Date **</label>
          <input
            id="holiday-date"
            type="date"
            className={inputClass}
            value={form.holiday_date}
            disabled={drawer?.mode === "edit"}
            onChange={(e) => setForm((f) => ({ ...f, holiday_date: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="holiday-name">Name **</label>
          <input id="holiday-name" className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_optional} onChange={(e) => setForm((f) => ({ ...f, is_optional: e.target.checked }))} />
          Optional holiday
        </label>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="holiday-note">Note</label>
          <input id="holiday-note" className={inputClass} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </HrFormDrawer>
    </div>
  );
}
