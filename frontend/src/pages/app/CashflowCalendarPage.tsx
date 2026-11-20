import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type BtbLcRow, type OutstandingBillResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { toLocalISODate } from "@/lib/dates";
import { addMoney, subtractMoney } from "@/lib/money";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageErrorClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageToolbarButtonClass,
} from "@/components/app/listPageLayout";
import { SummaryStrip } from "@/components/finance/kit";

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
      api.getCashForecastSummary().catch((e) => {
        logApiError("CashflowCalendar.getCashForecastSummary", e);
        return null;
      }),
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
      const key = toLocalISODate(d);
      map.set(key, { date: key, inflow: 0, outflow: 0, labels: [] });
    }
    for (const bill of bills) {
      if (!bill.due_date) continue;
      const key = bill.due_date.slice(0, 10);
      const c = map.get(key);
      if (!c) continue;
      const amt = Math.max(0, subtractMoney(bill.amount, bill.paid_amount));
      if (bill.bill_type === "RECEIVABLE") {
        c.inflow = addMoney(c.inflow, amt);
        c.labels.push(`AR ${bill.bill_no}`);
      } else {
        c.outflow = addMoney(c.outflow, amt);
        c.labels.push(`AP ${bill.bill_no}`);
      }
    }
    for (const lc of lcs) {
      if (!lc.maturity_date) continue;
      const key = lc.maturity_date.slice(0, 10);
      const c = map.get(key);
      if (!c) continue;
      c.outflow = addMoney(c.outflow, lc.maturity_amount ?? lc.amount);
      c.labels.push(`LC mat. ${lc.reference ?? lc.id}`);
    }
    return Array.from(map.values());
  }, [bills, lcs, year, month]);

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Cashflow Calendar"
        description="Planned inflows/outflows from open bills and LC maturities."
        belowTitle={
          <p className="text-sm text-text-muted">
            <Link to="/app/finance/cash-forecast" className="text-brand-primary hover:underline">
              Cash forecast
            </Link>{" "}
            ·{" "}
            <Link to="/app/accounts/outstanding-bills" className="text-brand-primary hover:underline">
              Bills
            </Link>
          </p>
        }
        actions={
          <>
            <button
              type="button"
              className={listPageToolbarButtonClass}
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
              className={listPageToolbarButtonClass}
              onClick={() => {
                const d = new Date(year, month + 1, 1);
                setYear(d.getFullYear());
                setMonth(d.getMonth());
              }}
            >
              Next →
            </button>
          </>
        }
      />
      {summary && (
        <SummaryStrip
          items={[
            { key: "in", label: "Forecast summary (all scenarios)", value: summary.expected_inflows.toLocaleString(), tone: "success" },
            { key: "out", label: "Expected outflows", value: summary.expected_outflows.toLocaleString(), tone: "warning" },
            { key: "net", label: "Net", value: summary.net_cash_flow.toLocaleString() },
          ]}
        />
      )}
      {error && <div className={listPageErrorClass}>{error}</div>}
      <h2 className="text-lg font-semibold text-text-primary">{monthLabel}</h2>
      {loading ? (
        <div className={listPageLoadingClass}>Loading…</div>
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
              const net = subtractMoney(c.inflow, c.outflow);
              const dayOfMonth = Number(c.date.slice(8, 10));
              return (
                <div
                  key={c.date}
                  className="min-h-[4rem] rounded border border-border bg-surface-raised p-1"
                >
                  <div className="font-medium">{dayOfMonth}</div>
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
