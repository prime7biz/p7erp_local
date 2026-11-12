/**
 * Phone-size audit (dev tool only)
 * --------------------------------
 * Opens every route in `mobile-audit-routes.json` at phone sizes against a LOCAL P7 ERP, with the
 * browser set to DARK system mode, and reports layout problems. Uses the same dedicated capture
 * user and installed Edge/Chrome as `capture.mjs`.
 *
 * Output (git-ignored):
 *   tools/tutorial-capture/.mobile-audit/<viewport>/<route>.jpg
 *   tools/tutorial-capture/.mobile-audit/report.json
 *
 * Usage (from this folder, Docker stack running):
 *   $env:CAPTURE_PASSWORD = "<capture user password>"
 *   node mobile-audit.mjs                     # all routes, all viewports
 *   node mobile-audit.mjs --viewport=phone-390
 *   node mobile-audit.mjs --route=/app/orders
 *   node mobile-audit.mjs --mobile-ui-v2      # simpler phone layout on (only in this browser; no DB change)
 *
 * Severity rules:
 *   high   - the whole page scrolls sideways, the app turned dark, the page crashed, or in print
 *            preview the shell still clips the page / prints the menus
 *   medium - a button, link or field sticks out past the right edge and cannot be scrolled to
 *   low    - tap targets smaller than 32px (count only; many dense ERP tables have them)
 * With --mobile-ui-v2 the report also counts controls under 44px tall (`under44`) and lists a few.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, ".mobile-audit");

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.CAPTURE_API_URL ?? "http://localhost:8000";
const COMPANY_CODE = process.env.CAPTURE_COMPANY_CODE ?? "LAKH806201";
const USERNAME = process.env.CAPTURE_USERNAME ?? "tutorial.guide";
const PASSWORD = process.env.CAPTURE_PASSWORD;
const LOGIN_AS = process.env.CAPTURE_LOGIN_AS ?? "admin";
const BROWSER_CHANNEL = process.env.CAPTURE_BROWSER ?? "msedge";
const MAX_ROUTES = 30;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

async function login() {
  if (!PASSWORD) throw new Error("Set CAPTURE_PASSWORD first (see capture.mjs for the one-time user setup).");
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_code: COMPANY_CODE, username: USERNAME, password: PASSWORD, login_as: LOGIN_AS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { token: body.access_token, tenantId: String(body.tenant_id) };
}

function slug(route) {
  return route.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
}

/** Runs inside the page: measure overflow, clipped controls and small tap targets. */
function measureLayout() {
  const vw = window.innerWidth;
  const doc = document.scrollingElement || document.documentElement;
  const pageOverflowPx = Math.max(0, doc.scrollWidth - vw);

  const scrollsSideways = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if ((s.overflowX === "auto" || s.overflowX === "scroll") && p.scrollWidth > p.clientWidth) return true;
    }
    return false;
  };
  const isShown = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);

  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter(isShown);
  const clipped = [];
  const under44 = [];
  let smallTargets = 0;
  const main = document.querySelector(".erp-main-content");
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !scrollsSideways(el)) clipped.push({ label: label(el), right: Math.round(r.right) });
    if (r.height < 32 && el.tagName !== "INPUT") smallTargets++;
    const isBox = el.type === "checkbox" || el.type === "radio";
    if (main?.contains(el) && !isBox && r.height < 44) under44.push(label(el));
  }
  return {
    dark: document.documentElement.classList.contains("dark"),
    pageOverflowPx,
    clipped: clipped.slice(0, 10),
    clippedCount: clipped.length,
    smallTargets,
    under44: under44.length,
    under44Sample: under44.slice(0, 8),
    title: document.querySelector("h1")?.textContent?.trim() ?? "",
  };
}

/** Runs inside the page with print media: is the whole page printable and are the menus hidden? */
function measurePrint() {
  const main = document.querySelector(".erp-main-content");
  const hiddenShell = ["header.no-print", "nav[aria-label='Main menu']"].every((sel) => {
    const el = document.querySelector(sel);
    return !el || getComputedStyle(el).display === "none";
  });
  if (!main) return { hasShell: false, hiddenShell, mainClips: false };
  const s = getComputedStyle(main);
  return { hasShell: true, hiddenShell, mainClips: s.overflowY !== "visible" };
}

function severityOf(r) {
  if (r.error || r.layout.dark || r.layout.pageOverflowPx > 2 || (r.print.hasShell && (r.print.mainClips || !r.print.hiddenShell)))
    return "high";
  if (r.layout.clippedCount > 0) return "medium";
  if (r.layout.smallTargets > 0) return "low";
  return "ok";
}

async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(here, "mobile-audit-routes.json"), "utf8"));
  const routes = config.routes
    .filter((r) => !args.route || r.path === args.route)
    .slice(0, MAX_ROUTES);
  const viewports = config.viewports.filter((v) => !args.viewport || v.name === args.viewport);
  const { token, tenantId } = await login();

  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: true });
  const results = [];
  try {
    for (const vp of viewports) {
      fs.mkdirSync(path.join(outDir, vp.name), { recursive: true });
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
      });
      await context.addInitScript(
        ({ t, id }) => {
          localStorage.setItem("p7_token", t);
          localStorage.setItem("p7_tenant_id", id);
          localStorage.setItem("p7_theme", "dark");
        },
        { t: token, id: tenantId },
      );
      if (args["mobile-ui-v2"]) {
        // Turn the tenant switch on for this browser only by editing the /auth/me answer.
        await context.route("**/api/v1/auth/me", async (route) => {
          const res = await route.fetch();
          const body = await res.json();
          body.feature_flags = { ...(body.feature_flags ?? {}), mobile_ui_v2: true };
          await route.fulfill({ response: res, json: body });
        });
      }
      const page = await context.newPage();
      for (const route of routes) {
        const entry = { viewport: vp.name, module: route.module, path: route.path };
        const errors = [];
        const onError = (e) => errors.push(String(e.message || e).slice(0, 200));
        page.on("pageerror", onError);
        try {
          await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(1200);
          entry.finalPath = new URL(page.url()).pathname;
          entry.layout = await page.evaluate(measureLayout);
          await page.screenshot({ path: path.join(outDir, vp.name, `${slug(route.path)}.jpg`), type: "jpeg", quality: 70 });
          await page.emulateMedia({ media: "print" });
          entry.print = await page.evaluate(measurePrint);
          await page.emulateMedia({ media: "screen" });
        } catch (e) {
          entry.error = String(e.message || e).slice(0, 200);
          entry.layout = entry.layout ?? { dark: false, pageOverflowPx: 0, clipped: [], clippedCount: 0, smallTargets: 0, under44: 0 };
          entry.print = entry.print ?? { hasShell: false, hiddenShell: true, mainClips: false };
        }
        page.off("pageerror", onError);
        if (errors.length) entry.pageErrors = errors;
        entry.severity = severityOf(entry);
        results.push(entry);
        console.log(
          `${entry.severity.padEnd(6)} ${vp.name}  ${route.path}` +
            (entry.layout.pageOverflowPx > 2 ? `  page overflow ${entry.layout.pageOverflowPx}px` : "") +
            (entry.layout.clippedCount ? `  clipped ${entry.layout.clippedCount}` : "") +
            (args["mobile-ui-v2"] && entry.layout.under44 ? `  under44 ${entry.layout.under44}` : "") +
            (entry.layout.dark ? "  DARK" : "") +
            (entry.print.mainClips ? "  print-clips" : "") +
            (entry.error ? `  error: ${entry.error}` : ""),
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const counts = results.reduce((acc, r) => ({ ...acc, [r.severity]: (acc[r.severity] ?? 0) + 1 }), {});
  console.log(`\nDone: ${JSON.stringify(counts)}. Report: ${path.relative(here, path.join(outDir, "report.json"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
