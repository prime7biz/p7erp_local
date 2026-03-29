interface Props {
  reason: string;
  toolRequired: string;
  disabled?: boolean;
  loading?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}

export function AiEscalationCard({ reason, toolRequired, disabled, loading, onApprove, onCancel }: Props) {
  return (
    <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle p-3">
      <div className="text-sm font-semibold text-text-primary">Paid processing required</div>
      <p className="mt-1 text-xs text-text-secondary">{reason}</p>
      <p className="mt-1 text-[11px] text-text-muted">
        Tool: <span className="font-semibold text-text-secondary">{toolRequired}</span>
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onApprove}
          disabled={disabled || loading}
        >
          {loading ? "Cloud AI is processing..." : "Approve Paid Processing"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onCancel}
          disabled={disabled || loading}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
