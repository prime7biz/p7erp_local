import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PUBLIC_MARKETING_PATHS } from "@/config/publicMarketingPaths";
import { resourceArticles } from "@/data/resourcesArticles";

const linkClass =
  "text-sm text-brand-primary hover:text-brand-primary/80 underline-offset-2 hover:underline";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold text-text-primary border-b border-border-subtle pb-2 mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SitemapPage() {
  const core = PUBLIC_MARKETING_PATHS.filter(
    (p) =>
      p !== "/" &&
      !p.startsWith("/legal/") &&
      p !== "/resources" &&
      !p.startsWith("/resources/"),
  ).sort((a, b) => a.localeCompare(b));

  const legal = PUBLIC_MARKETING_PATHS.filter((p) => p.startsWith("/legal/")).sort((a, b) =>
    a.localeCompare(b),
  );

  const articles = [...resourceArticles].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-bold text-text-primary mb-3">Site map</h1>
      <p className="text-text-secondary mb-10">
        Public pages and articles on Prime7 ERP. For the XML sitemap used by search engines, see{" "}
        <a href="/sitemap.xml" className={linkClass}>
          sitemap.xml
        </a>
        .
      </p>

      <Section title="Home">
        <ul className="space-y-2">
          <li>
            <Link to="/" className={linkClass}>
              Home
            </Link>
          </li>
        </ul>
      </Section>

      <Section title="Product & company">
        <ul className="space-y-2 columns-1 sm:columns-2 gap-x-8">
          {core.map((path) => (
            <li key={path} className="break-inside-avoid mb-2">
              <Link to={path} className={linkClass}>
                {path}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Resources hub">
        <ul className="space-y-2">
          <li>
            <Link to="/resources" className={linkClass}>
              /resources — Industry insights
            </Link>
          </li>
        </ul>
      </Section>

      <Section title={`Articles (${articles.length})`}>
        <ul className="space-y-2">
          {articles.map((a) => (
            <li key={a.slug}>
              <Link to={`/resources/${a.slug}`} className={linkClass}>
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Legal & trust">
        <ul className="space-y-2">
          {legal.map((path) => (
            <li key={path}>
              <Link to={path} className={linkClass}>
                {path}
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
