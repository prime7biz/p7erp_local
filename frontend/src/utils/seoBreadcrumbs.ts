import { LEGAL_DOC_SEGMENTS } from "@/config/publicMarketingPaths";
import { getArticleBySlug } from "@/data/resourcesArticles";

const LEGAL_LABELS: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  dpa: "Data Processing Agreement",
  "ai-disclaimer": "AI Usage Disclaimer",
  sla: "Service Level Agreement",
  "security-compliance": "Security & Compliance",
};

const TOP_LEVEL_LABELS: Record<string, string> = {
  "/features": "Features",
  "/pricing": "Pricing",
  "/about": "About Us",
  "/contact": "Contact",
  "/garments-erp": "Garments ERP",
  "/buying-house-erp": "Buying House ERP",
  "/trust-center": "Trust Center",
  "/how-it-works": "How It Works",
  "/security": "Security",
  "/erp-bangladesh": "ERP Bangladesh",
  "/erp-comparison": "ERP Comparison",
  "/resources": "Resources",
  "/support": "Support",
  "/sitemap": "Site map",
  "/login": "Login",
  "/signup": "Sign Up",
};

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/** Items for BreadcrumbList JSON-LD (excludes home when only one segment). */
export function getBreadcrumbItems(pathname: string, siteUrl: string): BreadcrumbItem[] | null {
  if (pathname === "/" || pathname === "") return null;

  const items: BreadcrumbItem[] = [{ name: "Home", path: `${siteUrl}/` }];

  const legalSeg = pathname.match(/^\/legal\/([^/]+)$/)?.[1];
  if (legalSeg && LEGAL_DOC_SEGMENTS.has(legalSeg)) {
    items.push({ name: "Legal", path: `${siteUrl}/legal/terms` });
    const label = LEGAL_LABELS[legalSeg] ?? legalSeg;
    items.push({ name: label, path: `${siteUrl}${pathname}` });
    return items;
  }

  const resourceArticle = pathname.match(/^\/resources\/([^/]+)$/)?.[1];
  if (resourceArticle) {
    const article = getArticleBySlug(resourceArticle);
    items.push({ name: "Resources", path: `${siteUrl}/resources` });
    if (article) {
      items.push({ name: article.title, path: `${siteUrl}${pathname}` });
    }
    return items;
  }

  const label = TOP_LEVEL_LABELS[pathname];
  if (label) {
    items.push({ name: label, path: `${siteUrl}${pathname}` });
    return items;
  }

  return null;
}

export function breadcrumbJsonLd(siteUrl: string, pathname: string) {
  const items = getBreadcrumbItems(pathname, siteUrl);
  if (!items || items.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.path,
    })),
  };
}
