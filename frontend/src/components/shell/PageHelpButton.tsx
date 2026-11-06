import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, CircleHelp } from "lucide-react";
import type { TutorialArticle } from "@/data/tutorials/types";
import { logApiError } from "@/utils/logApiError";

type FindArticles = (pathname: string) => TutorialArticle[];

const MAX_ARTICLES = 5;
const LOAD_DELAY_MS = 1500;

let findArticlesPromise: Promise<FindArticles> | null = null;

/**
 * Tutorial content is large, so it is loaded in its own chunk (shared with the Help pages)
 * instead of being bundled into the app shell.
 */
function loadFindArticles(): Promise<FindArticles> {
  findArticlesPromise ??= import("@/data/tutorials")
    .then(({ getArticlesForAppPath, normalizeAppPath, tutorialSections }) => (pathname: string) => {
      const path = normalizeAppPath(pathname).replace(/(.)\/+$/, "$1");
      return getArticlesForAppPath(tutorialSections, path).filter(
        (article) =>
          path === "/app" ||
          article.relatedAppRoutes.some((route) => {
            const r = normalizeAppPath(route);
            return r !== "/app" && (path === r || path.startsWith(`${r}/`));
          }),
      );
    })
    .catch((e: unknown) => {
      findArticlesPromise = null;
      logApiError("PageHelpButton.loadTutorials", e);
      return () => [];
    });
  return findArticlesPromise;
}

/** Header "Help" button: guides whose related screens match the current page. Hidden when none match. */
export function PageHelpButton() {
  const { pathname } = useLocation();
  const [findArticles, setFindArticles] = useState<FindArticles | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadFindArticles().then((fn) => {
        if (!cancelled) setFindArticles(() => fn);
      });
    }, LOAD_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const articles = useMemo(() => {
    if (!findArticles || pathname.startsWith("/app/tutorials")) return [];
    return findArticles(pathname).slice(0, MAX_ARTICLES);
  }, [findArticles, pathname]);

  if (articles.length === 0) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        aria-label="Help for this page"
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-text-secondary transition hover:bg-surface-subtle"
        title="Help for this page"
      >
        <CircleHelp className="h-4 w-4" aria-hidden />
        <span className="hidden xl:inline">Help</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Help for this page"
          className="absolute right-0 z-30 mt-1 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface-raised shadow-xl"
        >
          <div className="border-b border-border-subtle px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            Help for this page
          </div>
          <ul className="max-h-80 space-y-0.5 overflow-y-auto p-1">
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  to={`/app/tutorials/${article.id}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-1.5 no-underline hover:bg-surface-subtle"
                >
                  <span className="block text-sm font-medium text-text-primary">{article.title}</span>
                  {article.summary ? (
                    <span className="mt-0.5 line-clamp-2 block text-[11px] text-text-muted">{article.summary}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-border-subtle px-3 py-1.5">
            <Link
              to="/app/tutorials"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              All help & tutorials
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
