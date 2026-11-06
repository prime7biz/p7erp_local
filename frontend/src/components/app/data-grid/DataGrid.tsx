import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Rows3 } from "lucide-react";
import { toast } from "sonner";
import type { SavedViewConfig } from "@/api/client";
import { cn } from "@/lib/utils";
import { exportCsv, exportXlsx } from "./exportRows";
import { SavedViewsMenu } from "./SavedViewsMenu";
import type { GridColumn, GridDensity } from "./types";
import { todayLocalISO } from "@/lib/dates";

export type { GridColumn, GridDensity } from "./types";

type DataGridProps<T> = {
  /** Stable grid id (saved views + remembered layout), e.g. "customers.list". */
  tableKey: string;
  columns: GridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string | number;
  loading?: boolean;
  emptyState?: ReactNode;
  exportName?: string;
  /** Rendered in the sticky bar when rows are selected; enables row checkboxes. */
  bulkActions?: (selected: T[], clearSelection: () => void) => ReactNode;
  /** Lets saved views capture/restore the page's URL filters as well as the grid layout. */
  savedViews?: { getQuery: () => string; applyQuery: (query: string) => void };
  footer?: ReactNode;
};

type StoredLayout = { hidden?: string[]; density?: GridDensity };

function readLayout(tableKey: string): StoredLayout {
  try {
    return JSON.parse(localStorage.getItem(`p7_grid:${tableKey}`) || "{}") as StoredLayout;
  } catch {
    return {};
  }
}

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const toolbarBtn =
  "inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle";

/**
 * Shared list grid: sorting, column show/hide, density, row selection + bulk bar,
 * sticky first column, CSV/XLSX export of the visible rows, and saved views.
 * Sorting is client-side over the rows passed in (one page for paginated lists).
 */
export function DataGrid<T>({
  tableKey,
  columns,
  rows,
  getRowId,
  loading = false,
  emptyState,
  exportName,
  bulkActions,
  savedViews,
  footer,
}: DataGridProps<T>) {
  const initial = useMemo(() => readLayout(tableKey), [tableKey]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [density, setDensity] = useState<GridDensity>(initial.density ?? "comfortable");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    const hidden = new Set(initial.hidden ?? columns.filter((c) => c.defaultHidden).map((c) => c.id));
    return Object.fromEntries(columns.map((c) => [c.id, !hidden.has(c.id) || !!c.alwaysVisible]));
  });
  const [colsOpen, setColsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const colsRef = useClickOutside(colsOpen, useCallback(() => setColsOpen(false), []));
  const exportRef = useClickOutside(exportOpen, useCallback(() => setExportOpen(false), []));

  const hiddenIds = useMemo(
    () => Object.entries(columnVisibility).filter(([, v]) => v === false).map(([k]) => k),
    [columnVisibility],
  );

  useEffect(() => {
    try {
      localStorage.setItem(`p7_grid:${tableKey}`, JSON.stringify({ hidden: hiddenIds, density }));
    } catch {
      /* storage full or disabled: layout just won't persist */
    }
  }, [tableKey, hiddenIds, density]);

  const selectable = !!bulkActions;
  const columnDefs = useMemo<ColumnDef<T>[]>(() => {
    const defs: ColumnDef<T>[] = columns.map((c) => ({
      id: c.id,
      header: c.header,
      accessorFn: (row: T) => c.value?.(row) ?? null,
      cell: (info) => c.cell(info.row.original),
      enableSorting: c.enableSorting ?? !!c.value,
      enableHiding: !c.alwaysVisible,
      meta: { align: c.align },
    }));
    if (selectable) {
      defs.unshift({
        id: "__select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all rows on this page"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label="Select row"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      });
    }
    return defs;
  }, [columns, selectable]);

  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => String(getRowId(row)),
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // New data (page change, filters) clears selection so bulk actions never hit off-screen rows.
  useEffect(() => {
    setRowSelection({});
  }, [rows]);

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = useCallback(() => setRowSelection({}), []);
  const visibleRows = table.getRowModel().rows.map((r) => r.original);
  const visibleColumns = columns.filter((c) => columnVisibility[c.id] !== false);
  const baseName = `${exportName ?? tableKey}-${todayLocalISO()}`;

  const getCurrentConfig = (): SavedViewConfig => ({
    query: savedViews?.getQuery(),
    sort: sorting.map((s) => ({ id: s.id, desc: s.desc })),
    hidden_columns: hiddenIds,
    density,
  });
  const applyConfig = (cfg: SavedViewConfig) => {
    if (cfg.query != null) savedViews?.applyQuery(cfg.query);
    setSorting(cfg.sort ?? []);
    if (cfg.density) setDensity(cfg.density);
    if (cfg.hidden_columns) {
      const hidden = new Set(cfg.hidden_columns);
      setColumnVisibility(Object.fromEntries(columns.map((c) => [c.id, !hidden.has(c.id) || !!c.alwaysVisible])));
    }
  };

  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";
  const firstDataColId = visibleColumns[0]?.id;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border px-3 py-2">
        {savedViews ? (
          <SavedViewsMenu tableKey={tableKey} getCurrentConfig={getCurrentConfig} applyConfig={applyConfig} />
        ) : null}
        <div ref={colsRef} className="relative">
          <button type="button" className={toolbarBtn} aria-expanded={colsOpen} onClick={() => setColsOpen((o) => !o)}>
            <Columns3 className="h-3.5 w-3.5" aria-hidden /> Columns
          </button>
          {colsOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
              {columns
                .filter((c) => !c.alwaysVisible)
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle">
                    <input
                      type="checkbox"
                      checked={columnVisibility[c.id] !== false}
                      onChange={(e) => setColumnVisibility((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                    {c.header}
                  </label>
                ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
          aria-label={`Switch to ${density === "compact" ? "comfortable" : "compact"} rows`}
        >
          <Rows3 className="h-3.5 w-3.5" aria-hidden /> {density === "compact" ? "Compact" : "Comfortable"}
        </button>
        <div ref={exportRef} className="relative">
          <button
            type="button"
            className={toolbarBtn}
            aria-expanded={exportOpen}
            disabled={visibleRows.length === 0}
            onClick={() => setExportOpen((o) => !o)}
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Export
          </button>
          {exportOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
              <button
                type="button"
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                onClick={() => {
                  exportCsv(visibleColumns, selectedRows.length ? selectedRows : visibleRows, baseName);
                  setExportOpen(false);
                }}
              >
                CSV {selectedRows.length ? `(${selectedRows.length} selected)` : "(current view)"}
              </button>
              <button
                type="button"
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                onClick={() => {
                  setExportOpen(false);
                  exportXlsx(visibleColumns, selectedRows.length ? selectedRows : visibleRows, baseName).catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Excel export failed"),
                  );
                }}
              >
                Excel .xlsx {selectedRows.length ? `(${selectedRows.length} selected)` : "(current view)"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {selectable && selectedRows.length > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-brand-primary/30 bg-brand-primary/5 px-3 py-2 text-xs"
        >
          <span className="font-semibold text-text-primary">{selectedRows.length} selected</span>
          {bulkActions!(selectedRows, clearSelection)}
          <button type="button" onClick={clearSelection} className="ml-auto text-text-muted underline">
            Clear
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="bg-surface-subtle">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: string } | undefined)?.align;
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn(
                        cellPad,
                        "text-xs font-semibold uppercase tracking-wide text-text-muted",
                        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                        h.column.id === firstDataColId && "sticky left-0 z-[1] bg-surface-subtle",
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-text-primary"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="animate-pulse border-t border-border-subtle">
                  {table.getVisibleLeafColumns().map((c) => (
                    <td key={c.id} className={cellPad}>
                      <div className="h-3.5 w-20 rounded bg-surface-subtle" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                  {emptyState ?? <div className="p-10 text-center text-sm text-text-muted">No records.</div>}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("border-t border-border-subtle hover:bg-surface-subtle/60", row.getIsSelected() && "bg-brand-primary/5")}
                >
                  {row.getVisibleCells().map((cell) => {
                    const align = (cell.column.columnDef.meta as { align?: string } | undefined)?.align;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          cellPad,
                          "align-top text-text-secondary",
                          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
                          cell.column.id === firstDataColId && "sticky left-0 z-[1] bg-surface-raised",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
