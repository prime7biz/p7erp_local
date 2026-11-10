import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/money";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

/** Must match ALLOWED_CALCULATION_TYPES in backend/app/modules/hr_payroll/formula_engine.py. */
const CALCULATION_TYPES: [string, string][] = [
  ["FIXED", "Fixed amount (monthly salary)"],
  ["PERCENT_OF_BASE", "% of base salary"],
  ["PER_DAY", "Per day present (daily wage)"],
  ["PER_HOUR_OT", "Per overtime hour"],
  ["PER_PIECE", "Per piece scanned (piece rate)"],
  ["PER_SAM_MINUTE", "Per standard minute earned (SAM)"],
];
const calcLabel = (v: string) => CALCULATION_TYPES.find(([k]) => k === v)?.[1] ?? v;

/** Backend `PayrollComponentOut` (hr_payroll/schemas.py); money fields are decimal strings. */
type ComponentRow = {
  id: number;
  code: string;
  name: string;
  component_type: string;
  calculation_type: string;
  default_amount: string;
  gl_account_id: number | null;
  formula: string | null;
  applies_to: string;
  is_active: boolean;
};

type ComponentForm = {
  code: string;
  name: string;
  component_type: string;
  calculation_type: string;
  default_amount: string;
  formula: string;
  applies_to: string;
  is_active: boolean;
};
const EMPTY_FORM: ComponentForm = {
  code: "",
  name: "",
  component_type: "EARNING",
  calculation_type: "FIXED",
  default_amount: "0",
  formula: "",
  applies_to: "ALL",
  is_active: true,
};

export function HrPayrollComponentsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; row: ComponentRow } | null>(null);
  const [form, setForm] = useState<ComponentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await api.listHrPayrollComponents({ active_only: false })) as unknown as ComponentRow[]);
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

  const openEdit = (row: ComponentRow) => {
    setForm({
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      component_type: String(row.component_type ?? "EARNING"),
      calculation_type: String(row.calculation_type ?? "FIXED"),
      default_amount: String(row.default_amount ?? "0"),
      formula: String(row.formula ?? ""),
      applies_to: String(row.applies_to ?? "ALL"),
      is_active: Boolean(row.is_active),
    });
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
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      component_type: form.component_type,
      calculation_type: form.calculation_type,
      default_amount: form.default_amount,
      formula: form.formula || null,
      applies_to: form.applies_to,
      is_active: form.is_active,
    };
    setSaving(true);
    setFormError("");
    try {
      if (drawer.mode === "edit") await api.updateHrPayrollComponent(drawer.row.id, payload);
      else await api.createHrPayrollComponent(payload);
      setDrawer(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const amountText = (r: ComponentRow) =>
    r.calculation_type === "PERCENT_OF_BASE" ? `${formatMoney(r.default_amount)} %` : formatMoney(r.default_amount);

  const columns: HrTableColumn<ComponentRow>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-medium text-text-primary">{r.code}</span>, value: (r) => r.code },
    { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span
          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
            r.component_type === "DEDUCTION" ? "bg-status-danger-subtle text-status-danger-foreground" : "bg-status-success-subtle text-status-success-foreground"
          }`}
        >
          {r.component_type === "DEDUCTION" ? "Deduction" : r.component_type === "EARNING" ? "Earning" : r.component_type}
        </span>
      ),
      value: (r) => r.component_type,
    },
    { key: "calc", header: "Calculation", render: (r) => calcLabel(r.calculation_type), value: (r) => calcLabel(r.calculation_type), hideOnMobile: true },
    { key: "amount", header: "Default amount", align: "right", render: (r) => amountText(r), value: (r) => r.default_amount },
    { key: "applies", header: "Applies to", render: (r) => r.applies_to || "ALL", value: (r) => r.applies_to || "ALL", hideOnMobile: true },
    { key: "active", header: "Status", render: (r) => <ActiveBadge active={r.is_active} />, value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add component
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Payroll components"
          description="Earnings and deductions; optional formula and worker/staff applicability."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Components" }]}
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
        emptyTitle="No payroll components yet"
        emptyHint="Add earnings (basic, house rent, medical…) and deductions (advance, absence…) used in salary structures."
        emptyAction={addButton}
        searchPlaceholder="Search code, name or type…"
        initialSort={{ key: "code", dir: "asc" }}
        exportFileName="hr-payroll-components"
        canExport={canExportHrData(me?.role_name)}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />

      <HrFormDrawer
        open={drawer != null}
        title={drawer?.mode === "edit" ? "Edit component" : "Add component"}
        onClose={() => setDrawer(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pc-code">Code **</label>
            <input id="pc-code" className={inputClass} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pc-type">Component type</label>
            <select id="pc-type" className={inputClass} value={form.component_type} onChange={(e) => setForm((p) => ({ ...p, component_type: e.target.value }))}>
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="pc-name">Name **</label>
          <input id="pc-name" className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="pc-calc">How the amount is calculated</label>
          <select id="pc-calc" className={inputClass} value={form.calculation_type} onChange={(e) => setForm((p) => ({ ...p, calculation_type: e.target.value }))}>
            {CALCULATION_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pc-amount">Default amount</label>
            <input
              id="pc-amount"
              inputMode="decimal"
              className={inputClass}
              value={form.default_amount}
              onChange={(e) => setForm((p) => ({ ...p, default_amount: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="pc-applies">Applies to</label>
            <input
              id="pc-applies"
              list="pc-applies-options"
              className={inputClass}
              placeholder="ALL, WORKER, STAFF"
              value={form.applies_to}
              onChange={(e) => setForm((p) => ({ ...p, applies_to: e.target.value }))}
            />
            <datalist id="pc-applies-options">
              <option value="ALL" />
              <option value="WORKER" />
              <option value="STAFF" />
            </datalist>
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="pc-formula">Formula (optional)</label>
          <input id="pc-formula" className={inputClass} value={form.formula} onChange={(e) => setForm((p) => ({ ...p, formula: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          Active
        </label>
      </HrFormDrawer>
    </div>
  );
}
