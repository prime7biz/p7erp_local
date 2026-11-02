/**
 * Marketing analytics events. No tracking script is bundled: events are forwarded only to a
 * tool the site owner has already installed (Google Tag Manager `dataLayer` or Plausible).
 */
type EventProps = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: (event: string, options?: { props?: EventProps }) => void;
  }
}

export type MarketingEvent =
  | "cta_click"
  | "demo_request_submitted"
  | "contact_submitted"
  | "roi_calculated"
  | "signup_started";

export function trackEvent(event: MarketingEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer?.push({ event, ...props });
    window.plausible?.(event, { props });
  } catch {
    /* analytics must never break the page */
  }
}
