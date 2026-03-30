import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type AppPageHeaderProps = {
  title: string;
  description?: string;
  backTo?: { label: string; to: string };
  actions?: ReactNode;
  /** Optional KPI / summary strip below title row */
  belowTitle?: ReactNode;
  className?: string;
};

/**
 * Unified page header for CRM / operational modules (dense ERP layout).
 */
export function AppPageHeader({ title, description, backTo, actions, belowTitle, className = "" }: AppPageHeaderProps) {
  return (
    <header className={`space-y-3 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {backTo ? (
            <Link
              to={backTo.to}
              className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-brand-primary"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {backTo.label}
            </Link>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {belowTitle}
    </header>
  );
}
