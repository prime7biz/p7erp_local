import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";

function normalizePath(path: string) {
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

export function ShellBreadcrumbs({ routes }: { routes: FlatNavRoute[] }) {
  const location = useLocation();
  const crumb = resolveShellBreadcrumb(location.pathname, routes);
  if (!crumb) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden border-b border-border-subtle bg-surface-raised px-3 py-1.5 text-xs text-text-muted md:flex md:px-4"
    >
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        <li>
          <Link to="/app" className="text-text-muted hover:text-brand-primary">
            Home
          </Link>
        </li>
        <li className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-text-secondary">{crumb.module}</span>
        </li>
        {crumb.page !== crumb.module ? (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link to={crumb.href} className="truncate font-medium text-text-primary hover:text-brand-primary">
              {crumb.page}
            </Link>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
