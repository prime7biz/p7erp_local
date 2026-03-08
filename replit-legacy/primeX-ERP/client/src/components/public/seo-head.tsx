import { useEffect } from "react";
import { buildCanonical, buildBreadcrumb } from "@/lib/seo";

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  keywords?: string;
  jsonLd?: object | object[];
  noIndex?: boolean;
  breadcrumbs?: Array<{name: string, url: string} | {name: string, path: string}>;
}

export function SEOHead({
  title,
  description,
  canonical,
  ogImage = "https://prime7erp.com/og-default.png",
  ogType = "website",
  keywords,
  jsonLd,
  noIndex = false,
  breadcrumbs,
}: SEOHeadProps) {
  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, attr = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta("description", description);
    if (keywords) setMeta("keywords", keywords);

    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    setMeta("og:type", ogType, "property");
    setMeta("og:image", ogImage, "property");
    setMeta("og:site_name", "Prime7 ERP", "property");

    setMeta("twitter:card", "summary_large_image", "name");
    setMeta("twitter:title", title, "name");
    setMeta("twitter:description", description, "name");

    if (noIndex) {
      setMeta("robots", "noindex, nofollow");
    } else {
      const robotsMeta = document.querySelector('meta[name="robots"]');
      if (robotsMeta) robotsMeta.remove();
    }

    if (canonical) {
      const fullCanonical = canonical.startsWith('http') ? canonical : buildCanonical(canonical);
      const normalizedCanonical = fullCanonical.endsWith('/') && fullCanonical !== 'https://prime7erp.com/' ? fullCanonical.slice(0, -1) : fullCanonical;
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = normalizedCanonical;
    }

    if (jsonLd) {
      const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
      const existingScripts = document.querySelectorAll('script[data-seo-jsonld]');
      existingScripts.forEach(s => s.remove());

      schemas.forEach(schema => {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo-jsonld", "true");
        script.textContent = JSON.stringify(schema);
        document.head.appendChild(script);
      });
    }

    if (breadcrumbs && breadcrumbs.length > 0) {
      const existingBreadcrumbs = document.querySelectorAll('script[data-seo-breadcrumb]');
      existingBreadcrumbs.forEach(s => s.remove());

      const normalizedBreadcrumbs = breadcrumbs.map((item) => {
        const url = 'url' in item ? item.url : buildCanonical((item as any).path);
        return {
          name: item.name,
          url: url.startsWith('http') ? url : buildCanonical(url),
        };
      });

      const breadcrumbScript = document.createElement("script");
      breadcrumbScript.type = "application/ld+json";
      breadcrumbScript.setAttribute("data-seo-breadcrumb", "true");
      breadcrumbScript.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: normalizedBreadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      });
      document.head.appendChild(breadcrumbScript);
    }

    return () => {
      const jsonLdScripts = document.querySelectorAll('script[data-seo-jsonld]');
      jsonLdScripts.forEach(s => s.remove());
      const breadcrumbScripts = document.querySelectorAll('script[data-seo-breadcrumb]');
      breadcrumbScripts.forEach(s => s.remove());
    };
  }, [title, description, canonical, ogImage, ogType, keywords, jsonLd, noIndex, breadcrumbs]);

  return null;
}
