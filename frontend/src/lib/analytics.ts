/**
 * Marketing analytics (Plausible: no cookies, no personal data).
 *
 * Off unless the build sets VITE_PLAUSIBLE_DOMAIN (e.g. "prime7erp.com"; GitHub repository variable, see
 * docs/seo-optimization/GOOGLE-SEARCH-CONSOLE-SETUP.md). Only public, indexable marketing pages are measured:
 * the ERP app, portals, verification links and account pages are never sent, and page views are sent
 * without the query string so links with tokens can never leak.
 *
 * Events also reach Google Tag Manager's `dataLayer` if the site owner installs it separately.
 */
import { getRobotsMetaContent, ROBOTS_INDEX } from "@/utils/seoRobots";

type EventProps = Record<string, string | number | boolean | undefined>;
type PlausibleFn = ((event: string, options?: { props?: EventProps; u?: string }) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: PlausibleFn;
  }
}

export type MarketingEvent =
  | "cta_click"
  | "demo_request_submitted"
  | "contact_submitted"
  | "roi_calculated"
  | "signup_started";

const PLAUSIBLE_DOMAIN = String(import.meta.env.VITE_PLAUSIBLE_DOMAIN ?? "").trim();
/** Manual-pageview script, so this file decides which pages are counted. Override for a proxy or self-hosted server. */
const PLAUSIBLE_SCRIPT =
  String(import.meta.env.VITE_PLAUSIBLE_SCRIPT_URL ?? "").trim() || "https://plausible.io/js/script.manual.js";

export function isAnalyticsEnabled(domain: string = PLAUSIBLE_DOMAIN): boolean {
  return domain !== "";
}

/** Public marketing pages only (the same pages that are indexable); never /app, /portal, /verify or account pages. */
export function isTrackedPath(pathname: string): boolean {
  return getRobotsMetaContent(pathname) === ROBOTS_INDEX;
}

let scriptAdded = false;

function ensurePlausible(): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  if (!window.plausible) {
    const queue: PlausibleFn = (...args: Parameters<PlausibleFn>) => {
      (queue.q = queue.q || []).push(args);
    };
    window.plausible = queue;
  }
  if (scriptAdded) return;
  scriptAdded = true;
  const script = document.createElement("script");
  script.defer = true;
  script.src = PLAUSIBLE_SCRIPT;
  script.dataset.domain = PLAUSIBLE_DOMAIN;
  document.head.appendChild(script);
}

/** Counts a page view for public marketing pages (called on every route change by AnalyticsPageviews). */
export function trackPageview(pathname: string): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled() || !isTrackedPath(pathname)) return;
  ensurePlausible();
  try {
    window.plausible?.("pageview", { u: `${window.location.origin}${pathname}` });
  } catch {
    /* analytics must never break the page */
  }
}

export function trackEvent(event: MarketingEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer?.push({ event, ...props });
    if (isAnalyticsEnabled() && isTrackedPath(window.location.pathname)) {
      ensurePlausible();
      window.plausible?.(event, { props, u: `${window.location.origin}${window.location.pathname}` });
    }
  } catch {
    /* analytics must never break the page */
  }
}
