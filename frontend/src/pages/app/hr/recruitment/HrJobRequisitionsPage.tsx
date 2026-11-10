import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type HrJobRequisitionResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrEmployeeCell, HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useEmployeeLookup } from "@/components/hr/kit/useEmployeeLookup";
import { useHrOptions } from "@/components/hr/kit/useHrOptions";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/money";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

/** Statuses the backend treats specially (sets opened / closed dates); any other text is still accepted. */
const SUGGESTED_STATUSES = ["draft", "open", "filled", "closed", "cancelled"];

type RequisitionForm = {
  title: string;
  vacancy_count: number;
  department_id: number | null;
  hiring_manager_employee_id: number | null;
  employment_type: string;
  location: string;
  description: string;
};
const EMPTY_FORM: RequisitionForm = {
  title: "",
  vacancy_count: 1,
  department_id: null,
  hiring_manager_employee_id: null,
  employment_type: "",
  location: "",
  description: "",
};

function budgetText(r: HrJobRequisitionResponse): string {
  const min = r.budget_min;
  const max = r.budget_max;
  if (min == null && max == null) return "-";
  if (min != null && max != null) return `${formatMoney(min)} – ${formatMoney(max)}`;
  return min != null ? `from ${formatMoney(min)}` : `up to ${formatMoney(max)}`;
}

export function HrJobRequisitionsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<HrJobRequisitionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formError, setFormError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<RequisitionForm>(EMPTY_FORM);
  const [statusRow, setStatusRow] = useState<HrJobRequisitionResponse | null>(null);
  const [statusDraft, setStatusDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const departments = useHrOptions(
    "departmentsAll",
    () => api.listHrDepartments({ active_only: false, limit: 500 }),
    (d) => ({ value: d.id, label: `${d.code} · ${d.name}${d.is_active ? "" : " (inactive)"}` }),
  );
  const lookup = useEmployeeLookup(useMemo(() => rows.map((r) => r.hiring_manager_employee_id), [rows]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrJobRequisitions());
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
    setCreateOpen(true);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.createHrJobRequisition({
        title: form.title.trim(),
        vacancy_count: form.vacancy_count,
        department_id: form.department_id,
        hiring_manager_employee_id: form.hiring_manager_employee_id,
        employment_type: form.employment_type.trim() || null,
        location: form.location.trim() || null,
        description: form.description.trim() || null,
      });
      setCreateOpen(false);
      setInfo("Requisition created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const openStatus = (r: HrJobRequisitionResponse) => {
    setStatusRow(r);
    setStatusDraft("");
    setFormError("");
  };

  const applyStatus = async (e: FormEvent) => {
    e.preventDefault();
    if (!statusRow) return;
    if (!statusDraft.trim()) {
      setFormError("Enter the new status.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.postHrJobRequisitionStatus(statusRow.id, { status: statusDraft.trim() });
      setStatusRow(null);
      setInfo("Status updated.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<HrJobRequisitionResponse>[] = [
    { key: "title", header: "Title", render: (r) => <span className="font-medium text-text-primary">{r.title}</span>, value: (r) => r.title },
    {
      key: "department",
      header: "Department",
      render: (r) => (r.department_id == null ? "-" : departments.labelOf(r.department_id)),
      value: (r) => (r.department_id == null ? "" : departments.labelOf(r.department_id)),
    },
    { key: "vacancies", header: "Vacancies", align: "right", render: (r) => r.vacancy_count, value: (r) => r.vacancy_count },
    {
      key: "manager",
      header: "Hiring manager",
      hideOnMobile: true,
      render: (r) => <HrEmployeeCell id={r.hiring_manager_employee_id} lookup={lookup} />,
      value: (r) => {
        const emp = lookup(r.hiring_manager_employee_id);
        return emp ? `${emp.full_name} ${emp.employee_code}` : "";
      },
    },
    { key: "location", header: "Location", render: (r) => r.location || "-", value: (r) => r.location, hideOnMobile: true },
    { key: "budget", header: "Budget", align: "right", render: (r) => budgetText(r), value: (r) => budgetText(r), hideOnMobile: true, sortable: false },
    { key: "status", header: "Status", render: (r) => <HrStatusBadge status={r.status} />, value: (r) => r.status },
    { key: "opened", header: "Opened", render: (r) => r.opened_at || "-", value: (r) => r.opened_at, hideOnMobile: true },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add requisition
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Job requisitions"
          description="Open roles and hiring pipeline. Update status as you progress (e.g. open, filled, cancelled)."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Requisitions" }]}
        />
        {addButton}
      </div>
      {info ? (
        <div role="status" className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {info}
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
        emptyTitle="No requisitions yet"
        emptyHint="Add a requisition for each open role, then move it to open, filled or cancelled."
        emptyAction={addButton}
        searchPlaceholder="Search title, department or status…"
        initialSort={{ key: "title", dir: "asc" }}
        statusOf={(r) => r.status}
        exportFileName="hr-job-requisitions"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "status", label: "Change status", primary: true, onClick: () => openStatus(r) }]}
      />

      <HrFormDrawer
        open={createOpen}
        title="Add requisition"
        onClose={() => setCreateOpen(false)}
        onSubmit={(e) => void create(e)}
        submitLabel="Add requisition"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="req-title">Title **</label>
          <input id="req-title" className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="req-dept">Department</label>
            <select
              id="req-dept"
              className={inputClass}
              value={form.department_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">No department</option>
              {departments.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="req-vacancies">Vacancies</label>
            <input
              id="req-vacancies"
              type="number"
              min={1}
              max={999}
              className={inputClass}
              value={form.vacancy_count}
              onChange={(e) => setForm((f) => ({ ...f, vacancy_count: Number(e.target.value) || 1 }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="req-manager">Hiring manager</label>
          <HrEmployeeSelect id="req-manager" value={form.hiring_manager_employee_id} onChange={(v) => setForm((f) => ({ ...f, hiring_manager_employee_id: v }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="req-emptype">Employment type</label>
            <input id="req-emptype" className={inputClass} value={form.employment_type} onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="req-location">Location</label>
            <input id="req-location" className={inputClass} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="req-desc">Description</label>
          <textarea id="req-desc" rows={3} className={inputClass} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
      </HrFormDrawer>

      <HrFormDrawer
        open={statusRow != null}
        title="Change requisition status"
        description={statusRow ? `${statusRow.title} · now ${statusRow.status}` : undefined}
        onClose={() => setStatusRow(null)}
        onSubmit={(e) => void applyStatus(e)}
        submitLabel="Apply"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="req-status">New status **</label>
          <input
            id="req-status"
            list="req-status-options"
            className={inputClass}
            placeholder="e.g. open"
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value)}
            required
          />
          <datalist id="req-status-options">
            {SUGGESTED_STATUSES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="text-xs text-text-muted">Filled, closed and cancelled requisitions can no longer be edited.</p>
        </div>
      </HrFormDrawer>
    </div>
  );
}
