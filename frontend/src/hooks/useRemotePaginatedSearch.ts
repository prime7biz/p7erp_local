import { useCallback, useEffect, useRef, useState } from "react";

/** One row in a remote dropdown (id + display label). */
export type RemoteSelectOption<T = unknown> = {
  value: number;
  label: string;
  meta?: T;
};

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export interface UseRemotePaginatedSearchParams<T> {
  valueId: number | null | "";
  debounceMs?: number;
  pageSize?: number;
  fetchPage: (
    query: string,
    page: number,
    pageSize: number,
  ) => Promise<{ options: RemoteSelectOption<T>[]; total: number }>;
  hydrateById?: (id: number) => Promise<RemoteSelectOption<T> | null>;
  enabled?: boolean;
}

/**
 * Debounced server search + paginated options for async selects.
 * Uses a monotonic sequence number so slow responses do not overwrite newer results.
 */
export function useRemotePaginatedSearch<T = unknown>({
  valueId,
  debounceMs = 300,
  pageSize = 40,
  fetchPage,
  hydrateById,
  enabled = true,
}: UseRemotePaginatedSearchParams<T>) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedQuery = useDebouncedValue(searchInput, debounceMs);
  const [options, setOptions] = useState<RemoteSelectOption<T>[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState<RemoteSelectOption<T> | null>(null);
  const listSeq = useRef(0);
  const appendSeq = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const numericValue = valueId === "" || valueId === null ? null : Number(valueId);

  useEffect(() => {
    if (numericValue == null || !Number.isFinite(numericValue) || numericValue <= 0) {
      setHydrated(null);
      return;
    }
    if (!hydrateById) {
      setHydrated(null);
      return;
    }
    let cancel = false;
    void hydrateById(numericValue).then((opt) => {
      if (!cancel && opt) setHydrated(opt);
    });
    return () => {
      cancel = true;
    };
  }, [numericValue, hydrateById]);

  const resetAndFetch = useCallback(async () => {
    if (!enabled || !open) return;
    const seq = ++listSeq.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetchPageRef.current(debouncedQuery.trim(), 1, pageSize);
      if (seq !== listSeq.current) return;
      setOptions(res.options);
      setTotal(res.total);
      setPage(1);
    } catch (e) {
      if (seq !== listSeq.current) return;
      setError(e instanceof Error ? e.message : "Load failed");
      setOptions([]);
      setTotal(0);
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [enabled, open, debouncedQuery, pageSize]);

  useEffect(() => {
    void resetAndFetch();
  }, [resetAndFetch]);

  const loadMore = useCallback(async () => {
    if (!enabled || !open || loadingMore) return;
    if (options.length >= total) return;
    const nextPage = page + 1;
    const seq = ++appendSeq.current;
    setLoadingMore(true);
    setError("");
    try {
      const res = await fetchPageRef.current(debouncedQuery.trim(), nextPage, pageSize);
      if (seq !== appendSeq.current) return;
      setPage(nextPage);
      setOptions((prev) => {
        const seen = new Set(prev.map((o) => o.value));
        const add = res.options.filter((o) => !seen.has(o.value));
        return [...prev, ...add];
      });
    } catch (e) {
      if (seq === appendSeq.current) {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    } finally {
      if (seq === appendSeq.current) setLoadingMore(false);
    }
  }, [enabled, open, loadingMore, page, options.length, total, debouncedQuery, pageSize]);

  const selectedLabel = (() => {
    if (numericValue == null) return "";
    const fromList = options.find((o) => o.value === numericValue);
    if (fromList) return fromList.label;
    if (hydrated && hydrated.value === numericValue) return hydrated.label;
    return "";
  })();

  return {
    open,
    setOpen,
    searchInput,
    setSearchInput,
    options,
    total,
    page,
    loading,
    loadingMore,
    error,
    loadMore,
    hasMore: total > 0 && options.length < total,
    selectedLabel,
    hydrated,
    numericValue,
  };
}
