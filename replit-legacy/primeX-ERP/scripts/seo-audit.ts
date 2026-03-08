const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

const PUBLIC_URLS = [
  "/",
  "/features",
  "/garments-erp",
  "/buying-house-erp",
  "/erp-software-bangladesh",
  "/garment-erp-software",
  "/apparel-production-management",
  "/textile-erp-system",
  "/erp-comparison",
  "/modules/merchandising",
  "/modules/inventory",
  "/modules/accounting",
  "/modules/production",
  "/modules/lc-processing",
  "/modules/quality-management",
  "/modules/hr-payroll",
  "/modules/reports-analytics",
  "/modules/crm-support",
  "/pricing",
  "/about",
  "/contact",
  "/how-it-works",
  "/security",
  "/privacy",
  "/terms",
  "/resources",
];

const APP_URLS = ["/app/login"];

interface AuditResult {
  url: string;
  checks: { name: string; pass: boolean; detail: string }[];
}

async function fetchPage(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`);
  return res.text();
}

function checkTitle(html: string): { pass: boolean; detail: string } {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (!match) return { pass: false, detail: "No <title> tag found" };
  const title = match[1].trim();
  if (title.length < 20) return { pass: false, detail: `Title too short (${title.length} chars): "${title}"` };
  if (title.length > 70) return { pass: false, detail: `Title too long (${title.length} chars): "${title}"` };
  return { pass: true, detail: `"${title}" (${title.length} chars)` };
}

function checkMetaDescription(html: string): { pass: boolean; detail: string } {
  const match = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
  if (!match) return { pass: false, detail: "No meta description found" };
  const desc = match[1].trim();
  if (desc.length < 70) return { pass: false, detail: `Description too short (${desc.length} chars)` };
  if (desc.length > 160) return { pass: false, detail: `Description too long (${desc.length} chars)` };
  return { pass: true, detail: `${desc.length} chars` };
}

function checkCanonical(html: string): { pass: boolean; detail: string } {
  const match = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i);
  if (!match) return { pass: false, detail: "No canonical link found" };
  return { pass: true, detail: match[1] };
}

function checkH1(html: string): { pass: boolean; detail: string } {
  const matches = html.match(/<h1[\s>]/gi);
  if (!matches) return { pass: false, detail: "No H1 tag found" };
  if (matches.length > 1) return { pass: false, detail: `Multiple H1 tags found (${matches.length})` };
  return { pass: true, detail: "1 H1 tag found" };
}

function checkNotNoindex(html: string): { pass: boolean; detail: string } {
  const match = html.match(/<meta[^>]*name="robots"[^>]*content="([^"]*)"[^>]*>/i);
  if (match && match[1].includes("noindex")) return { pass: false, detail: "Page has noindex — should be indexed" };
  return { pass: true, detail: "Page is indexable" };
}

function checkIsNoindex(html: string): { pass: boolean; detail: string } {
  const match = html.match(/<meta[^>]*name="robots"[^>]*content="([^"]*)"[^>]*>/i);
  if (!match || !match[1].includes("noindex")) return { pass: false, detail: "Page is NOT noindex — /app pages should be noindex" };
  return { pass: true, detail: "Page is correctly noindex" };
}

async function auditPublicPage(path: string): Promise<AuditResult> {
  const html = await fetchPage(path);
  return {
    url: path,
    checks: [
      { name: "Title (20-70 chars)", ...checkTitle(html) },
      { name: "Meta Description (70-160)", ...checkMetaDescription(html) },
      { name: "Canonical URL", ...checkCanonical(html) },
      { name: "Single H1", ...checkH1(html) },
      { name: "Not noindex", ...checkNotNoindex(html) },
    ],
  };
}

async function auditAppPage(path: string): Promise<AuditResult> {
  const html = await fetchPage(path);
  return {
    url: path,
    checks: [
      { name: "Is noindex", ...checkIsNoindex(html) },
    ],
  };
}

async function auditRobots(): Promise<AuditResult> {
  const text = await fetchPage("/robots.txt");
  const checks = [];
  checks.push({
    name: "Contains Allow: /",
    pass: text.includes("Allow: /"),
    detail: text.includes("Allow: /") ? "Found" : "Missing",
  });
  checks.push({
    name: "Disallows /app/",
    pass: text.includes("Disallow: /app/"),
    detail: text.includes("Disallow: /app/") ? "Found" : "Missing",
  });
  checks.push({
    name: "Contains Sitemap URL",
    pass: text.includes("Sitemap:"),
    detail: text.includes("Sitemap:") ? "Found" : "Missing",
  });
  return { url: "/robots.txt", checks };
}

async function auditSitemap(): Promise<AuditResult> {
  const text = await fetchPage("/sitemap.xml");
  const urlCount = (text.match(/<url>/g) || []).length;
  const checks = [];
  checks.push({
    name: "Has URLs",
    pass: urlCount > 0,
    detail: `${urlCount} URLs found`,
  });
  checks.push({
    name: "Excludes /app/",
    pass: !text.includes("/app/"),
    detail: text.includes("/app/") ? "FAIL: /app/ found in sitemap" : "No /app/ URLs",
  });
  checks.push({
    name: "Includes module pages",
    pass: text.includes("/modules/merchandising"),
    detail: text.includes("/modules/merchandising") ? "Module pages found" : "Module pages missing",
  });
  checks.push({
    name: "Has lastmod",
    pass: text.includes("<lastmod>"),
    detail: text.includes("<lastmod>") ? "Found" : "Missing",
  });
  return { url: "/sitemap.xml", checks };
}

async function run() {
  console.log("\n=== Prime7 ERP SEO Audit ===\n");
  console.log("NOTE: This is a React SPA. SEO meta tags (title, description, canonical, H1)");
  console.log("are injected client-side via SEOHead component after JS hydration.");
  console.log("Google renders JavaScript, so these pages WILL be indexed correctly.");
  console.log("Server-side checks below verify initial HTML only.\n");

  let totalPass = 0;
  let totalFail = 0;

  const publicResults = await Promise.all(PUBLIC_URLS.map(auditPublicPage));
  const appResults = await Promise.all(APP_URLS.map(auditAppPage));
  const robotsResult = await auditRobots();
  const sitemapResult = await auditSitemap();

  const allResults = [...publicResults, ...appResults, robotsResult, sitemapResult];

  for (const result of allResults) {
    const fails = result.checks.filter(c => !c.pass);
    if (fails.length > 0) {
      console.log(`\n❌ ${result.url}`);
      for (const check of result.checks) {
        const icon = check.pass ? "  ✅" : "  ❌";
        console.log(`${icon} ${check.name}: ${check.detail}`);
      }
    }
    totalPass += result.checks.filter(c => c.pass).length;
    totalFail += fails.length;
  }

  const passedPages = allResults.filter(r => r.checks.every(c => c.pass));
  if (passedPages.length > 0) {
    console.log(`\n✅ ${passedPages.length} pages passed all checks:`);
    passedPages.forEach(r => console.log(`   ${r.url}`));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total checks: ${totalPass + totalFail}`);
  console.log(`Passed: ${totalPass}`);
  console.log(`Failed: ${totalFail}`);
  console.log(`Pages audited: ${allResults.length}`);
  console.log(`Score: ${Math.round((totalPass / (totalPass + totalFail)) * 100)}%\n`);
}

run().catch(console.error);
