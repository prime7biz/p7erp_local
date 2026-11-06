import type { TutorialArticle } from "@/data/tutorials/types";

export interface TocHeading {
  id: string;
  text: string;
}

export function sortArticles(a: TutorialArticle, b: TutorialArticle): number {
  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  if (ao !== bo) return ao - bo;
  return a.title.localeCompare(b.title);
}

export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "section";
}

/**
 * Returns a function that turns heading text into a unique id (`steps`, `steps-2`, …).
 * The markdown renderer and the table of contents must both use it in document order.
 */
export function createHeadingSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
}

/** `##` headings of an article body (used for the "On this page" list). */
export function extractTocHeadings(markdown: string): TocHeading[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "");
  const slug = createHeadingSlugger();
  const headings: TocHeading[] = [];
  for (const match of withoutCode.matchAll(/^(#{2,3})\s+(.+?)\s*#*\s*$/gm)) {
    const level = match[1]?.length ?? 2;
    const text = stripInlineMarkdown(match[2] ?? "");
    const id = slug(text);
    if (level === 2) headings.push({ id, text });
  }
  return headings;
}
