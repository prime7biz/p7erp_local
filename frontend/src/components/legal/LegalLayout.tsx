import { NavLink, Outlet, Link } from "react-router-dom";
import { Printer, FileDown } from "lucide-react";

const LEGAL_DOC_NAV = [
  { to: "/legal/terms", label: "Terms of Service" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/dpa", label: "Data Processing Agreement" },
  { to: "/legal/ai-disclaimer", label: "AI Disclaimer" },
] as const;

const TRUST_NAV = [
  { to: "/legal/sla", label: "SLA" },
  { to: "/legal/security-compliance", label: "Security & Compliance" },
  { to: "/trust-center", label: "Trust Center" },
] as const;

const navClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
      : "text-text-secondary hover:bg-surface-subtle hover:text-text-primary border border-transparent"
  }`;

export function LegalLayout() {
  return (
    <div className="py-10 lg:py-16 bg-surface-raised min-h-[70vh] print:bg-white print:py-4">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="no-print text-sm text-brand-primary hover:underline inline-flex items-center gap-1 mb-6"
        >
          ← Back to Home
        </Link>

        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <aside className="no-print lg:w-56 shrink-0 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Legal</p>
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 lg:overflow-visible" aria-label="Legal documents">
                {LEGAL_DOC_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navClass} end>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Trust</p>
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0 lg:overflow-visible" aria-label="Trust and reliability">
                {TRUST_NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} className={navClass} end>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="no-print flex flex-wrap items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-subtle transition-colors"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden />
                Print
              </button>
              <button
                type="button"
                disabled
                title="PDF export will be available in a future release"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-text-muted cursor-not-allowed opacity-80"
              >
                <FileDown className="h-3.5 w-3.5" aria-hidden />
                Export PDF (soon)
              </button>
            </div>

            <article className="legal-print-doc rounded-xl border border-border bg-surface-raised lg:bg-white/90 shadow-sm p-6 sm:p-8 lg:p-10 print:shadow-none print:border-0 print:bg-white print:p-0">
              <Outlet />
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
