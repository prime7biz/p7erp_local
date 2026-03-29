import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AiMessageResponse } from "@/api/client";
import { readProvenance, readTraceSpans } from "@/pages/app/ai/utils/aiFormatting";

interface Props {
  message: AiMessageResponse;
}

function confidenceBadgeClass(label: string | undefined): string {
  const l = (label || "").toLowerCase();
  if (l === "high") return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  if (l === "medium") return "bg-amber-500/15 text-amber-900 dark:text-amber-100";
  if (l === "low" || l === "uncertain") return "bg-red-500/15 text-red-800 dark:text-red-200";
  return "bg-surface-subtle text-text-muted";
}

/** Collapsible Phase-2 provenance: confidence, grounding, sources, warnings, optional trace spans. */
export function AiProvenancePanel({ message }: Props) {
  const [open, setOpen] = useState(false);
  const prov = readProvenance(message);
  const spans = readTraceSpans(message);

  if (!prov && spans.length === 0) return null;

  const label = prov?.confidence_label;
  const conf = prov?.confidence;

  return (
    <div className="mt-2 rounded-lg border border-dashed border-border/80 bg-surface-subtle/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-[11px] font-medium text-text-secondary hover:bg-surface-subtle"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <span>Sources and confidence</span>
        {label ? (
          <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${confidenceBadgeClass(label)}`}>
            {label}
            {typeof conf === "number" ? ` · ${Math.round(conf * 100)}%` : ""}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/60 px-2 pb-2 pt-1 text-[11px] text-text-secondary">
          {prov?.grounding ? (
            <p>
              <span className="font-semibold text-text-primary">Grounding:</span> {prov.grounding.replace(/_/g, " ")}
            </p>
          ) : null}
          {prov?.model_used ? (
            <p>
              <span className="font-semibold text-text-primary">Model:</span> {prov.model_used}
            </p>
          ) : null}
          {typeof prov?.total_latency_ms === "number" ? (
            <p>
              <span className="font-semibold text-text-primary">Latency:</span> {prov.total_latency_ms} ms
            </p>
          ) : null}
          {Array.isArray(prov?.warnings) && prov.warnings.length > 0 ? (
            <div className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-900 dark:text-amber-100">
              <p className="font-semibold">Warnings</p>
              <ul className="list-inside list-disc">
                {prov.warnings!.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {Array.isArray(prov?.sources) && prov.sources.length > 0 ? (
            <div>
              <p className="font-semibold text-text-primary">Retrieval sources</p>
              <ul className="mt-1 space-y-1">
                {prov.sources!.slice(0, 8).map((s, i) => (
                  <li key={i} className="rounded border border-border/60 bg-surface-base p-1.5">
                    <span className="text-text-muted">
                      [{s.module || s.source_type || "chunk"}] {s.source_ref || "—"}
                    </span>
                    {s.snippet ? <p className="mt-0.5 text-text-primary line-clamp-3">{s.snippet}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {spans.length > 0 ? (
            <details className="rounded border border-border/40 bg-surface-base p-1">
              <summary className="cursor-pointer font-semibold text-text-primary">Request spans ({spans.length})</summary>
              <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-[10px] text-text-muted">
                {spans.map((s, i) => (
                  <li key={i}>
                    {s.name} {s.start_ms}–{s.end_ms}ms {s.status}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
