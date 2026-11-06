import { useEffect, useMemo, useState } from "react";
import { api, type MisRatioAnalysisResponse, type MisRatioTrendResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { formatRatioValue, statusBadgeClass } from "./misFormat";
import { todayLocalISO } from "@/lib/dates";

const CATEGORY_LABELS: Record<string, string> = {
  liquidity: "Liquidity",
  profitability: "Profitability",
  efficiency: "Efficiency",
  leverage: "Leverage",
};

const CATEGORY_ORDER = ["liquidity", "profitability", "efficiency", "leverage"];

export function RatioAnalysisMisPage() {
  const [asOfDate, setAsOfDate] = useState(() => todayLocalISO());
  const [data, setData] = useState<MisRatioAnalysisResponse | null>(null);
  const [selectedRatio, setSelectedRatio] = useState<string>("current_ratio");
  const [trend, setTrend] = useState<MisRatioTrendResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setError("");
      setLoading(true);
      const res = await api.getMisRatioAnalysis({ as_of_date: asOfDate });
      setData(res);
      if (!res.ratios.some((r) => r.name === selectedRatio) && res.ratios[0]) {
        setSelectedRatio(res.ratios[0].name);
      }
    } catch (e) {
      logApiError("RatioAnalysisMisPage.load", e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrend(name: string) {
    try {
      setTrend(await api.getMisRatioTrend({ ratio_name: name, months: 6 }));
    } catch (e) {
      logApiError("RatioAnalysisMisPage.loadTrend", e);
      setTrend(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOfDate]);

  useEffect(() => {
    if (selectedRatio) void loadTrend(selectedRatio);
  }, [selectedRatio]);

  const categories = useMemo(() => {
    if (!data?.by_category) return [];
    return CATEGORY_ORDER.filter((c) => data.by_category[c]?.length);
  }, [data]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="MIS Ratio Analysis"
        description="Liquidity, profitability, efficiency, and leverage ratios with benchmarks (separate from legacy ratio report)."
        backTo={{ label: "MIS Dashboard", to: "/app/finance/mis" }}
        actions={
          <input
            type="date"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && !data ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {data
        ? categories.map((cat) => (
            <section key={cat} className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-800">{CATEGORY_LABELS[cat] ?? cat}</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(data.by_category[cat] ?? []).map((ratio) => (
                  <button
                    key={ratio.name}
                    type="button"
                    onClick={() => setSelectedRatio(ratio.name)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selectedRatio === ratio.name
                        ? "border-brand-primary bg-brand-subtle"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-gray-600">{ratio.label}</p>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(ratio.status)}`}>
                        {ratio.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{formatRatioValue(ratio)}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Benchmark: {ratio.benchmark != null ? formatRatioValue({ name: ratio.name, value: ratio.benchmark }) : "—"}
                    </p>
                    <p className="mt-1 text-[10px] text-gray-400">{ratio.formula}</p>
                  </button>
                ))}
              </div>
            </section>
          ))
        : null}

      {trend && trend.points.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-800">
            6-month trend — {data?.ratios.find((r) => r.name === selectedRatio)?.label ?? selectedRatio}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {trend.points.map((pt) => (
              <li key={pt.date} className="flex justify-between border-b border-gray-50 py-1">
                <span className="text-gray-600">{pt.date}</span>
                <span className="tabular-nums font-medium text-gray-900">
                  {pt.value != null
                    ? formatRatioValue({ name: selectedRatio, value: pt.value })
                    : "n/a"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
