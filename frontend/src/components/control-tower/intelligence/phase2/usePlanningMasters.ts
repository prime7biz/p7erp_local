import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export interface SimpleOption {
  id: number;
  label: string;
  active: boolean;
}

/** Sewing lines and production shifts for drop-downs (loaded once per tab). */
export function usePlanningMasters(enabled: boolean) {
  const [lines, setLines] = useState<SimpleOption[]>([]);
  const [shifts, setShifts] = useState<SimpleOption[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Promise.all([api.listSewingLines(), api.listProductionShifts()])
      .then(([l, s]) => {
        if (!alive) return;
        setLines(l.map((x) => ({ id: x.id, label: `${x.line_code} · ${x.name}`, active: x.is_active })));
        setShifts(s.map((x) => ({ id: x.id, label: `${x.shift_code} · ${x.name}`, active: x.is_active })));
      })
      .catch((e: unknown) => {
        logApiError("usePlanningMasters", e);
        if (alive) setError("Could not load sewing lines / shifts. Reload the page or check your production setup access.");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  const lineLabel = (id: number | null | undefined) => (id == null ? "—" : (lines.find((l) => l.id === id)?.label ?? `Line #${id}`));
  return { lines, shifts, error, lineLabel };
}
