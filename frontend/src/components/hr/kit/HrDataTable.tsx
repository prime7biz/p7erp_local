import { useMemo, useState, type ReactNode } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import {
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTheadClass,
  listTableThClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import type { ListPageSize } from "@/hooks/useListPagination";
import { saveBlob } from "@/lib/fileSave";
import { logApiError } from "@/utils/logApiError";
import { HrRowActions } from "./HrRowActions";
import type { HrRowAction } from "./rowActions";
import { filterRows, nextSort, sortRows, toCsv, type HrTableColumn, type SortState } from "./tableLogic";

export type { HrTableColumn } from "./tableLogic";

const toolbarButton =
  "inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle disabled:opacity-50";

export interface HrDataTableLabels {
  refresh: string;
  exportCsv: string;
  retry: string;
  clearSearch: string;
  all: string;
  actions: string;
  filterByStatus: string;
  loading: string;
  /** Shown when the search has no hits; `{{query}}` is replaced by the typed text. */
  noMatch: string;
}

const DEFAULT_LABELS: HrDataTableLabels = {
  refresh: "Refresh",
  exportCsv: "Export CSV",
  retry: "Try again",
  clearSearch: "Clear search",
  all: "All",
  actions: "Actions",
  filterByStatus: "Filter by status",
  loading: "Loading",
  noMatch: "No rows match “{{query}}”",
};

const chipBase = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition";

function alignClass(align?: "left" | "right" | "center"): string {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

/**
 * HR list table: search, sortable columns, paging, phone cards, Export CSV and row actions.
 * Search / sort / paging work on the rows already loaded (no extra server calls).
 */
export function HrDataTable<T>({
  rows,
  rowKey,
  columns,
  loading = false,
  error,
  onRetry,
  onRefresh,
  emptyTitle = "Nothing here yet",
  emptyHint,
  emptyAction,
  searchPlaceholder = "Search this list…",
  rowActions,
  toolbar,
  exportFileName,
  canExport = false,
  initialSort = null,
  defaultPageSize = 20,
  statusOf,
  labels: labelOverrides,
}: {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: HrTableColumn<T>[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  searchPlaceholder?: string;
  rowActions?: (row: T) => HrRowAction[];
  /** Extra filters / buttons shown next to the search box. */
  toolbar?: ReactNode;
  /** When set (and `canExport`), shows Export CSV for the filtered rows. */
  exportFileName?: string;
  canExport?: boolean;
  initialSort?: SortState;
  defaultPageSize?: ListPageSize;
  /** When set, shows clickable status chips with counts (All, Pending, Approved…). */
  statusOf?: (row: T) => string | null | undefined;
  /** Translated texts (self-service pages have a Bangla switch). */
  labels?: Partial<HrDataTableLabels>;
}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(defaultPageSize);

  const statusCounts = useMemo(() => {
    if (!statusOf) return [];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const s = (statusOf(row) ?? "").trim();
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows, statusOf]);

  // After a reload the chosen status may no longer exist (e.g. the last pending row was approved).
  const activeStatus = status && statusCounts.some(([s]) => s === status) ? status : null;

  const filtered = useMemo(() => {
    const byStatus = activeStatus && statusOf ? rows.filter((r) => (statusOf(r) ?? "").trim() === activeStatus) : rows;
    return sortRows(filterRows(byStatus, columns, query), columns, sort);
  }, [rows, columns, query, sort, activeStatus, statusOf]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActions = Boolean(rowActions);
  const searchable = columns.some((c) => c.value);

  const exportCsv = () => {
    if (!exportFileName) return;
    const blob = new Blob([toCsv(columns, filtered)], { type: "text/csv;charset=utf-8" });
    void saveBlob(blob, `${exportFileName}.csv`).catch((e: unknown) => logApiError("HrDataTable.exportCsv", e));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {searchable ? (
          <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-lg border border-border-strong bg-surface-raised py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
            />
          </label>
        ) : null}
        {toolbar}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {onRefresh ? (
            <button type="button" onClick={onRefresh} className={toolbarButton} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> {labels.refresh}
            </button>
          ) : null}
          {exportFileName && canExport ? (
            <button type="button" onClick={exportCsv} className={toolbarButton} disabled={loading || filtered.length === 0}>
              <Download className="h-4 w-4" aria-hidden /> {labels.exportCsv}
            </button>
          ) : null}
        </div>
      </div>

      {statusCounts.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={labels.filterByStatus}>
          {[[null, rows.length] as const, ...statusCounts].map(([s, n]) => {
            const active = activeStatus === s;
            return (
              <button
                key={s ?? "__all"}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`${chipBase} ${
                  active
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                    : "border-border bg-surface-raised text-text-secondary hover:border-border-strong"
                }`}
              >
                <span className="capitalize">{s ? s.replace(/_/g, " ").toLowerCase() : labels.all}</span>
                <span className="rounded-full bg-surface-subtle px-1.5 text-[11px] text-text-muted">{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="rounded-md border border-status-danger/30 px-2.5 py-1 text-xs font-medium">
              {labels.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={listPageTableCardClass}>
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label={labels.loading}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-surface-subtle" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium text-text-primary">{query ? labels.noMatch.replace("{{query}}", query.trim()) : emptyTitle}</p>
            {!query && emptyHint ? <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">{emptyHint}</p> : null}
            {query ? (
              <button type="button" onClick={() => setQuery("")} className={`mt-4 ${toolbarButton}`}>
                {labels.clearSearch}
              </button>
            ) : emptyAction ? (
              <div className="mt-4 flex justify-center">{emptyAction}</div>
            ) : null}
          </div>
        ) : (
          <>
            {/* Phones: one card per row. */}
            <ul className="divide-y divide-border sm:hidden">
              {visible.map((row) => (
                <li key={rowKey(row)} className="space-y-1.5 px-4 py-3">
                  {columns
                    .filter((c) => !c.hideOnMobile)
                    .map((c, i) => (
                      <div key={c.key} className={i === 0 ? "text-sm" : "flex items-start justify-between gap-3 text-sm"}>
                        {i === 0 ? null : <span className="shrink-0 text-xs text-text-muted">{c.header}</span>}
                        <span className={i === 0 ? "" : "min-w-0 text-right text-text-secondary"}>{c.render(row)}</span>
                      </div>
                    ))}
                  {hasActions ? (
                    <div className="pt-1">
                      <HrRowActions rowId={rowKey(row)} actions={rowActions!(row)} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {/* Tablets and desktop: table with sticky header. */}
            <div className="hidden max-h-[70vh] overflow-auto sm:block">
              <table className={listTableBaseClass}>
                <thead className={`${listTableTheadClass} sticky top-0 z-[1]`}>
                  <tr>
                    {columns.map((c) => {
                      const active = sort?.key === c.key;
                      const canSort = c.sortable !== false && Boolean(c.value);
                      return (
                        <th
                          key={c.key}
                          className={`${listTableThClass} ${alignClass(c.align)}`}
                          aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                        >
                          {canSort ? (
                            <button
                              type="button"
                              onClick={() => setSort((s) => nextSort(s, c.key))}
                              className="inline-flex items-center gap-1 uppercase hover:text-text-primary"
                            >
                              {c.header}
                              <span className={active ? "text-brand-primary" : "text-text-muted/40"} aria-hidden>
                                {active && sort!.dir === "desc" ? "▼" : "▲"}
                              </span>
                            </button>
                          ) : (
                            c.header
                          )}
                        </th>
                      );
                    })}
                    {hasActions ? <th className={`${listTableThClass} text-right`}>{labels.actions}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {visible.map((row) => (
                    <tr key={rowKey(row)} className={listTableTrClass}>
                      {columns.map((c) => (
                        <td key={c.key} className={`${listTableTdClass} ${alignClass(c.align)}`}>
                          {c.render(row)}
                        </td>
                      ))}
                      {hasActions ? (
                        <td className={`${listTableTdClass} text-right`}>
                          <HrRowActions rowId={rowKey(row)} actions={rowActions!(row)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 10 ? (
              <DataTablePagination
                page={safePage}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={(p) => setPage(Math.max(1, Math.min(p, pageCount)))}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
