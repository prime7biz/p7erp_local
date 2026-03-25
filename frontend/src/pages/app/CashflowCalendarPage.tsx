import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type BtbLcRow, type OutstandingBillResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type DayCell = { date: string; inflow: number; outflow: number; labels: string[] };

function monthDays(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1);
  const last = new Date(year, month0 + 1, 0);
  const out: Date[] = [];
  for (let d = first.getDate(); d <= last.getDate(); d++) {
    out.push(new Date(year, month0, d));
  }
  return out;
}

export function CashflowCalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [bills, setBills] = useState<OutstandingBillResponse[]>([]);
  const [lcs, setLcs] = useState<BtbLcRow[]>([]);
  const [summary, setSummary] = useState<{ expected_inflows: number; expected_outflows: number; net_cash_flow: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      api.listOutstandingBills({}),
      api.listBtbLcs({}),
      api.getCashForecastSummary().catch(() => null),
    ])
      .then(([b, lc, s]) => {
        if (!cancelled) {
          setBills(Array.isArray(b) ? b : []);
          setLcs(Array.isArray(lc) ? lc : []);
          setSummary(s);
        }
      })
      .catch((e) => {
        logApiError("CashflowCalendarPage.load", e);
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cells: DayCell[] = useMemo(() => {
    const days = monthDays(year, month);
    const map = new Map<string, DayCell>();
    for (const d of days) {
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key, inflow: 0, outflow: 0, labels: [] });
    }
    for (const bill of bills) {
      if (!bill.due_date) continue;
      const key = bill.due_date.slice(0, 10);
      const c = map.get(key);
      if (!c) continue;
      const amt = Math.max(0, Number(bill.amount ?? 0) - Number(bill.paid_amount ?? 0));
      if (bill.bill_type === "RECEIVABLE") {
        c.inflow += amt;
        c.labels.push(`AR ${bill.bill_no}`);
      } else {
        c.outflow += amt;
        c.labels.push(`AP ${bill.bill_no}`);
      }
    }
    for (const lc of lcs) {
      if (!lc.maturity_date) continue;
      const key = lc.maturity_date.slice(0, 10);
      const c = map.get(key);
      if (!c) continue;
      const amt = Number(lc.maturity_amount ?? lc.amount ?? 0);
      c.outflow += amt;
      c.labels.push(`LC mat. ${lc.reference ?? lc.id}`);
    }
    return Array.from(map.values());
  }, [bills, lcs, year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Cashflow Calendar</h1>
          <p className="text-text-muted text-sm mt-0.5">
            Planned inflows/outflows from open bills and LC maturities.{" "}
            <Link to="/app/finance/cash-forecast" className="text-brand-primary hover:underline">
              Cash forecast
            </Link>{" "}
            ·{" "}
            <Link to="/app/accounts/outstanding-bills" className="text-brand-primary hover:underline">
              Bills
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-sm"
            onClick={() => {
              const d = new Date(year, month - 1, 1);
              setYear(d.getFullYear());
              setMonth(d.getMonth());
            }}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-sm"
            onClick={() => {
              const d = new Date(year, month + 1, 1);
              setYear(d.getFullYear());
              setMonth(d.getMonth());
            }}
          >
            Next →
          </button>
        </div>
      </header>
      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Forecast summary (all scenarios)</div>
            <div className="text-lg font-semibold text-emerald-700">{summary.expected_inflows.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Expected outflows</div>
            <div className="text-lg font-semibold text-amber-800">{summary.expected_outflows.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-3">
            <div className="text-xs text-text-muted">Net</div>
            <div className="text-lg font-semibold">{summary.net_cash_flow.toLocaleString()}</div>
          </div>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-status-danger-subtle border border-status-danger/20 px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <h2 className="text-lg font-semibold">{monthLabel}</h2>
      {loading ? (
        <div className="p-12 text-center text-text-muted">Loading…</div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-xs sm:text-sm">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="p-2 text-center font-medium text-text-muted">
              {d}
            </div>
          ))}
          {(() => {
            const first = new Date(year, month, 1);
            const pad = first.getDay();
            const blanks = Array.from({ length: pad }, (_, i) => <div key={`b-${i}`} className="min-h-[4rem]" />);
            const dayNodes = cells.map((c) => {
              const net = c.inflow - c.outflow;
              const dt = new Date(c.date);
              return (
                <div
                  key={c.date}
                  className="min-h-[4rem] rounded border border-border bg-surface-raised p-1"
                >
                  <div className="font-medium">{dt.getDate()}</div>
                  {c.inflow > 0 && <div className="text-emerald-700">+{c.inflow.toFixed(0)}</div>}
                  {c.outflow > 0 && <div className="text-amber-800">−{c.outflow.toFixed(0)}</div>}
                  {c.labels.length > 0 && (
                    <div className="mt-1 max-h-12 overflow-hidden text-[10px] text-text-muted" title={c.labels.join(", ")}>
                      {c.labels.slice(0, 2).join(", ")}
                      {c.labels.length > 2 ? "…" : ""}
                    </div>
                  )}
                  {net !== 0 && (
                    <div className="text-[10px] text-text-muted">net {net.toFixed(0)}</div>
                  )}
                </div>
              );
            });
            return [...blanks, ...dayNodes];
          })()}
        </div>
      )}
    </div>
  );
}
