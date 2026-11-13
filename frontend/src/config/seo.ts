/**
 * Per-page SEO: title and meta description.
 * Used by the Seo component to set document head per route.
 * Public site branding: "Prime7 ERP" for consistency with legacy reference (primeX-ERP).
 */

import { SOLUTION_PAGES } from "@/config/solutionPages";
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
    title: "Prime7 ERP – AI-Powered Garments ERP Software",
    description:
      "Cloud garments ERP for manufacturers and buying houses: merchandising, costing, production, inventory, back-to-back LC, accounting and HR in one system.",
  },
  "/features": {
    title: "Garment ERP Features and Modules – Prime7 ERP",
    description:
      "Every Prime7 ERP module for garment businesses: merchandising, costing, production, inventory, commercial and LC, accounting, quality, HR and AI.",
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
  "/book-demo": {
    title: "Book a Demo – Prime7 ERP for Garments & Buying Houses",
    description:
      "Book a 45-minute live demo of Prime7 ERP: merchandising, inventory, production, LC, accounts and payroll for Bangladesh garment businesses.",
  },
  "/roi-calculator": {
    title: "ERP ROI Calculator – Prime7 ERP",
    description:
      "Estimate how many admin hours and how much salary cost your garment team could save by moving off spreadsheets. Your numbers, transparent formula.",
  },
  "/garments-erp": {
    title: "Garment Manufacturing ERP Software – Prime7 ERP",
    description:
      "ERP software for the garments industry: merchandising, costing, BOM, TNA, production, inventory, quality, accounts and HR for apparel factories.",
  },
  "/buying-house-erp": {
    title: "Buying House ERP Software for Garment Sourcing – Prime7",
    description:
      "ERP for buying houses and sourcing offices: buyer orders, supplier follow-up, sample approvals, TNA, LC tracking, commission and commercial documents.",
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
    title: "How It Works: ERP Setup and Onboarding – Prime7 ERP",
    description:
      "How Prime7 ERP goes live: sign-up, data migration from Excel, configuration, user training and go-live support for garment and buying house teams.",
  },
  "/security": {
    title: "ERP Security & Data Protection – Prime7 ERP",
    description:
      "How Prime7 ERP protects your data: encryption in transit, role-based access, audit logs, tenant data isolation, backups and responsible disclosure.",
  },
  "/erp-comparison": {
    title: "Garment ERP vs Generic ERP and Spreadsheets – Prime7 ERP",
    description:
      "How a purpose-built garment ERP compares with generic ERP and spreadsheets: industry workflows, AI assistance, transparent pricing, setup and data security.",
  },
  "/blog": {
    title: "Blog – Prime7 ERP",
    description:
      "Articles and updates from Prime7 ERP on garment manufacturing, buying house operations, and industry trends.",
  },
  "/resources": {
    title: "Garment ERP Guides and Resources – Prime7 ERP",
    description:
      "Practical guides for garment factories and buying houses: choosing ERP software, back-to-back LC management, costing and consumption, and production planning.",
  },
  "/support": {
    title: "Support – Prime7 ERP",
    description:
      "Get help with Prime7 ERP: contact our support team, reach technical support for your account or implementation, and find guides for common tasks.",
  },
  "/sitemap": {
    title: "Site map – Prime7 ERP",
    description:
      "Browse all public pages, legal documents, and resource articles on Prime7 ERP for garments manufacturers and buying houses.",
  },
  "/install": {
    title: "Android App – Prime7 ERP",
    description:
      "Install Prime7 ERP on your Android phone or tablet from Google Play, the APK download or Chrome. The app updates itself with every release.",
  },
  "/account-deletion": {
    title: "Delete Your Account – Prime7 ERP",
    description:
      "Ask us to delete your Prime7 ERP login account and personal profile, and see which business records your company keeps.",
  },
  "/login": {
    title: "Login – Prime7 ERP",
    description:
      "Sign in to Prime7 ERP with your company code, email and password. Staff, tenant admins, customers, financiers and suppliers use one login page.",
  },
  "/signup": {
    title: "Sign Up – Prime7 ERP",
    description: "Start your Prime7 ERP free trial. Create your account for garment or buying house ERP.",
  },
  "/forgot-password": {
    title: "Forgot Password – Prime7 ERP",
    description: "Request a password reset link for your Prime7 ERP account.",
  },
  "/reset-password": {
    title: "Reset Password – Prime7 ERP",
    description: "Choose a new password for your Prime7 ERP account.",
  },
  "/accept-invite": {
    title: "Accept Invitation – Prime7 ERP",
    description: "Accept your Prime7 ERP invitation and set up your account.",
  },
  "/verify/proforma": {
    title: "Verify Proforma – Prime7 ERP",
    description: "Verify proforma invoice with Prime7 ERP.",
  },
  // Solution pages keep their title and description next to their route (src/config/solutionPages.ts).
  ...Object.fromEntries(SOLUTION_PAGES.map((p) => [p.path, { title: p.title, description: p.description }])),
};

/** Search results show about 160 characters; longer excerpts are cut at a word boundary. */
function shortenDescription(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "")}…`;
}

/** Resolve SEO meta for the current path. App routes use a generic title. */
export function getSeoForPath(pathname: string): SeoMeta {
  const articleMatch = pathname.match(/^\/resources\/([^/]+)$/);
  if (articleMatch?.[1]) {
    const articleSlug = articleMatch[1];
    const article = getArticleBySlug(articleSlug);
    if (article) {
      const withBrand = `${article.title} – Prime7 ERP`;
      return {
        title: withBrand.length <= 65 ? withBrand : article.title,
        description: shortenDescription(article.excerpt),
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

  if (pathname.startsWith("/verify/document")) {
    return {
      title: "Verify Document – Prime7 ERP",
      description: "Check that a printed voucher or inventory document is genuine.",
    };
  }

  return NOT_FOUND_SEO;
}
