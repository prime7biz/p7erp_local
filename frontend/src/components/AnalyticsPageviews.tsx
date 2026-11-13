import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageview } from "@/lib/analytics";

/** Sends one page view per public page visit (src/lib/analytics.ts decides which pages count). Renders nothing. */
export function AnalyticsPageviews() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageview(pathname);
  }, [pathname]);
  return null;
}
