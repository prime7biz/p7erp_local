#!/usr/bin/env node
/**
 * Frontend ↔ backend API wiring audit (read-only).
 *
 * 1. Dump backend routes (from repo root):
 *      docker compose exec -T backend sh -c 'python scripts/dump_api_routes.py > /tmp/routes.json'
 *      docker compose cp backend:/tmp/routes.json ./backend_routes.json
 * 2. Run (from frontend/):
 *      node scripts/audit-api-wiring.mjs ../backend_routes.json [--json report.json]
 *
 * Reports frontend API calls with no backend route (MISSING), calls whose HTTP method the
 * backend route does not accept (METHOD), and backend routes no frontend file references.
 * Paths built entirely at runtime (e.g. `request(path)` with a variable) cannot be checked.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const routesFile = args.find((a) => !a.startsWith("--"));
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
if (!routesFile) {
  console.error("usage: node scripts/audit-api-wiring.mjs <backend_routes.json> [--json out.json]");
  process.exit(2);
}

const backendRoutes = JSON.parse(fs.readFileSync(routesFile, "utf8").replace(/^\uFEFF/, ""));
const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = [
  path.join(FRONTEND_DIR, "src"),
  path.resolve(FRONTEND_DIR, "../frontend-admin/src"),
].filter((dir) => fs.existsSync(dir));

/** Helpers whose path argument is relative to a fixed prefix (and optional default method). */
const PREFIX_HELPERS = {
  requestPlatformAdmin: { prefix: "/api/v1/admin" },
  extRequest: { prefix: "/api/external" },
  extRequestPublic: { prefix: "/api/external" },
  externalGet: { prefix: "/api/external", method: "GET" },
  externalPost: { prefix: "/api/external", method: "POST" },
};
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const HOLE = "\u0000";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Read a JS string literal starting at src[i] (a quote). Returns { raw, holes, end }. */
function readLiteral(src, i) {
  const q = src[i];
  let raw = "";
  const holes = [];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      raw += src.slice(j, j + 2);
      j += 2;
      continue;
    }
    if (c === q) return { raw, holes, end: j + 1 };
    if (q === "`" && c === "$" && src[j + 1] === "{") {
      let depth = 1;
      let k = j + 2;
      while (k < src.length && depth > 0) {
        const d = src[k];
        if (d === "`" || d === '"' || d === "'") {
          k = readLiteral(src, k).end;
          continue;
        }
        if (d === "{") depth++;
        else if (d === "}") depth--;
        k++;
      }
      holes.push(src.slice(j + 2, k - 1));
      raw += HOLE;
      j = k;
      continue;
    }
    if (q !== "`" && c === "\n") break;
    raw += c;
    j++;
  }
  return { raw, holes, end: j };
}

/** Text of the enclosing call's arguments after the literal (to find `method:`). */
function callTail(src, from) {
  let depth = 1;
  let k = from;
  const limit = Math.min(src.length, from + 2500);
  while (k < limit) {
    const c = src[k];
    if (c === "`" || c === '"' || c === "'") {
      k = readLiteral(src, k).end;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(from, k);
    } else if (c === ";" && depth === 1) return src.slice(from, k);
    k++;
  }
  return src.slice(from, limit);
}

function detectMethods(tail) {
  const m = tail.match(/method\s*:\s*([^,}\n]+)/);
  if (!m) return ["GET"];
  const found = HTTP_METHODS.filter((h) => new RegExp(`["'\`]${h}["'\`]`).test(m[1]));
  return found.length ? found : ["?"];
}

/** Turn a raw literal into comparable segments. */
function normalise(raw, holes) {
  let s = raw.replace(/^\$\{API_BASE\}/, "");
  if (s.startsWith(HOLE) && /API_BASE/.test(holes[0] ?? "")) {
    s = s.slice(1);
    holes = holes.slice(1);
  }
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  const segs = s.split("/").filter((x, idx) => idx === 0 || x !== "");
  segs.shift();
  let holeIdx = 0;
  const out = [];
  for (let n = 0; n < segs.length; n++) {
    const seg = segs[n];
    const count = (seg.match(new RegExp(HOLE, "g")) || []).length;
    const contents = holes.slice(holeIdx, holeIdx + count);
    holeIdx += count;
    if (!count) {
      out.push(seg);
      continue;
    }
    const isLast = n === segs.length - 1;
    const optionalTail = contents.some((h) => /["'`]\/|["'`]\?|\?\$\{|\bqs\b|query|params|suffix/i.test(h));
    if (seg === HOLE) {
      if (isLast && optionalTail) break;
      out.push("{p}");
      continue;
    }
    if (isLast && seg.endsWith(HOLE) && !seg.slice(0, -1).includes(HOLE)) {
      out.push(seg.slice(0, -1));
      if (optionalTail && /["'`]\//.test(contents[contents.length - 1])) out.push("**");
      continue;
    }
    out.push("~" + seg.split(HOLE).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"));
  }
  return out;
}

function segMatch(fe, be) {
  if (/^\{.+\}$/.test(be)) return true;
  if (fe === "{p}") return true;
  if (fe.startsWith("~")) return new RegExp(`^${fe.slice(1)}$`).test(be);
  return fe === be;
}

function pathMatches(feSegs, beSegs) {
  for (let i = 0; i < Math.max(feSegs.length, beSegs.length); i++) {
    const fe = feSegs[i];
    const be = beSegs[i];
    if (fe === "**") return true;
    if (be && /^\{.+:path\}$/.test(be)) return fe !== undefined;
    if (fe === undefined || be === undefined) return false;
    if (!segMatch(fe, be)) return false;
  }
  return true;
}

const backend = backendRoutes
  .filter((r) => r.path.startsWith("/api/") || r.path === "/health")
  .map((r) => ({ ...r, segs: r.path.split("/").filter(Boolean), used: false }));

const BASE_ONLY = new Set(["/api/v1", "/api/external", "/api/v1/admin"]);

const calls = [];
for (const root of SOURCE_ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(path.dirname(FRONTEND_DIR), file).replace(/\\/g, "/");
    const seen = new Set();
    const add = (litStart, { prefix = "", method } = {}) => {
      if (seen.has(litStart)) return;
      seen.add(litStart);
      const lineStart = src.lastIndexOf("\n", litStart) + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(src.slice(lineStart, litStart))) return;
      const lit = readLiteral(src, litStart);
      const raw = prefix + lit.raw;
      const lastHole = lit.holes[lit.holes.length - 1] ?? "";
      if (raw.endsWith(HOLE) && /^\s*path\s*$/.test(lastHole)) return;
      const visible = raw.replace(new RegExp(HOLE, "g"), "${…}");
      if (BASE_ONLY.has(visible.replace(/^\$\{…\}/, "").replace(/\/$/, ""))) return;
      const assigned = /=\s*$/.test(src.slice(Math.max(0, litStart - 4), litStart));
      calls.push({
        file: rel,
        line: src.slice(0, litStart).split("\n").length,
        raw: visible,
        segs: normalise(raw, lit.holes),
        methods: method ? [method] : assigned ? ["?"] : detectMethods(callTail(src, lit.end)),
      });
    };
    for (const [helper, opts] of Object.entries(PREFIX_HELPERS)) {
      const re = new RegExp(`\\b${helper}\\s*(?:<[^()]*?>)?\\s*\\(\\s*([\`"'])`, "g");
      for (const m of src.matchAll(re)) add(m.index + m[0].length - 1, opts);
    }
    for (const m of src.matchAll(/[`"'](?=(?:\$\{API_BASE\})?\/api\/)/g)) add(m.index);
  }
}

const missing = [];
const methodMismatch = [];
for (const c of calls) {
  const hits = backend.filter((b) => pathMatches(c.segs, b.segs));
  if (!hits.length) {
    missing.push(c);
    continue;
  }
  const accepted = new Set(hits.flatMap((h) => h.methods));
  const ok = c.methods.includes("?") || c.methods.every((m) => accepted.has(m));
  for (const h of hits) if (c.methods.includes("?") || c.methods.some((m) => h.methods.includes(m))) h.used = true;
  if (!ok) methodMismatch.push({ ...c, accepted: [...accepted] });
}

const unused = backend.filter((b) => !b.used);
const groupKey = (p) => p.split("/").slice(0, 4).join("/");
const unusedGroups = {};
for (const u of unused) unusedGroups[groupKey(u.path)] = (unusedGroups[groupKey(u.path)] || 0) + 1;

const fmt = (c) => `  ${c.methods.join("|").padEnd(6)} ${c.raw}\n         ↳ ${c.file}:${c.line}`;
console.log(`Frontend API call sites scanned : ${calls.length}`);
console.log(`Backend /api routes             : ${backend.length}`);
console.log(`Backend routes referenced       : ${backend.length - unused.length}`);
console.log(`\nMISSING (frontend call, no backend route): ${missing.length}`);
for (const c of missing) console.log(fmt(c));
console.log(`\nMETHOD (path exists, method not accepted): ${methodMismatch.length}`);
for (const c of methodMismatch) console.log(`${fmt(c)}\n         backend accepts: ${c.accepted.join(", ")}`);
console.log(`\nBackend routes with no frontend reference: ${unused.length} (by prefix, top 40)`);
for (const [k, v] of Object.entries(unusedGroups).sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

if (jsonOut) {
  fs.writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        missing,
        methodMismatch,
        unused: unused.map((u) => ({ path: u.path, methods: u.methods })),
      },
      null,
      1,
    ),
  );
  console.log(`\nFull report written to ${jsonOut}`);
}
process.exitCode = missing.length || methodMismatch.length ? 1 : 0;
