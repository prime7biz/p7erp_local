/**
 * Help & Tutorials — content model
 *
 * Maintenance: see `.cursor/rules/tutorials-maintenance.mdc` and `tutorialRegistry.ts`.
 * When app routes, sidebar labels, or workflows change, update matching articles
 * and bump `lastUpdated`.
 */

/** Image shown in article header or gallery (paths under `public/`, e.g. `/tutorials/x.png` or `/images/x.svg`). */
export interface TutorialImageAsset {
  src: string;
  caption?: string;
  alt: string;
}

/**
 * Short screen-recorded walkthrough (local `.webm` / `.mp4` under `public/tutorials/videos/`).
 * Recorded from the real app with `tools/tutorial-capture/`.
 */
export interface TutorialVideoAsset {
  src: string;
  title: string;
  /** Still frame shown before the video plays (e.g. a screenshot of the first screen). */
  poster?: string;
  caption?: string;
  durationSeconds?: number;
}

/** One numbered step in a `steps` infographic (optional screenshot of that step). */
export interface TutorialStep {
  title: string;
  /** Short markdown (bold, inline code, links). */
  body?: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Optional in-app link to open the screen for this step. */
  href?: string;
}

/** Lightweight visual workflow / diagram metadata (rendered by tutorial UI components). */
export type TutorialInfographic =
  | {
      type: "steps";
      title?: string;
      steps: TutorialStep[];
    }
  | {
      type: "flow";
      title?: string;
      steps: { label: string; href?: string }[];
    }
  | {
      type: "diagram";
      title?: string;
      caption?: string;
      imageSrc: string;
      imageAlt: string;
    }
  | {
      type: "highlight";
      title?: string;
      body: string;
    };

export interface TutorialArticle {
  id: string;
  title: string;
  /** One-line description for cards and article header (derived in `enrichTutorialSections` if omitted). */
  summary?: string;
  /** Should match parent section `id` (derived if omitted). */
  sectionId?: string;
  /** Extra search terms beyond `tags` (defaults to `tags` when enriched). */
  keywords?: string[];
  /** Markdown body (headings, lists, bold). Keep steps aligned with the live UI. */
  content: string;
  tags: string[];
  /** ISO date `YYYY-MM-DD` — update when the article or linked workflow changes. */
  lastUpdated: string;
  /** In-app paths this article documents (e.g. `/app/orders`). */
  relatedAppRoutes: string[];
  relatedArticleIds?: string[];
  /** Optional hero image path (public URL). */
  coverImage?: string;
  images?: TutorialImageAsset[];
  /** Walkthrough videos shown near the top of the article. */
  videos?: TutorialVideoAsset[];
  infographics?: TutorialInfographic[];
  /** Approximate reading / doing time in minutes (shown in the article header). */
  estimatedMinutes?: number;
  /** Sort order within section (lower first; derived from index if omitted). */
  order?: number;
  /** Show in “Featured workflows” on the help hub. */
  featured?: boolean;
  /** e.g. "buyer", "finance", "warehouse" — for future filtering. */
  audience?: string;
}

export interface TutorialSection {
  id: string;
  title: string;
  description: string;
  articles: TutorialArticle[];
}
