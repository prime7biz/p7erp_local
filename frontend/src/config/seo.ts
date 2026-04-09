/**
 * Per-page SEO: title and meta description.
 * Used by the Seo component to set document head per route.
 * Public site branding: "Prime7 ERP" for consistency with legacy reference (primeX-ERP).
 */

import { getArticleBySlug } from "@/data/resourcesArticles";

export interface SeoMeta {
  title: string;
  description: string;
}

const DEFAULT_SEO: SeoMeta = {
  title: "Prime7 ERP – Cloud ERP for Garments & Buying Houses",
  description:
    "Prime7 ERP – AI-powered cloud ERP for garment manufacturers and buying houses. Merchandising, production, inventory, LC management, accounting, and HR in one platform.",
};

export const NOT_FOUND_SEO: SeoMeta = {
  title: "Page not found – Prime7 ERP",
  description: "The page you are looking for does not exist or may have been moved. Browse our site map or return to the home page.",
};

export const SEO_BY_PATH: Record<string, SeoMeta> = {
  "/": {
    title: "Prime7 ERP – Cloud ERP for Garments & Buying Houses",
    description:
      "AI-powered cloud ERP for garment manufacturers and buying houses. Merchandising, production, inventory, LC management, accounting, and HR in one unified platform.",
  },
  "/features": {
    title: "Features – Prime7 ERP",
    description:
      "Explore Prime7 ERP modules: accounting, inventory, production, merchandising, LC management, quality, HR, and AI analytics built for the garment industry.",
  },
  "/pricing": {
    title: "Pricing – Prime7 ERP",
    description:
      "Prime7 ERP pricing plans for garment manufacturers and buying houses. Start free trial, flexible modules, transparent pricing.",
  },
  "/about": {
    title: "About Us – Prime7 ERP",
    description:
      "Prime7 ERP is built by industry veterans for garment manufacturers and buying houses. Innovation, reliability, and customer success at the core.",
  },
  "/contact": {
    title: "Contact – Prime7 ERP",
    description:
      "Contact Prime7 ERP for demos, support, and sales. Book a demo or get in touch with our team.",
  },
  "/garments-erp": {
    title: "Garments ERP – Prime7 ERP",
    description:
      "End-to-end ERP for garment manufacturers: merchandising, production, inventory, quality, accounting, and HR in one system.",
  },
  "/buying-house-erp": {
    title: "Buying House ERP – Prime7 ERP",
    description:
      "ERP built for buying houses: order management, supplier coordination, LC tracking, and commercial operations.",
  },
  "/legal/privacy": {
    title: "Privacy Policy – Prime7 ERP",
    description:
      "Prime7 ERP privacy policy: data collection, AI processing, security, encryption, multi-tenant isolation, cross-border transfers, retention, and your rights.",
  },
  "/legal/terms": {
    title: "Terms of Service – Prime7 ERP",
    description:
      "Prime7 ERP terms of service: SaaS subscription, multi-tenant ERP, AI advisory features, data ownership, liability, and governing law.",
  },
  "/legal/dpa": {
    title: "Data Processing Agreement – Prime7 ERP",
    description:
      "Prime7 ERP data processing agreement (DPA) with regional addenda: GDPR, US state privacy, Bangladesh, India, Africa, and Asia-Pacific.",
  },
  "/legal/ai-disclaimer": {
    title: "AI Usage Disclaimer – Prime7 ERP",
    description:
      "Prime7 ERP AI disclaimer: advisory-only outputs, no warranty, no autonomous financial posting, and limitation of liability for AI use.",
  },
  "/legal/sla": {
    title: "Service Level Agreement – Prime7 ERP",
    description:
      "Prime7 ERP SLA summary: availability targets, support response goals, maintenance, exclusions, and service credit disclaimer for enterprise buyers.",
  },
  "/legal/security-compliance": {
    title: "Security & Compliance – Prime7 ERP",
    description:
      "Prime7 ERP security and compliance overview: encryption, access control, tenant isolation, monitoring, and responsible disclosure—without false certification claims.",
  },
  "/trust-center": {
    title: "Trust Center – Prime7 ERP",
    description:
      "Prime7 ERP Trust Center: security, privacy, availability, AI responsibility, quick facts, FAQs, and links to legal documents for procurement teams.",
  },
  "/privacy": {
    title: "Privacy Policy – Prime7 ERP",
    description: "Redirect to the Prime7 ERP privacy policy.",
  },
  "/terms": {
    title: "Terms of Service – Prime7 ERP",
    description: "Redirect to the Prime7 ERP terms of service.",
  },
  "/how-it-works": {
    title: "How It Works – Prime7 ERP",
    description:
      "How Prime7 ERP works: implementation, onboarding, and getting started for garment manufacturers and buying houses.",
  },
  "/security": {
    title: "Security – Prime7 ERP",
    description:
      "Prime7 ERP security: encryption, access control, compliance, and data protection for your business.",
  },
  "/erp-bangladesh": {
    title: "ERP Bangladesh – Prime7 ERP",
    description:
      "Prime7 ERP for Bangladesh garment and buying house industry. Local support and compliance.",
  },
  "/erp-comparison": {
    title: "ERP Comparison – Prime7 ERP",
    description:
      "Compare Prime7 ERP with other garment and buying house ERP solutions. Features and pricing comparison.",
  },
  "/blog": {
    title: "Blog – Prime7 ERP",
    description:
      "Articles and updates from Prime7 ERP on garment manufacturing, buying house operations, and industry trends.",
  },
  "/resources": {
    title: "Resources & Industry Insights – Prime7 ERP",
    description:
      "Expert guides on garment manufacturing ERP, inventory management, production tracking and more. Free resources for garment industry professionals.",
  },
  "/support": {
    title: "Support – Prime7 ERP",
    description: "Prime7 ERP support: help center, documentation, and contact options.",
  },
  "/sitemap": {
    title: "Site map – Prime7 ERP",
    description:
      "Browse all public pages, legal documents, and resource articles on Prime7 ERP for garments manufacturers and buying houses.",
  },
  "/login": {
    title: "Login – Prime7 ERP",
    description: "Sign in to Prime7 ERP. Company code, username, and password.",
  },
  "/signup": {
    title: "Sign Up – Prime7 ERP",
    description: "Start your Prime7 ERP free trial. Create your account for garment or buying house ERP.",
  },
  "/verify/proforma": {
    title: "Verify Proforma – Prime7 ERP",
    description: "Verify proforma invoice with Prime7 ERP.",
  },
};

/** Resolve SEO meta for the current path. App routes use a generic title. */
export function getSeoForPath(pathname: string): SeoMeta {
  const articleMatch = pathname.match(/^\/resources\/([^/]+)$/);
  if (articleMatch?.[1]) {
    const articleSlug = articleMatch[1];
    const article = getArticleBySlug(articleSlug);
    if (article) {
      return {
        title: `${article.title} – Prime7 ERP`,
        description: article.excerpt,
      };
    }
    return NOT_FOUND_SEO;
  }

  const exact = SEO_BY_PATH[pathname];
  if (exact) return exact;

  if (pathname.startsWith("/app")) {
    return {
      title: "App – Prime7 ERP",
      description: DEFAULT_SEO.description,
    };
  }

  if (pathname.startsWith("/portal")) {
    return {
      title: "Portal – Prime7 ERP",
      description: DEFAULT_SEO.description,
    };
  }

  return NOT_FOUND_SEO;
}
