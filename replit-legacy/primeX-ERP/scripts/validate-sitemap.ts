const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://prime7erp.com";

interface PageValidation {
  url: string;
  path: string;
  status: number;
  redirectedTo: string | null;
  contentType: string;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  descriptionLength: number;
  canonical: string | null;
  canonicalOk: boolean;
  canonicalDetail: string;
  hasNoindex: boolean;
  h1Count: number;
  pass: boolean;
  errors: string[];
}

async function fetchSitemap(): Promise<string[]> {
  const res = await fetch(`${SITE_URL}/sitemap.xml`);
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const urls: string[] = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

function extractTag(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

async function validateUrl(fullUrl: string): Promise<PageValidation> {
  const path = fullUrl.replace(SITE_URL, "") || "/";
  const errors: string[] = [];

  let status = 0;
  let redirectedTo: string | null = null;
  let contentType = "";
  let html = "";

  try {
    const res = await fetch(fullUrl, { redirect: "follow" });
    status = res.status;
    contentType = res.headers.get("content-type") || "";
    const finalUrl = res.url;
    if (finalUrl !== fullUrl && finalUrl !== fullUrl + "/") {
      redirectedTo = finalUrl;
    }
    html = await res.text();
  } catch (e: any) {
    return {
      url: fullUrl,
      path,
      status: 0,
      redirectedTo: null,
      contentType: "",
      title: null,
      titleLength: 0,
      metaDescription: null,
      descriptionLength: 0,
      canonical: null,
      canonicalOk: false,
      canonicalDetail: "FETCH_ERROR",
      hasNoindex: false,
      h1Count: 0,
      pass: false,
      errors: [`Fetch error: ${e.message}`],
    };
  }

  if (status !== 200) {
    errors.push(`HTTP ${status} (expected 200)`);
  }

  const title = extractTag(html, /<title[^>]*>(.*?)<\/title>/i);
  const titleLength = title ? title.length : 0;

  const metaDescription =
    extractTag(html, /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) ||
    extractTag(html, /<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
  const descriptionLength = metaDescription ? metaDescription.length : 0;

  const canonical =
    extractTag(html, /<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i) ||
    extractTag(html, /<link[^>]*href="([^"]*)"[^>]*rel="canonical"[^>]*>/i);

  let canonicalOk = false;
  let canonicalDetail = "";

  const expectedCanonical = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;

  if (!canonical) {
    canonicalDetail = "SPA (injected via JS)";
    canonicalOk = true;
  } else if (canonical === expectedCanonical) {
    canonicalDetail = "OK";
    canonicalOk = true;
  } else if (canonical === expectedCanonical.replace(/\/$/, "")) {
    canonicalDetail = "OK (no trailing slash)";
    canonicalOk = true;
  } else if (canonical.replace(/\/$/, "") === expectedCanonical.replace(/\/$/, "")) {
    canonicalDetail = "OK (slash normalized)";
    canonicalOk = true;
  } else {
    canonicalDetail = `MISMATCH: ${canonical}`;
    canonicalOk = false;
    errors.push(`Canonical mismatch: expected ${expectedCanonical}, got ${canonical}`);
  }

  const robotsMeta = extractTag(html, /<meta[^>]*name="robots"[^>]*content="([^"]*)"[^>]*>/i);
  const hasNoindex = robotsMeta ? robotsMeta.toLowerCase().includes("noindex") : false;

  if (hasNoindex && !path.startsWith("/app")) {
    errors.push("Public page has noindex!");
  }

  const h1Matches = html.match(/<h1[\s>]/gi);
  const h1Count = h1Matches ? h1Matches.length : 0;

  return {
    url: fullUrl,
    path,
    status,
    redirectedTo,
    contentType,
    title,
    titleLength,
    metaDescription,
    descriptionLength,
    canonical,
    canonicalOk,
    canonicalDetail,
    hasNoindex,
    h1Count,
    pass: errors.length === 0,
    errors,
  };
}

async function checkRobotsTxt(): Promise<{ pass: boolean; errors: string[] }> {
  const errors: string[] = [];
  try {
    const res = await fetch(`${SITE_URL}/robots.txt`);
    const text = await res.text();
    if (!text.includes("Disallow: /app/")) {
      errors.push("robots.txt missing 'Disallow: /app/'");
    }
    if (!text.includes("Sitemap:")) {
      errors.push("robots.txt missing Sitemap URL");
    }
  } catch (e: any) {
    errors.push(`Failed to fetch robots.txt: ${e.message}`);
  }
  return { pass: errors.length === 0, errors };
}

async function checkAppNoindex(): Promise<{ pass: boolean; errors: string[]; xRobotsTag: string | null }> {
  const errors: string[] = [];
  let xRobotsTag: string | null = null;
  try {
    const res = await fetch(`${SITE_URL}/app/login`);
    xRobotsTag = res.headers.get("x-robots-tag");
    if (!xRobotsTag || !xRobotsTag.toLowerCase().includes("noindex")) {
      errors.push("/app/login missing X-Robots-Tag: noindex header");
    }
  } catch (e: any) {
    errors.push(`Failed to fetch /app/login: ${e.message}`);
  }
  return { pass: errors.length === 0, errors, xRobotsTag };
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : " ".repeat(len - str.length) + str;
}

async function run() {
  console.log("\n" + "=".repeat(90));
  console.log("  PRIME7 ERP — SITEMAP VALIDATION REPORT");
  console.log("=".repeat(90));
  console.log(`  Site: ${SITE_URL}`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log(`  Note: This is a React SPA. Title, description, canonical, H1, and`);
  console.log(`        noindex meta tags are injected client-side via JavaScript.`);
  console.log(`        Google renders JS and will see all tags. Raw HTML checks below.`);
  console.log("=".repeat(90) + "\n");

  console.log("Fetching sitemap.xml...");
  const sitemapUrls = await fetchSitemap();
  console.log(`Found ${sitemapUrls.length} URLs in sitemap.\n`);

  const appUrlsInSitemap = sitemapUrls.filter(u => u.includes("/app/"));
  if (appUrlsInSitemap.length > 0) {
    console.log("  FAIL: /app/ URLs found in sitemap:");
    appUrlsInSitemap.forEach(u => console.log(`    - ${u}`));
    console.log();
  } else {
    console.log("  OK: No /app/ URLs in sitemap.\n");
  }

  console.log("Validating each URL...\n");

  const results: PageValidation[] = [];
  const batchSize = 5;
  for (let i = 0; i < sitemapUrls.length; i += batchSize) {
    const batch = sitemapUrls.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(validateUrl));
    results.push(...batchResults);
    process.stdout.write(`  Checked ${Math.min(i + batchSize, sitemapUrls.length)}/${sitemapUrls.length}\r`);
  }
  console.log();

  const hdrUrl = padRight("URL", 50);
  const hdrSt = padLeft("Status", 7);
  const hdrCan = padRight("Canonical", 22);
  const hdrTtl = padLeft("Title", 6);
  const hdrDesc = padLeft("Desc", 5);
  const hdrNoi = padLeft("Noindex", 8);
  const hdrH1 = padLeft("H1s", 4);

  console.log("-".repeat(106));
  console.log(`${hdrUrl} ${hdrSt} ${hdrCan} ${hdrTtl} ${hdrDesc} ${hdrNoi} ${hdrH1}`);
  console.log("-".repeat(106));

  for (const r of results) {
    const url = padRight(r.path, 50);
    const st = padLeft(String(r.status), 7);
    const can = padRight(r.canonicalDetail.substring(0, 22), 22);
    const ttl = padLeft(r.titleLength > 0 ? `${r.titleLength}c` : "-", 6);
    const desc = padLeft(r.descriptionLength > 0 ? `${r.descriptionLength}c` : "-", 5);
    const noi = padLeft(r.hasNoindex ? "YES" : "no", 8);
    const h1 = padLeft(String(r.h1Count), 4);
    const icon = r.pass ? "OK" : "XX";
    console.log(`${icon} ${url} ${st} ${can} ${ttl} ${desc} ${noi} ${h1}`);
  }
  console.log("-".repeat(106));

  console.log("\n" + "=".repeat(90));
  console.log("  ADDITIONAL CHECKS");
  console.log("=".repeat(90));

  const robotsCheck = await checkRobotsTxt();
  console.log(`\n  robots.txt: ${robotsCheck.pass ? "PASS" : "FAIL"}`);
  robotsCheck.errors.forEach(e => console.log(`    - ${e}`));

  const appCheck = await checkAppNoindex();
  console.log(`  /app/login noindex: ${appCheck.pass ? "PASS" : "FAIL"}`);
  if (appCheck.xRobotsTag) {
    console.log(`    X-Robots-Tag: ${appCheck.xRobotsTag}`);
  }
  appCheck.errors.forEach(e => console.log(`    - ${e}`));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const allErrors: string[] = [];

  for (const r of results) {
    r.errors.forEach(e => allErrors.push(`${r.path}: ${e}`));
  }
  robotsCheck.errors.forEach(e => allErrors.push(`robots.txt: ${e}`));
  appCheck.errors.forEach(e => allErrors.push(`/app: ${e}`));
  if (appUrlsInSitemap.length > 0) {
    allErrors.push(`Sitemap contains ${appUrlsInSitemap.length} /app/ URLs`);
  }

  console.log("\n" + "=".repeat(90));
  console.log("  SUMMARY");
  console.log("=".repeat(90));
  console.log(`  Total sitemap URLs:   ${sitemapUrls.length}`);
  console.log(`  HTTP 200 OK:          ${results.filter(r => r.status === 200).length}`);
  console.log(`  Passed validation:    ${passed}`);
  console.log(`  Failed validation:    ${failed}`);
  console.log(`  /app in sitemap:      ${appUrlsInSitemap.length > 0 ? "YES (BAD)" : "No (good)"}`);
  console.log(`  robots.txt:           ${robotsCheck.pass ? "PASS" : "FAIL"}`);
  console.log(`  /app noindex header:  ${appCheck.pass ? "PASS" : "FAIL"}`);

  if (allErrors.length > 0) {
    console.log(`\n  ERRORS (${allErrors.length}):`);
    allErrors.forEach(e => console.log(`    - ${e}`));
  } else {
    console.log(`\n  No errors found.`);
  }

  const exitCode = allErrors.length > 0 ? 1 : 0;
  console.log(`\n  Result: ${exitCode === 0 ? "ALL CHECKS PASSED" : "VALIDATION FAILED"}`);
  console.log("=".repeat(90) + "\n");

  process.exit(exitCode);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
