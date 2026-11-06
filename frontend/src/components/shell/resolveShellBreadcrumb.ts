import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";

export function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** Resolve module + page labels from entitled flat nav routes. */
export function resolveShellBreadcrumb(pathname: string, routes: FlatNavRoute[]) {
  const path = normalizePath(pathname);
  if (path === "/app") {
    return { module: "Dashboard", page: "Home", href: "/app" };
  }
  const matches = routes.filter(
    (r) => path === r.href || (r.href !== "/app" && path.startsWith(`${r.href}/`)),
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.href.length - a.href.length);
  const hit = matches[0];
  if (!hit) return null;
  const moduleLabel = hit.section.split(" · ")[0] ?? hit.section;
  return { module: moduleLabel, page: hit.label, href: hit.href };
}
