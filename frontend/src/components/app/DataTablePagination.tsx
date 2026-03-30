import type { ListPageSize } from "@/hooks/useListPagination";

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  /** Total row count; use -1 when unknown (offset/limit APIs without total). */
  total: number;
  /** When total is unknown: true if another page exists after current. */
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ListPageSize) => void;
  allowedSizes?: readonly ListPageSize[];
  className?: string;
}

function visiblePageNumbers(page: number, totalPages: number): number[] {
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);
  return pages;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  hasNextPage = false,
  onPageChange,
  onPageSizeChange,
  allowedSizes = [10, 20, 50],
  className = "",
}: DataTablePaginationProps) {
  const unknownTotal = total < 0;
  const totalPages = unknownTotal ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = unknownTotal ? page : Math.min(page, totalPages);
  const from = unknownTotal
    ? total === 0
      ? 0
      : (page - 1) * pageSize + 1
    : total === 0
      ? 0
      : (safePage - 1) * pageSize + 1;
  const to = unknownTotal
    ? (page - 1) * pageSize + pageSize
    : Math.min(safePage * pageSize, total);

  const pageButtons = unknownTotal ? [] : visiblePageNumbers(safePage, totalPages);

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {unknownTotal ? (
            <>
              Showing rows {from}–{to}
              {total === 0 ? "" : " (next/prev for more)"}
            </>
          ) : (
            <>
              Showing {from} to {to} of {total}
            </>
          )}
        </span>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-text-muted">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as ListPageSize)}
            className="rounded-md border border-border-strong bg-surface-raised px-2 py-1 text-xs text-text-primary"
          >
            {allowedSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        {!unknownTotal &&
          pageButtons.map((pageNo) => (
            <button
              key={pageNo}
              type="button"
              onClick={() => onPageChange(pageNo)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                pageNo === safePage
                  ? "bg-brand-primary text-brand-primary-foreground"
                  : "border border-border-strong text-text-secondary hover:bg-surface-subtle"
              }`}
            >
              {pageNo}
            </button>
          ))}
        {unknownTotal && (
          <span className="px-2 text-xs">
            Page {page}
          </span>
        )}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={unknownTotal ? !hasNextPage : page >= totalPages}
          className="rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
