import { useEffect, useState } from "react";
import { MENU_OPEN_SECTION_KEY } from "@/api/authStorage";

/**
 * The one menu module that is open (desktop sidebar and phone "More" menu share it).
 * Only the user's own click changes it; opening a page does not. Sign-in and sign-out clear it
 * (`clearInternalSessionStorage`), so every new login starts with all modules closed.
 */
const CHANGE_EVENT = "p7:menu-open-section";

export function readOpenMenuSection(): string | null {
  try {
    return localStorage.getItem(MENU_OPEN_SECTION_KEY) || null;
  } catch {
    return null;
  }
}

export function saveOpenMenuSection(section: string | null): void {
  try {
    if (section) localStorage.setItem(MENU_OPEN_SECTION_KEY, section);
    else localStorage.removeItem(MENU_OPEN_SECTION_KEY);
  } catch {
    /* storage disabled / private mode: the choice lasts until the page reloads */
  }
  window.dispatchEvent(new CustomEvent<string | null>(CHANGE_EVENT, { detail: section }));
}

/** Open module + setter, kept in sync between the sidebar and the phone menu (both stay mounted). */
export function useOpenMenuSection(): [string | null, (section: string | null) => void] {
  const [openSection, setOpenSection] = useState<string | null>(readOpenMenuSection);
  useEffect(() => {
    const onChange = (e: Event) => setOpenSection((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  return [openSection, saveOpenMenuSection];
}
