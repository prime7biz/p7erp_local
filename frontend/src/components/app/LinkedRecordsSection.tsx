import { Link } from "react-router-dom";

export type LinkedRecordRow = { id: number; label: string; sub?: string; to: string };

type LinkedRecordsColumnProps = {
  title: string;
  rows: LinkedRecordRow[];
  maxVisible?: number;
};

function Column({ title, rows, maxVisible = 8 }: LinkedRecordsColumnProps) {
  if (!rows.length) return null;
  const slice = rows.slice(0, maxVisible);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-text-muted">
        {title} ({rows.length})
      </div>
      <ul className="space-y-1">
        {slice.map((r) => (
          <li key={r.id}>
            <Link to={r.to} className="text-sm text-brand-primary hover:underline">
              {r.label}
              {r.sub ? <span className="text-text-muted"> — {r.sub}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type LinkedRecordsSectionProps = {
  title?: string;
  columns: LinkedRecordsColumnProps[];
  className?: string;
};

/**
 * Reusable upstream/downstream links for detail pages (quotation, order, customer).
 */
export function LinkedRecordsSection({
  title = "Related records",
  columns,
  className = "",
}: LinkedRecordsSectionProps) {
  const anyRows = columns.some((c) => c.rows.length > 0);
  if (!anyRows) return null;
  return (
    <section className={`rounded-xl border border-border bg-surface-raised p-5 ${className}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-status-warning">{title}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <Column key={col.title} {...col} />
        ))}
      </div>
    </section>
  );
}
