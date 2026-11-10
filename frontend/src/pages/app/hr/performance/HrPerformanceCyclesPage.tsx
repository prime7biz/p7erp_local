import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrPerformanceCycleResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

type CycleForm = { name: string; description: string; start_date: string; end_date: string };
const EMPTY_FORM: CycleForm = { name: "", description: "", start_date: "", end_date: "" };

export function HrPerformanceCyclesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrPerformanceCycleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CycleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrPerformanceCycles());
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
    setCreateOpen(true);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setFormError("Name, start date and end date are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.createHrPerformanceCycle({
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setCreateOpen(false);
      setInfo("Cycle created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (row: HrPerformanceCycleResponse, status: "closed") => {
    if (busyId != null) return;
    if (!window.confirm(`Close "${row.name}"? Goals can no longer be added or edited in a closed cycle.`)) return;
    setBusyId(row.id);
    setInfo("");
    setActionError("");
    try {
      await api.postHrPerformanceCycleStatus(row.id, { status });
      setInfo(`${row.name} is closed.`);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusyId(null);
    }
  };

  const rowActions = (r: HrPerformanceCycleResponse): HrRowAction[] => {
    const actions: HrRowAction[] = [];
    if (r.status !== "closed") {
      actions.push({ key: "close", label: "Close cycle", primary: true, disabled: busyId != null, onClick: () => void setStatus(r, "closed") });
    }
    return actions;
  };

  const columns: HrTableColumn<HrPerformanceCycleResponse>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-medium text-text-primary">{r.name}</span>, value: (r) => r.name },
    { key: "start", header: "Start", render: (r) => r.start_date, value: (r) => r.start_date },
    { key: "end", header: "End", render: (r) => r.end_date, value: (r) => r.end_date },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    { key: "description", header: "Description", render: (r) => r.description || "-", value: (r) => r.description, hideOnMobile: true },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add cycle
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Performance cycles" description="Define review periods. Close a cycle when its goals and reviews are final." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Cycles" }]} />
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
        emptyTitle="No performance cycles yet"
        emptyHint="Add a review period (for example Jan–Jun 2026) before setting goals and reviews."
        emptyAction={addButton}
        searchPlaceholder="Search name or status…"
        initialSort={{ key: "start", dir: "desc" }}
        statusOf={(r) => r.status}
        exportFileName="hr-performance-cycles"
        canExport={canExportHrData(me?.role_name)}
        rowActions={rowActions}
      />

      <HrFormDrawer
        open={createOpen}
        title="Add performance cycle"
        description="New cycles start as draft."
        onClose={() => setCreateOpen(false)}
        onSubmit={(e) => void onCreate(e)}
        submitLabel="Add cycle"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cycle-name">Name **</label>
          <input id="cycle-name" className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cycle-desc">Description</label>
          <input id="cycle-desc" className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="cycle-start">Start date **</label>
            <input id="cycle-start" type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="cycle-end">End date **</label>
            <input id="cycle-end" type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required />
          </div>
        </div>
      </HrFormDrawer>
    </div>
  );
}
