import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrLeavePolicyCreate, type HrLeavePolicyResponse, type HrLeavePolicyUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { useAuth } from "@/context/AuthContext";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";
const EMPTY_CREATE: HrLeavePolicyCreate = {
  leave_type_id: 0,
  employment_type: "",
  annual_quota_days: "0",
  max_carry_forward_days: "0",
  effective_from: "",
  effective_to: "",
  is_active: true,
};

export function HrLeavePoliciesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrLeavePolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<HrLeavePolicyResponse | null>(null);
  const [editForm, setEditForm] = useState<HrLeavePolicyUpdate>({});
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<HrLeavePolicyCreate>(EMPTY_CREATE);
  const leaveTypes = useHrOptions(
    "leaveTypesAll",
    () => api.listHrLeaveTypes({ active_only: false }),
    (t) => ({ value: t.id, label: `${t.code} · ${t.name}` }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrLeavePolicies());
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

  const openEdit = (r: HrLeavePolicyResponse) => {
    setEditing(r);
    setEditForm({
      employment_type: r.employment_type ?? undefined,
      annual_quota_days: r.annual_quota_days,
      max_carry_forward_days: r.max_carry_forward_days,
      effective_from: r.effective_from ?? undefined,
      effective_to: r.effective_to ?? undefined,
      is_active: r.is_active,
    });
    setFormError("");
  };

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE);
    setFormError("");
    setCreating(true);
  };

  const saveCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.leave_type_id || !createForm.effective_from) {
      setFormError("Choose the leave type and the effective-from date.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      await api.createHrLeavePolicy({
        ...createForm,
        employment_type: createForm.employment_type?.trim() || null,
        effective_to: createForm.effective_to || null,
      });
      setCreating(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setFormError("");
    try {
      await api.updateHrLeavePolicy(editing.id, editForm);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrLeavePolicyResponse>[] = [
    {
      key: "type",
      header: "Leave type",
      render: (r) => <span className="font-medium text-text-primary">{leaveTypes.labelOf(r.leave_type_id)}</span>,
      value: (r) => leaveTypes.labelOf(r.leave_type_id),
    },
    { key: "employment", header: "Employment", render: (r) => r.employment_type || "All", value: (r) => r.employment_type || "All" },
    { key: "quota", header: "Annual quota (days)", align: "right", render: (r) => r.annual_quota_days, value: (r) => r.annual_quota_days },
    { key: "carry", header: "Max carry-forward", align: "right", render: (r) => r.max_carry_forward_days, value: (r) => r.max_carry_forward_days, hideOnMobile: true },
    { key: "from", header: "Effective from", render: (r) => r.effective_from || "-", value: (r) => r.effective_from, hideOnMobile: true },
    { key: "to", header: "Effective to", render: (r) => r.effective_to || "-", value: (r) => r.effective_to, hideOnMobile: true },
    { key: "active", header: "Status", render: (r) => <ActiveBadge active={r.is_active} />, value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add policy
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Leave policies" description="Quota and carry-forward rules by employment type." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Policies" }]} />
        {addButton}
      </div>
      <HrDataTable
        emptyAction={addButton}
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onRefresh={() => void load()}
        emptyTitle="No leave policies yet"
        emptyHint="Leave policies set the yearly quota and carry-forward for each leave type."
        searchPlaceholder="Search leave type or employment type…"
        initialSort={{ key: "type", dir: "asc" }}
        exportFileName="hr-leave-policies"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={editing != null}
        title="Edit leave policy"
        description={editing ? leaveTypes.labelOf(editing.leave_type_id) : undefined}
        onClose={() => setEditing(null)}
        onSubmit={(e) => void saveEdit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="lp-employment">Employment type</label>
          <input
            id="lp-employment"
            className={inputClass}
            value={editForm.employment_type ?? ""}
            onChange={(e) => setEditForm((f) => ({ ...f, employment_type: e.target.value || undefined }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lp-quota">Annual quota (days)</label>
            <input
              id="lp-quota"
              inputMode="decimal"
              className={inputClass}
              value={editForm.annual_quota_days ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, annual_quota_days: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lp-carry">Max carry-forward (days)</label>
            <input
              id="lp-carry"
              inputMode="decimal"
              className={inputClass}
              value={editForm.max_carry_forward_days ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, max_carry_forward_days: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lp-from">Effective from</label>
            <input
              id="lp-from"
              type="date"
              className={inputClass}
              value={editForm.effective_from ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, effective_from: e.target.value || null }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lp-to">Effective to</label>
            <input
              id="lp-to"
              type="date"
              className={inputClass}
              value={editForm.effective_to ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, effective_to: e.target.value || null }))}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={editForm.is_active ?? true} onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active
        </label>
      </HrFormDrawer>

      <HrFormDrawer
        open={creating}
        title="Add leave policy"
        description="Fields marked with ** are mandatory."
        onClose={() => setCreating(false)}
        onSubmit={(e) => void saveCreate(e)}
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="lpc-type">Leave type **</label>
          <select
            id="lpc-type"
            className={inputClass}
            value={createForm.leave_type_id || ""}
            onChange={(e) => setCreateForm((f) => ({ ...f, leave_type_id: Number(e.target.value) || 0 }))}
          >
            <option value="">Choose…</option>
            {leaveTypes.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="lpc-employment">Employment type (leave empty for everyone)</label>
          <input
            id="lpc-employment"
            className={inputClass}
            value={createForm.employment_type ?? ""}
            onChange={(e) => setCreateForm((f) => ({ ...f, employment_type: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lpc-quota">Annual quota (days)</label>
            <input
              id="lpc-quota"
              inputMode="decimal"
              className={inputClass}
              value={createForm.annual_quota_days ?? ""}
              onChange={(e) => setCreateForm((f) => ({ ...f, annual_quota_days: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lpc-carry">Max carry-forward (days)</label>
            <input
              id="lpc-carry"
              inputMode="decimal"
              className={inputClass}
              value={createForm.max_carry_forward_days ?? ""}
              onChange={(e) => setCreateForm((f) => ({ ...f, max_carry_forward_days: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lpc-from">Effective from **</label>
            <input
              id="lpc-from"
              type="date"
              className={inputClass}
              value={createForm.effective_from}
              onChange={(e) => setCreateForm((f) => ({ ...f, effective_from: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="lpc-to">Effective to</label>
            <input
              id="lpc-to"
              type="date"
              className={inputClass}
              value={createForm.effective_to ?? ""}
              onChange={(e) => setCreateForm((f) => ({ ...f, effective_to: e.target.value }))}
            />
          </div>
        </div>
      </HrFormDrawer>
    </div>
  );
}
