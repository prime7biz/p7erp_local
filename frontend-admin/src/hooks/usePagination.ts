import { useCallback, useEffect, useState } from "react";

type UsePaginationArgs<T> = {
  fetchPage: (page: number) => Promise<{ items: T[]; total: number; page_size: number }>;
  initialPage?: number;
};

export function usePagination<T>({ fetchPage, initialPage = 1 }: UsePaginationArgs<T>) {
  const [page, setPage] = useState(initialPage);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetchPage(p);
        setItems(r.items);
        setTotal(r.total);
        setPageSize(r.page_size);
        setPage(p);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    load(page);
  }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    setPage,
    items,
    total,
    pageSize,
    totalPages,
    loading,
    err,
    reload: () => load(page),
  };
}
