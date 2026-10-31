import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type EmptyIllustration =
  | "orders"
  | "shipments"
  | "tasks"
  | "production"
  | "search"
  | "generic";

export type EmptyStateProps = {
  headline: string;
  description?: string;
  /** Optional Lucide icon; used when no illustration */
  icon?: LucideIcon;
  /** Flat garment-themed SVG illustration */
  illustration?: EmptyIllustration;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  className?: string;
};

function Illustration({ kind }: { kind: EmptyIllustration }) {
  const common = "h-20 w-28 text-brand-primary";
  if (kind === "orders") {
    return (
      <svg viewBox="0 0 112 80" className={common} aria-hidden>
        <rect x="18" y="18" width="52" height="44" rx="6" fill="var(--color-brand-subtle)" stroke="currentColor" strokeWidth="2" />
        <path d="M28 30h32M28 40h24M28 50h18" stroke="var(--color-accent-secondary)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="84" cy="52" r="14" fill="var(--color-accent-secondary-subtle)" stroke="var(--color-accent-secondary)" strokeWidth="2" />
        <path d="M84 46v12M78 52h12" stroke="var(--color-accent-secondary)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "shipments") {
    return (
      <svg viewBox="0 0 112 80" className={common} aria-hidden>
        <rect x="14" y="28" width="48" height="30" rx="4" fill="var(--color-brand-subtle)" stroke="currentColor" strokeWidth="2" />
        <path d="M62 36h18l10 10v12H62V36z" fill="var(--color-accent-secondary-subtle)" stroke="var(--color-accent-secondary)" strokeWidth="2" />
        <circle cx="30" cy="62" r="7" fill="var(--color-surface-raised)" stroke="currentColor" strokeWidth="2" />
        <circle cx="78" cy="62" r="7" fill="var(--color-surface-raised)" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "tasks") {
    return (
      <svg viewBox="0 0 112 80" className={common} aria-hidden>
        <circle cx="56" cy="40" r="26" fill="var(--color-status-success-subtle)" stroke="var(--color-status-success)" strokeWidth="2" />
        <path d="M42 40l8 8 16-18" fill="none" stroke="var(--color-status-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "production") {
    return (
      <svg viewBox="0 0 112 80" className={common} aria-hidden>
        <path d="M20 55h72" stroke="var(--color-border-strong)" strokeWidth="2" />
        <rect x="24" y="28" width="18" height="27" rx="2" fill="var(--color-brand-subtle)" stroke="currentColor" strokeWidth="2" />
        <rect x="48" y="20" width="18" height="35" rx="2" fill="var(--color-accent-secondary-subtle)" stroke="var(--color-accent-secondary)" strokeWidth="2" />
        <rect x="72" y="34" width="18" height="21" rx="2" fill="var(--color-accent-tertiary-subtle)" stroke="var(--color-accent-tertiary)" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "search") {
    return (
      <svg viewBox="0 0 112 80" className={common} aria-hidden>
        <circle cx="48" cy="36" r="16" fill="var(--color-surface-subtle)" stroke="currentColor" strokeWidth="2" />
        <path d="M60 48l16 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M40 36h16" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 112 80" className={common} aria-hidden>
      <rect x="28" y="22" width="56" height="40" rx="8" fill="var(--color-surface-subtle)" stroke="currentColor" strokeWidth="2" />
      <path d="M40 42h32" stroke="var(--color-text-muted)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Shared empty-list / empty-panel placeholder with optional CTA + illustration.
 */
export function EmptyState({
  headline,
  description,
  icon: Icon = Inbox,
  illustration,
  ctaLabel,
  ctaHref,
  onCtaClick,
  className,
}: EmptyStateProps) {
  const showCta = Boolean(ctaLabel && (ctaHref || onCtaClick));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-subtle/40 px-6 py-10 text-center",
        className,
      )}
      role="status"
    >
      {illustration ? (
        <div className="mb-3">
          <Illustration kind={illustration} />
        </div>
      ) : (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised text-text-muted shadow-sm ring-1 ring-border-subtle">
          <Icon className="h-5 w-5 opacity-70" aria-hidden />
        </div>
      )}
      <p className="text-sm font-semibold text-text-primary">{headline}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-text-muted">{description}</p> : null}
      {showCta ? (
        ctaHref ? (
          <Link
            to={ctaHref}
            className="btn-press mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-brand-primary px-4 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-hover"
          >
            {ctaLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onCtaClick}
            className="btn-press mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-brand-primary px-4 text-xs font-semibold text-brand-primary-foreground hover:bg-brand-hover"
          >
            {ctaLabel}
          </button>
        )
      ) : null}
    </div>
  );
}
