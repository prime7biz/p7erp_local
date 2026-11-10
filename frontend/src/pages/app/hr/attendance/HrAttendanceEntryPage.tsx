import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  api,
  type HrAttendanceBulkEntryBody,
  type HrAttendanceEntryCreate,
  type HrAttendanceEntryResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const BULK_IMPORT_SAMPLE = `{
  "rows": [
    {
      "employee_id": 101,
      "attendance_date": "2026-04-22",
      "in_time": "09:00:00",
      "out_time": "18:00:00",
      "status": "PRESENT",
      "source": "BIOMETRIC"
    }
  ]
}`;
const STATUS_SUGGESTIONS = ["PRESENT", "ABSENT", "LATE"];
const SOURCES = ["MANUAL", "BIOMETRIC", "CARD_READER", "MOBILE_APP"];
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

const EMPTY_FORM: HrAttendanceEntryCreate = {
  employee_id: 0,
  attendance_date: "",
  in_time: "",
  out_time: "",
  status: "PRESENT",
  remarks: "",
  source: "MANUAL",
};

export function HrAttendanceEntryPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrAttendanceEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: HrAttendanceEntryResponse } | null>(null);
  const [form, setForm] = useState<HrAttendanceEntryCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.employee_id), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrAttendanceEntries());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
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
  const openEdit = (row: HrAttendanceEntryResponse) => {
    setForm({
      employee_id: row.employee_id,
      attendance_date: row.attendance_date,
      in_time: row.in_time ?? "",
      out_time: row.out_time ?? "",
      status: row.status,
      remarks: row.remarks ?? "",
      source: row.source ?? "MANUAL",
    });
    setFormError("");
    setDrawer({ mode: "edit", row });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (drawer.mode === "create" && (!form.employee_id || !form.attendance_date)) {
      setFormError("Choose the employee and the date.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "create") {
        await api.createHrAttendanceEntry({
          ...form,
          in_time: form.in_time || null,
          out_time: form.out_time || null,
          remarks: form.remarks || null,
          source: form.source || "MANUAL",
        });
      } else {
        await api.updateHrAttendanceEntry(drawer.row.id, {
          in_time: form.in_time || null,
          out_time: form.out_time || null,
          status: form.status,
          remarks: form.remarks || null,
          source: form.source ?? undefined,
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

  const onBulk = async () => {
    setBulkMsg("");
    try {
      const parsed = JSON.parse(bulkJson) as HrAttendanceBulkEntryBody;
      if (!parsed || !Array.isArray(parsed.rows)) {
        throw new Error('Invalid JSON body. Use {"rows":[...]}');
      }
      const r = await api.postHrAttendanceEntriesBulk(parsed);
      setBulkMsg(`Created ${r.created} entries.`);
      await load();
    } catch (e) {
      setBulkMsg(e instanceof Error ? e.message : "Bulk import failed");
    }
  };

  const columns: HrTableColumn<HrAttendanceEntryResponse>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (r) => <HrEmployeeCell id={r.employee_id} lookup={lookup} />,
      value: (r) => {
        const e = lookup(r.employee_id);
        return e ? `${e.full_name} ${e.employee_code}` : `#${r.employee_id}`;
      },
    },
    { key: "date", header: "Date", render: (r) => r.attendance_date, value: (r) => r.attendance_date },
    { key: "in", header: "In", render: (r) => r.in_time ?? "—", value: (r) => r.in_time },
    { key: "out", header: "Out", render: (r) => r.out_time ?? "—", value: (r) => r.out_time },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    { key: "source", header: "Source", render: (r) => r.source ?? "-", value: (r) => r.source, hideOnMobile: true },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add entry
    </button>
  );

  const set = (key: keyof HrAttendanceEntryCreate) => (e: { target: { value: string } }) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Daily attendance entry"
          description="Manual or device-sourced attendance. Use bulk JSON for a biometric batch upload."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Daily entry" }]}
        />
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
        emptyTitle="No attendance entries yet"
        emptyHint="Add entries by hand, record IN / OUT on the Manual tab, or import from attendance devices."
        emptyAction={addButton}
        searchPlaceholder="Search employee, date or status…"
        statusOf={(r) => r.status}
        initialSort={{ key: "date", dir: "desc" }}
        exportFileName="attendance-entries"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <details className="rounded-xl border border-border bg-surface-raised p-4">
        <summary className="cursor-pointer text-sm font-semibold text-text-primary">Bulk import (JSON)</summary>
        <p className="mt-2 text-xs text-text-muted">
          Body shape: <code className="text-xs">{"{ \"rows\": [ { employee_id, attendance_date, in_time, out_time, status, source } ] }"}</code> — field
          names must match the API (backend <code className="text-xs">AttendanceBulkEntryBody</code>).
        </p>
        <textarea
          className="mt-2 w-full rounded-lg border border-border-strong px-3 py-2 font-mono text-xs"
          rows={5}
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
          placeholder={BULK_IMPORT_SAMPLE}
        />
        {bulkMsg && <p className="mt-2 text-sm text-text-secondary">{bulkMsg}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs" onClick={() => setBulkJson(BULK_IMPORT_SAMPLE)}>
            Load sample JSON
          </button>
          <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium" onClick={() => void onBulk()}>
            Upload batch
          </button>
        </div>
      </details>

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit attendance" : "Add attendance entry"}
        description={drawer?.mode === "edit" ? "Changing a saved entry needs manager / admin or hr.attendance.manage." : undefined}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="att-employee">Employee **</label>
          {drawer?.mode === "edit" ? (
            <HrEmployeeCell id={form.employee_id} lookup={lookup} link={false} />
          ) : (
            <HrEmployeeSelect id="att-employee" value={form.employee_id || null} onChange={(v) => setForm((p) => ({ ...p, employee_id: v ?? 0 }))} required />
          )}
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="att-date">Date **</label>
          <input id="att-date" type="date" className={inputClass} value={form.attendance_date} disabled={drawer?.mode === "edit"} onChange={set("attendance_date")} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="att-in">In time</label>
            <input id="att-in" className={inputClass} placeholder="09:00:00" value={form.in_time ?? ""} onChange={set("in_time")} />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="att-out">Out time</label>
            <input id="att-out" className={inputClass} placeholder="18:00:00" value={form.out_time ?? ""} onChange={set("out_time")} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="att-status">Status **</label>
            <input id="att-status" list="att-status-list" className={inputClass} value={form.status} onChange={set("status")} required />
            <datalist id="att-status-list">
              {STATUS_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="att-source">Source</label>
            <select id="att-source" className={inputClass} value={form.source ?? "MANUAL"} onChange={set("source")}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="att-remarks">Remarks</label>
          <textarea id="att-remarks" rows={2} className={inputClass} value={form.remarks ?? ""} onChange={set("remarks")} />
        </div>
      </HrFormDrawer>
    </div>
  );
}
