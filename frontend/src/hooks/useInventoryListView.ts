import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "p7_inventory_list_view_v1";

function readStoredView(): "table" | "cards" {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s === "cards" || s === "table") return s;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.innerWidth < 768) return "cards";
  return "table";
}

/** True when viewport is at most `maxPx` wide (mobile / small tablet). */
export function useIsNarrowScreen(maxPx = 768): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [maxPx]);
  return matches;
}

/**
 * Persisted Table vs Cards preference for inventory list pages (Phase 4.5).
 * On narrow screens, user can switch; on desktop, always use the table.
 */
export function useListViewPreference() {
  const isNarrow = useIsNarrowScreen(768);
  const [view, setView] = useState<"table" | "cards">(readStoredView);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const showCards = isNarrow && view === "cards";
  const setViewSafe = useCallback((v: "table" | "cards") => setView(v), []);

  return { isNarrow, view, setView: setViewSafe, showCards };
}
