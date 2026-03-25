import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPayrollAccountingConfigPage() {
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [salaryExpense, setSalaryExpense] = useState("");
  const [salaryPayable, setSalaryPayable] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = await api.listHrPayrollAccountingConfig();
      setCfg(c);
      setSalaryExpense(String(c.salary_expense_account_id ?? ""));
      setSalaryPayable(String(c.salary_payable_account_id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.upsertHrPayrollAccountingConfig({
        salary_expense_account_id: salaryExpense ? Number(salaryExpense) : null,
        salary_payable_account_id: salaryPayable ? Number(salaryPayable) : null,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Payroll GL mapping"
        description="Map salary expense and payable accounts for automated voucher posting."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Accounting config" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {loading ? (
        <div className="text-sm text-text-muted">Loading...</div>
      ) : (
        <form onSubmit={onSave} className="max-w-md space-y-3 rounded-xl border border-border bg-surface-raised p-4">
          <label className="block text-sm text-text-secondary">
            Salary expense GL account ID
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={salaryExpense} onChange={(e) => setSalaryExpense(e.target.value)} />
          </label>
          <label className="block text-sm text-text-secondary">
            Salary payable GL account ID
            <input className="mt-1 w-full rounded border px-2 py-1 text-sm" value={salaryPayable} onChange={(e) => setSalaryPayable(e.target.value)} />
          </label>
          {cfg && <pre className="text-xs text-text-muted overflow-x-auto">{JSON.stringify(cfg, null, 2)}</pre>}
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Save mapping
          </button>
        </form>
      )}
    </div>
  );
}
