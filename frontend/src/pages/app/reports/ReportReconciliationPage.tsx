import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ReportReconciliationPage() {
  const [tbBalanced, setTbBalanced] = useState<boolean | null>(null);
  const [tbDebit, setTbDebit] = useState(0);
  const [tbCredit, setTbCredit] = useState(0);
  const [stockTotal, setStockTotal] = useState<number | null>(null);
  const [openRecons, setOpenRecons] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.getTrialBalance({}), api.getStockValuation({}), api.listBankReconciliations()])
      .then(([tb, sv, br]) => {
        if (cancelled) return;
        setTbDebit(tb.total_debit ?? 0);
        setTbCredit(tb.total_credit ?? 0);
        setTbBalanced(Math.abs((tb.total_debit ?? 0) - (tb.total_credit ?? 0)) < 0.01);
        setStockTotal(sv.total_value ?? null);
        const open = Array.isArray(br) ? br.filter((r) => !r.is_finalized).length : 0;
        setOpenRecons(open);
      })
      .catch((e) => {
        logApiError("ReportReconciliationPage", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Data Reconciliation</h1>
        <p className="text-text-muted text-sm mt-0.5">
          Quick cross-checks across GL, inventory valuation, and bank reconciliation status.{" "}
          <Link to="/app/accounts/reports/trial-balance" className="text-brand-primary hover:underline">
            Trial balance
          </Link>{" "}
          ·{" "}
          <Link to="/app/inventory/stock-valuation" className="text-brand-primary hover:underline">
            Stock valuation
          </Link>
        </p>
      </header>
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {loading ? (
        <div className="space-y-3 p-6"><div className="h-4 w-3/4 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-full animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-5/6 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-2/3 animate-pulse rounded bg-surface-subtle" /><div className="h-4 w-4/5 animate-pulse rounded bg-surface-subtle" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div
            className={`rounded-xl border p-4 ${
              tbBalanced ? "border-emerald-300 bg-emerald-50/50" : "border-amber-300 bg-amber-50/50"
            }`}
          >
            <h2 className="font-semibold">General ledger (trial balance)</h2>
            <p className="mt-1 text-sm text-text-muted">Total debit vs credit must match.</p>
            <div className="mt-2 text-sm">
              Debit: {tbDebit.toLocaleString()} · Credit: {tbCredit.toLocaleString()}
            </div>
            <div className="mt-2 font-medium">{tbBalanced ? "Balanced" : "Mismatch — review TB"}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 className="font-semibold">Inventory valuation (FIFO)</h2>
            <p className="mt-1 text-sm text-text-muted">Compare to inventory / stock control accounts in COA.</p>
            <div className="mt-2 text-lg font-semibold">
              {stockTotal != null ? stockTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-4 md:col-span-2">
            <h2 className="font-semibold">Bank reconciliation</h2>
            <p className="mt-1 text-sm text-text-muted">Non-finalized bank reconciliations may indicate unreconciled cash.</p>
            <div className="mt-2">
              Open / non-finalized sessions: <strong>{openRecons}</strong> —{" "}
              <Link to="/app/banking/reconciliation" className="text-brand-primary hover:underline">
                Open bank reconciliation
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
