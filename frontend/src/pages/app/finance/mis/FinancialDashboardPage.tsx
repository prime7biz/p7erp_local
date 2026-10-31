import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Gauge, TrendingUp } from "lucide-react";
import { api, type MisHealthResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { formatMoney, formatRatioValue, statusBadgeClass } from "./misFormat";

const QUICK_LINKS = [
  { to: "/app/finance/mis/fund-flow", label: "Fund Flow", icon: TrendingUp },
  { to: "/app/finance/mis/ratios", label: "MIS Ratios", icon: BarChart3 },
  { to: "/app/finance/mis/comparative", label: "Comparative", icon: Gauge },
  { to: "/app/finance/mis/cash-scenarios", label: "Cash Scenarios", icon: TrendingUp },
] as const;

export function FinancialDashboardPage() {
  const [data, setData] = useState<MisHealthResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        setLoading(true);
        setData(await api.getMisHealth());
      } catch (e) {
        logApiError("FinancialDashboardPage.load", e);
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const crStatus = data?.current_ratio?.status;
  const runway = data?.runway_months;
  const showRatioAlert = crStatus === "warning" || crStatus === "critical";
  const showRunwayAlert = runway != null && runway < 6;

  return (
    <div className="space-y-4 p-4 md:p-6 print-report">
      <AppPageHeader
        title="Financial MIS Dashboard"
        description="Executive snapshot of profitability, liquidity, and cash position from chart-of-accounts data."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {data?.enabled === false ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          MIS reports are disabled for this tenant. Ask an admin to enable{" "}
          <code className="text-xs">mis_reports_enabled</code> in Settings → Configuration.
        </p>
      ) : null}

      {(showRatioAlert || showRunwayAlert) && data?.enabled !== false ? (
        <div className="space-y-2">
          {showRatioAlert ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Current ratio is{" "}
                <span className={`inline rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass(crStatus)}`}>
                  {crStatus}
                </span>
                {data?.current_ratio?.value != null
                  ? ` (${formatRatioValue(data.current_ratio)})`
                  : null}
                . Review liquidity in MIS Ratios.
              </span>
            </div>
          ) : null}
          {showRunwayAlert ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Cash runway is about {runway?.toFixed(1)} months — consider collections and spend controls in Cash
                Scenarios.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Net Profit", value: formatMoney(data?.net_profit), sub: "YTD-style from CoA" },
          {
            label: "Current Ratio",
            value: data?.current_ratio ? formatRatioValue(data.current_ratio) : "—",
            sub: data?.current_ratio?.status ?? "—",
            status: data?.current_ratio?.status,
          },
          { label: "Cash & Bank", value: formatMoney(data?.cash), sub: "On hand today" },
          { label: "Receivables (AR)", value: formatMoney(data?.ar), sub: "Outstanding proxy" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{loading ? "…" : card.value}</p>
            {card.status ? (
              <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(card.status)}`}>
                {card.sub}
              </span>
            ) : (
              <p className="mt-1 text-xs text-gray-500">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Quick links</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-gray-500" />
                {label}
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
