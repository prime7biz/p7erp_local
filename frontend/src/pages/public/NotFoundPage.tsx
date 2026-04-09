import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="py-20 text-center px-4">
      <h1 className="text-3xl font-bold text-text-primary mb-4">Page not found</h1>
      <p className="text-text-secondary mb-8 max-w-md mx-auto">
        We couldn&apos;t find that page. Check the URL or open the site map.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg border border-border-strong bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          Home
        </Link>
        <Link
          to="/sitemap"
          className="inline-flex items-center rounded-lg border border-border-strong px-5 py-2.5 text-sm font-semibold text-text-secondary hover:bg-surface-subtle"
        >
          Site map
        </Link>
      </div>
    </section>
  );
}
