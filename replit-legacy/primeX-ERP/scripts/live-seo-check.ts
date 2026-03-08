const LIVE_BASE_URL = process.env.REPLIT_DEPLOYMENT_URL
  ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
  : "https://prime7erp.com";

const PUBLIC_PAGES = [
  "/",
  "/features",
  "/garments-erp",
  "/buying-house-erp",
  "/erp-software-bangladesh",
  "/pricing",
  "/modules/merchandising",
  "/modules/inventory",
  "/resources",
  "/contact",
];

const EXPECTED_SITEMAP_ROUTES = [
  "/",
  "/features",
  "/garments-erp",
  "/buying-house-erp",
  "/erp-software-bangladesh",
  "/pricing",
  "/modules/merchandising",
  "/modules/inventory",
  "/resources",
  "/contact",
];

interface PageResult {
  url: string;
  status: number;
  titleLength: number | null;
  metaDescLength: number | null;
  hasCanonical: boolean;
  h1Count: number;
  hasOpenGraph: boolean;
  hasJsonLd: boolean;
  internalLinksCount: number;
  hasNoindex: boolean;
}

interface ScoreBreakdown {
  name: string;
  points: number;
  maxPoints: number;
  pass: boolean;
  detail: string;
}

function extractTitle(html: string): { length: number | null; text: string | null } {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (!match) return { length: null, text: null };
  const text = match[1].trim();
  return { length: text.length, text };
}

function extractMetaDesc(html: string): { length: number | null; text: string | null } {
  const match =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  if (!match) return { length: null, text: null };
  const text = match[1].trim();
  return { length: text.length, text };
}

function hasCanonical(html: string): boolean {
  return /<link[^>]*rel=["']canonical["'][^>]*>/i.test(html);
}

function countH1(html: string): number {
  const matches = html.match(/<h1[\s>]/gi);
  return matches ? matches.length : 0;
}

function hasOpenGraph(html: string): boolean {
  return /<meta[^>]*property=["']og:/i.test(html);
}

function hasJsonLd(html: string): boolean {
  return /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
}

function countInternalLinks(html: string): number {
  const matches = html.match(/href=["']\/[^"']*/gi);
  return matches ? matches.length : 0;
}

function hasNoindex(html: string): boolean {
  const match = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i);
  return match ? match[1].toLowerCase().includes("noindex") : false;
}

async function checkPage(path: string): Promise<{ result: PageResult; response: Response }> {
  const url = `${LIVE_BASE_URL}${path}`;
  const response = await fetch(url);
  const html = await response.text();
  const title = extractTitle(html);
  const desc = extractMetaDesc(html);

  return {
    result: {
      url: path,
      status: response.status,
      titleLength: title.length,
      metaDescLength: desc.length,
      hasCanonical: hasCanonical(html),
      h1Count: countH1(html),
      hasOpenGraph: hasOpenGraph(html),
      hasJsonLd: hasJsonLd(html),
      internalLinksCount: countInternalLinks(html),
      hasNoindex: hasNoindex(html),
    },
    response,
  };
}

function printDivider() {
  console.log("─".repeat(80));
}

function printHeader(text: string) {
  console.log("\n" + "═".repeat(80));
  console.log(`  ${text}`);
  console.log("═".repeat(80));
}

async function run() {
  printHeader("PRIME7 ERP — LIVE SEO CHECK (Phase-2 Validation)");
  console.log(`\n  Target: ${LIVE_BASE_URL}`);
  console.log(`  Date:   ${new Date().toISOString()}\n`);

  printHeader("⚠️  SPA NOTE — READ CAREFULLY");
  console.log(`
  This application is a React SPA (Single Page Application).
  The raw server HTML contains an empty <div id="root"></div>.
  All SEO meta tags (title, description, canonical, OG tags, JSON-LD,
  H1 tags) are injected CLIENT-SIDE via JavaScript after hydration.

  Therefore, the checks below on raw HTML will show missing tags —
  this is EXPECTED for an SPA without Server-Side Rendering (SSR).

  Google's crawler renders JavaScript and WILL see the full SEO tags.
  However, other crawlers (Bing, social media bots) may NOT render JS.

  SEO WARNING: SPA without SSR — meta tags injected via client-side
  JavaScript. Google renders JS but other crawlers may not.

  Image size checks are NOT possible from raw HTML since all images
  are loaded dynamically via JavaScript.
`);

  const scores: ScoreBreakdown[] = [];
  const criticalIssues: string[] = [];
  let pagesWithIssues = 0;

  // ─── PUBLIC PAGES ───────────────────────────────────────────────────────────
  printHeader("PUBLIC PAGES");

  const pageResults: PageResult[] = [];
  let allPagesReturn200 = true;

  for (const path of PUBLIC_PAGES) {
    try {
      const { result } = await checkPage(path);
      pageResults.push(result);

      const statusIcon = result.status === 200 ? "✅" : "❌";
      if (result.status !== 200) {
        allPagesReturn200 = false;
        criticalIssues.push(`${path} returned status ${result.status}`);
      }

      console.log(`\n  ${statusIcon} ${path}  [HTTP ${result.status}]`);
      console.log(`     Title length:      ${result.titleLength ?? "N/A (SPA — injected via JS)"}`);
      console.log(`     Meta desc length:  ${result.metaDescLength ?? "N/A (SPA — injected via JS)"}`);
      console.log(`     Canonical:         ${result.hasCanonical ? "Yes" : "No (SPA — injected via JS)"}`);
      console.log(`     H1 count:          ${result.h1Count || "0 (SPA — injected via JS)"}`);
      console.log(`     OpenGraph tags:    ${result.hasOpenGraph ? "Yes" : "No (SPA — injected via JS)"}`);
      console.log(`     JSON-LD:           ${result.hasJsonLd ? "Yes" : "No (SPA — injected via JS)"}`);
      console.log(`     Internal links:    ${result.internalLinksCount}`);
      console.log(`     Has noindex:       ${result.hasNoindex ? "⚠️ YES — PROBLEM!" : "No (good)"}`);

      if (result.hasNoindex) {
        pagesWithIssues++;
        criticalIssues.push(`${path} has noindex in raw HTML — public page should be indexable`);
      }
    } catch (err: any) {
      allPagesReturn200 = false;
      pagesWithIssues++;
      criticalIssues.push(`${path} failed to fetch: ${err.message}`);
      console.log(`\n  ❌ ${path}  [FETCH ERROR: ${err.message}]`);
    }
  }

  const noAccidentalNoindex = pageResults.every((r) => !r.hasNoindex);
  scores.push({
    name: "All pages return 200",
    points: allPagesReturn200 ? 20 : 0,
    maxPoints: 20,
    pass: allPagesReturn200,
    detail: allPagesReturn200
      ? "All public pages return HTTP 200"
      : "Some pages did not return 200",
  });
  scores.push({
    name: "No accidental noindex on public pages",
    points: noAccidentalNoindex ? 15 : 0,
    maxPoints: 15,
    pass: noAccidentalNoindex,
    detail: noAccidentalNoindex
      ? "No public pages have noindex in raw HTML"
      : "Some public pages have noindex in raw HTML",
  });

  // ─── /app/login ─────────────────────────────────────────────────────────────
  printHeader("/app/login CHECK");

  try {
    const loginUrl = `${LIVE_BASE_URL}/app/login`;
    const loginResponse = await fetch(loginUrl);
    const loginHtml = await loginResponse.text();
    const loginStatus = loginResponse.status;
    const loginHasNoindex = hasNoindex(loginHtml);
    const xRobotsTag = loginResponse.headers.get("x-robots-tag");

    const statusIcon = loginStatus === 200 ? "✅" : "❌";
    console.log(`\n  ${statusIcon} /app/login  [HTTP ${loginStatus}]`);
    console.log(`     noindex in HTML:    ${loginHasNoindex ? "Yes" : "No (expected — set via JS, not in raw HTML)"}`);
    console.log(`     X-Robots-Tag:       ${xRobotsTag ?? "Not set"}`);

    if (!loginHasNoindex) {
      console.log(`     ℹ️  NOTE: noindex is set via client-side JS (React Helmet/SEOHead).`);
      console.log(`        It will NOT appear in raw server HTML. This is expected for SPA.`);
      console.log(`        Google will see it after JS rendering.`);
    }

    const hasXRobotsTag = xRobotsTag !== null && xRobotsTag.toLowerCase().includes("noindex");
    scores.push({
      name: "/app/login has X-Robots-Tag header",
      points: hasXRobotsTag ? 10 : 0,
      maxPoints: 10,
      pass: hasXRobotsTag,
      detail: hasXRobotsTag
        ? `X-Robots-Tag: ${xRobotsTag}`
        : xRobotsTag
          ? `X-Robots-Tag present but missing noindex: "${xRobotsTag}"`
          : "X-Robots-Tag header not set — consider adding server-side noindex header",
    });

    if (!hasXRobotsTag) {
      criticalIssues.push("/app/login missing X-Robots-Tag: noindex header (server-side protection)");
    }

    if (loginStatus !== 200) {
      pagesWithIssues++;
    }
  } catch (err: any) {
    console.log(`\n  ❌ /app/login  [FETCH ERROR: ${err.message}]`);
    criticalIssues.push(`/app/login failed to fetch: ${err.message}`);
    scores.push({
      name: "/app/login has X-Robots-Tag header",
      points: 0,
      maxPoints: 10,
      pass: false,
      detail: `Failed to fetch: ${err.message}`,
    });
  }

  // ─── robots.txt ─────────────────────────────────────────────────────────────
  printHeader("robots.txt CHECK");

  try {
    const robotsResponse = await fetch(`${LIVE_BASE_URL}/robots.txt`);
    const robotsText = await robotsResponse.text();
    const robotsStatus = robotsResponse.status;

    const hasDisallowApp = robotsText.includes("Disallow: /app/");
    const hasSitemap = robotsText.includes("Sitemap:");

    console.log(`\n  HTTP ${robotsStatus}`);
    console.log(`  Content:\n`);
    robotsText.split("\n").forEach((line) => console.log(`    ${line}`));
    console.log();
    console.log(`  Disallow: /app/  →  ${hasDisallowApp ? "✅ Found" : "❌ Missing"}`);
    console.log(`  Sitemap: URL     →  ${hasSitemap ? "✅ Found" : "❌ Missing"}`);

    const robotsPass = hasDisallowApp && hasSitemap && robotsStatus === 200;
    scores.push({
      name: "robots.txt compliance",
      points: robotsPass ? 15 : 0,
      maxPoints: 15,
      pass: robotsPass,
      detail: robotsPass
        ? "robots.txt has Disallow: /app/ and Sitemap URL"
        : `Issues: ${!hasDisallowApp ? "Missing Disallow: /app/. " : ""}${!hasSitemap ? "Missing Sitemap URL. " : ""}${robotsStatus !== 200 ? `Status ${robotsStatus}` : ""}`,
    });

    if (!robotsPass) {
      if (!hasDisallowApp) criticalIssues.push("robots.txt missing 'Disallow: /app/'");
      if (!hasSitemap) criticalIssues.push("robots.txt missing 'Sitemap:' URL");
    }
  } catch (err: any) {
    console.log(`\n  ❌ robots.txt  [FETCH ERROR: ${err.message}]`);
    criticalIssues.push(`robots.txt failed to fetch: ${err.message}`);
    scores.push({
      name: "robots.txt compliance",
      points: 0,
      maxPoints: 15,
      pass: false,
      detail: `Failed to fetch: ${err.message}`,
    });
  }

  // ─── sitemap.xml ────────────────────────────────────────────────────────────
  printHeader("sitemap.xml CHECK");

  try {
    const sitemapResponse = await fetch(`${LIVE_BASE_URL}/sitemap.xml`);
    const sitemapText = await sitemapResponse.text();
    const sitemapStatus = sitemapResponse.status;

    const urlMatches = sitemapText.match(/<loc>([^<]*)<\/loc>/gi) || [];
    const sitemapUrls = urlMatches.map((m) => {
      const match = m.match(/<loc>([^<]*)<\/loc>/i);
      return match ? match[1] : "";
    });
    const urlCount = sitemapUrls.length;

    const containsApp = sitemapUrls.some((u) => u.includes("/app/"));
    const missingRoutes: string[] = [];
    for (const route of EXPECTED_SITEMAP_ROUTES) {
      const found = sitemapUrls.some((u) => {
        const urlPath = new URL(u).pathname.replace(/\/$/, "") || "/";
        const expectedPath = route.replace(/\/$/, "") || "/";
        return urlPath === expectedPath;
      });
      if (!found) missingRoutes.push(route);
    }

    console.log(`\n  HTTP ${sitemapStatus}`);
    console.log(`  Total URLs: ${urlCount}`);
    console.log();

    if (urlCount <= 50) {
      sitemapUrls.forEach((u) => console.log(`    ${u}`));
    } else {
      sitemapUrls.slice(0, 20).forEach((u) => console.log(`    ${u}`));
      console.log(`    ... and ${urlCount - 20} more`);
    }

    console.log();
    console.log(`  Contains /app/ URLs:  ${containsApp ? "❌ YES — should be excluded!" : "✅ No (good)"}`);
    console.log(`  Expected routes present: ${EXPECTED_SITEMAP_ROUTES.length - missingRoutes.length}/${EXPECTED_SITEMAP_ROUTES.length}`);

    if (missingRoutes.length > 0) {
      console.log(`  Missing routes:`);
      missingRoutes.forEach((r) => console.log(`    ❌ ${r}`));
    }

    const sitemapExcludesApp = !containsApp;
    const sitemapHasAllRoutes = missingRoutes.length === 0;
    const sitemapCompliance = sitemapExcludesApp && sitemapHasAllRoutes && sitemapStatus === 200 && urlCount > 0;

    scores.push({
      name: "sitemap.xml compliance",
      points: sitemapCompliance ? 15 : 0,
      maxPoints: 15,
      pass: sitemapCompliance,
      detail: sitemapCompliance
        ? `${urlCount} URLs, all expected routes present, no /app/ URLs`
        : `Issues found in sitemap`,
    });
    scores.push({
      name: "Sitemap contains all expected routes",
      points: sitemapHasAllRoutes ? 15 : 0,
      maxPoints: 15,
      pass: sitemapHasAllRoutes,
      detail: sitemapHasAllRoutes
        ? "All expected public routes found in sitemap"
        : `Missing: ${missingRoutes.join(", ")}`,
    });
    scores.push({
      name: "Sitemap excludes /app/",
      points: sitemapExcludesApp ? 10 : 0,
      maxPoints: 10,
      pass: sitemapExcludesApp,
      detail: sitemapExcludesApp
        ? "No /app/ URLs in sitemap"
        : "Sitemap contains /app/ URLs — these should be excluded",
    });

    if (containsApp) criticalIssues.push("sitemap.xml contains /app/ URLs");
    if (missingRoutes.length > 0) criticalIssues.push(`sitemap.xml missing routes: ${missingRoutes.join(", ")}`);
  } catch (err: any) {
    console.log(`\n  ❌ sitemap.xml  [FETCH ERROR: ${err.message}]`);
    criticalIssues.push(`sitemap.xml failed to fetch: ${err.message}`);
    scores.push({
      name: "sitemap.xml compliance",
      points: 0,
      maxPoints: 15,
      pass: false,
      detail: `Failed to fetch: ${err.message}`,
    });
    scores.push({
      name: "Sitemap contains all expected routes",
      points: 0,
      maxPoints: 15,
      pass: false,
      detail: `Failed to fetch`,
    });
    scores.push({
      name: "Sitemap excludes /app/",
      points: 0,
      maxPoints: 10,
      pass: false,
      detail: `Failed to fetch`,
    });
  }

  // ─── SPA AWARENESS (informational, 0 points) ───────────────────────────────
  scores.push({
    name: "SPA awareness note (informational)",
    points: 0,
    maxPoints: 0,
    pass: true,
    detail: "React SPA — meta tags injected client-side. Google renders JS.",
  });

  // ─── FINAL SCORE ───────────────────────────────────────────────────────────
  printHeader("SEO HEALTH SCORE BREAKDOWN");

  const totalPoints = scores.reduce((sum, s) => sum + s.points, 0);
  const maxPoints = scores.reduce((sum, s) => sum + s.maxPoints, 0);
  const healthScore = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;

  console.log();
  for (const s of scores) {
    const icon = s.pass ? "✅" : "❌";
    const pointsStr = s.maxPoints > 0 ? `${s.points}/${s.maxPoints} pts` : "info";
    console.log(`  ${icon} ${s.name.padEnd(45)} ${pointsStr.padStart(12)}  ${s.detail}`);
  }

  const totalPages = PUBLIC_PAGES.length + 1 + 2;
  const indexReady = pageResults.filter((r) => r.status === 200 && !r.hasNoindex).length;

  printHeader("FINAL SUMMARY");
  console.log();
  console.log(`  Total pages checked:    ${totalPages}`);
  console.log(`  Pages index-ready:      ${indexReady}/${PUBLIC_PAGES.length} public pages`);
  console.log(`  Pages with issues:      ${pagesWithIssues}`);
  console.log();
  console.log(`  ┌─────────────────────────────────┐`);
  console.log(`  │                                 │`);
  console.log(`  │   SEO HEALTH SCORE:  ${String(healthScore).padStart(3)}/100    │`);
  console.log(`  │   ${healthScore >= 80 ? "🟢 GOOD" : healthScore >= 50 ? "🟡 NEEDS WORK" : "🔴 CRITICAL"}${" ".repeat(24 - (healthScore >= 80 ? 6 : healthScore >= 50 ? 12 : 10))}│`);
  console.log(`  │                                 │`);
  console.log(`  └─────────────────────────────────┘`);
  console.log();

  if (criticalIssues.length > 0) {
    console.log(`  ⚠️  CRITICAL ISSUES (${criticalIssues.length}):`);
    criticalIssues.forEach((issue, i) => console.log(`     ${i + 1}. ${issue}`));
    console.log();
  } else {
    console.log(`  ✅ No critical issues found!\n`);
  }

  console.log(`  SEO Phase-2 Validation Complete`);
  printDivider();
  console.log();
}

run().catch((err) => {
  console.error("Fatal error running SEO check:", err);
  process.exit(1);
});
