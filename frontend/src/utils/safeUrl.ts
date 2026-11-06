/**
 * URL safety helpers for links built from data (customer websites, AI suggestions, `?next=`).
 *
 * A link like `javascript:alert(1)` in a database field would run code when clicked, so dynamic
 * `href`s must go through `safeHref`.
 */

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Returns a safe `href` or `undefined` (render plain text / a disabled link instead).
 * Allows http(s), mailto, tel and same-site relative paths (`/app/...`, `#id`, `?q=`).
 * With `assumeHttps`, a bare domain like `example.com` becomes `https://example.com`.
 */
export function safeHref(
  raw: string | null | undefined,
  options: { assumeHttps?: boolean } = {},
): string | undefined {
  if (raw == null) return undefined;
  // Browsers ignore control characters and whitespace inside the scheme ("java\tscript:").
  // eslint-disable-next-line no-control-regex
  const value = String(raw).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!value) return undefined;
  if (value.startsWith("//") || value.startsWith("\\")) return undefined;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) return value;

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (!scheme) {
    if (options.assumeHttps && /^[\w-]+(\.[\w-]+)+([/?#:].*)?$/.test(value)) return `https://${value}`;
    return undefined;
  }
  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Accepts only same-site paths for post-login redirects (`/app/orders`), never `//evil.com`
 * or `https://evil.com`. Returns null when the value is not safe.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.startsWith("/\\")) return null;
  return t;
}
