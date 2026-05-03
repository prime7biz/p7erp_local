import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { AiDataQualityScanResponse } from "@/api/client";

interface Props {
  scan: AiDataQualityScanResponse | null;
  loading: boolean;
  onRun: () => void | Promise<void>;
}

export function AiDataQualityCard({ scan, loading, onRun }: Props) {
  const issues = scan?.issues ?? [];
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-status-info-foreground" />
          <h2 className="text-sm font-semibold text-text-primary">Data quality scan</h2>
          {scan?.generated_at ? (
            <span className="text-[11px] text-text-muted">
              &middot; generated {new Date(scan.generated_at).toLocaleString()}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void onRun()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scanning..." : "Run scan"}
        </button>
      </div>

      {issues.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {issues.map((it, i) => (
            <li key={i} className="rounded-lg border border-border bg-surface-subtle p-2 text-xs">
              <span className="font-semibold text-text-primary">{String(it.title ?? "")}</span>
              <span className="text-text-muted"> ({String(it.severity ?? "")})</span>
              <p className="mt-0.5 text-text-secondary">{String(it.suggestion ?? "")}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {scan?.narrative ? (
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{scan.narrative}</p>
      ) : (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border p-3 text-xs text-text-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning-foreground" />
          <span>Run a scan to check orders, BOMs, customers, and stock movements for anomalies.</span>
        </div>
      )}
    </div>
  );
}
