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
    <div className="max-w-4xl mx-auto px-4 py-12 lg:py-16">
      <Link to={backTo} className="text-sm text-primary hover:underline mb-6 inline-flex items-center gap-1">
        ← {backLabel}
      </Link>
      <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">{title}</h1>
      {subtitle && <p className="text-lg text-gray-600 mb-10">{subtitle}</p>}
      <div className="text-gray-600 space-y-6">{children}</div>
      {showCta && (
        <div className="mt-12 pt-10 border-t border-gray-200 flex flex-wrap gap-4">
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Contact Us
          </Link>
        </div>
      )}
    </div>
  );
}
