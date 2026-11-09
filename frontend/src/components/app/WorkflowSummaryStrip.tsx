import { Link } from "react-router-dom";

export type WorkflowStripItem = {
  label: string;
  value: string | number;
  hint?: string;
  to?: string;
};

type WorkflowSummaryStripProps = {
  items: WorkflowStripItem[];
  className?: string;
};

/**
 * Horizontal summary of pipeline counts / next-step context (customer → order flow, etc.).
 */
export function WorkflowSummaryStrip({ items, className = "" }: WorkflowSummaryStripProps) {
  if (!items.length) return null;
  return (
    <div
      className={`flex gap-2 overflow-x-auto rounded-xl border border-border bg-surface-subtle/80 px-3 py-2 text-xs sm:flex-wrap sm:overflow-visible ${className}`}
    >
      {items.map((it) => {
        const inner = (
          <span className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-lg bg-surface-raised px-2.5 py-1.5 shadow-sm">
            <span className="font-medium text-text-muted">{it.label}</span>
            <span className="font-semibold text-text-primary" title={it.hint}>
              {it.value}
            </span>
          </span>
        );
        return it.to ? (
          <Link key={it.label} to={it.to} className="shrink-0 hover:opacity-90">
            {inner}
          </Link>
        ) : (
          <span key={it.label} className="shrink-0">
            {inner}
          </span>
        );
      })}
    </div>
  );
}
