import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useEmbeddedPage } from "@/components/app/embeddedPage";

type AppPageHeaderProps = {
  title: string;
  description?: string;
  backTo?: { label: string; to: string };
  actions?: ReactNode;
  /** Optional KPI / summary strip below title row */
  belowTitle?: ReactNode;
  className?: string;
  /** Compact ERP density (default). Use `comfortable` for marketing-like pages. */
  density?: "compact" | "comfortable";
};

/**
 * Unified page header for CRM / operational modules (dense ERP layout).
 */
export function AppPageHeader({
  title,
  description,
  backTo,
  actions,
  belowTitle,
  className = "",
  density = "compact",
}: AppPageHeaderProps) {
  const embedded = useEmbeddedPage();
  const titleClass =
    density === "comfortable"
      ? "text-2xl font-bold tracking-tight text-text-primary sm:text-3xl"
      : "text-lg font-semibold tracking-tight text-text-primary sm:text-xl";

  if (embedded) {
    if (!description && !actions && !belowTitle) return null;
    return (
      <header className={`space-y-2 ${className}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          {description ? <p className="min-w-0 max-w-3xl text-sm text-text-muted">{description}</p> : <span />}
          {actions ? <div className="no-print flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
        </div>
        {belowTitle}
      </header>
    );
  }

  return (
    <header className={`space-y-2 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {backTo ? (
            <Link
              to={backTo.to}
              className="mb-0.5 inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-brand-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              {backTo.label}
            </Link>
          ) : null}
          <h1 className={`${titleClass} break-words`}>{title}</h1>
          {description ? <p className="mt-0.5 max-w-3xl text-sm text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="no-print flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div> : null}
      </div>
      {belowTitle}
    </header>
  );
}
