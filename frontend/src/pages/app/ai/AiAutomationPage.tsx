import { useCallback, useEffect, useState } from "react";
import { api, type AiActionRunResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

export function AiAutomationPage() {
  const [scanNarrative, setScanNarrative] = useState<string | null>(null);
  const [issues, setIssues] = useState<Array<Record<string, unknown>>>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [actions, setActions] = useState<AiActionRunResponse[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);

  const loadActions = useCallback(() => {
    setActionsLoading(true);
    api
      .aiListActionRuns({ limit: 30 })
      .then(setActions)
      .catch((e) => logApiError("AiAutomation.actionRuns", e))
      .finally(() => setActionsLoading(false));
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const runScan = () => {
    setScanLoading(true);
    api
      .aiDataQualityScan()
      .then((r) => {
        setScanNarrative(r.narrative);
        setIssues(r.issues || []);
      })
      .catch((e) => logApiError("AiAutomation.dataQuality", e))
      .finally(() => setScanLoading(false));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">AI Automation</h1>
        <p className="text-sm text-text-muted">
          Data quality scan (Gemini narrative) and recent AI action runs (draft workflows with confirmation).
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-info-foreground" />
            <h2 className="text-sm font-semibold text-text-primary">Data quality scan</h2>
          </div>
          <button
            type="button"
            onClick={() => void runScan()}
            disabled={scanLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanLoading ? "animate-spin" : ""}`} />
            Run scan
          </button>
        </div>
        {issues.length > 0 && (
          <ul className="mb-3 space-y-2">
            {issues.map((it, i) => (
              <li key={i} className="rounded-lg border border-border bg-surface-subtle p-2 text-xs">
                <span className="font-semibold text-text-primary">{String(it.title ?? "")}</span>
                <span className="text-text-muted"> ({String(it.severity ?? "")})</span>
                <p className="text-text-secondary mt-0.5">{String(it.suggestion ?? "")}</p>
              </li>
            ))}
          </ul>
        )}
        {scanNarrative ? (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{scanNarrative}</p>
        ) : (
          <p className="text-xs text-text-muted">Run scan to check orders, BOMs, customers, and stock movements.</p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="text-sm font-semibold text-text-primary mb-3">Recent AI action runs</h2>
        {actionsLoading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="text-sm text-text-muted">No action runs yet. Use AI Assistant to propose a draft action.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-text-primary">{a.action_key}</span>
                  <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px]">{a.status}</span>
                </div>
                <p className="text-text-secondary mt-1 line-clamp-2">{a.preview_text || a.prompt_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 flex gap-2 text-xs text-text-muted">
        <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning-foreground" />
        <span>
          Destructive or financial actions still require explicit confirmation in the AI Assistant chat flow.
        </span>
      </div>
    </div>
  );
}
