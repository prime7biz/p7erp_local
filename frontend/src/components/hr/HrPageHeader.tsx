import { Link } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function HrPageHeader(props: {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
}) {
  const { title, description, breadcrumbs } = props;
  return (
    <div className="space-y-1">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
          {breadcrumbs.map((b, i) => (
            <span key={`${b.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? <span className="text-text-muted">/</span> : null}
              {b.href ? (
                <Link to={b.href} className="hover:text-text-primary">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      {description ? <p className="text-sm text-text-muted">{description}</p> : null}
    </div>
  );
}
