import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrLeaveTypeCreate, type HrLeaveTypeResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

const EMPTY_FORM: HrLeaveTypeCreate = { code: "", name: "", is_paid: true, requires_approval: true, is_active: true };

export function HrLeaveTypesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrLeaveTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: HrLeaveTypeResponse } | null>(null);
  const [form, setForm] = useState<HrLeaveTypeCreate>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrLeaveTypes({ active_only: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leave types");
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

  const openEdit = (row: HrLeaveTypeResponse) => {
    setForm({ code: row.code, name: row.name, is_paid: row.is_paid, requires_approval: row.requires_approval, is_active: row.is_active });
    setFormError("");
    setDrawer({ mode: "edit", row });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!drawer) return;
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Code and name are required.");
      return;
    }
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      is_paid: form.is_paid,
      requires_approval: form.requires_approval,
      is_active: form.is_active,
    };
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "edit") await api.updateHrLeaveType(drawer.row.id, body);
      else await api.createHrLeaveType(body);
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrLeaveTypeResponse>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-medium text-text-primary">{r.code}</span>, value: (r) => r.code },
    { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
    { key: "paid", header: "Paid", render: (r) => (r.is_paid ? "Yes" : "No"), value: (r) => (r.is_paid ? "Yes" : "No") },
    { key: "approval", header: "Approval", render: (r) => (r.requires_approval ? "Required" : "No"), value: (r) => (r.requires_approval ? "Required" : "No"), hideOnMobile: true },
    { key: "active", header: "Status", render: (r) => <ActiveBadge active={r.is_active} />, value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add leave type
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Leave types"
          description="Configure leave categories (casual, sick, annual, etc.). Quotas are set in Leave policies."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Leave types" }]}
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
        emptyTitle="No leave types yet"
        emptyHint="Add the leave categories your company uses, for example CL, SL and EL."
        emptyAction={addButton}
        searchPlaceholder="Search code or name…"
        initialSort={{ key: "code", dir: "asc" }}
        exportFileName="hr-leave-types"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit leave type" : "Add leave type"}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="lt-code">Code **</label>
          <input id="lt-code" className={inputClass} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="lt-name">Name **</label>
          <input id="lt-name" className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_paid ?? true} onChange={(e) => setForm((p) => ({ ...p, is_paid: e.target.checked }))} />
          Paid leave
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.requires_approval ?? true} onChange={(e) => setForm((p) => ({ ...p, requires_approval: e.target.checked }))} />
          Requires approval
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          Active
        </label>
      </HrFormDrawer>
    </div>
  );
}
