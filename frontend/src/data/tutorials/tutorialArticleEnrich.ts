import type { TutorialSection } from "./types";

/** Pull a short summary from markdown (first paragraph under ## Overview). */
export function deriveTutorialSummary(content: string, title: string): string {
  const block = content.match(/## Overview\s*\n+([\s\S]*?)(?=\n## |\n?$)/i);
  if (block?.[1]) {
    const text = block[1]
      .split(/\n\n+/)[0]
      ?.replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text && text.length > 12) {
      return text.length > 220 ? `${text.slice(0, 217)}…` : text;
    }
  }
  return title;
}

/** Fill `sectionId`, `summary`, `keywords`, and `order` when not authored explicitly. */
export function enrichTutorialSections(sections: TutorialSection[]): TutorialSection[] {
  return sections.map((sec) => ({
    ...sec,
    articles: sec.articles.map((a, index) => ({
      ...a,
      sectionId: a.sectionId ?? sec.id,
      summary: a.summary ?? deriveTutorialSummary(a.content, a.title),
      keywords: a.keywords ?? [...a.tags],
      order: a.order ?? index,
    })),
  }));
}

export function getSectionForArticle(
  sections: TutorialSection[],
  articleId: string,
): TutorialSection | undefined {
  return sections.find((s) => s.articles.some((a) => a.id === articleId));
}
