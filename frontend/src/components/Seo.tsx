import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getSeoForPath } from "@/config/seo";
import { getArticleBySlug, ORGANIZATION_AUTHOR } from "@/data/resourcesArticles";
import { resourceArticleDateToIsoDate, resourceArticleDateToIsoDateTime } from "@/utils/resourceArticleDates";
import { breadcrumbJsonLd } from "@/utils/seoBreadcrumbs";
import { jsonLd } from "@/utils/jsonLd";
import { getRobotsMetaContent } from "@/utils/seoRobots";

/** Base URL for canonical and Open Graph. Set via VITE_SITE_URL or default for production. */
const raw = typeof import.meta.env?.VITE_SITE_URL === "string" ? import.meta.env.VITE_SITE_URL : "";
const SITE_URL = raw ? raw.replace(/\/$/, "") : "https://prime7erp.com";

const ORG_ID = `${SITE_URL}/#organization`;

/** Default share image for Open Graph / Twitter (public/images/og-default.jpg, 1200×630, ~60 KB). */
const DEFAULT_OG_IMAGE = `${SITE_URL}/images/og-default.jpg`;

/** JSON-LD for the landing page: Organization + SoftwareApplication + WebSite. */
const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "Prime7 ERP",
      description:
        "AI-powered cloud ERP for garment manufacturers and buying houses. Merchandising, production, inventory, LC management, accounting, and HR in one platform.",
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.png`,
      email: "info@prime7erp.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Gulshan-2",
        addressLocality: "Dhaka",
        postalCode: "1212",
        addressCountry: "BD",
      },
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "sales",
          telephone: "+880-1892-787220",
          email: "info@prime7erp.com",
          availableLanguage: ["English", "Bengali"],
        },
        {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: "support@prime7erp.com",
          availableLanguage: ["English", "Bengali"],
        },
      ],
      sameAs: ["https://www.facebook.com/share/1Cc3vRoqye/"],
    },
    {
      "@type": "SoftwareApplication",
      name: "Prime7 ERP",
      url: SITE_URL,
      publisher: { "@id": ORG_ID },
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Enterprise resource planning (ERP)",
      operatingSystem: "Web browser",
      description:
        "Cloud ERP for garment manufacturers and buying houses. Modules include merchandising, costing, production, inventory, export and back-to-back LC, accounting, quality, HR, and AI assistance.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Prime7 ERP",
      url: SITE_URL,
      inLanguage: "en",
      publisher: { "@id": ORG_ID },
    },
  ],
};

/** JSON-LD for the contact page: LocalBusiness. */
const CONTACT_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Prime7 ERP",
  url: SITE_URL,
  telephone: "+880 1892-787220",
  email: "info@prime7erp.com",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Gulshan-2",
    addressLocality: "Dhaka",
    postalCode: "1212",
    addressCountry: "BD",
  },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
    opens: "09:00",
    closes: "18:00",
  },
  description:
    "Contact Prime7 ERP for demos, support, and sales. Book a demo or get in touch with our team.",
};

export function Seo() {
  const { pathname } = useLocation();
  const meta = getSeoForPath(pathname);
  const isLanding = pathname === "/";
  const isContact = pathname === "/contact";
  const articleMatch = pathname.match(/^\/resources\/([^/]+)$/);
  const articleSlug = articleMatch?.[1];
  const article = articleSlug ? getArticleBySlug(articleSlug) : null;
  const canonicalUrl = `${SITE_URL}${pathname === "/" ? "" : pathname}`;
  const robotsContent = getRobotsMetaContent(pathname);
  const crumbs = breadcrumbJsonLd(SITE_URL, pathname);

  const articleOgAlt = article
    ? `${article.title} – Prime7 ERP Resources`
    : "Prime7 ERP — Cloud ERP for Garments and Buying Houses";

  const articleJsonLd =
    article &&
    (() => {
      const datePublished = resourceArticleDateToIsoDate(article.date);
      return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        datePublished,
        ...(article.updated ? { dateModified: resourceArticleDateToIsoDate(article.updated) } : {}),
        author:
          article.author === ORGANIZATION_AUTHOR
            ? { "@type": "Organization", "@id": ORG_ID, name: "Prime7 ERP" }
            : { "@type": "Person", name: article.author, jobTitle: article.authorRole },
        publisher: {
          "@id": ORG_ID,
        },
        image: [DEFAULT_OG_IMAGE],
        description: article.excerpt,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonicalUrl,
        },
      };
    })();

  return (
    <Helmet htmlAttributes={{ lang: "en" }}>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <meta name="robots" content={robotsContent} />
      <link rel="canonical" href={canonicalUrl} />
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:type" content={article ? "article" : "website"} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:site_name" content="Prime7 ERP" />
      <meta property="og:image" content={DEFAULT_OG_IMAGE} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={articleOgAlt} />
      {article ? (
        <meta property="article:published_time" content={resourceArticleDateToIsoDateTime(article.date)} />
      ) : null}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={DEFAULT_OG_IMAGE} />
      <meta name="twitter:image:alt" content={articleOgAlt} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      {isLanding && <script type="application/ld+json">{jsonLd(LANDING_JSON_LD)}</script>}
      {isContact && <script type="application/ld+json">{jsonLd(CONTACT_JSON_LD)}</script>}
      {articleJsonLd && <script type="application/ld+json">{jsonLd(articleJsonLd)}</script>}
      {crumbs && <script type="application/ld+json">{jsonLd(crumbs)}</script>}
    </Helmet>
  );
}
