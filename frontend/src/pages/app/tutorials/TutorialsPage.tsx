import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, MapPin, Search, Sparkles } from "lucide-react";
import { getFeaturedArticles, tutorialSections, searchTutorialArticles } from "@/data/tutorials";
import type { TutorialArticle } from "@/data/tutorials/types";

/** Featured step-by-step guides (quick entry points on the hub). */
const QUICK_GUIDE_LINKS = [
  { id: "fin-voucher-entry", label: "Voucher entry" },
  { id: "fin-voucher-approval-queue", label: "Voucher approvals" },
  { id: "merch-create-inquiry", label: "Create inquiry" },
  { id: "merch-quotation-to-order", label: "Quotation to order" },
  { id: "inv-po-deep", label: "Purchase order" },
  { id: "inv-grn-deep", label: "Goods receiving" },
  { id: "mfg-planning-deep", label: "Production planning" },
  { id: "sup-create-ticket", label: "Support ticket" },
] as const;

function sortArticles(a: TutorialArticle, b: TutorialArticle): number {
  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title);
}

export function TutorialsPage() {
  const [query, setQuery] = useState("");

  const featuredArticles = useMemo(() => getFeaturedArticles(tutorialSections).sort(sortArticles), []);

  const sectionsToShow = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return tutorialSections.map((sec) => ({
        ...sec,
        articles: [...sec.articles].sort(sortArticles),
      }));
    }
    const matched = new Set(searchTutorialArticles(q).map((a) => a.id));
    return tutorialSections
      .map((sec) => ({
        ...sec,
        articles: [...sec.articles].filter((a) => matched.has(a.id)).sort(sortArticles),
      }))
      .filter((sec) => sec.articles.length > 0);
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Help & Tutorials</h1>
        <p className="mt-1 text-sm text-text-muted">
          Guides aligned with the live sidebar and workflows. When the product changes, these articles are updated together
          with the code (see project maintenance rules).
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, tag, summary, or keyword…"
          className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          aria-label="Search tutorials"
        />
      </div>

      {!query.trim() && featuredArticles.length > 0 ? (
        <div className="rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
            Featured workflows
          </p>
          <p className="mt-1 text-sm text-text-secondary">High-traffic tasks with visuals and route links.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {featuredArticles.map((article) => {
              const sec = tutorialSections.find((s) => s.articles.some((x) => x.id === article.id));
              const n = article.relatedAppRoutes.length;
              return (
                <li key={article.id}>
                  <Link
                    to={`/app/tutorials/${article.id}`}
                    className="block rounded-lg border border-border bg-surface-raised p-3 text-left no-underline transition hover:border-brand-primary/40"
                  >
                    <span className="font-medium text-text-primary">{article.title}</span>
                    {article.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-text-muted">{article.summary}</p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                      {sec ? <span>{sec.title}</span> : null}
                      {sec ? <span aria-hidden>·</span> : null}
                      <span>Updated {article.lastUpdated}</span>
                      {n > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" aria-hidden />
                            {n} route{n === 1 ? "" : "s"}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!query.trim() ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Quick guides</p>
          <p className="mt-1 text-sm text-text-secondary">Common tasks — step-by-step articles.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_GUIDE_LINKS.map((g) => (
              <Link
                key={g.id}
                to={`/app/tutorials/${g.id}`}
                className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-text-primary no-underline hover:border-brand-primary/50"
              >
                {g.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {sectionsToShow.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center text-sm text-text-secondary">
          No articles match your search. Try another keyword or clear the search box.
        </div>
      ) : (
        <div className="space-y-8">
          {sectionsToShow.map((section) => (
            <section key={section.id} className="space-y-3">
              <div className="flex items-start gap-2">
                <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{section.title}</h2>
                  <p className="text-sm text-text-muted">{section.description}</p>
                </div>
              </div>
              <ul className="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">
                {section.articles.map((article) => {
                  const n = article.relatedAppRoutes.length;
                  const summary = article.summary ?? "";
                  return (
                    <li key={article.id}>
                      <Link
                        to={`/app/tutorials/${article.id}`}
                        className="block rounded-xl border border-border bg-surface-raised p-4 transition hover:border-brand-primary/40 hover:bg-surface-subtle no-underline"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-text-primary">{article.title}</span>
                          {article.featured ? (
                            <span className="shrink-0 rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
                              Featured
                            </span>
                          ) : null}
                        </div>
                        {summary ? (
                          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-text-secondary">{summary}</p>
                        ) : null}
                        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                          <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-1.5 py-0.5">
                            {section.title}
                          </span>
                          <span aria-hidden>·</span>
                          <span>Updated {article.lastUpdated}</span>
                          {n > 0 ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin className="h-3 w-3" aria-hidden />
                                {n} screen{n === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                          {article.tags.length > 0 ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="truncate">{article.tags.slice(0, 4).join(", ")}</span>
                            </>
                          ) : null}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
