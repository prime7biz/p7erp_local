/** Renders structured evidence_json from merch alert rules (schema_version 1). */

function formatLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 1000 ? value.toLocaleString() : String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function MerchAlertEvidence({ evidence }: { evidence: Record<string, unknown> | null | undefined }) {
  if (!evidence || typeof evidence !== "object") {
    return null;
  }
  const ruleKey = typeof evidence.rule_key === "string" ? evidence.rule_key : null;
  const evaluatedAt = typeof evidence.evaluated_at === "string" ? evidence.evaluated_at : null;
  const thresholds = evidence.thresholds && typeof evidence.thresholds === "object" ? (evidence.thresholds as Record<string, unknown>) : null;
  const facts = evidence.facts && typeof evidence.facts === "object" ? (evidence.facts as Record<string, unknown>) : null;

  const rows = (obj: Record<string, unknown> | null) =>
    obj
      ? Object.entries(obj).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 text-sm border-b border-border-subtle py-1.5 last:border-0">
            <span className="text-text-muted capitalize">{formatLabel(k)}</span>
            <span className="text-text-secondary break-words font-mono text-xs">{formatValue(v)}</span>
          </div>
        ))
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface-subtle/50 p-3 space-y-3">
      <p className="text-xs font-medium text-text-muted uppercase">Evidence</p>
      {(ruleKey || evaluatedAt) && (
        <div className="text-xs text-text-muted space-y-0.5">
          {ruleKey && (
            <p>
              <span className="text-text-secondary">Rule:</span>{" "}
              <code className="font-mono text-text-primary">{ruleKey}</code>
            </p>
          )}
          {evaluatedAt && (
            <p>
              <span className="text-text-secondary">Evaluated:</span>{" "}
              {new Date(evaluatedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
      {thresholds && Object.keys(thresholds).length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted mb-1">Thresholds</p>
          <div className="rounded border border-border-subtle bg-surface-raised px-2">{rows(thresholds)}</div>
        </div>
      )}
      {facts && Object.keys(facts).length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted mb-1">Facts</p>
          <div className="rounded border border-border-subtle bg-surface-raised px-2">{rows(facts)}</div>
        </div>
      )}
    </div>
  );
}
