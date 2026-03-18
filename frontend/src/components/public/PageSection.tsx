import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/** Standard wrapper for public sub-pages: back link, title, children, and optional CTA. */
export function PageSection({
  title,
  subtitle,
  backTo = "/",
  backLabel = "Back to Home",
  children,
  showCta = true,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  children: React.ReactNode;
  showCta?: boolean;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 lg:py-24">
      <Link to={backTo} className="text-sm text-brand-primary hover:underline mb-6 inline-flex items-center gap-1">
        ← {backLabel}
      </Link>
      <h1 className="text-3xl lg:text-4xl font-bold text-text-primary mb-2">{title}</h1>
      {subtitle && <p className="text-lg text-text-secondary mb-10 max-w-3xl leading-relaxed">{subtitle}</p>}
      <div className="text-text-secondary space-y-6 leading-relaxed">{children}</div>
      {showCta && (
        <div className="mt-12 pt-10 border-t border-border flex flex-wrap gap-4">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90 transition-colors"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
          >
            Contact Us
          </Link>
        </div>
      )}
    </div>
  );
}
