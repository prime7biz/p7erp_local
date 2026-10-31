/** Persist recent + favorite app routes per user (localStorage only). */

export type NavShortcut = {
  href: string;
  label: string;
  section?: string;
};

const RECENTS_MAX = 5;
const FAVORITES_MAX = 8;

function recentsKey(userId: number) {
  return `p7_nav_recents_${userId}`;
}

function favoritesKey(userId: number) {
  return `p7_nav_favorites_${userId}`;
}

function readList(key: string): NavShortcut[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is NavShortcut =>
        !!row &&
        typeof row === "object" &&
        typeof (row as NavShortcut).href === "string" &&
        typeof (row as NavShortcut).label === "string",
    );
  } catch {
    return [];
  }
}

function writeList(key: string, rows: NavShortcut[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getNavRecents(userId: number): NavShortcut[] {
  return readList(recentsKey(userId)).slice(0, RECENTS_MAX);
}

export function pushNavRecent(userId: number, entry: NavShortcut) {
  if (!entry.href.startsWith("/app")) return;
  const next = [entry, ...getNavRecents(userId).filter((r) => r.href !== entry.href)].slice(0, RECENTS_MAX);
  writeList(recentsKey(userId), next);
}

export function getNavFavorites(userId: number): NavShortcut[] {
  return readList(favoritesKey(userId)).slice(0, FAVORITES_MAX);
}

export function isNavFavorite(userId: number, href: string): boolean {
  return getNavFavorites(userId).some((f) => f.href === href);
}

export function toggleNavFavorite(userId: number, entry: NavShortcut): NavShortcut[] {
  const current = getNavFavorites(userId);
  const exists = current.some((f) => f.href === entry.href);
  const next = exists
    ? current.filter((f) => f.href !== entry.href)
    : [entry, ...current].slice(0, FAVORITES_MAX);
  writeList(favoritesKey(userId), next);
  return next;
}
