import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type AccountGroupResponse,
  type BillsAgingResponse,
  type FinancialStatementsResponse,
} from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";
import { logApiError } from "@/utils/logApiError";

function sumOutstanding(r: BillsAgingResponse | null): number {
  if (!r?.rows?.length) return 0;
  return r.rows.reduce((s, row) => s + (Number(row.outstanding_amount) || 0), 0);
}

type Snap = {
  fs: FinancialStatementsResponse;
  arAging: BillsAgingResponse | null;
  apAging: BillsAgingResponse | null;
};

function buildMetrics(fs: FinancialStatementsResponse, arAging: BillsAgingResponse | null, apAging: BillsAgingResponse | null) {
  const assets = Number(fs.balance_sheet.assets ?? 0);
  const liabilities = Number(fs.balance_sheet.liabilities ?? 0);
  const equity = Number(fs.balance_sheet.equity ?? 0);
  const netProfit = Number(fs.profit_and_loss.net_profit ?? 0);
  const income = Number(fs.profit_and_loss.income ?? 0);
  const expense = Number(fs.profit_and_loss.expense ?? 0);
  const ar = sumOutstanding(arAging);
  const ap = sumOutstanding(apAging);
  const debtToEquity = equity > 0 ? liabilities / equity : 0;
  const profitMargin = income > 0 ? (netProfit / income) * 100 : 0;
  const roe = equity > 0 ? (netProfit / equity) * 100 : 0;
  const roa = assets > 0 ? (netProfit / assets) * 100 : 0;
  const solvencyCoverage = liabilities > 0 ? assets / liabilities : assets > 0 ? Infinity : 0;
  const currentRatioApprox = liabilities > 0 ? assets / liabilities : 0;
  const quickRatioApprox = ap > 0 ? (assets - ap) / Math.max(liabilities, 1) : currentRatioApprox;
  const receivablesTurnover = ar > 0 ? income / ar : 0;
  const payablesTurnover = ap > 0 ? expense / ap : 0;
  const inventoryTurnover = assets > 0 ? expense / assets : 0;
  return {
    assets,
    liabilities,
    equity,
    netProfit,
    income,
    expense,
    ar,
    ap,
    debtToEquity,
    profitMargin,
    roe,
    roa,
    solvencyCoverage,
    currentRatioApprox,
    quickRatioApprox,
    receivablesTurnover,
    payablesTurnover,
    inventoryTurnover,
  };
}

export function RatioAnalysisPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [compareDate, setCompareDate] = useState("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [compactView, setCompactView] = useState(false);
  const [primary, setPrimary] = useState<Snap | null>(null);
  const [secondary, setSecondary] = useState<Snap | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSnap(d: string): Promise<Snap> {
    const [fs, arAging, apAging] = await Promise.all([
      api.getFinancialStatements({ as_of_date: d, group_id: groupId || undefined }),
      api.getBillsAging({ bill_type: "RECEIVABLE", as_of_date: d }).catch((e) => {
        logApiError("RatioAnalysisPage.getBillsAging AR", e);
        return null;
      }),
      api.getBillsAging({ bill_type: "PAYABLE", as_of_date: d }).catch((e) => {
        logApiError("RatioAnalysisPage.getBillsAging AP", e);
        return null;
      }),
    ]);
    return { fs, arAging, apAging };
  }

  async function load() {
    try {
      setError("");
      setLoading(true);
      setPrimary(await loadSnap(asOfDate));
      if (compareDate) {
        setSecondary(await loadSnap(compareDate));
      } else {
        setSecondary(null);
      }
    } catch (e) {
      setError((e as Error).message);
      setPrimary(null);
      setSecondary(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      setGroups(await api.listAccountGroups());
    } catch (e) {
      logApiError("RatioAnalysisPage.listAccountGroups", e);
      setGroups([]);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate, compareDate, groupId]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  const m1 = useMemo(() => (primary ? buildMetrics(primary.fs, primary.arAging, primary.apAging) : null), [primary]);
  const m2 = useMemo(() => (secondary ? buildMetrics(secondary.fs, secondary.arAging, secondary.apAging) : null), [secondary]);

  function exportCsv() {
    if (!m1) return;
    const rows = [
      ["metric", "value", compareDate ? `compare_${compareDate}` : ""],
      ["As of", asOfDate, compareDate || ""],
      ["Debt to Equity", m1.debtToEquity.toFixed(4), m2 ? m2.debtToEquity.toFixed(4) : ""],
      ["Profit Margin %", m1.profitMargin.toFixed(2), m2 ? m2.profitMargin.toFixed(2) : ""],
      ["ROE %", m1.roe.toFixed(2), m2 ? m2.roe.toFixed(2) : ""],
      ["ROA %", m1.roa.toFixed(2), m2 ? m2.roa.toFixed(2) : ""],
      ["Assets / Liabilities (coverage)", m1.solvencyCoverage === Infinity ? "n/a" : m1.solvencyCoverage.toFixed(4), m2 && m2.solvencyCoverage !== Infinity ? m2.solvencyCoverage.toFixed(4) : ""],
      ["Receivables turnover (income / AR)", m1.receivablesTurnover.toFixed(4), m2 ? m2.receivablesTurnover.toFixed(4) : ""],
      ["Payables turnover (expense / AP)", m1.payablesTurnover.toFixed(4), m2 ? m2.payablesTurnover.toFixed(4) : ""],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadCsv(csv, "ratio_analysis_report");
    setSuccess("Ratio Analysis exported successfully.");
  }

  function handlePrint() {
    printCurrentPage();
    setSuccess("Ratio Analysis print dialog opened.");
  }

  const metricRows: Array<{ label: string; v1?: number; v2?: number; fmt?: "pct" | "num" }> = m1
    ? [
        { label: "Debt to Equity", v1: m1.debtToEquity, v2: m2?.debtToEquity, fmt: "num" },
        { label: "Profit margin %", v1: m1.profitMargin, v2: m2?.profitMargin, fmt: "pct" },
        { label: "ROE %", v1: m1.roe, v2: m2?.roe, fmt: "pct" },
        { label: "ROA %", v1: m1.roa, v2: m2?.roa, fmt: "pct" },
        {
          label: "Assets ÷ Liabilities (broad solvency)",
          v1: m1.solvencyCoverage === Infinity ? undefined : m1.solvencyCoverage,
          v2: m2 && m2.solvencyCoverage !== Infinity ? m2.solvencyCoverage : undefined,
          fmt: "num",
        },
        { label: "Current ratio (approx: assets ÷ liabilities)", v1: m1.currentRatioApprox, v2: m2?.currentRatioApprox, fmt: "num" },
        { label: "Quick ratio (approx)", v1: m1.quickRatioApprox, v2: m2?.quickRatioApprox, fmt: "num" },
        { label: "Receivables turnover (income ÷ AR outstanding)", v1: m1.receivablesTurnover, v2: m2?.receivablesTurnover, fmt: "num" },
        { label: "Payables turnover (expense ÷ AP outstanding)", v1: m1.payablesTurnover, v2: m2?.payablesTurnover, fmt: "num" },
        { label: "Inventory turnover (expense ÷ total assets, proxy)", v1: m1.inventoryTurnover, v2: m2?.inventoryTurnover, fmt: "num" },
      ]
    : [];

  function fmtVal(n: number | undefined, kind: "pct" | "num") {
    if (n === undefined || Number.isNaN(n) || !Number.isFinite(n)) return "—";
    if (kind === "pct") return `${n.toFixed(2)}%`;
    return n.toFixed(4);
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-border-strong pb-2">
        <h1 className="text-lg font-semibold">Ratio Analysis</h1>
        <p className="text-xs text-text-secondary">As of: {asOfDate}</p>
      </div>
      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold text-text-primary">Ratio Analysis</h1>
          <p className="text-sm text-text-muted">
            Health metrics from financial statements and AR/AP aging.{" "}
            <Link className="text-brand-primary hover:underline" to="/app/accounts/reports/ar-ap-aging">
              Open AR/AP Aging
            </Link>
          </p>
        </div>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} title="Primary as-of date" />
        <input
          type="date"
          className="rounded border px-3 py-2 text-sm"
          value={compareDate}
          onChange={(e) => setCompareDate(e.target.value)}
          title="Optional second date for comparison"
        />
        <select className="rounded border px-3 py-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} - {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`rounded border px-3 py-2 text-sm ${compactView ? "border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary" : "border-border text-text-secondary"}`}
          onClick={() => setCompactView((v) => !v)}
        >
          {compactView ? "Comfort View" : "Compact View"}
        </button>
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => handlePrint()}>
          Print
        </button>
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()} disabled={!m1}>
          Export CSV
        </button>
      </div>
      {loading ? <div className="rounded border bg-surface-raised px-3 py-4 text-sm text-text-muted">Loading…</div> : null}
      {error ? <div className="no-print rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="no-print rounded border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      {m1 ? (
        <div className={`grid ${compactView ? "gap-2" : "gap-3"} md:grid-cols-2`}>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-text-secondary">Primary ({asOfDate})</h3>
            <div className={`grid ${compactView ? "gap-2" : "gap-3"} sm:grid-cols-2`}>
              <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>Debt to Equity</div>
                <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m1.debtToEquity.toFixed(2)}</div>
              </div>
              <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>Profit Margin %</div>
                <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m1.profitMargin.toFixed(2)}%</div>
              </div>
              <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>ROE %</div>
                <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m1.roe.toFixed(2)}%</div>
              </div>
              <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>ROA %</div>
                <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m1.roa.toFixed(2)}%</div>
              </div>
            </div>
          </div>
          {m2 && compareDate ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-text-secondary">Compare ({compareDate})</h3>
              <div className={`grid ${compactView ? "gap-2" : "gap-3"} sm:grid-cols-2`}>
                <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                  <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>Debt to Equity</div>
                  <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m2.debtToEquity.toFixed(2)}</div>
                </div>
                <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                  <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>Profit Margin %</div>
                  <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m2.profitMargin.toFixed(2)}%</div>
                </div>
                <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                  <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>ROE %</div>
                  <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m2.roe.toFixed(2)}%</div>
                </div>
                <div className={`print-card rounded-xl border bg-surface-raised ${compactView ? "p-2" : "p-3"} print:p-2`}>
                  <div className={`${compactView ? "text-[11px]" : "text-xs"} text-text-muted`}>ROA %</div>
                  <div className={`${compactView ? "text-lg" : "text-xl"} font-semibold`}>{m2.roa.toFixed(2)}%</div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {metricRows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-3 py-2">Metric</th>
                <th className="px-3 py-2">{asOfDate}</th>
                {compareDate ? <th className="px-3 py-2">{compareDate}</th> : null}
                {compareDate ? <th className="px-3 py-2">Delta</th> : null}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => {
                const fmt = row.fmt ?? "num";
                const d =
                  row.v1 != null && row.v2 != null && Number.isFinite(row.v1) && Number.isFinite(row.v2) ? row.v2 - row.v1 : null;
                return (
                  <tr key={row.label} className="border-t">
                    <td className="px-3 py-2 text-text-secondary">{row.label}</td>
                    <td className="px-3 py-2 font-medium">{fmtVal(row.v1, fmt)}</td>
                    {compareDate ? <td className="px-3 py-2 font-medium">{fmtVal(row.v2, fmt)}</td> : null}
                    {compareDate ? (
                      <td className="px-3 py-2 text-text-muted">{d == null || Number.isNaN(d) ? "—" : fmtVal(d, fmt)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
