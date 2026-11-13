/**
 * After `vite build` (browser) and `vite build --ssr` (dist-ssr/), writes one HTML file per public page:
 *   dist/index.html, dist/pricing/index.html, dist/resources/<slug>/index.html, ...
 * Nginx serves them with `try_files $uri $uri/index.html /spa-fallback.html` (nginx.prod.conf).
 *
 * Each page file contains, in the first response (no JavaScript needed):
 *   - the head tags from src/components/Seo.tsx (title, description, canonical, Open Graph, JSON-LD)
 *   - the page body for public marketing pages, inside <div data-prerendered> (see src/lib/prerenderSnapshot.ts)
 *
 * Also writes dist/spa-fallback.html (noindex) for app, portal, auth and unknown URLs.
 *
 * Env:
 *   PRERENDER_PUBLIC_HTML=false  -> kill switch: head tags only (title/description/robots/canonical), empty body
 *   VITE_SITE_URL (then SITEMAP_SITE_URL) -> site origin used by the fallback canonical (default https://prime7erp.com)
 *
 * If rendering one page fails, that page falls back to head tags only and the build continues.
 */
import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ReactElement } from "react";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { PRERENDER_HEAD_ONLY_PATHS, PUBLIC_MARKETING_PATHS } from "../src/config/publicMarketingPaths.ts";
import { getSeoForPath } from "../src/config/seo.ts";
import { resourceArticles } from "../src/data/resourcesArticles.ts";
import { getRobotsMetaContent, ROBOTS_NOINDEX } from "../src/utils/seoRobots.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.join(__dirname, "..");
const DIST = path.join(FRONTEND_ROOT, "dist");
const SSR_ENTRY = path.join(FRONTEND_ROOT, "dist-ssr", "entryServer.js");

const HEAD_START = "<!-- p7:seo-head:start";
const HEAD_END = "<!-- p7:seo-head:end -->";
const ROOT_TAG = '<div id="root"></div>';
const RENDER_TIMEOUT_MS = 20_000;

type HelmetDatum = { toString(): string };
type HelmetContext = {
  helmet?: Record<"title" | "meta" | "link" | "script" | "htmlAttributes", HelmetDatum>;
};
type Renderer = {
  headElement: (pathname: string, ctx: object) => ReactElement;
  pageElement: (pathname: string, ctx: object) => ReactElement;
  hydratableElement: (pathname: string, ctx: object) => ReactElement;
  renderedRouteIds: () => string[];
  resetRenderedRouteIds: () => void;
};

const HYDRATE = process.env.PRERENDER_HYDRATE === "true";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function replaceHeadBlock(template: string, headHtml: string): string {
  const start = template.indexOf(HEAD_START);
  const end = template.indexOf(HEAD_END);
  if (start < 0 || end < start) {
    throw new Error("dist/index.html has no p7:seo-head markers — run `vite build` again before this script.");
  }
  // Markers stay in the output so this script can run again on the same files.
  return `${template.slice(0, start)}<!-- p7:seo-head:start -->\n    ${headHtml}\n    ${HEAD_END}${template.slice(end + HEAD_END.length)}`;
}

/** The Vite output before this script changed it; kept in dist-ssr/ (never served) so re-runs work. */
function readTemplate(): string {
  const indexPath = path.join(DIST, "index.html");
  const savedPath = path.join(FRONTEND_ROOT, "dist-ssr", "index.template.html");
  const current = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  if (current.includes(HEAD_START) && current.includes(ROOT_TAG)) {
    fs.mkdirSync(path.dirname(savedPath), { recursive: true });
    fs.writeFileSync(savedPath, current, "utf8");
    return current;
  }
  if (fs.existsSync(savedPath)) return fs.readFileSync(savedPath, "utf8");
  console.error("inject-static-route-html: dist/index.html missing or already processed — run vite build first.");
  process.exit(1);
}

/** Head tags used when pre-rendering is off or failed (same tags the old script wrote). */
function basicHead(pathname: string): string {
  const meta = getSeoForPath(pathname);
  // Same order as Seo.tsx (VITE_SITE_URL); verify-seo-build.mjs fails if canonicals and sitemap URLs differ.
  const siteUrl = (process.env.VITE_SITE_URL || process.env.SITEMAP_SITE_URL || "https://prime7erp.com").replace(/\/$/, "");
  const canonical = `${siteUrl}${pathname === "/" ? "" : pathname}`;
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" data-rh="true" />`,
    `<meta name="robots" content="${escapeHtml(getRobotsMetaContent(pathname))}" data-rh="true" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" data-rh="true" />`,
  ].join("\n    ");
}

function helmetHead(ctx: HelmetContext): string {
  const h = ctx.helmet;
  if (!h) throw new Error("Seo did not produce head tags");
  return [h.title, h.meta, h.link, h.script].map((part) => part.toString()).filter(Boolean).join("\n    ");
}

function renderToHtml(element: ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    let failed: unknown = null;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        html += chunk.toString();
        callback();
      },
      final(callback) {
        if (failed) reject(failed);
        else resolve(html);
        callback();
      },
    });
    const stream = renderToPipeableStream(element, {
      onAllReady() {
        clearTimeout(timer);
        stream.pipe(sink);
      },
      onShellError(error) {
        clearTimeout(timer);
        reject(error);
      },
      onError(error) {
        // A component threw inside a Suspense boundary: the HTML would be incomplete, so do not use it.
        failed = error;
      },
    });
    const timer = setTimeout(() => {
      stream.abort();
      reject(new Error(`render timed out after ${RENDER_TIMEOUT_MS} ms`));
    }, RENDER_TIMEOUT_MS);
  });
}

async function loadRenderer(): Promise<Renderer | null> {
  if (process.env.PRERENDER_PUBLIC_HTML === "false") {
    console.log("inject-static-route-html: PRERENDER_PUBLIC_HTML=false — writing head tags only.");
    return null;
  }
  if (!fs.existsSync(SSR_ENTRY)) {
    console.warn(`inject-static-route-html: WARNING ${path.relative(FRONTEND_ROOT, SSR_ENTRY)} missing — writing head tags only.`);
    return null;
  }
  try {
    return (await import(pathToFileURL(SSR_ENTRY).href)) as Renderer;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`inject-static-route-html: WARNING could not load the pre-render bundle (${reason}) — writing head tags only.`);
    return null;
  }
}

async function buildPage(template: string, pathname: string, renderer: Renderer | null): Promise<{ html: string; body: boolean }> {
  if (renderer) {
    try {
      const ctx: HelmetContext = {};
      let body = "";
      if (PRERENDER_HEAD_ONLY_PATHS.has(pathname)) {
        renderToString(renderer.headElement(pathname, ctx));
      } else {
        renderer.resetRenderedRouteIds();
        const element = HYDRATE ? renderer.hydratableElement(pathname, ctx) : renderer.pageElement(pathname, ctx);
        body = await renderToHtml(element);
        if (!body.includes("<h1")) throw new Error("rendered page has no <h1>");
      }
      let head = helmetHead(ctx);
      if (HYDRATE && body) {
        // Data only (not executed, allowed by the CSP): src/main.tsx preloads these chunks before hydrating.
        const ids = JSON.stringify(renderer.renderedRouteIds()).replace(/</g, "\\u003c");
        head += `\n    <script type="application/json" id="p7-route-chunks">${ids}</script>`;
      }
      let html = replaceHeadBlock(template, head);
      const lang = ctx.helmet?.htmlAttributes.toString();
      if (lang) html = html.replace(/<html[^>]*>/, `<html ${lang}>`);
      if (body) {
        if (!html.includes(ROOT_TAG)) throw new Error(`template has no ${ROOT_TAG}`);
        html = html.replace(
          ROOT_TAG,
          HYDRATE
            ? `<div id="root" data-hydrate="true">${body}</div>`
            : `<div id="root"><div data-prerendered="true" style="display:contents">${body}</div></div>`,
        );
      }
      return { html, body: Boolean(body) };
    } catch (error) {
      console.warn(`inject-static-route-html: WARNING ${pathname} could not be pre-rendered (${String(error)}); head tags only.`);
    }
  }
  return { html: replaceHeadBlock(template, basicHead(pathname)), body: false };
}

function writeFile(urlPath: string, html: string) {
  const rel = urlPath === "/" ? "index.html" : path.join(...urlPath.slice(1).split("/"), "index.html");
  const full = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html, "utf8");
}

/**
 * Pre-rendered text is painted before the app loads, so the main font should arrive with the page;
 * otherwise the text is drawn twice (fallback font, then Inter). Only the Latin Inter file is preloaded.
 */
function withFontPreload(template: string): string {
  const assets = path.join(DIST, "assets");
  const font = fs.existsSync(assets) ? fs.readdirSync(assets).find((f) => /^inter-latin-wght-normal-.*\.woff2$/.test(f)) : undefined;
  if (!font || template.includes(`/assets/${font}`)) return template;
  return template.replace(
    HEAD_END,
    `${HEAD_END}\n    <link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />`,
  );
}

async function main() {
  const template = withFontPreload(readTemplate());
  const renderer = await loadRenderer();

  // App, portal, auth and unknown URLs: same JavaScript, but never indexed from the raw HTML.
  const fallbackHead = [
    "<title>Prime7 ERP</title>",
    `<meta name="robots" content="${ROBOTS_NOINDEX}" data-rh="true" />`,
  ].join("\n    ");
  fs.writeFileSync(path.join(DIST, "spa-fallback.html"), replaceHeadBlock(template, fallbackHead), "utf8");

  const articlePaths = resourceArticles.map((a) => `/resources/${a.slug}`);
  const allPaths = [...new Set([...PUBLIC_MARKETING_PATHS, ...articlePaths])];

  let pages = 0;
  let withBody = 0;
  for (const p of allPaths) {
    if (getRobotsMetaContent(p) === ROBOTS_NOINDEX) continue;
    const { html, body } = await buildPage(template, p, renderer);
    writeFile(p, html);
    pages++;
    if (body) withBody++;
  }
  console.log(
    `inject-static-route-html: wrote ${pages} page files (${withBody} with pre-rendered body, ${HYDRATE ? "hydrate" : "swap"} mode) + spa-fallback.html under dist/`,
  );
}

main().catch((error) => {
  console.error("inject-static-route-html: failed", error);
  process.exit(1);
});
