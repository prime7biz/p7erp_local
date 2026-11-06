import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListTree,
  MapPin,
  PlayCircle,
  Printer,
} from "lucide-react";
import { getArticleById, getSectionForArticle, tutorialSections } from "@/data/tutorials";
import { menuSections } from "@/app/sidebarConfig";
import { flattenMenuRoutes } from "@/components/shell/flattenMenuRoutes";
import { TutorialMarkdown } from "./TutorialMarkdown";
import { TutorialInfographicBlocks } from "./TutorialInfographicBlocks";
import { TutorialImageGrid } from "./TutorialImageGrid";
import { TutorialVideoList } from "./TutorialVideo";
import { extractTocHeadings, sortArticles, type TocHeading } from "./tutorialUi";

const routeLabels = new Map(flattenMenuRoutes(menuSections).map((r) => [r.href, r.label]));

function routeLabel(route: string): string {
  return routeLabels.get(route) ?? route;
}

function printArticle() {
  const cleanup = () => {
    document.body.classList.remove("print-tutorial");
    window.removeEventListener("afterprint", cleanup);
  };
  document.body.classList.add("print-tutorial");
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function TableOfContents({ headings }: { headings: TocHeading[] }) {
  return (
    <nav aria-label="On this page">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <ListTree className="h-3.5 w-3.5" aria-hidden />
        On this page
      </p>
      <ul className="mt-2 space-y-1 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className="-ml-px block border-l border-transparent py-0.5 pl-3 text-xs text-text-secondary no-underline hover:border-brand-primary hover:text-brand-primary"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TutorialArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();
  const article = articleId ? getArticleById(tutorialSections, articleId) : undefined;
  const section = article && articleId ? getSectionForArticle(tutorialSections, articleId) : undefined;
  const headings = useMemo(() => (article ? extractTocHeadings(article.content) : []), [article]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const target = hash ? document.getElementById(decodeURIComponent(hash)) : null;
    if (target) target.scrollIntoView();
    else document.getElementById("main-content")?.scrollTo({ top: 0 });
  }, [articleId]);

  if (!article) {
    return (
      <div className="space-y-6">
        <Link
          to="/app/tutorials"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary no-underline hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Help & Tutorials
        </Link>
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">Article not found</h1>
          <p className="mt-2 text-sm text-text-muted">
            This guide does not exist or the link is outdated. Try the Help hub or search from the sidebar.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              to="/app/tutorials"
              className="rounded-lg border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text-primary no-underline hover:border-brand-primary/50"
            >
              Open Help & Tutorials
            </Link>
            <Link
              to="/app"
              className="rounded-lg border border-border bg-surface-subtle px-4 py-2 text-sm font-medium text-text-primary no-underline hover:border-brand-primary/50"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const related = [...(article.relatedArticleIds ?? [])]
    .map((id) => getArticleById(tutorialSections, id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .sort(sortArticles);

  const siblings = section ? [...section.articles].sort(sortArticles) : [];
  const index = siblings.findIndex((a) => a.id === article.id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  const routeCount = article.relatedAppRoutes.length;
  const summary = article.summary ?? "";
  const showToc = headings.length >= 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          to="/app/tutorials"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary no-underline hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Help & Tutorials
        </Link>
        <button
          type="button"
          onClick={printArticle}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-primary/50"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print
        </button>
      </div>

      <div className={showToc ? "lg:grid lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start lg:gap-6" : undefined}>
        <article
          id="tutorial-print-area"
          className="overflow-hidden rounded-xl border border-border bg-surface-raised print:overflow-visible print:border-0"
        >
          {article.coverImage ? (
            <div className="border-b border-border bg-surface-subtle print:hidden">
              <img
                src={article.coverImage}
                alt={`Cover illustration: ${article.title}`}
                className="mx-auto max-h-48 w-full object-contain px-4 py-3"
                loading="lazy"
              />
            </div>
          ) : null}

          <div className="p-6 sm:p-8 print:p-0">
            <header className="border-b border-border pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                {section ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 font-medium text-text-secondary">
                    <BookMarked className="h-3.5 w-3.5" aria-hidden />
                    {section.title}
                  </span>
                ) : null}
                <span>Updated {article.lastUpdated}</span>
                {article.estimatedMinutes ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {article.estimatedMinutes} min
                  </span>
                ) : null}
                {article.videos && article.videos.length > 0 ? (
                  <span className="inline-flex items-center gap-1 print:hidden">
                    <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                    {article.videos.length} video{article.videos.length === 1 ? "" : "s"}
                  </span>
                ) : null}
                {routeCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {routeCount} related screen{routeCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-text-primary">{article.title}</h1>
              {summary ? <p className="mt-2 text-sm leading-relaxed text-text-secondary">{summary}</p> : null}
              {article.tags.length > 0 ? (
                <p className="mt-2 text-xs text-text-muted">Tags: {article.tags.join(", ")}</p>
              ) : null}
            </header>

            {showToc ? (
              <details className="mt-4 rounded-lg border border-border bg-surface-subtle px-3 py-2 lg:hidden print:hidden">
                <summary className="cursor-pointer text-xs font-semibold text-text-secondary">
                  On this page ({headings.length})
                </summary>
                <div className="mt-2">
                  <TableOfContents headings={headings} />
                </div>
              </details>
            ) : null}

            {article.videos && article.videos.length > 0 ? (
              <div className="mt-6 print:hidden">
                <TutorialVideoList videos={article.videos} />
              </div>
            ) : null}

            {article.infographics && article.infographics.length > 0 ? (
              <div className="mt-6">
                <TutorialInfographicBlocks items={article.infographics} />
              </div>
            ) : null}

            <TutorialMarkdown source={article.content} />

            {article.images && article.images.length > 0 ? (
              <div className="mt-8 border-t border-border pt-6">
                <h2 className="text-sm font-semibold text-text-primary">Visuals</h2>
                <TutorialImageGrid images={article.images} />
              </div>
            ) : null}

            {article.relatedAppRoutes.length > 0 ? (
              <div className="mt-8 border-t border-border pt-6 print:hidden">
                <h2 className="text-sm font-semibold text-text-primary">Related screens in the app</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Open from the sidebar or use the links below (same screens as the live app).
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {article.relatedAppRoutes.map((route) => (
                    <li key={route}>
                      <Link
                        to={route}
                        title={route}
                        className="inline-flex items-center rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-text-primary no-underline hover:border-brand-primary/50"
                      >
                        {routeLabel(route)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {related.length > 0 ? (
              <div className="mt-6 border-t border-border pt-6 print:hidden">
                <h2 className="text-sm font-semibold text-text-primary">Related guides</h2>
                <ul className="mt-2 space-y-1">
                  {related.map((a) => (
                    <li key={a.id}>
                      <Link to={`/app/tutorials/${a.id}`} className="text-sm text-brand-primary hover:underline">
                        {a.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {previous || next ? (
              <nav
                aria-label="More guides in this section"
                className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2 print:hidden"
              >
                {previous ? (
                  <Link
                    to={`/app/tutorials/${previous.id}`}
                    className="group rounded-lg border border-border p-3 no-underline hover:border-brand-primary/50"
                  >
                    <span className="flex items-center gap-1 text-[11px] text-text-muted">
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      Previous
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-text-primary group-hover:text-brand-primary">
                      {previous.title}
                    </span>
                  </Link>
                ) : (
                  <span className="hidden sm:block" />
                )}
                {next ? (
                  <Link
                    to={`/app/tutorials/${next.id}`}
                    className="group rounded-lg border border-border p-3 text-right no-underline hover:border-brand-primary/50"
                  >
                    <span className="flex items-center justify-end gap-1 text-[11px] text-text-muted">
                      Next
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="mt-0.5 block text-sm font-medium text-text-primary group-hover:text-brand-primary">
                      {next.title}
                    </span>
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </article>

        {showToc ? (
          <aside className="hidden lg:sticky lg:top-4 lg:block print:hidden">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <TableOfContents headings={headings} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
