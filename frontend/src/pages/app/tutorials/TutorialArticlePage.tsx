import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BookMarked, MapPin } from "lucide-react";
import { getArticleById, getSectionForArticle, tutorialSections } from "@/data/tutorials";
import { TutorialMarkdown } from "./TutorialMarkdown";
import { TutorialInfographicBlocks } from "./TutorialInfographicBlocks";
import { TutorialImageGrid } from "./TutorialImageGrid";

function sortByOrder<T extends { order?: number; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao !== bo) return ao - bo;
    return a.title.localeCompare(b.title);
  });
}

export function TutorialArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();
  const article = articleId ? getArticleById(tutorialSections, articleId) : undefined;
  const section = article && articleId ? getSectionForArticle(tutorialSections, articleId) : undefined;

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

  const related = sortByOrder(
    (article.relatedArticleIds ?? [])
      .map((id) => getArticleById(tutorialSections, id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a)),
  );

  const routeCount = article.relatedAppRoutes.length;
  const summary = article.summary ?? "";

  return (
    <div className="space-y-6">
      <Link
        to="/app/tutorials"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-primary no-underline hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to Help & Tutorials
      </Link>

      <article className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        {article.coverImage ? (
          <div className="border-b border-border bg-surface-subtle">
            <img
              src={article.coverImage}
              alt={`Cover illustration: ${article.title}`}
              className="mx-auto max-h-48 w-full object-contain px-4 py-3"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className="p-6 sm:p-8">
          <header className="border-b border-border pb-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {section ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-surface-subtle px-2 py-0.5 font-medium text-text-secondary">
                  <BookMarked className="h-3.5 w-3.5" aria-hidden />
                  {section.title}
                </span>
              ) : null}
              <span>Updated {article.lastUpdated}</span>
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
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="text-sm font-semibold text-text-primary">Related screens in the app</h2>
              <p className="mt-1 text-xs text-text-muted">
                Open from the sidebar or use the links below (same URLs as the live app).
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {article.relatedAppRoutes.map((route) => (
                  <li key={route}>
                    <Link
                      to={route}
                      className="inline-flex items-center rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-text-primary no-underline hover:border-brand-primary/50"
                    >
                      {route}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {related.length > 0 ? (
            <div className="mt-6 border-t border-border pt-6">
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
        </div>
      </article>
    </div>
  );
}
