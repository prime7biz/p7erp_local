/**
 * Help & Tutorials capture tool
 * ------------------------------
 * Signs in to a LOCAL P7 ERP once, then takes screenshots and records short walkthrough
 * videos described in `manifests/*.json`. Uses the Microsoft Edge (or Chrome) already
 * installed on the machine, so no browser download is needed.
 *
 * Output:
 *   frontend/public/tutorials/screens/<name>.jpg
 *   frontend/public/tutorials/videos/<name>.webm  (+ <name>-poster.jpg)
 *   tools/tutorial-capture/capture-report.json
 *
 * One-time setup (local Docker only):
 *   docker compose exec -e TUTORIAL_CAPTURE_PASSWORD=<password> backend python scripts/seed_tutorial_capture_user.py
 *   npm install   (from this folder; add $env:NODE_OPTIONS="--use-system-ca" behind a TLS-inspecting proxy)
 *   node node_modules/playwright-core/cli.js install ffmpeg   (needed for videos only)
 *
 * Usage (from this folder):
 *   $env:CAPTURE_PASSWORD = "<same password>"
 *   node capture.mjs                       # every manifest, screenshots + videos
 *   node capture.mjs --manifest=inventory  # only manifests/inventory.json
 *   node capture.mjs --only=shots          # screenshots only (or --only=videos)
 *   node capture.mjs --name=inventory-purchase-orders   # one entry
 *   node capture.mjs --skip-existing       # do not overwrite files that already exist
 *
 * IMPORTANT: the ERP allows one session per user. Run ONE capture at a time and expect
 * the capture user to be signed out in your normal browser.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const publicDir = path.join(repoRoot, "frontend", "public", "tutorials");
const screensDir = path.join(publicDir, "screens");
const videosDir = path.join(publicDir, "videos");

const BASE_URL = process.env.CAPTURE_BASE_URL ?? "http://localhost:5173";
const API_URL = process.env.CAPTURE_API_URL ?? "http://localhost:8000";
const COMPANY_CODE = process.env.CAPTURE_COMPANY_CODE ?? "LAKH806201";
// Dedicated user from `backend/scripts/seed_tutorial_capture_user.py` so captures never sign out a real person.
const USERNAME = process.env.CAPTURE_USERNAME ?? "tutorial.guide";
const PASSWORD = process.env.CAPTURE_PASSWORD;
const LOGIN_AS = process.env.CAPTURE_LOGIN_AS ?? "admin";
const BROWSER_CHANNEL = process.env.CAPTURE_BROWSER ?? "msedge";

const VIEWPORT = { width: 1440, height: 900 };
const VIDEO_SIZE = { width: 1280, height: 800 };

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

function loadManifests() {
  const dir = path.join(here, "manifests");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !args.manifest || f === `${args.manifest}.json`);
  const shots = [];
  const videos = [];
  for (const f of files) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const s of m.screenshots ?? []) shots.push({ ...s, manifest: f });
    for (const v of m.videos ?? []) videos.push({ ...v, manifest: f });
  }
  const names = args.name ? String(args.name).split(",").map((n) => n.trim()).filter(Boolean) : [];
  const byName = (list) => (names.length ? list.filter((x) => names.includes(x.name)) : list);
  const result = { shots: byName(shots), videos: byName(videos) };
  if (args["referenced-only"]) {
    const refFile = path.join(here, "referenced-assets.json");
    if (!fs.existsSync(refFile)) throw new Error("Run `npm run check` first to create referenced-assets.json.");
    const used = new Set(JSON.parse(fs.readFileSync(refFile, "utf8")));
    result.shots = result.shots.filter((s) => used.has(`/tutorials/screens/${s.name}.jpg`));
    result.videos = result.videos.filter((v) => used.has(`/tutorials/videos/${v.name}.webm`));
  }
  const found = new Set([...result.shots, ...result.videos].map((x) => x.name));
  for (const n of names) if (!found.has(n)) console.log(`WARN no manifest entry named "${n}"`);
  return result;
}

async function login() {
  if (!PASSWORD) {
    throw new Error("Set CAPTURE_PASSWORD (and optionally CAPTURE_COMPANY_CODE / CAPTURE_USERNAME) first.");
  }
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_code: COMPANY_CODE, username: USERNAME, password: PASSWORD, login_as: LOGIN_AS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { token: body.access_token, tenantId: String(body.tenant_id) };
}

/**
 * Real people must never appear in committed screenshots (the repo is public).
 * `redact.local.json` (git-ignored) maps real text → placeholder, e.g. {"Jane Doe": "Staff User"}.
 * Longest strings are replaced first.
 */
function loadRedactions() {
  const file = path.join(here, "redact.local.json");
  if (!fs.existsSync(file)) {
    console.log("WARN no redact.local.json — real names/emails will not be masked (see README).");
    return [];
  }
  return Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))).sort((a, b) => b[0].length - a[0].length);
}

/** Runs in the page before app code: auth token, name/email masking, and a cursor dot for videos. */
function initScript({ token, tenantId, showCursor, redactions }) {
  localStorage.setItem("p7_token", token);
  localStorage.setItem("p7_tenant_id", tenantId);
  if (redactions.length) {
    const apply = (s) => {
      let out = s;
      for (const [from, to] of redactions) if (out.includes(from)) out = out.split(from).join(to);
      return out;
    };
    const scrubNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const v = apply(node.nodeValue ?? "");
        if (v !== node.nodeValue) node.nodeValue = v;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const v = apply(t.nodeValue ?? "");
        if (v !== t.nodeValue) t.nodeValue = v;
      }
      const els = [node, ...node.querySelectorAll("input, textarea, [title], [placeholder], [alt], [aria-label]")];
      for (const el of els) {
        if ("value" in el && typeof el.value === "string") {
          const v = apply(el.value);
          if (v !== el.value) el.value = v;
        }
        for (const attr of ["title", "placeholder", "alt", "aria-label"]) {
          const a = el.getAttribute?.(attr);
          if (a) {
            const v = apply(a);
            if (v !== a) el.setAttribute(attr, v);
          }
        }
      }
    };
    window.__tutorialScrub = () => scrubNode(document.body);
    window.addEventListener("DOMContentLoaded", () => {
      scrubNode(document.body);
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "characterData") scrubNode(m.target);
          else m.addedNodes.forEach(scrubNode);
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }
  if (!showCursor) return;
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.id = "__tutorial_cursor";
    Object.assign(dot.style, {
      position: "fixed", zIndex: "2147483647", width: "22px", height: "22px", borderRadius: "50%",
      background: "rgba(239,68,68,0.35)", border: "2px solid rgba(239,68,68,0.9)", pointerEvents: "none",
      transform: "translate(-50%,-50%)", left: "-50px", top: "-50px", transition: "width .15s, height .15s",
    });
    document.body.appendChild(dot);
    window.addEventListener("mousemove", (e) => { dot.style.left = `${e.clientX}px`; dot.style.top = `${e.clientY}px`; }, true);
    window.addEventListener("mousedown", () => { dot.style.width = "34px"; dot.style.height = "34px"; }, true);
    window.addEventListener("mouseup", () => { dot.style.width = "22px"; dot.style.height = "22px"; }, true);
  });
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

async function showCaption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__tutorial_caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "__tutorial_caption";
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: "2147483646",
        maxWidth: "80%", padding: "10px 18px", borderRadius: "10px", background: "rgba(15,23,42,0.88)",
        color: "#fff", font: "600 18px/1.4 system-ui, sans-serif", textAlign: "center", pointerEvents: "none",
        boxShadow: "0 6px 24px rgba(0,0,0,.25)",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.display = t ? "block" : "none";
  }, text ?? "");
}

async function highlight(page, locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 18 });
  await locator.evaluate((el) => {
    el.dataset.prevOutline = el.style.outline;
    el.style.outline = "3px solid rgba(239,68,68,0.9)";
    el.style.outlineOffset = "2px";
  }).catch(() => {});
  await page.waitForTimeout(650);
  await locator.evaluate((el) => { el.style.outline = el.dataset.prevOutline ?? ""; }).catch(() => {});
  return { x, y };
}

/** Executes one action object from a manifest. */
async function runAction(page, a, { video }) {
  if (a.goto) {
    await page.goto(`${BASE_URL}${a.goto}`, { waitUntil: "domcontentloaded" });
    await settle(page, a.waitMs ?? 1500);
    return;
  }
  if (a.caption !== undefined) {
    await showCaption(page, a.caption);
    await page.waitForTimeout(a.ms ?? (video ? 2200 : 0));
    return;
  }
  if (a.click) {
    const loc = page.locator(a.click).first();
    await loc.waitFor({ state: "visible", timeout: a.timeout ?? 10000 });
    if (video) await highlight(page, loc);
    await loc.click();
    await settle(page, a.waitMs ?? 900);
    return;
  }
  if (a.hover) {
    const loc = page.locator(a.hover).first();
    if (video) await highlight(page, loc);
    else await loc.hover();
    await page.waitForTimeout(a.waitMs ?? 500);
    return;
  }
  if (a.fill) {
    const [sel, value] = a.fill;
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: "visible", timeout: a.timeout ?? 10000 });
    if (video) {
      await highlight(page, loc);
      await loc.click();
      await loc.fill("");
      await loc.pressSequentially(String(value), { delay: 55 });
    } else {
      await loc.fill(String(value));
    }
    await page.waitForTimeout(a.waitMs ?? 400);
    return;
  }
  if (a.select) {
    const [sel, value] = a.select;
    const loc = page.locator(sel).first();
    if (video) await highlight(page, loc);
    await loc.selectOption(value);
    await page.waitForTimeout(a.waitMs ?? 500);
    return;
  }
  if (a.press) {
    await page.keyboard.press(a.press);
    await page.waitForTimeout(a.waitMs ?? 500);
    return;
  }
  if (a.scroll !== undefined) {
    await page.mouse.wheel(0, a.scroll);
    await page.waitForTimeout(a.waitMs ?? 700);
    return;
  }
  if (a.waitFor) {
    await page.locator(a.waitFor).first().waitFor({ state: "visible", timeout: a.timeout ?? 15000 });
    return;
  }
  if (a.waitMs) {
    await page.waitForTimeout(a.waitMs);
    return;
  }
  throw new Error(`Unknown action: ${JSON.stringify(a)}`);
}

/** Heuristic: did we land on an error / not-found / login screen, or is a real name still visible? */
async function detectProblem(page, expectedRoute, redactions) {
  const url = new URL(page.url());
  if (url.pathname.startsWith("/login")) return "redirected to /login (session lost or no access)";
  await page.evaluate(() => window.__tutorialScrub?.()).catch(() => {});
  const fullText = await page.locator("body").innerText().catch(() => "");
  const leaked = redactions.find(([from]) => fullText.includes(from));
  if (leaked) return `unmasked personal data visible ("${leaked[1]}" placeholder did not apply)`;
  const text = fullText.slice(0, 4000);
  if (/page not found|404/i.test(text) && text.length < 800) return "looks like a not-found page";
  if (/something went wrong|unexpected application error/i.test(text)) return "error boundary shown";
  if (expectedRoute && !url.pathname.startsWith(expectedRoute.split("?")[0])) return `redirected to ${url.pathname}`;
  return null;
}

async function captureShots(browser, auth, shots, report, redactions) {
  fs.mkdirSync(screensDir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(initScript, { ...auth, showCursor: false, redactions });
  const page = await context.newPage();
  for (const s of shots) {
    const file = path.join(screensDir, `${s.name}.jpg`);
    if (args["skip-existing"] && fs.existsSync(file)) {
      report.screenshots.push({ name: s.name, status: "skipped" });
      continue;
    }
    const started = Date.now();
    try {
      // Each shot starts from a clean UI state (collapsed sidebar, list density, recents) — only the login is kept.
      await page
        .evaluate(() => {
          const token = localStorage.getItem("p7_token");
          const tenantId = localStorage.getItem("p7_tenant_id");
          localStorage.clear();
          sessionStorage.clear();
          if (token) localStorage.setItem("p7_token", token);
          if (tenantId) localStorage.setItem("p7_tenant_id", tenantId);
        })
        .catch(() => {});
      if (s.viewport) await page.setViewportSize(s.viewport);
      else await page.setViewportSize(VIEWPORT);
      await page.goto(`${BASE_URL}${s.route}`, { waitUntil: "domcontentloaded" });
      await settle(page, s.waitMs ?? 1800);
      if (s.waitFor) await page.locator(s.waitFor).first().waitFor({ state: "visible", timeout: 15000 });
      for (const a of s.actions ?? []) await runAction(page, a, { video: false });
      const problem = await detectProblem(page, s.actions?.some((a) => a.goto || a.click) ? null : s.route, redactions);
      if (problem?.startsWith("unmasked")) throw new Error(`${problem} — not saved`);
      const opts = { path: file, type: "jpeg", quality: 82, fullPage: Boolean(s.fullPage) };
      if (s.clipSelector) await page.locator(s.clipSelector).first().screenshot(opts);
      else await page.screenshot(opts);
      report.screenshots.push({
        name: s.name, route: s.route, status: problem ? "warning" : "ok", problem, finalUrl: page.url(),
        ms: Date.now() - started,
      });
      console.log(`${problem ? "WARN" : "ok  "} shot  ${s.name}${problem ? ` — ${problem}` : ""}`);
    } catch (err) {
      report.screenshots.push({ name: s.name, route: s.route, status: "failed", error: String(err.message ?? err) });
      console.log(`FAIL shot  ${s.name} — ${err.message ?? err}`);
    }
  }
  await context.close();
}

async function captureVideos(browser, auth, videos, report, redactions) {
  fs.mkdirSync(videosDir, { recursive: true });
  const tmpDir = path.join(here, ".video-tmp");
  for (const v of videos) {
    const out = path.join(videosDir, `${v.name}.webm`);
    if (args["skip-existing"] && fs.existsSync(out)) {
      report.videos.push({ name: v.name, status: "skipped" });
      continue;
    }
    const context = await browser.newContext({
      viewport: VIDEO_SIZE,
      deviceScaleFactor: 1,
      recordVideo: { dir: tmpDir, size: VIDEO_SIZE },
    });
    await context.addInitScript(initScript, { ...auth, showCursor: true, redactions });
    const page = await context.newPage();
    const started = Date.now();
    let error = null;
    let posterTaken = false;
    try {
      for (const a of v.steps) {
        await runAction(page, a, { video: true });
        if (redactions.length && (a.goto || a.click)) {
          const text = await page.locator("body").innerText().catch(() => "");
          const leaked = redactions.find(([from]) => text.includes(from));
          if (leaked) throw new Error(`unmasked personal data visible ("${leaked[1]}") — video not saved`);
        }
        if (!posterTaken && a.caption) {
          await page.screenshot({ path: path.join(videosDir, `${v.name}-poster.jpg`), type: "jpeg", quality: 80 });
          posterTaken = true;
        }
      }
      await showCaption(page, "");
      await page.waitForTimeout(1200);
    } catch (err) {
      error = String(err.message ?? err);
    }
    const durationSeconds = Math.round((Date.now() - started) / 1000);
    const videoHandle = page.video();
    await context.close();
    if (videoHandle) {
      const tmp = await videoHandle.path();
      if (error) {
        fs.rmSync(tmp, { force: true });
      } else {
        fs.copyFileSync(tmp, out);
        fs.rmSync(tmp, { force: true });
      }
    }
    report.videos.push({ name: v.name, title: v.title, status: error ? "failed" : "ok", error, durationSeconds });
    console.log(`${error ? "FAIL" : "ok  "} video ${v.name} (${durationSeconds}s)${error ? ` — ${error}` : ""}`);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

/**
 * One capture at a time: every run signs in again, which ends the previous run's session.
 * Waiting runs queue first-come, first-served (ticket files in `.capture-queue/`).
 * A lock whose process has exited, or that is older than 45 minutes, is treated as stale.
 */
const lockFile = path.join(here, ".capture.lock");
const queueDir = path.join(here, ".capture-queue");
const ticket = path.join(queueDir, `${Date.now()}-${process.pid}`);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code !== "ESRCH";
  }
}

/** Position in the queue (0 = next); removes tickets of runs that no longer exist. */
function queuePosition() {
  const tickets = fs.readdirSync(queueDir).sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
  const live = tickets.filter((t) => {
    if (isAlive(Number(t.split("-")[1]))) return true;
    fs.rmSync(path.join(queueDir, t), { force: true });
    return false;
  });
  return live.indexOf(path.basename(ticket));
}

function leaveQueue() {
  fs.rmSync(ticket, { force: true });
}

async function acquireLock() {
  const staleMs = 45 * 60 * 1000;
  let waitedLogged = false;
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(ticket, "");
  process.on("exit", leaveQueue);
  for (;;) {
    const position = queuePosition();
    if (position > 0) {
      if (!waitedLogged) {
        console.log(`Another capture is running — waiting in queue (position ${position + 1})…`);
        waitedLogged = true;
      }
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: "wx" });
      leaveQueue();
      return;
    } catch {
      let ownerAlive = true;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lockFile).mtimeMs;
        ownerAlive = isAlive(JSON.parse(fs.readFileSync(lockFile, "utf8")).pid);
      } catch (err) {
        if (err?.code === "ENOENT") continue;
      }
      if (!ownerAlive || age > staleMs) {
        fs.rmSync(lockFile, { force: true });
        continue;
      }
      if (!waitedLogged) {
        console.log("Another capture is running — waiting for it to finish…");
        waitedLogged = true;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function releaseLock() {
  try {
    const owner = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (owner.pid === process.pid) fs.rmSync(lockFile, { force: true });
  } catch {
    /* already gone */
  }
}

async function main() {
  const { shots, videos } = loadManifests();
  await acquireLock();
  process.on("exit", releaseLock);
  process.on("SIGINT", () => process.exit(130));
  const auth = await login();
  const redactions = loadRedactions();
  const browser = await chromium.launch({ channel: BROWSER_CHANNEL, headless: !args.headed });
  const report = { startedAt: new Date().toISOString(), baseUrl: BASE_URL, screenshots: [], videos: [] };
  try {
    if (args.only !== "videos") await captureShots(browser, auth, shots, report, redactions);
    if (args.only !== "shots") await captureVideos(browser, auth, videos, report, redactions);
  } finally {
    await browser.close();
  }
  const reportFile = path.join(here, "capture-report.json");
  const previous = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : { screenshots: [], videos: [] };
  const merge = (oldList, newList) => {
    const map = new Map(oldList.map((x) => [x.name, x]));
    for (const x of newList) map.set(x.name, x);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const merged = {
    updatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    screenshots: merge(previous.screenshots ?? [], report.screenshots),
    videos: merge(previous.videos ?? [], report.videos),
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(merged, null, 2)}\n`);
  const bad = [...report.screenshots, ...report.videos].filter((x) => x.status === "failed" || x.status === "warning");
  console.log(`\nDone. ${report.screenshots.length} screenshots, ${report.videos.length} videos, ${bad.length} need attention.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
