/**
 * Checks how the frontend Nginx (nginx.prod.conf) answers public, private, redirect and attack URLs.
 *
 * Usage: node scripts/verify-nginx-routes.mjs [baseUrl]
 *   Local:  docker run --rm -p 8089:80 -v "%cd%/dist:/usr/share/nginx/html:ro"
 *             -v "%cd%/nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine
 *           node scripts/verify-nginx-routes.mjs http://localhost:8089
 *   Live:   node scripts/verify-nginx-routes.mjs https://prime7erp.com
 *
 * Uses raw HTTP (no redirect following, no URL normalisation) so encoded payloads reach Nginx as sent.
 */
import http from "node:http";
import https from "node:https";

const base = new URL(process.argv[2] || "http://localhost:8089");
const client = base.protocol === "https:" ? https : http;

/** [path, expected status, expected Location (exact) or null, robots expected in HTML or null, Host header] */
const CASES = [
  // www -> apex for pages only; API, attendance devices and media are never redirected.
  ["/pricing?ref=x", 301, "https://prime7erp.com/pricing?ref=x", null, "www.prime7erp.com"],
  ["/", 301, "https://prime7erp.com/", null, "www.prime7erp.com"],
  ["/iclock/cdata?SN=TEST", null, null, null, "www.prime7erp.com"],
  ["/api/v1/health-check-not-real", null, null, null, "www.prime7erp.com"],
  ["/pricing", 200, null, "index", "www.evil.com"],
  ["/", 200, null, "index"],
  ["/pricing", 200, null, "index"],
  ["/garment-costing-software", 200, null, "index"],
  ["/pricing/", 301, "/pricing", null],
  ["/pricing/?ref=x", 301, "/pricing?ref=x", null],
  ["/blog", 301, "/resources", null],
  ["/blog/consumption-control-garments", 301, "/resources/consumption-control-garments", null],
  ["/privacy", 301, "/legal/privacy", null],
  ["/terms", 301, "/legal/terms", null],
  ["/legal", 301, "/legal/terms", null],
  ["/login", 200, null, "index"],
  ["/app", 200, null, "noindex"],
  ["/app/accounts/vouchers", 200, null, "noindex"],
  ["/portal/customer", 200, null, "noindex"],
  ["/no-such-page", 200, null, "noindex"],
  ["/assets/does-not-exist.js", 404, null, null],
  // Open-redirect attempts: never a Location that a browser reads as another site.
  ["/%5Cevil.com/", null, null, null],
  ["/%5C%5Cevil.com/", null, null, null],
  ["//evil.com/", null, null, null],
  ["/%2F%2Fevil.com/", null, null, null],
  ["/%0d%0aSet-Cookie:x=1/", null, null, null],
];

function get(path, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        host: base.hostname,
        port: base.port || (base.protocol === "https:" ? 443 : 80),
        path,
        method: "GET",
        headers: hostHeader ? { Host: hostHeader } : undefined,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c.length < 200_000 ? c : ""));
        res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? null, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

let failures = 0;
const SAFE_ABSOLUTE = [base.origin, "https://prime7erp.com/"];
for (const [path, status, location, robots, hostHeader] of CASES) {
  // Live checks against https://www… cannot override Host through Cloudflare; skip those cases there.
  if (hostHeader && base.protocol === "https:") continue;
  const res = await get(path, hostHeader);
  const problems = [];
  if (status !== null && res.status !== status) problems.push(`status ${res.status}, expected ${status}`);
  if (location !== null && res.location !== location) problems.push(`Location ${res.location}, expected ${location}`);
  if (status === null && hostHeader && res.status === 301) problems.push("must not be redirected");
  if (res.location && !/^\/(?![/\\])/.test(res.location) && !SAFE_ABSOLUTE.some((o) => res.location.startsWith(o))) {
    problems.push(`unsafe Location ${JSON.stringify(res.location)}`);
  }
  if (res.headers["set-cookie"]) problems.push("unexpected Set-Cookie header");
  if (robots) {
    const found = res.body.match(/name="robots" content="([a-z]+)/)?.[1];
    if (found !== robots) problems.push(`robots ${found}, expected ${robots}`);
  }
  if (res.status === 200 && !res.headers["x-frame-options"]) problems.push("security headers missing");
  if (problems.length) failures++;
  console.log(`${problems.length ? "FAIL" : "ok  "} ${hostHeader ? `[${hostHeader}] ` : ""}${path} -> ${res.status}${res.location ? ` ${res.location}` : ""}${problems.length ? `  (${problems.join("; ")})` : ""}`);
}
if (failures) {
  console.error(`verify-nginx-routes: ${failures} failing case(s)`);
  process.exit(1);
}
console.log(`verify-nginx-routes: OK — ${CASES.length} cases`);
