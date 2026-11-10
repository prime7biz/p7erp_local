import { useEffect, useMemo, useRef, useState } from "react";
import { logApiError } from "@/utils/logApiError";

export interface HrOption {
  value: number;
  label: string;
}

/**
 * Load a small master list once (leave types, candidates, payroll runs…) for drop-downs and
 * for showing names instead of ids in tables. `labelOf(id)` falls back to "#id".
 */
export function useHrOptions<T>(
  cacheKey: string,
  load: () => Promise<T[]>,
  toOption: (row: T) => HrOption,
): { options: HrOption[]; labelOf: (id: number | null | undefined) => string; loaded: boolean } {
  const loadRef = useRef(load);
  loadRef.current = load;
  const mapRef = useRef(toOption);
  mapRef.current = toOption;
  const [options, setOptions] = useState<HrOption[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((rows) => {
        if (!cancelled) setOptions(rows.map((r) => mapRef.current(r)));
      })
      .catch((err: unknown) => logApiError(`useHrOptions.${cacheKey}`, err))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const byId = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const labelOf = (id: number | null | undefined) => (id == null ? "-" : (byId.get(id) ?? `#${id}`));
  return { options, labelOf, loaded };
}
