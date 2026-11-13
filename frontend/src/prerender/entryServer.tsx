/**
 * Build-time entry for pre-rendering public marketing pages.
 *
 * `vite build --ssr src/prerender/entryServer.tsx --outDir dist-ssr` bundles this file for Node;
 * scripts/inject-static-route-html.ts renders the elements below and writes the result into
 * dist/<path>/index.html. It is never loaded in the browser.
 *
 * The same <Seo /> and <AppRouter /> the browser uses are rendered here, so the HTML that
 * search engines and link previews read matches what visitors see after JavaScript loads.
 */
import { Suspense, type ReactElement } from "react";
import { HelmetProvider } from "react-helmet-async";
import { StaticRouter } from "react-router-dom";
import { AppRouter } from "@/app/router";
import { Seo } from "@/components/Seo";
import { AppRoot } from "@/AppRoot";

/** Which lazy public routes the last page rendered (written into the HTML for hydration preloading). */
export { renderedRouteIds, resetRenderedRouteIds } from "@/app/lazyRoute";

/** Head tags only (title, meta, canonical, JSON-LD) for pages whose body is not pre-rendered. */
export function headElement(pathname: string, helmetContext: object): ReactElement {
  return (
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={pathname}>
        <Seo />
      </StaticRouter>
    </HelmetProvider>
  );
}

/** Head tags plus the page body, exactly as the public route renders on first load (swap mode). */
export function pageElement(pathname: string, helmetContext: object): ReactElement {
  return (
    <HelmetProvider context={helmetContext}>
      <StaticRouter location={pathname}>
        <Seo />
        <Suspense fallback={null}>
          <AppRouter />
        </Suspense>
      </StaticRouter>
    </HelmetProvider>
  );
}

/** The full browser app tree (src/AppRoot.tsx) for hydration mode (PRERENDER_HYDRATE=true). */
export function hydratableElement(pathname: string, helmetContext: object): ReactElement {
  return (
    <AppRoot
      helmetContext={helmetContext}
      renderRouter={(children) => <StaticRouter location={pathname}>{children}</StaticRouter>}
    />
  );
}
