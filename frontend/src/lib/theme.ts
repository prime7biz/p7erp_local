/** Theme helpers: localStorage key `p7_theme` = "light" | "dark". */

export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "p7_theme";

/** Return explicit stored preference, or null when following the OS. */
export function getStoredTheme(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

/** Resolve stored preference, or fall back to OS prefers-color-scheme. */
export function resolveTheme(): ThemePreference {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** Apply theme by toggling the `dark` class on <html>. */
export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function setTheme(theme: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function toggleTheme(): ThemePreference {
  const next: ThemePreference = resolveTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/**
 * When the user has not set `p7_theme`, keep the document in sync with the OS.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getStoredTheme() != null) return;
    applyTheme(mq.matches ? "dark" : "light");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

if (typeof window !== "undefined") {
  watchSystemTheme();
}
