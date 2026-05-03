import { useCallback, useEffect, useState } from "react";
import { api, type AiForecastRunResponse } from "@/api/client";
import { ForecastChart } from "@/pages/app/ai/predictions/charts/renderers/ForecastChart";
import { formatAiError } from "@/pages/app/ai/predictions/utils/formatAiError";
import { X, Copy, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

export function ForecastRunDrawer({
  runId,
  onClose,
  onDeleted,
  onUpdated,
}: {
  runId: number | null;
  onClose: () => void;
  onDeleted?: (id: number) => void;
  onUpdated?: (run: AiForecastRunResponse) => void;
}) {
  const [run, setRun] = useState<AiForecastRunResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (runId == null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.aiGetForecastRun(runId);
      setRun(r);
      onUpdated?.(r);
    } catch (e) {
      setError(formatAiError(e, "Failed to load forecast run"));
      setRun(null);
    } finally {
      setLoading(false);
    }
  }, [runId, onUpdated]);

  useEffect(() => {
    if (runId == null) {
      setRun(null);
      setConfirmDelete(false);
      return;
    }
    void load();
  }, [runId, load]);

  const copyJson = () => {
    if (!run) return;
    void navigator.clipboard.writeText(JSON.stringify(run.result_json ?? {}, null, 2));
  };

  const doDelete = async () => {
    if (!run || !confirmDelete) return;
    setDeleting(true);
    try {
      await api.aiDeleteForecastRun(run.id);
      onDeleted?.(run.id);
      onClose();
    } catch (e) {
      setError(formatAiError(e, "Delete failed"));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (runId == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-surface-raised shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold text-text-primary">Forecast details</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-surface-subtle" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          {loading ? <p className="text-sm text-text-muted">Loading…</p> : null}
          {error ? <p className="text-xs text-status-danger-foreground">{error}</p> : null}
          {run ? (
            <>
              <div>
                <div className="text-sm font-semibold text-text-primary">{run.forecast_name}</div>
                <div className="text-[11px] text-text-muted">
                  {run.forecast_code} · {run.status} · conf {run.confidence_score?.toFixed(2) ?? "N/A"}
                </div>
                <div className="mt-1 text-[11px] text-text-muted">
                  Created {new Date(run.created_at).toLocaleString()}
                  {run.completed_at ? ` · Completed ${new Date(run.completed_at).toLocaleString()}` : ""}
                </div>
                {run.session_id ? (
                  <Link to={`/app/ai/assistant`} className="mt-1 inline-block text-[11px] text-brand-primary hover:underline">
                    Open assistant (session #{run.session_id})
                  </Link>
                ) : null}
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Visualization</div>
                <ForecastChart run={run} />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Assumptions</div>
                <pre className="max-h-32 overflow-auto rounded border border-border bg-surface-subtle p-2 text-[11px] text-text-secondary">
                  {JSON.stringify(run.assumptions_json ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Narrative</div>
                <p className="whitespace-pre-wrap text-sm text-text-secondary">{run.narrative_explanation || "—"}</p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase text-text-muted">result_json</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={copyJson} className="inline-flex items-center gap-1 text-[11px] text-brand-primary">
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                    <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
                      <RefreshCw className="h-3 w-3" /> Refresh
                    </button>
                  </div>
                </div>
                <pre className="max-h-64 overflow-auto rounded border border-border bg-surface-subtle p-2 text-[10px] leading-relaxed text-text-secondary">
                  {JSON.stringify(run.result_json ?? {}, null, 2)}
                </pre>
              </div>
              <div className="border-t border-border pt-3">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1 text-xs text-status-danger-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove from list
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-text-secondary">Delete this run?</span>
                    <button type="button" className="rounded bg-status-danger-foreground px-2 py-1 text-white" disabled={deleting} onClick={() => void doDelete()}>
                      {deleting ? "…" : "Confirm delete"}
                    </button>
                    <button type="button" className="text-text-muted underline" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
