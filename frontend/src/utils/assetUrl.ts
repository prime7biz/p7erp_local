export function resolveSafeImageUrl(pathOrUrl: string | null | undefined): string | null {
  const raw = (pathOrUrl ?? "").trim();
  if (!raw) return null;

  // Ignore placeholder seed-data host so browser does not spam DNS errors.
  if (/^https?:\/\/cdn\.example\.com\//i.test(raw)) return null;

  if (/^https?:\/\//i.test(raw)) return raw;

  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return raw;
  return `${base}${raw.startsWith("/") ? raw : `/${raw}`}`;
}
