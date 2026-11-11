# Security and risk assessment for mobile delivery

**Status:** assessment only (2026-11-10). No security control was changed. Findings come from reading the code (file and
line given) and from an independent read-only security review run during this investigation. Nothing here has been
penetration-tested.

**Scope:** the recommended architecture (installable PWA on `https://prime7erp.com`), plus the extra risks that would
apply if a native wrapper (Capacitor / TWA) were chosen later.

**Bottom line:** a PWA does **not** weaken Prime7's server-side controls (tenant isolation, RBAC, approvals, audit,
period locks). It does make a few **existing** browser-side weaknesses matter more, because phones are carried around,
lost and shared, and an installed app stays signed in. Four items must be fixed before the PWA is offered to users
(section 5).

---

## 1. Controls that already protect mobile users (keep them unchanged)

| Control | Evidence | Why it matters on a phone |
|---|---|---|
| Token tenant must equal the user's tenant | `backend/app/common/auth.py:201-203` | A stolen token cannot be pointed at another tenant |
| `X-Tenant-Id` must match the user | `backend/app/common/tenant.py:69-73` | Header tampering on the device does nothing |
| Files take the tenant from the token only | `backend/app/modules/files/router.py:68-71` | No cross-tenant file access by URL |
| Every client-supplied related id is ownership-checked | `backend/app/common/ownership.py` (`ensure_owned`) | Same API, same checks |
| Server-side RBAC and route permission inventory | `backend/app/common/permissions.py`, `backend/tests/test_route_permission_inventory.py` | Hiding menus on phones is not the control; the server is |
| User re-checked on every request (`is_active`) | `backend/app/common/auth.py:197` | Deactivating a user blocks a lost phone at its next request |
| One user, one device (newest login wins) | `auth/router.py:305`, `auth.py:220-243`, `single_session_global` default on (`config.py:50`) | A second device signing in ends the first; password reset also ends sessions (`auth/router.py:573`) |
| Token families separated | `auth.py:158-176` | Portal / platform / reset tokens cannot call staff APIs |
| A new login wipes older sessions and cached data | `frontend/src/api/authStorage.ts:80-85` | Shared phones do not keep the previous login |
| Downloads go through one helper | `frontend/src/lib/fileSave.ts` | Predictable file handling on iOS and Android |
| HR payroll and employee files are `private, no-store` | `hr_payroll/register_router.py`, `hr/employee_files_router.py` | The most sensitive downloads are already not cached |
| Production secret checks, hidden OpenAPI, rate limits | `config.py:297-324`, `main.py:230-233` | Unchanged by mobile delivery |

## 2. Ranked risks

Severity is for the **PWA** unless stated. "Prerequisite" means it must be done before the PWA is offered.

### R1 — HIGH — Staff and portal tokens are kept in `localStorage`, and CSP does not block scripts

- **Evidence:** `frontend/src/api/core.ts:19-33`, `frontend/src/api/externalClient.ts:48-88`; CSP is
  `Content-Security-Policy-Report-Only` (`frontend/nginx.prod.conf:41`, also lines 53 and 63), so an injected script is
  not blocked. `docs/FRONTEND_SECURITY_HEADERS.md` already describes the switch to enforcement.
- **Mobile impact:** the token stays on the phone for its full lifetime; any cross-site scripting bug could copy it.
- **Mitigation:** enforce the CSP (rename the header in all three places after a clean report period) — **prerequisite**.
  Longer term: the staff refresh-cookie design (HttpOnly refresh cookie, short in-memory access token) described in
  `docs/FRONTEND_SECURITY_HEADERS.md`.

### R2 — HIGH — No staff logout on the server and no "sign out this device"

- **Evidence:** the staff router has `/login` only (`backend/app/modules/auth/router.py:183`); logout deletes the browser
  copy (`core.ts:36-39`); a token is valid for 60 minutes (`config.py:10`).
- **Mobile impact:** a lost or stolen phone that is still signed in stays usable until the token expires (up to 60 minutes),
  unless an admin acts.
- **Available before Phase 1:** an admin can **deactivate the user** (blocked at the next request, `auth.py:197`). The
  user's own **forgot-password reset** bumps the session version (`auth/router.py:573`). A new login on another device also
  ends the old session. Note: an admin typing a new password in **Settings → User Mgmt → Edit** does **not** end existing
  sessions.
- **Mitigation:** add `POST /auth/logout` that bumps `auth_session_version`, and an admin "sign out all devices" action
  (also a session-version bump). **Recommended before wide rollout; required before any longer mobile session (R6).**
- **Status (2026-11-11, Phase 1, not yet deployed):** done. `POST /api/v1/auth/logout` (skips the bump during platform-admin
  impersonation) is called by the Logout button; `POST /api/v1/settings/users/{id}/sign-out-devices` (tenant admin, own
  tenant only, audited as `SETTINGS_USER_SIGN_OUT_DEVICES`, 409 when single-session is off) is in **Actions → Sign out
  devices**. Tests: `backend/tests/test_auth_logout_and_device_signout.py`.

### R3 — MEDIUM — Authenticated responses do not say `no-store`

- **Evidence:** the generic file route sends only `nosniff` (`files/router.py:81-90`) for customer logos, style pictures,
  trade documents, signatures and HR documents; Nginx adds no cache header on `/api/` or `/media/`
  (`nginx.prod.conf:66-121`); only five `Cache-Control` headers exist in the backend, all in HR.
- **Mobile impact:** a browser may keep authenticated JSON, images or PDFs in its HTTP disk cache after logout. Browsers
  rarely cache API JSON without validators, but this must be **proven**, not assumed.
- **Mitigation:** `Cache-Control: private, no-store` on `/api/` and `/media/` (Nginx `add_header ... always`, without
  overriding stricter backend values) and on the generic file route — **prerequisite**. The POC inspects both the service
  worker cache **and** the browser HTTP/disk cache (section 6).
- **Status (2026-11-11, Phase 1, not yet deployed):** done in the backend instead of Nginx (avoids Nginx dropping the
  server-level security headers in a location with its own `add_header`): `backend/app/common/cache_headers.py`
  (`ApiNoStoreMiddleware`) adds `Cache-Control: private, no-store` to every `/api/` response that has none, and the file
  route sets it explicitly. There is no backend `/media` mount; files go through `/api/v1/files`. Trade-off: logos and style
  pictures are downloaded again on each view instead of coming from the browser cache.

### R4 — MEDIUM — Data left on shared phones after logout

- **Evidence:** the production scan queue (`p7_scan_queue`, `p7_scan_problems`), inventory KPI snapshots
  (`p7_inventory_kpi_snapshot`, `p7_inventory_overview_snapshot`) and dismissed alert ids are not cleared at logout and not
  keyed by tenant (`EXISTING-ERP-AUDIT.md` section 8). `lastCompanyCode` reveals the tenant.
- **Mobile impact:** on a shared factory phone the next user may see the previous tenant's counts, or the scan station may
  send scans recorded by someone else.
- **Mitigation:** clear KPI snapshots and alert dismissals in `clearInternalSessionStorage`; key the scan queue by tenant
  and user and warn before logout when unsent scans exist (do not silently delete them; they are real production records)
  — **prerequisite for shared devices**; business owner decides the scan-queue rule.
- **Status (2026-11-11, Phase 1, not yet deployed):** done with the approved rule. Sign-out and a new login remove KPI
  snapshots and alert dismissals (`frontend/src/api/authStorage.ts`). Scan queues are kept per company and user
  (`p7_scan_queue:<tenant>:<user>`, `scanQueue.ts`); scans under the old shared key go once to the next person who opens
  the scan station (today's behaviour); Logout warns when the user still has unsent scans.

### R5 — MEDIUM — Service worker could cache sensitive data if built carelessly (new with PWA)

- **Mitigation by design** (`AUTOMATIC-UPDATE-STRATEGY.md` section 3.2): the worker caches only hashed `/assets/`, icons and
  `offline.html`; it never touches `/api/`, `/media/`, `/health`, `/iclock/`, blobs, PDFs or requests with `Authorization`;
  HTML is network-first and never cached. A CI check and the POC verify this. A kill-switch worker is kept ready.
- **Status (2026-11-11, not yet deployed):** implemented (`frontend/public/sw.js`; it also refuses to store an HTML
  response under an asset name). Verified in Microsoft Edge: after API calls with `Authorization`, Cache Storage held only
  `/assets`, icons and `offline.html`. Independent security screen: PASS WITH FINDINGS; all findings fixed (previous-image
  file filter and digest pin, update applied after route change instead of intercepting clicks, `^~` on proxy locations,
  workflow and deploy-script input checks).

### R6 — MEDIUM — Session length decision

- **Today:** re-login every 60 minutes on every device. Users of an installed app will ask for longer sessions.
- **Risk:** a longer token on a phone widens the lost-device window.
- **Mitigation:** do not raise `jwt_expire_minutes` alone. If longer sessions are wanted, ship them only together with R2
  (server logout, device sign-out) and the refresh-cookie design from R1, and keep the access token short. Needs a business
  decision and its own security review.

### Live edge facts (checked on the server 2026-11-11, read-only)

- **Cloudflare** is in front of `prime7erp.com` (the host Nginx requires Cloudflare Authenticated Origin Pulls,
  `/etc/nginx/sites-enabled/prime7erp`). Cloudflare caches files such as `.js` and `.apk` by default unless the origin
  says otherwise; `sw.js` is sent `no-store` and `/downloads/` `no-cache` for that reason. Verify `cf-cache-status` after
  each release.
- **The host Nginx enforces a CSP** on every page (`default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'
  https://static.cloudflareinsights.com; ...`). So the live site is **not** "Report-Only only" as R1 assumed: an enforced
  policy exists, but `'unsafe-inline'` and `'unsafe-eval'` weaken its XSS protection. Removing them is the real R1 fix.
  The service worker and manifest work under this policy (`worker-src` / `manifest-src` fall back to `'self'`).
- The host Nginx sends `/api/` straight to the backend (port 8000), skipping the frontend container, which is why
  `no-store` is set in the backend (`ApiNoStoreMiddleware`) and not in the container Nginx.

### R7 — MEDIUM — TLS and HSTS at the edge are unverified

- **Evidence:** no `Strict-Transport-Security` in the repository; the host Nginx owning port 443 is not in the repository.
- **Mitigation:** confirm HTTPS redirect, a valid certificate, HSTS (`max-age` at least 6 months, `includeSubDomains` if all
  sub-domains are HTTPS) on the host Nginx. PWAs require HTTPS anyway.

### R8 — LOW to MEDIUM — Screenshots, app-switcher snapshots, clipboard, shoulder surfing

- **Fact:** a web app cannot block screenshots or the app-switcher snapshot (Android `FLAG_SECURE` and iOS snapshot hiding
  are native-only).
- **Mitigation:** keep sensitive fields masked by default where the code already does it (HR identity and bank fields,
  `hr/employee_service.py` masking); require a device passcode by policy; recommend MDM for company phones. Accept as a
  residual risk and state it in user guidance.

### R9 — LOW — Update integrity and supply chain

- **Fact:** a PWA update is whatever our server serves; integrity equals server and CI integrity.
- **Evidence:** images are also tagged `latest` and pushed by two workflows (`deploy.yml`, `docker-build.yml`); deploys use a
  version tag (`deploy_production_remote.sh:34-37`).
- **Mitigation:** keep deploy-by-tag; consider deploy-by-digest later; keep `script-src 'self'` (no third-party scripts in
  the app shell); keep the service worker same-origin only.

### R10 — LOW — Links and deep links

- **Fact:** a PWA has no custom URL scheme. On Android an installed WebAPK may open in-scope links (for example a
  password-reset email link) in the app; that is the same origin and the same code, so tokens stay first-party. External
  links open in the browser.
- **Mitigation:** keep reset tokens single-use and short-lived (existing); never put tokens in `start_url` or the manifest.

### R11 — LOW — Inner Nginx overwrites `X-Forwarded-Proto`

- **Evidence:** `proxy_set_header X-Forwarded-Proto $scheme;` (`nginx.prod.conf:73`, also 90, 106, 118) sends `http` to the
  backend behind the host proxy. Cookie `Secure` flags do not depend on it (`backend/app/common/auth_cookies.py:66-78`).
- **Mitigation:** pass through the host value when the request comes from the trusted host proxy. Low priority.

### R12 — INFO — Camera blocked by `Permissions-Policy`

- **Evidence:** `camera=()` (`nginx.prod.conf:35`) blocks the in-page webcam on every device.
- **Mitigation (functional, not a weakness):** if in-page camera is wanted, use `camera=(self)` only; never allow third-party
  origins.
- **Status (2026-11-11, approved, not yet deployed):** `camera=(self)` in `frontend/nginx.prod.conf`.

### R13 — Public install entry points

- The "Install the app" shortcut on the landing and login pages is public. It must show only installation help: no tenant
  name, no company code, no session state, no API calls beyond static files.

## 3. CSRF and XSS

- **CSRF:** staff API calls use a `Bearer` header, not cookies, so classic CSRF does not apply. Portal refresh cookies use
  `SameSite=Strict`, path `/api/external/auth` and a required `X-Requested-With: p7` header (`authStorage.ts:27`). A
  same-origin PWA keeps these first-party. (A native wrapper on another origin would break this; see section 4.)
- **XSS:** the main defence is React escaping plus an **enforced** CSP (R1). Report-Only gives no protection today.

## 4. Extra risks only if a native wrapper is chosen (not the recommendation)

| Risk | Applies to | Why |
|---|---|---|
| Native bridge raises the impact of XSS | Capacitor B and C | Injected script could call native plugins |
| Remote code inside the app | Capacitor C | A compromised website controls the native shell |
| Origin change | Capacitor B | `capacitor://localhost` breaks same-origin `/api`, `SameSite=Strict` cookies; needs CORS changes |
| Secure storage, backup exclusion, certificate pinning | Capacitor B / C | Must be built and maintained |
| Signing key custody | APK, TWA, Capacitor | Losing the Android key prevents updates; leaking it allows fake updates |
| Digital Asset Links misconfiguration | TWA | Falls back to a Custom Tab (visible URL bar), not a security hole |
| App Review data handling | iOS Custom Apps | Apple needs a demo login and sample data; never real tenant data |

## 5. Security acceptance criteria for the PWA (go / no-go)

| # | Criterion | How it is proven |
|---|---|---|
| S1 | CSP is enforced (`Content-Security-Policy`), with no violations on the POC routes | Response headers + browser console on Android and iPhone |
| S2 | `/api/` and `/media/` responses and the generic file route carry `Cache-Control: private, no-store` | `curl -I` against the deployed POC; header test in CI |
| S3 | Service worker Cache Storage contains only `/assets/*`, icons and `offline.html` | Chrome DevTools remote debugging (Android) and Safari Web Inspector (iPhone), after a full POC session |
| S4 | No authenticated JSON, media, PDF or export is served from the HTTP disk cache after logout | Logout, go offline, open a previously viewed document URL: must fail, not display |
| S5 | Logout and user change clear KPI snapshots and alert dismissals; scan queue handled per the approved rule | Inspect `localStorage` before and after logout |
| S6 | Lost-device procedure works: deactivating the user or resetting the password ends the phone session at the next request | POC step with two devices |
| S7 | Same-user login on a second device ends the first with `session_superseded` | POC step |
| S8 | Tenant isolation and RBAC tests still pass unchanged | `docker compose exec backend pytest tests/test_route_permission_inventory.py tests/test_merch_tenant_isolation.py -q` |
| S9 | HTTPS with valid certificate and HSTS on `prime7erp.com` | Browser certificate view; `curl -I https://prime7erp.com` |
| S10 | Install pages expose no tenant or session data | Code review + network log on the install page |

S2 (`no-store`) and S1 (CSP enforcement) are header changes in `frontend/nginx.prod.conf`; S5 is a small frontend change;
R2 (server logout / device sign-out) is a small backend change with tests. None needs a database migration.

## 6. How the POC checks caching (both layers)

1. **Service worker layer:** list every Cache Storage entry (Android: `chrome://inspect` → Application → Cache Storage;
   iPhone: Safari → Develop → device → Storage). Pass only if every entry is `/assets/*`, an icon or `offline.html`.
2. **HTTP cache layer:** check response headers of `/api/v1/...`, `/media/...`, one PDF and one export (S2). Then sign out,
   turn on flight mode and re-open a document URL seen earlier; it must not display (S4).
3. An empty Cache Storage panel alone is **never** accepted as proof.

## 7. Residual risks after the prerequisites

- Tokens remain in `localStorage` until the refresh-cookie design ships (mitigated by enforced CSP and short tokens).
- Screenshots and app-switcher snapshots cannot be blocked by a web app.
- iOS may evict storage of unused web apps (users sign in again; no data loss on the server).
- The live host Nginx configuration must be reviewed on the server.
