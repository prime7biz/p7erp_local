import { Loader2, RefreshCw } from "lucide-react";

type Props = {
  summary: string | null;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
};

export function AIInsightsBar({ summary, loading, onRefresh, disabled }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">AI insights (Gemini)</h3>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh analysis
        </button>
      </div>
      {summary ? (
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{summary}</p>
      ) : (
        <p className="text-sm text-text-muted">
          {loading ? "Analyzing pipeline…" : "Click refresh to generate a short summary of risks and next steps."}
        </p>
      )}
    </div>
  );
}
