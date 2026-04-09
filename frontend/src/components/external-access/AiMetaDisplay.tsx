import { useState } from "react";

/** Mirrors backend `AiGovernanceMeta` — fields optional when API returns partial/empty meta. */
export type AiGovernanceMetaView = {
  generated_at?: string;
  data_as_of?: string;
  confidence_score?: number;
  source_modules?: string[];
  assumptions?: string[];
  limitations?: string[];
  tenant_review_required?: boolean;
  approved_for_external?: boolean;
};

function CollapsibleList({ title, items }: { title: string; items: string[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-text-primary hover:bg-surface-subtle"
      >
        {title}
        <span className="text-text-muted">{open ? "▼" : "▶"}</span>
      </button>
      {open ? (
        <ul className="list-disc space-y-1 border-t border-border px-6 py-3 text-xs text-text-muted">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AiMetaDisplay({
  meta,
  className = "",
}: {
  meta: AiGovernanceMetaView | null | undefined;
  className?: string;
}) {
  if (!meta || Object.keys(meta).length === 0) {
    return <p className={`text-xs text-text-muted ${className}`}>No metadata for this report.</p>;
  }

  const conf = meta.confidence_score;
  const confPct = typeof conf === "number" && Number.isFinite(conf) ? Math.round(conf * 100) : null;
  const pending = meta.tenant_review_required && !meta.approved_for_external;

  return (
    <aside className={`space-y-3 ${className}`}>
      {pending ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Pending approval — tenant review required before external distribution.
        </div>
      ) : null}

      <dl className="space-y-2 text-xs">
        {meta.data_as_of ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Data as of</dt>
            <dd className="text-right font-medium text-text-primary">{meta.data_as_of}</dd>
          </div>
        ) : null}
        {meta.generated_at ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Generated</dt>
            <dd className="text-right font-medium text-text-primary">{meta.generated_at}</dd>
          </div>
        ) : null}
        {confPct != null ? (
          <div className="flex justify-between gap-2">
            <dt className="text-text-muted">Confidence</dt>
            <dd>
              <span className="inline-flex rounded-full bg-surface-subtle px-2 py-0.5 font-semibold tabular-nums text-text-primary">
                {confPct}%
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      {meta.source_modules && meta.source_modules.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-text-muted">Source modules</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {meta.source_modules.map((m) => (
              <span key={m} className="rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] text-text-primary">
                {m}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <CollapsibleList title="Assumptions" items={meta.assumptions ?? []} />
      <CollapsibleList title="Limitations" items={meta.limitations ?? []} />
    </aside>
  );
}
