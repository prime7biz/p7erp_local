import { X } from "lucide-react";

type Suggestion = {
  recommended_line_id?: number | null;
  recommended_line_code?: string;
  recommended_start_date?: string;
  reason?: string;
} | null;

type Props = {
  open: boolean;
  orderId: number | null;
  suggestion: Suggestion;
  loading: boolean;
  onClose: () => void;
  onGoToLinePlan?: () => void;
};

export function AISuggestionModal({ open, orderId, suggestion, loading, onClose, onGoToLinePlan }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border border-border bg-surface-raised p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">AI allocation suggestion</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-surface-subtle" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {orderId != null ? <p className="mb-2 text-sm text-text-muted">Order #{orderId}</p> : null}
        {loading ? (
          <p className="text-sm text-text-secondary">Requesting suggestion…</p>
        ) : suggestion ? (
          <div className="space-y-2 text-sm">
            {suggestion.recommended_line_code != null ? (
              <p>
                <span className="text-text-muted">Line: </span>
                <span className="font-medium">{suggestion.recommended_line_code}</span>
                {suggestion.recommended_line_id != null ? ` (id ${suggestion.recommended_line_id})` : null}
              </p>
            ) : null}
            {suggestion.recommended_start_date ? (
              <p>
                <span className="text-text-muted">Start: </span>
                {suggestion.recommended_start_date}
              </p>
            ) : null}
            {suggestion.reason ? (
              <p className="rounded border border-border-subtle bg-surface-subtle/50 p-2 text-text-secondary">{suggestion.reason}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-amber-800">No AI suggestion available (check GEMINI_API_KEY or try again).</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onGoToLinePlan ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              onClick={onGoToLinePlan}
            >
              Open line plan board
            </button>
          ) : null}
          <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
