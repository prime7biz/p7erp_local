import type { ReactNode } from "react";

import { reasonLabels } from "./reasonLabels";

import type { ChipTone } from "./panelLogic";

const TONE: Record<ChipTone, string> = {
  neutral: "border-border bg-surface-subtle text-text-secondary",
  good: "border-green-200 bg-green-50 text-green-900",
  warn: "border-amber-200 bg-amber-50 text-amber-950",
  bad: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export function Chip({ tone = "neutral", children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Reason / missing-input codes shown as readable chips. */
export function ReasonChips({ codes, tone = "neutral" }: { codes: string[] | null | undefined; tone?: ChipTone }) {
  const labels = reasonLabels(codes);
  if (labels.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((l) => (
        <Chip key={l} tone={tone}>
          {l}
        </Chip>
      ))}
    </span>
  );
}

export function PanelCard({
  title,
  subtitle,
  children,
  loading,
  error,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  error?: string;
  testId?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-raised p-4 space-y-3" data-testid={testId}>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
      </div>
      {loading ? (
        <p className="text-xs text-text-muted" role="status">
          Loading…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="rounded border border-status-danger/20 bg-status-danger-subtle p-2 text-xs text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {!error ? children : null}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-2" title={hint}>
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}
