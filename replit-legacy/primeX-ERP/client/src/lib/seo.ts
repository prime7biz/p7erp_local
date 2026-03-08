const SITE_URL = "https://prime7erp.com";

export function buildCanonical(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (cleanPath === "/") {
    return `${SITE_URL}/`;
  }
  return `${SITE_URL}${cleanPath.replace(/\/+$/, "")}`;
}

export function buildBreadcrumb(items: Array<{ name: string; path: string }>): Array<{ name: string; url: string }> {
  return items.map((item) => ({
    name: item.name,
    url: buildCanonical(item.path),
  }));
}
