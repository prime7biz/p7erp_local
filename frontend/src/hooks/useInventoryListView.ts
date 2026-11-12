import { useCallback, useEffect, useState } from "react";
import { PHONE_MEDIA_QUERY } from "@/lib/mobileUi";

const STORAGE_KEY = "p7_inventory_list_view_v1";

export type ListView = "table" | "cards";

function matchesNow(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Live media query: updates when the phone is rotated or the window is resized. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchesNow(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

function readListView(storageKey: string): ListView | null {
  try {
    const s = localStorage.getItem(storageKey);
    return s === "cards" || s === "table" ? s : null;
  } catch {
    return null;
  }
}

/**
 * Cards vs Table for one list with the tenant switch `mobile_ui_v2` (`enabled`).
 * Phones (below 768px) start on Cards; the choice is saved per list (`p7_list_view:<tableKey>`)
 * only when the user taps the toggle, so visiting on a desktop never changes the phone default.
 * The old shared inventory key is not read: it is written automatically on desktop as "table".
 */
export function useResponsiveListPreference(tableKey: string, enabled: boolean) {
  const storageKey = `p7_list_view:${tableKey}`;
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const [view, setViewState] = useState<ListView>(() => readListView(storageKey) ?? "cards");

  const setView = useCallback(
    (v: ListView) => {
      setViewState(v);
      try {
        localStorage.setItem(storageKey, v);
      } catch {
        /* storage full or disabled: the choice lasts until the page is reopened */
      }
    },
    [storageKey],
  );

  return { isPhone, view, setView, showCards: enabled && isPhone && view === "cards", showToggle: enabled && isPhone };
}

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
