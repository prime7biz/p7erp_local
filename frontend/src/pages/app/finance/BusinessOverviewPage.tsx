import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { listPageKpiGridClass } from "@/components/app/listPageLayout";
import { AiMetaDisplay, type AiGovernanceMetaView } from "@/components/external-access/AiMetaDisplay";

type Overview = {
  base_currency?: string;
  data_as_of?: string;
  liquid_funds_bank_balances?: number;
  receivables_open?: number;
  payables_open?: number;
  working_capital_proxy?: number;
  active_debt_principal?: number;
  open_orders_count?: number;
  obligation_emi_by_month?: Record<string, number>;
  btb_master_contracts?: {
    reference?: string | null;
    amount?: number;
    utilized?: number;
    utilization_percent?: number | null;
  }[];
  system_cash_forecast_lines?: { month?: string | null; inflow?: number; outflow?: number }[];
};

function fmtMoney(n: unknown, ccy: string) {
  if (n == null || typeof n !== "number") return "—";
  return `${ccy} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function BusinessOverviewPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<Record<string, unknown> | null>(null);
  const [ai, setAi] = useState<{ narrative?: string; meta?: AiGovernanceMetaView } | null>(null);
  const [aiErr, setAiErr] = useState("");
  const [err, setErr] = useState("");
  const [openAi, setOpenAi] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [o, h, r] = await Promise.all([
          api.getBusinessOverview(),
          api.getBusinessOverviewHealthScore(),
          api.getBusinessOverviewDeterministicSummary(),
        ]);
        setOverview(o as Overview);
        setHealth(h);
        setRules(r);
        setErr("");
      } catch (e) {
        logApiError("BusinessOverviewPage.core", e);
        setErr((e as Error).message);
      }
    })();
  }, []);

  async function loadAi() {
    setAiErr("");
    try {
      const raw = await api.getBusinessOverviewAiNarrative();
      setAi({
        narrative: typeof raw.narrative === "string" ? raw.narrative : "",
        meta: raw.meta as AiGovernanceMetaView | undefined,
      });
    } catch (e) {
      logApiError("BusinessOverviewPage.ai", e);
      setAiErr((e as Error).message);
    }
  }

  const ccy = overview?.base_currency?.trim() || "BDT";
  const emiMonths = overview?.obligation_emi_by_month
    ? Object.entries(overview.obligation_emi_by_month).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const btbs = overview?.btb_master_contracts ?? [];
  const cfLines = overview?.system_cash_forecast_lines ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Business overview</h1>
          <p className="text-sm text-text-muted">Cross-module KPIs and optional AI narrative.</p>
        </div>
        <Link to="/app/finance/facilities/dashboard" className="text-sm text-brand-primary">
          Facilities dashboard →
        </Link>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className={listPageKpiGridClass}>
        <Kpi title="Health score" value={health?.score != null ? `${health.score} / 100` : "—"} />
        <Kpi title="Liquid funds (bank)" value={fmtMoney(overview?.liquid_funds_bank_balances, ccy)} />
        <Kpi title="Receivables (open)" value={fmtMoney(overview?.receivables_open, ccy)} />
        <Kpi title="Payables (open)" value={fmtMoney(overview?.payables_open, ccy)} />
        <Kpi title="Working capital (proxy)" value={fmtMoney(overview?.working_capital_proxy, ccy)} />
        <Kpi title="Active debt (principal)" value={fmtMoney(overview?.active_debt_principal, ccy)} />
        <Kpi title="Open orders" value={overview?.open_orders_count != null ? String(overview.open_orders_count) : "—"} />
        <Kpi title="Data as of" value={overview?.data_as_of ?? "—"} />
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold">Deterministic summary</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
          {Array.isArray(rules?.bullets)
            ? (rules!.bullets as string[]).map((b) => <li key={b}>{b}</li>)
            : Object.entries(rules ?? {}).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}:</strong> {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </li>
              ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">Obligation EMI by month</h2>
        {emiMonths.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No upcoming / due installments in scope.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2">EMI ({ccy})</th>
                </tr>
              </thead>
              <tbody>
                {emiMonths.map(([month, amt]) => (
                  <tr key={month} className="border-b border-border/60">
                    <td className="py-2 pr-4 font-medium">{month}</td>
                    <td className="py-2 tabular-nums">{amt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">BTB master contracts</h2>
        {btbs.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No master contracts on file.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Utilized</th>
                  <th className="py-2">Utilization %</th>
                </tr>
              </thead>
              <tbody>
                {btbs.map((row, i) => (
                  <tr key={`${row.reference ?? i}`} className="border-b border-border/60">
                    <td className="py-2 pr-4">{row.reference ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmtMoney(row.amount, ccy)}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmtMoney(row.utilized, ccy)}</td>
                    <td className="py-2 tabular-nums">{row.utilization_percent != null ? `${row.utilization_percent}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary">System cash forecast</h2>
        {cfLines.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">No generated cash forecast scenario found.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="py-2 pr-4">Month</th>
                  <th className="py-2 pr-4">Inflow</th>
                  <th className="py-2">Outflow</th>
                </tr>
              </thead>
              <tbody>
                {cfLines.map((ln, i) => (
                  <tr key={`${ln.month ?? i}`} className="border-b border-border/60">
                    <td className="py-2 pr-4">{ln.month ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmtMoney(ln.inflow, ccy)}</td>
                    <td className="py-2 tabular-nums">{fmtMoney(ln.outflow, ccy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold"
          onClick={() => setOpenAi((x) => !x)}
        >
          AI insights
          <span className="text-text-muted">{openAi ? "▼" : "▶"}</span>
        </button>
        {openAi ? (
          <div className="mt-4 space-y-4">
            <button type="button" className="rounded-lg border border-border px-3 py-1 text-xs" onClick={() => void loadAi()}>
              Load / regenerate
            </button>
            {aiErr ? <p className="text-xs text-red-600">{aiErr}</p> : null}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border-2 border-violet-400/30 bg-surface-base p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Narrative</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{ai?.narrative || "—"}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-subtle p-4">
                <p className="text-xs font-semibold uppercase text-text-muted">Metadata</p>
                <AiMetaDisplay meta={ai?.meta} className="mt-2" />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="text-xs text-text-muted">{title}</p>
      <p className="mt-1 text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}
