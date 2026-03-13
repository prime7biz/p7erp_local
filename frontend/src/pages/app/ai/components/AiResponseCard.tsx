import type { AiToolInvocationResult } from "@/api/client";

export function AiResponseCard({ item }: { item: AiToolInvocationResult }) {
  const data = item.data || {};
  const appliedFilters = Array.isArray((data as { applied_filters?: unknown }).applied_filters)
    ? ((data as { applied_filters: unknown[] }).applied_filters.filter((x): x is string => typeof x === "string"))
    : [];
  const itemRows = Array.isArray((data as { items?: unknown }).items)
    ? ((data as { items: unknown[] }).items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object"))
    : [];
  const forecastRows = Array.isArray((data as { forecast_points?: unknown }).forecast_points)
    ? ((data as { forecast_points: unknown[] }).forecast_points.filter(
        (x): x is Record<string, unknown> => !!x && typeof x === "object",
      ))
    : [];
  const rows = itemRows.length > 0 ? itemRows : forecastRows;
  const reportMetadata =
    typeof (data as { report_metadata?: unknown }).report_metadata === "object" && (data as { report_metadata?: unknown }).report_metadata
      ? ((data as { report_metadata: Record<string, unknown> }).report_metadata)
      : null;
  const forecastMetadata =
    typeof (data as { forecast_metadata?: unknown }).forecast_metadata === "object" &&
    (data as { forecast_metadata?: unknown }).forecast_metadata
      ? ((data as { forecast_metadata: Record<string, unknown> }).forecast_metadata)
      : null;
  const sources = Array.isArray((data as { sources?: unknown }).sources)
    ? ((data as { sources: unknown[] }).sources.filter((x): x is Record<string, unknown> => !!x && typeof x === "object"))
    : [];
  const retrievedFromKnowledge = Boolean((data as { retrieved_from_knowledge?: unknown }).retrieved_from_knowledge);
  const disclaimer = typeof (data as { disclaimer?: unknown }).disclaimer === "string" ? (data as { disclaimer: string }).disclaimer : "";

  const metricEntries = Object.entries(data).filter(
    ([key, value]) =>
      key !== "items" &&
      key !== "forecast_points" &&
      key !== "sources" &&
      key !== "retrieved_from_knowledge" &&
      key !== "disclaimer" &&
      key !== "applied_filters" &&
      key !== "report_metadata" &&
      key !== "forecast_metadata" &&
      (typeof value === "number" || typeof value === "string" || typeof value === "boolean"),
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-800">{item.tool_name}</div>
        <div className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {item.source_area}
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-700">{item.summary}</p>
      {reportMetadata ? (
        <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
          <span className="font-semibold">Report:</span> {String(reportMetadata.report_name ?? reportMetadata.report_code ?? "Generated report")}
        </div>
      ) : null}
      {forecastMetadata ? (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <span className="font-semibold">Forecast:</span>{" "}
          {String(forecastMetadata.forecast_name ?? forecastMetadata.forecast_code ?? "Generated forecast")}
        </div>
      ) : null}
      {retrievedFromKnowledge ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900">
          <span className="font-semibold">Knowledge Retrieval:</span> Answer derived from indexed documents.
        </div>
      ) : null}
      {appliedFilters.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {appliedFilters.map((filter) => (
            <span key={filter} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600">
              {filter}
            </span>
          ))}
        </div>
      ) : null}
      {metricEntries.length > 0 ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Summary</div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {metricEntries.slice(0, 6).map(([key, value]) => (
              <div key={key} className="text-xs text-slate-700">
                <span className="font-medium text-slate-600">{key.replaceAll("_", " ")}:</span> {String(value)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Results</div>
          <div className="space-y-1">
            {rows.slice(0, 8).map((row, idx) => {
              const entries = Object.entries(row).slice(0, 4);
              return (
                <div key={idx} className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  {entries.map(([key, value], i) => (
                    <span key={key}>
                      <span className="font-medium text-slate-600">{key.replaceAll("_", " ")}:</span> {String(value ?? "-")}
                      {i < entries.length - 1 ? " | " : ""}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">Sources</div>
          <div className="space-y-1">
            {sources.slice(0, 5).map((src, idx) => (
              <div key={idx} className="rounded border border-violet-100 bg-violet-50 px-2 py-1 text-xs text-violet-900">
                <span className="font-semibold">{String(src.document_title ?? src.document_code ?? "Document")}</span>:{" "}
                {String(src.snippet ?? "")}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {disclaimer ? <p className="mt-1 text-[11px] text-slate-500">{disclaimer}</p> : null}
      {item.reason_code ? (
        <p className="mt-1 text-[11px] text-amber-700">Policy reason: {item.reason_code}</p>
      ) : null}
      {item.error ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
    </div>
  );
}
