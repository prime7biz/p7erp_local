import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  BookOpen,
  ChartColumn,
  Clock,
  Factory,
  FileChartColumn,
  Landmark,
  LifeBuoy,
  Package,
  PlayCircle,
  Rocket,
  Search,
  Settings,
  Ship,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { getArticleById, getFeaturedArticles, searchTutorialArticles, tutorialSections } from "@/data/tutorials";
import type { TutorialArticle, TutorialSection } from "@/data/tutorials/types";
import { sortArticles } from "./tutorialUi";

/** Articles for first-time users, shown in the "Start here" strip. */
const START_HERE_IDS = ["gs-at-a-glance", "gs-login", "gs-sidebar", "gs-dashboard"];

/** Featured step-by-step guides (quick entry points on the hub). Missing ids are skipped. */
const QUICK_GUIDE_LINKS = [
  { id: "fin-voucher-entry", label: "Voucher entry" },
  { id: "fin-voucher-approval-queue", label: "Voucher approvals" },
  { id: "merch-create-inquiry", label: "Create inquiry" },
  { id: "merch-quotation-to-order", label: "Quotation to order" },
  { id: "inv-po-deep", label: "Purchase order" },
  { id: "inv-grn-deep", label: "Goods receiving" },
  { id: "mfg-planning-deep", label: "Production planning" },
  { id: "mfg-hourly-deep", label: "Hourly production" },
  { id: "hr-add-employee", label: "Add an employee" },
  { id: "hr-leave-request-approval", label: "Leave request" },
  { id: "hr-pay-monthly-run", label: "Monthly payroll" },
  { id: "commercial-btb-lcs", label: "BTB LC" },
  { id: "fin-rpt-month-end", label: "Month-end close" },
  { id: "fin-coming-from-tally", label: "Coming from Tally" },
  { id: "sup-create-ticket", label: "Support ticket" },
];

const SECTION_ICONS: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  support: LifeBuoy,
  merchandising: ShoppingBag,
  "export-import": Ship,
  inventory: Package,
  manufacturing: Factory,
  quality: BadgeCheck,
  "ai-tools": Sparkles,
  hr: Users,
  "hr-payroll": Wallet,
  finance: Landmark,
  "finance-reports": ChartColumn,
  workflow: Workflow,
  reports: FileChartColumn,
  settings: Settings,
};

interface HelpRole {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Whole sections that belong to this role. */
  sectionIds: string[];
  /** Articles in other sections with one of these tags (case-insensitive, exact) also match. */
  tags: string[];
  /** Values of the optional article `audience` field that match this role. */
  audiences: string[];
}

/** "Browse by role" chips. Add a section id or tag here to show more articles for a role. */
const HELP_ROLES: HelpRole[] = [
  {
    id: "merchandiser",
    label: "Merchandiser",
    icon: ShoppingBag,
    sectionIds: ["merchandising", "export-import"],
    tags: ["inquiry", "quotation", "tna", "sample", "bom"],
    audiences: ["merchandiser", "merchandising", "buyer"],
  },
  {
    id: "store",
    label: "Store / Warehouse",
    icon: Package,
    sectionIds: ["inventory"],
    tags: ["grn", "gate pass", "delivery challan", "requisition", "warehouse"],
    audiences: ["warehouse", "store", "inventory"],
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    sectionIds: ["manufacturing", "quality"],
    tags: ["production", "shop floor", "qc"],
    audiences: ["production", "factory", "quality"],
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: Landmark,
    sectionIds: ["finance", "finance-reports"],
    tags: ["voucher", "ap", "bills", "finance"],
    audiences: ["finance", "accounts"],
  },
  {
    id: "hr",
    label: "HR",
    icon: Users,
    sectionIds: ["hr", "hr-payroll"],
    tags: ["payroll", "attendance", "leave"],
    audiences: ["hr"],
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    sectionIds: ["settings", "workflow", "support"],
    tags: ["admin", "users", "roles", "approvals"],
    audiences: ["admin"],
  },
];

function articleMatchesRole(article: TutorialArticle, sectionId: string, role: HelpRole): boolean {
  if (role.sectionIds.includes(sectionId)) return true;
  if (article.audience && role.audiences.includes(article.audience.toLowerCase())) return true;
  return article.tags.some((t) => role.tags.includes(t.toLowerCase()));
}

function sectionAnchor(sectionId: string): string {
  return `help-section-${sectionId}`;
}

function firstCoverImage(section: TutorialSection): string | undefined {
  return section.articles.find((a) => a.coverImage)?.coverImage;
}

const sortedSections: TutorialSection[] = tutorialSections.map((sec) => ({
  ...sec,
  articles: [...sec.articles].sort(sortArticles),
}));

const sectionTitleById = new Map(tutorialSections.map((s) => [s.id, s.title]));

function ArticleMeta({ article, sectionTitle }: { article: TutorialArticle; sectionTitle?: string }) {
  const videoCount = article.videos?.length ?? 0;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
      {sectionTitle ? <span className="rounded-md bg-surface-subtle px-1.5 py-0.5">{sectionTitle}</span> : null}
      {article.estimatedMinutes ? (
        <span className="inline-flex items-center gap-0.5">
          <Clock className="h-3 w-3" aria-hidden />
          {article.estimatedMinutes} min
        </span>
      ) : null}
      {videoCount > 0 ? (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-brand-primary/10 px-1.5 py-0.5 font-medium text-brand-primary">
          <PlayCircle className="h-3 w-3" aria-hidden />
          Video
        </span>
      ) : null}
      <span>Updated {article.lastUpdated}</span>
    </p>
  );
}

function ArticleCard({ article, sectionTitle }: { article: TutorialArticle; sectionTitle?: string }) {
  return (
    <Link
      to={`/app/tutorials/${article.id}`}
      className="flex h-full gap-3 rounded-xl border border-border bg-surface-raised p-3 no-underline transition hover:border-brand-primary/40 hover:bg-surface-subtle sm:p-4"
    >
      {article.coverImage ? (
        <img
          src={article.coverImage}
          alt=""
          loading="lazy"
          className="hidden h-16 w-24 shrink-0 rounded-md border border-border bg-surface-subtle object-cover sm:block"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-text-primary">{article.title}</span>
          {article.featured ? (
            <span className="shrink-0 rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-primary">
              Featured
            </span>
          ) : null}
        </div>
        {article.summary ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">{article.summary}</p>
        ) : null}
        <ArticleMeta article={article} sectionTitle={sectionTitle} />
      </div>
    </Link>
  );
}

function SectionCard({ section }: { section: TutorialSection }) {
  const Icon = SECTION_ICONS[section.id] ?? BookOpen;
  const cover = firstCoverImage(section);
  const count = section.articles.length;
  return (
    <a
      href={`#${sectionAnchor(section.id)}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface-raised no-underline transition hover:border-brand-primary/40"
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="h-24 w-full border-b border-border bg-surface-subtle object-cover"
        />
      ) : null}
      <div className="flex flex-1 items-start gap-3 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-text-primary group-hover:text-brand-primary">{section.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{section.description}</p>
          <p className="mt-1 text-[11px] font-medium text-text-secondary">
            {count} guide{count === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </a>
  );
}

export function TutorialsPage() {
  const [query, setQuery] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);

  const role = HELP_ROLES.find((r) => r.id === roleId);
  const q = query.trim();
  const isFiltering = Boolean(q) || Boolean(role);

  const startHere = useMemo(
    () =>
      START_HERE_IDS.map((id) => getArticleById(tutorialSections, id)).filter(
        (a): a is TutorialArticle => Boolean(a),
      ),
    [],
  );

  const quickGuides = useMemo(
    () => QUICK_GUIDE_LINKS.filter((g) => getArticleById(tutorialSections, g.id)),
    [],
  );

  const featuredArticles = useMemo(() => getFeaturedArticles(tutorialSections).sort(sortArticles), []);

  const videoArticles = useMemo(() => {
    const seen = new Set<string>();
    return sortedSections
      .flatMap((s) => s.articles)
      .filter((a) => {
        const src = a.videos?.[0]?.src;
        if (!src || seen.has(src)) return false;
        seen.add(src);
        return true;
      });
  }, []);

  const sectionsToShow = useMemo(() => {
    const lower = q.toLowerCase();
    const matched = q ? new Set(searchTutorialArticles(q).map((a) => a.id)) : null;
    return sortedSections
      .map((sec) => {
        const sectionHit =
          Boolean(lower) &&
          (sec.title.toLowerCase().includes(lower) || sec.description.toLowerCase().includes(lower));
        return {
          ...sec,
          articles: sec.articles.filter((a) => {
            if (matched && !sectionHit && !matched.has(a.id)) return false;
            if (role && !articleMatchesRole(a, sec.id, role)) return false;
            return true;
          }),
        };
      })
      .filter((sec) => sec.articles.length > 0);
  }, [q, role]);

  const resultCount = sectionsToShow.reduce((n, s) => n + s.articles.length, 0);

  const clearFilters = () => {
    setQuery("");
    setRoleId(null);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-brand-primary/10 via-surface-raised to-surface-raised p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-primary">Help & Tutorials</p>
        <h1 className="mt-1 text-2xl font-semibold text-text-primary sm:text-3xl">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Step-by-step guides with real screenshots and short videos of the live app. Search for a task, or pick your
          role to see the guides that matter to you.
        </p>
        <div className="relative mt-4 max-w-2xl">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides, e.g. “purchase order”, “voucher”, “leave”…"
            className="w-full rounded-xl border border-border bg-surface-raised py-3 pl-10 pr-3 text-sm text-text-primary shadow-sm placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            aria-label="Search tutorials"
          />
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-text-muted">Browse by role</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Browse by role">
            {HELP_ROLES.map((r) => {
              const Icon = r.icon;
              const active = r.id === roleId;
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRoleId(active ? null : r.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
                      : "border-border bg-surface-raised text-text-secondary hover:border-brand-primary/50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {isFiltering ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised px-4 py-2.5 text-sm text-text-secondary">
          <span>
            {resultCount} guide{resultCount === 1 ? "" : "s"}
            {role ? ` for ${role.label}` : ""}
            {q ? ` matching “${q}”` : ""}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        </div>
      ) : (
        <>
          {startHere.length > 0 ? (
            <section aria-labelledby="help-start-here">
              <h2 id="help-start-here" className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Rocket className="h-5 w-5 text-brand-primary" aria-hidden />
                New to Prime7? Start here
              </h2>
              <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {startHere.map((article, i) => (
                  <li key={article.id}>
                    <Link
                      to={`/app/tutorials/${article.id}`}
                      className="flex h-full gap-3 rounded-xl border border-border bg-surface-raised p-3 no-underline transition hover:border-brand-primary/40"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-text-primary">{article.title}</span>
                        {article.summary ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-text-muted">{article.summary}</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {videoArticles.length > 0 ? (
            <section aria-labelledby="help-videos">
              <h2 id="help-videos" className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <PlayCircle className="h-5 w-5 text-brand-primary" aria-hidden />
                Video walkthroughs
              </h2>
              <p className="mt-1 text-sm text-text-muted">Short recordings of the real screens — watch, then try it.</p>
              <ul className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
                {videoArticles.map((article) => {
                  const video = article.videos?.[0];
                  const poster = video?.poster ?? article.coverImage;
                  return (
                    <li key={article.id} className="w-56 shrink-0 snap-start">
                      <Link
                        to={`/app/tutorials/${article.id}`}
                        className="group block overflow-hidden rounded-xl border border-border bg-surface-raised no-underline transition hover:border-brand-primary/40"
                      >
                        <span className="relative block h-32 bg-surface-subtle">
                          {poster ? (
                            <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : null}
                          <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition group-hover:bg-black/30">
                            <PlayCircle className="h-10 w-10 text-white drop-shadow" aria-hidden />
                          </span>
                        </span>
                        <span className="block p-3">
                          <span className="line-clamp-2 block text-sm font-medium text-text-primary">
                            {video?.title ?? article.title}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-text-muted">{article.title}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {featuredArticles.length > 0 ? (
            <section
              aria-labelledby="help-featured"
              className="rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4"
            >
              <h2
                id="help-featured"
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted"
              >
                <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden />
                Featured workflows
              </h2>
              <p className="mt-1 text-sm text-text-secondary">High-traffic tasks with visuals and route links.</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {featuredArticles.map((article) => (
                  <li key={article.id}>
                    <ArticleCard article={article} sectionTitle={sectionTitleById.get(article.sectionId ?? "")} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {quickGuides.length > 0 ? (
            <section className="rounded-xl border border-border bg-surface-raised p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Quick guides</h2>
              <p className="mt-1 text-sm text-text-secondary">Common tasks — step-by-step articles.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickGuides.map((g) => (
                  <Link
                    key={g.id}
                    to={`/app/tutorials/${g.id}`}
                    className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-medium text-text-primary no-underline hover:border-brand-primary/50"
                  >
                    {g.label}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="help-topics">
            <h2 id="help-topics" className="flex items-center gap-2 text-lg font-semibold text-text-primary">
              <BookOpen className="h-5 w-5 text-brand-primary" aria-hidden />
              Browse topics
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedSections.map((section) => (
                <li key={section.id}>
                  <SectionCard section={section} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {sectionsToShow.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-8 text-center text-sm text-text-secondary">
          No guides match. Try another keyword, pick a different role, or{" "}
          <button type="button" onClick={clearFilters} className="font-medium text-brand-primary hover:underline">
            clear the filters
          </button>
          .
        </div>
      ) : (
        <div className="space-y-8">
          <nav
            aria-label="Jump to section"
            className="sticky top-0 z-10 -mx-3 flex gap-2 overflow-x-auto border-b border-border bg-surface-base/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5"
          >
            <span className="shrink-0 self-center text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Jump to
            </span>
            {sectionsToShow.map((section) => (
              <a
                key={section.id}
                href={`#${sectionAnchor(section.id)}`}
                className="shrink-0 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs font-medium text-text-secondary no-underline hover:border-brand-primary/50 hover:text-brand-primary"
              >
                {section.title}
                <span className="ml-1 text-text-muted">{section.articles.length}</span>
              </a>
            ))}
          </nav>

          {sectionsToShow.map((section) => {
            const Icon = SECTION_ICONS[section.id] ?? BookOpen;
            return (
              <section
                key={section.id}
                id={sectionAnchor(section.id)}
                aria-labelledby={`${sectionAnchor(section.id)}-title`}
                className="scroll-mt-14 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 id={`${sectionAnchor(section.id)}-title`} className="text-lg font-semibold text-text-primary">
                      {section.title}
                      <span className="ml-2 text-sm font-normal text-text-muted">
                        {section.articles.length} guide{section.articles.length === 1 ? "" : "s"}
                      </span>
                    </h2>
                    <p className="text-sm text-text-muted">{section.description}</p>
                  </div>
                </div>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {section.articles.map((article) => (
                    <li key={article.id}>
                      <ArticleCard article={article} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
