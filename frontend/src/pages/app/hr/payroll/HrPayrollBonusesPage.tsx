import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";
import { HrDataTable, type HrTableColumn } from "@/components/hr/kit/HrDataTable";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/money";
import { canExportHrData } from "@/lib/roles";

const PREFIX = "/app/hr";
const inputClass = "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-text-secondary";

const BONUS_TYPES: [string, string][] = [
  ["FESTIVAL", "Festival"],
  ["ATTENDANCE", "Attendance"],
  ["PERFORMANCE", "Performance"],
];
const typeLabel = (v: string | null | undefined) => BONUS_TYPES.find(([k]) => k === v)?.[1] ?? (v || "-");

/** Shape returned by GET /hr/payroll/bonuses (hr_payroll/router.py list_bonuses). */
type BonusRow = {
  id: number;
  bonus_type: string | null;
  period_code: string | null;
  title: string | null;
  status: string | null;
  amount_or_pct: string | null;
};

type BonusForm = { bonus_type: string; period_code: string; title: string; amount_or_pct: string };
const EMPTY_FORM: BonusForm = { bonus_type: "FESTIVAL", period_code: "", title: "Bonus", amount_or_pct: "" };

/** The field holds an amount or a percentage, so only plain numbers are formatted. */
function amountText(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "-";
  return /^-?\d+(\.\d+)?$/.test(s) ? formatMoney(s) : s;
}

export function HrPayrollBonusesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<BonusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [formError, setFormError] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BonusForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows((await api.listHrPayrollBonuses()) as unknown as BonusRow[]);
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
    setOpen(true);
  };

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.period_code.trim() || !form.title.trim() || !form.amount_or_pct.trim()) {
      setFormError("Period code, title and amount or % are required.");
      return;
    }
    setSaving(true);
    setFormError("");
    setInfo("");
    try {
      await api.createHrPayrollBonus({
        bonus_type: form.bonus_type,
        period_code: form.period_code,
        title: form.title,
        amount_or_pct: form.amount_or_pct,
      });
      setOpen(false);
      setForm(EMPTY_FORM);
      setInfo("Bonus declaration created.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: HrTableColumn<BonusRow>[] = [
    { key: "title", header: "Title", render: (r) => <span className="font-medium text-text-primary">{r.title || "-"}</span>, value: (r) => r.title },
    { key: "type", header: "Type", render: (r) => typeLabel(r.bonus_type), value: (r) => typeLabel(r.bonus_type) },
    { key: "period", header: "Period", render: (r) => r.period_code || "-", value: (r) => r.period_code },
    { key: "amount", header: "Amount or %", align: "right", render: (r) => amountText(r.amount_or_pct), value: (r) => r.amount_or_pct },
    { key: "status", header: "Status", render: (r) => (r.status ? <HrStatusBadge status={r.status} /> : "-"), value: (r) => r.status },
  ];

  const addButton = (
    <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-90">
      + Create declaration
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader title="Bonuses" description="Festival, attendance, or performance bonuses." breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Bonuses" }]} />
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
        emptyTitle="No bonus declarations yet"
        emptyHint="Declare a festival, attendance or performance bonus for a payroll period."
        emptyAction={addButton}
        searchPlaceholder="Search title, type or period…"
        initialSort={{ key: "period", dir: "desc" }}
        statusOf={(r) => r.status}
        exportFileName="hr-bonus-declarations"
        canExport={canExportHrData(me?.role_name)}
      />

      <HrFormDrawer
        open={open}
        title="Create bonus declaration"
        onClose={() => setOpen(false)}
        onSubmit={(e) => void onCreate(e)}
        submitLabel="Create declaration"
        submitting={saving}
        error={formError}
      >
        <div className="space-y-1">
          <label className={labelClass} htmlFor="bonus-type">Bonus type</label>
          <select id="bonus-type" className={inputClass} value={form.bonus_type} onChange={(e) => setForm((p) => ({ ...p, bonus_type: e.target.value }))}>
            {BONUS_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="bonus-period">Period code **</label>
          <input id="bonus-period" className={inputClass} value={form.period_code} onChange={(e) => setForm((p) => ({ ...p, period_code: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="bonus-title">Title **</label>
          <input id="bonus-title" className={inputClass} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} required />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="bonus-amount">Amount or % **</label>
          <input id="bonus-amount" className={inputClass} value={form.amount_or_pct} onChange={(e) => setForm((p) => ({ ...p, amount_or_pct: e.target.value }))} required />
        </div>
      </HrFormDrawer>
    </div>
  );
}
