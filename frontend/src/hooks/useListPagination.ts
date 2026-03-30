import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "p7_list_page_size";

const ALLOWED = [10, 20, 50] as const;
export type ListPageSize = (typeof ALLOWED)[number];

function readStoredPageSize(): ListPageSize {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (ALLOWED.includes(n as ListPageSize)) return n as ListPageSize;
  } catch {
    /* ignore */
  }
  return 10;
}

/**
 * Shared list pagination: page, pageSize (10/20/50), persisted in localStorage.
 * Resets to page 1 when pageSize changes.
 */
export function useListPagination() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<ListPageSize>(() =>
    typeof window !== "undefined" ? readStoredPageSize() : 10,
  );

  const setPageSize = useCallback((size: ListPageSize) => {
    setPageSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEY, String(size));
    } catch {
      /* ignore */
    }
    setPage(1);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredPageSize();
    setPageSizeState((prev) => (prev === stored ? prev : stored));
  }, []);

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    offset,
    limit: pageSize,
    allowedSizes: ALLOWED,
  };
}
