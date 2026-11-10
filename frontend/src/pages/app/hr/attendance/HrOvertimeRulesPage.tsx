import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type HrOvertimeRuleResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ActiveBadge } from "@/components/hr/HrListParts";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

type RuleForm = {
  code: string;
  name: string;
  employee_category: string;
  weekday_multiplier: string;
  weekend_multiplier: string;
  holiday_multiplier: string;
  is_active: boolean;
};
const EMPTY: RuleForm = {
  code: "",
  name: "",
  employee_category: "",
  weekday_multiplier: "1.5",
  weekend_multiplier: "2",
  holiday_multiplier: "2",
  is_active: true,
};

export function HrOvertimeRulesPage() {
  const [rows, setRows] = useState<HrOvertimeRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<HrOvertimeRuleResponse | "new" | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrOvertimeRules());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overtime rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setFormError("");
    setEditing("new");
  };
  const openEdit = (r: HrOvertimeRuleResponse) => {
    setForm({
      code: r.code,
      name: r.name,
      employee_category: r.employee_category ?? "",
      weekday_multiplier: String(r.weekday_multiplier ?? ""),
      weekend_multiplier: String(r.weekend_multiplier ?? ""),
      holiday_multiplier: String(r.holiday_multiplier ?? ""),
      is_active: r.is_active,
    });
    setFormError("");
    setEditing(r);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Code and name are required.");
      return;
    }
    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      employee_category: form.employee_category.trim() || null,
      weekday_multiplier: form.weekday_multiplier,
      weekend_multiplier: form.weekend_multiplier,
      holiday_multiplier: form.holiday_multiplier,
      is_active: form.is_active,
    };
    setSaving(true);
    setFormError("");
    try {
      if (editing === "new") await api.createHrOvertimeRule(body);
      else if (editing) await api.updateHrOvertimeRule(editing.id, body);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const mult = (v: unknown) => (v == null || v === "" ? "-" : `× ${String(v)}`);
  const columns: HrTableColumn<HrOvertimeRuleResponse>[] = [
    { key: "code", header: "Code", render: (r) => <span className="font-medium text-text-primary">{r.code}</span>, value: (r) => r.code },
    { key: "name", header: "Name", render: (r) => r.name, value: (r) => r.name },
    { key: "category", header: "Category", render: (r) => r.employee_category || "All", value: (r) => r.employee_category, hideOnMobile: true },
    { key: "weekday", header: "Weekday", align: "right", render: (r) => mult(r.weekday_multiplier), value: (r) => String(r.weekday_multiplier ?? "") },
    { key: "weekend", header: "Weekend", align: "right", render: (r) => mult(r.weekend_multiplier), value: (r) => String(r.weekend_multiplier ?? "") },
    { key: "holiday", header: "Holiday", align: "right", render: (r) => mult(r.holiday_multiplier), value: (r) => String(r.holiday_multiplier ?? ""), hideOnMobile: true },
    { key: "active", header: "Status", render: (r) => <ActiveBadge active={r.is_active} />, value: (r) => (r.is_active ? "Active" : "Inactive") },
  ];

  const addButton = (
    <button type="button" onClick={openNew} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Add rule
    </button>
  );

  const field = (key: keyof RuleForm, label: string, required = false) => (
    <div className="space-y-1">
      <label className={labelClass} htmlFor={`ot-${key}`}>
        {required ? `${label} **` : label}
      </label>
      <input
        id={`ot-${key}`}
        className={inputClass}
        value={String(form[key])}
        required={required}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Overtime rules" description="Overtime pay multipliers for weekdays, weekends and holidays, optionally per employee category." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "OT Rules" }]} />
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
        emptyTitle="No overtime rules yet"
        emptyHint="Add at least one rule so approved overtime can be paid."
        emptyAction={addButton}
        rowActions={(r) => [{ key: "edit", label: "Edit", primary: true, onClick: () => openEdit(r) }]}
      />
      <HrFormDrawer
        open={editing != null}
        title={editing === "new" ? "Add overtime rule" : "Edit overtime rule"}
        description="Multipliers are applied to the hourly rate, e.g. 2 = double pay."
        onClose={() => setEditing(null)}
        onSubmit={(e) => void onSubmit(e)}
        submitting={saving}
        error={formError}
      >
        {field("code", "Code", true)}
        {field("name", "Name", true)}
        {field("employee_category", "Employee category (leave empty for everyone)")}
        <div className="grid grid-cols-3 gap-3">
          {field("weekday_multiplier", "Weekday ×")}
          {field("weekend_multiplier", "Weekend ×")}
          {field("holiday_multiplier", "Holiday ×")}
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          Active
        </label>
      </HrFormDrawer>
    </div>
  );
}
