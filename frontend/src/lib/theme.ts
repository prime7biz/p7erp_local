/**
 * Theme helpers. The app is light-only: most pages and print layouts have no dark styles,
 * so the OS dark setting and any old `p7_theme` value are ignored.
 * The exports stay so older imports keep compiling; none of them can turn dark mode on.
 */

export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "p7_theme";

/** Always null: there is no stored preference any more. */
export function getStoredTheme(): ThemePreference | null {
  return null;
}

export function resolveTheme(): ThemePreference {
  return "light";
}

/** Always applies light mode (removes the `dark` class on <html>). */
export function applyTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark");
}

/** Clears any old saved choice and applies light mode. */
export function setTheme() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    /* private mode / blocked storage */
  }
  applyTheme();
}

export function toggleTheme(): ThemePreference {
  setTheme();
  return "light";
}

/** No-op kept for compatibility: the app no longer follows the OS theme. */
export function watchSystemTheme(): () => void {
  return () => {};
}

if (typeof window !== "undefined") {
  setTheme();
}
