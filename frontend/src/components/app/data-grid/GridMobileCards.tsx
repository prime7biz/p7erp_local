import type { ReactNode } from "react";
import type { VisibilityState } from "@tanstack/react-table";
import { splitCardColumns } from "./cardColumns";
import type { GridColumn } from "./types";

type CardRow<T> = { id: string; row: T; selected: boolean; toggle: (e: unknown) => void };

function DetailList<T>({ cols, row }: { cols: GridColumn<T>[]; row: T }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
      {cols.map((c) => (
        <div key={c.id} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{c.header}</dt>
          <dd className="mt-0.5 break-words text-sm text-text-secondary">{c.cell(row)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Phone card list used by `DataGrid` when `mobileCards` is on and the screen is below 768px. */
export function GridMobileCards<T>({
  columns,
  rows,
  columnVisibility,
  loading,
  emptyState,
  selectable,
  allSelected,
  someSelected,
  onToggleAll,
}: {
  columns: GridColumn<T>[];
  rows: CardRow<T>[];
  columnVisibility: VisibilityState;
  loading: boolean;
  emptyState?: ReactNode;
  selectable: boolean;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (e: unknown) => void;
}) {
  const cols = splitCardColumns(columns, columnVisibility);

  if (loading) {
    return (
      <ul className="space-y-3 p-3" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface-subtle" />
        ))}
      </ul>
    );
  }
  if (rows.length === 0) {
    return <>{emptyState ?? <div className="p-10 text-center text-sm text-text-muted">No records.</div>}</>;
  }

  return (
    <div className="p-3">
      {selectable ? (
        <label className="mb-2 flex min-h-11 items-center gap-3 px-1 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={onToggleAll}
          />
          Select all visible
        </label>
      ) : null}
      <ul className="space-y-3">
        {rows.map(({ id, row, selected, toggle }) => (
          <li
            key={id}
            className={`rounded-xl border bg-surface-raised p-3 shadow-sm ${selected ? "border-brand-primary/60 bg-brand-primary/5" : "border-border"}`}
          >
            <div className="flex items-start gap-3">
              {selectable ? (
                <label className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center">
                  <input type="checkbox" className="h-5 w-5" aria-label="Select row" checked={selected} onChange={toggle} />
                </label>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="break-words text-base font-semibold text-text-primary [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">
                  {cols.title.map((c) => (
                    <div key={c.id}>{c.cell(row)}</div>
                  ))}
                </div>
                {cols.subtitle.map((c) => (
                  <div key={c.id} className="mt-0.5 break-words text-sm text-text-secondary">
                    {c.cell(row)}
                  </div>
                ))}
              </div>
              {cols.status.length > 0 ? (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {cols.status.map((c) => (
                    <div key={c.id}>{c.cell(row)}</div>
                  ))}
                </div>
              ) : null}
            </div>
            {cols.detail.length > 0 ? (
              <div className="mt-3">
                <DetailList cols={cols.detail} row={row} />
              </div>
            ) : null}
            {cols.more.length > 0 ? (
              <details className="mt-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand-primary">
                  More details
                </summary>
                <div className="pt-1">
                  <DetailList cols={cols.more} row={row} />
                </div>
              </details>
            ) : null}
            {cols.actions.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-2">
                {cols.actions.map((c) => (
                  <div key={c.id}>{c.cell(row)}</div>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
