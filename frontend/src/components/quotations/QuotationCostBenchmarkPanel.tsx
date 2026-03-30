import { useCallback } from "react";
import type { QuotationDetailResponse } from "@/api/client";
import { useQuotationCostBenchmark } from "@/hooks/useQuotationCostBenchmark";
import { Loader2 } from "lucide-react";

type Props = {
  quotation: QuotationDetailResponse;
};

function clsColor(cls: string): string {
  if (cls === "normal") return "text-green-700 bg-green-50 border-green-200";
  if (cls === "insufficient_data") return "text-gray-700 bg-gray-50 border-gray-200";
  if (cls === "abnormal") return "text-red-800 bg-red-50 border-red-200";
  if (cls.includes("high") || cls === "high") return "text-orange-800 bg-orange-50 border-orange-200";
  if (cls.includes("low") || cls === "low") return "text-blue-800 bg-blue-50 border-blue-200";
  return "text-amber-800 bg-amber-50 border-amber-200";
}

export function QuotationCostBenchmarkPanel({ quotation }: Props) {
  const bm = useQuotationCostBenchmark();

  const onRun = useCallback(async () => {
    if (!quotation.id) return;
    await bm.run(quotation.id, { months_back: 12 });
  }, [bm, quotation.id]);

  if (!quotation.id) {
    return (
      <aside className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-sm">
        <div className="font-semibold text-gray-800">Cost benchmark</div>
        <p className="mt-1">Save the quotation first.</p>
      </aside>
    );
  }

  const r = bm.result;

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-800 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Cost benchmark (advisory)</div>
        {bm.busy ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" /> : null}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-600">
        Compares this quote to similar historical quotations in your tenant (rules only — no auto changes).
      </p>
      {bm.error ? <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">{bm.error}</div> : null}

      <div className="mt-2">
        <button
          type="button"
          disabled={bm.busy}
          onClick={() => void onRun()}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Run benchmark
        </button>
      </div>

      {r ? (
        <div className="mt-3 space-y-2">
          <div
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${clsColor(r.overall_classification)}`}
          >
            Overall: {r.overall_classification.replace(/_/g, " ")}
          </div>
          <p className="text-[11px] text-gray-700">{r.summary}</p>
          {r.insufficient_data ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
              Peers: {r.similar_quotation_count} (need ≥3 for stable ranges)
            </div>
          ) : (
            <div className="text-[11px] text-gray-600">Peers: {r.similar_quotation_count}</div>
          )}
          <div className="text-[11px] text-gray-600">
            Confidence: {(r.overall_confidence * 100).toFixed(0)}% (peer sample strength)
          </div>
          <ul className="space-y-2">
            {r.metrics.map((m) => (
              <li key={m.metric_key} className="rounded-lg border border-gray-100 bg-gray-50/80 p-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-medium text-gray-800">{m.metric_key.replace(/_/g, " ")}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${clsColor(m.classification)}`}
                  >
                    {m.classification}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-gray-600">
                  <span>Current: {m.current_value != null ? m.current_value.toFixed(4) : "—"}</span>
                  <span>
                    Avg: {m.benchmark_range.avg != null ? m.benchmark_range.avg.toFixed(4) : "—"}
                  </span>
                  <span>
                    Min–max: {m.benchmark_range.min != null ? m.benchmark_range.min.toFixed(4) : "—"} –{" "}
                    {m.benchmark_range.max != null ? m.benchmark_range.max.toFixed(4) : "—"}
                  </span>
                  <span>
                    Dev %: {m.deviation_percent != null ? m.deviation_percent.toFixed(1) : "—"}
                  </span>
                  <span>Conf: {(m.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-indigo-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, 50 + (m.deviation_percent ?? 0) / 2))}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
          {r.next_actions.length ? (
            <ul className="list-inside list-disc text-[11px] text-gray-700">
              {r.next_actions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">Run to see material/CM/total ratios vs peers.</p>
      )}
    </aside>
  );
}
