/** Yellow/red discrepancy alerts from LC / shipping document extraction. */

export type ExtractionAlert = {
  severity?: string;
  code?: string;
  message?: string;
};

export function ExtractionAlertsBanner({
  alerts,
  suggestCreateMasterContract,
  matchHint,
  suggestedStatus,
}: {
  alerts?: ExtractionAlert[] | null;
  suggestCreateMasterContract?: boolean;
  matchHint?: string | null;
  suggestedStatus?: string | null;
}) {
  const list = alerts ?? [];
  if (!list.length && !suggestCreateMasterContract && !matchHint) return null;

  return (
    <div className="space-y-2">
      {suggestCreateMasterContract ? (
        <div className="rounded-lg border border-brand-primary/30 bg-brand-subtle/60 px-3 py-2 text-xs text-brand-primary">
          Create Master Contract from this LC? Review extracted fields below, then save the form.
        </div>
      ) : null}
      {matchHint ? (
        <div className="rounded-lg border border-status-info/30 bg-status-info-subtle/50 px-3 py-2 text-xs text-status-info-foreground">
          {matchHint}
          {suggestedStatus ? ` Suggested status: ${suggestedStatus}.` : ""}
        </div>
      ) : null}
      {list.map((a, i) => {
        const critical = (a.severity || "").toLowerCase() === "critical";
        return (
          <div
            key={`${a.code || "alert"}-${i}`}
            className={
              critical
                ? "rounded-lg border border-status-danger/40 bg-status-danger-subtle/60 px-3 py-2 text-xs text-status-danger-foreground"
                : "rounded-lg border border-status-warning/40 bg-status-warning-subtle/60 px-3 py-2 text-xs text-status-warning-foreground"
            }
          >
            {a.message || a.code || "Review required"}
          </div>
        );
      })}
    </div>
  );
}
