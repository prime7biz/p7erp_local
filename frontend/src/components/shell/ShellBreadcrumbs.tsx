import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { FlatNavRoute } from "@/components/shell/flattenMenuRoutes";
import { useRecordBreadcrumbLabel } from "@/components/shell/recordBreadcrumb";
import { normalizePath, resolveShellBreadcrumb } from "@/components/shell/resolveShellBreadcrumb";

export function ShellBreadcrumbs({ routes }: { routes: FlatNavRoute[] }) {
  const location = useLocation();
  const recordLabel = useRecordBreadcrumbLabel();
  const crumb = resolveShellBreadcrumb(location.pathname, routes);
  // The home dashboard is the root of the trail; "Home › Dashboard › Home" adds nothing.
  if (!crumb || normalizePath(location.pathname) === "/app") return null;
  const onRecord = recordLabel && normalizePath(location.pathname) !== crumb.href;

  return (
    <nav
      aria-label="Breadcrumb"
      className="no-print hidden border-b border-border-subtle bg-surface-raised px-3 py-1.5 text-xs text-text-muted md:flex md:px-4"
    >
      <ol className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap">
        <li>
          <Link to="/app" className="text-text-muted hover:text-brand-primary">
            Home
          </Link>
        </li>
        <li className="flex min-w-0 shrink items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-text-secondary">{crumb.module}</span>
        </li>
        {crumb.page !== crumb.module ? (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link
              to={crumb.href}
              className={onRecord ? "truncate text-text-secondary hover:text-brand-primary" : "truncate font-medium text-text-primary hover:text-brand-primary"}
            >
              {crumb.page}
            </Link>
          </li>
        ) : null}
        {onRecord ? (
          <li className="flex min-w-0 items-center gap-1" aria-current="page">
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="truncate font-medium text-text-primary">{recordLabel}</span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
