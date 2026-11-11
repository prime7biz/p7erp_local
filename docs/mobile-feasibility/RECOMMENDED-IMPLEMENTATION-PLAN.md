# Recommended implementation plan

**Status:** approved 2026-11-11. Phase 1 (prerequisites) is implemented locally and tested, **not committed or deployed**.
See section 8 for decisions and progress.

Related documents: `EXISTING-ERP-AUDIT.md` (what exists), `MOBILE-ARCHITECTURE-COMPARISON.md` (why this option),
`ANDROID-IOS-PRIVATE-DISTRIBUTION.md` (install rules), `AUTOMATIC-UPDATE-STRATEGY.md` (update design),
`SECURITY-AND-RISK-ASSESSMENT.md` (risks and acceptance criteria).

---

## 1. Final recommendation

**Deliver Prime7 to Android and iPhone as an installable Progressive Web App (PWA) served from
`https://prime7erp.com`.** Optional later: an Android Trusted Web Activity APK on top of the same PWA, only if Android
users or customer IT specifically ask for an APK.

### Why this is the best option for Prime7

1. **Automatic updates through the existing deploy.** The app's code is the website's code. A normal deploy updates every
   installed app; the update applies at the next safe moment and never over an unsaved form.
2. **No store, no paid account, no renewal** on either platform.
3. **One code base and one pipeline.** No mobile fork, no second release.
4. **Security model unchanged.** Same origin, same API, same tenant and RBAC checks; no native bridge.
5. **Smallest effort and lowest running cost** (weighted score 80/100 vs 67 for TWA, 60 for remote Capacitor, 45 for bundled
   Capacitor; it stays first in every sensitivity scenario).

### Why the alternatives are less suitable

- **Bundled Capacitor:** every frontend change becomes a native release; iOS private distribution is hard (Custom Apps
  "Get Apps" is not listed for Bangladesh; Enterprise is not allowed for tenant users; Ad Hoc is for testing).
- **Remote Capacitor (`server.url`):** Capacitor documents it as not for production; Apple review risk (guidelines 4.2 and
  2.5.2); remote code next to native plugins.
- **TWA:** good but Android-only and built on top of the PWA; kept as an optional add-on.
- **Plain website:** already works, but no proper install, no safe update control.
- **React Native / Flutter / native:** months of work and a second code base for no current need.

### Answers to the brief

| Question | Answer |
|---|---|
| Separate mobile code base? | **No.** |
| Docker changes? | Small, inside the existing frontend image: new static files, Nginx cache rules, `version.json`, previous-release assets. No port, volume, network, service or base-image change. |
| GitHub Actions changes? | Small: pass the previous frontend tag and the PWA flag as build arguments; optional header smoke test. No new workflow. |
| Backend changes? | None for the PWA itself. Security prerequisites add a staff logout / device sign-out endpoint (no migration; uses the existing `auth_session_version`). |
| Database changes? | None. |
| Estimated development time | About **3–5 weeks** for one developer: 1–2 weeks of security and unsaved-form prerequisites (includes a one-week CSP observation period), 2–3 weeks for the PWA, install pages and the two-device proof of concept. |
| Estimated ongoing cost | **USD 0** in accounts and hosting. Maintenance is part of normal web releases. Optional TWA later: Android developer verification registration before the 2027 global rollout (fee per Google's terms at that time). |

## 2. How users install it

### Android (Chrome)

1. Open `https://prime7erp.com` in **Chrome**.
2. Tap **Get the mobile app** on the website or **Install the app** under the sign-in form.
3. On the install page, tap **Install**, then **Install** again in Chrome's prompt.
   (If no prompt appears: Chrome menu **⋮** → **Install app** or **Add to home screen**.)
4. Open **Prime7 ERP** from the home screen or app drawer and sign in.

### iPhone and iPad (Safari)

1. Open `https://prime7erp.com` in **Safari**.
2. Tap **Get the mobile app** or **Install the app**; the install page shows these steps.
3. Tap the **Share** button, then **Add to Home Screen**.
4. Keep **Open as Web App** switched on, then tap **Add**.
5. Open **Prime7 ERP** from the home screen and sign in. (The home-screen app has its own sign-in, separate from Safari.)

### How they get future updates

Nothing to do. When the app is opened after a deploy it starts on the new version. If it was left running, it switches at
the next safe moment (back from the background with no unsaved form, opening another page, or tapping **Reload now** on
the banner). Unsaved forms are never reloaded. Details and timing targets: `AUTOMATIC-UPDATE-STRATEGY.md` sections 3.5
and 5.

## 3. App install entry points (landing page and login page)

These are the user's requested shortcuts. **Future work; no code in this phase.** They ship in the same phase as the PWA,
because they need the manifest, service worker and install-prompt capture (`AUTOMATIC-UPDATE-STRATEGY.md` section 3.9).

### 3.1 Where they go

| Surface | Placement | Label | Style |
|---|---|---|---|
| Landing page `frontend/src/pages/Landing.tsx` | A button in the existing **Explore More** row (around line 524), and a secondary link under the final call-to-action buttons (around line 555) | "Get the mobile app" | Same classes as the Explore More buttons; outline style on the dark final CTA |
| Login page `frontend/src/pages/UnifiedLoginPage.tsx` | In the footer block, next to **Back to Website** (around line 341) | "Install the app" | Same muted link style (`text-sm text-text-muted hover:text-brand-primary`) with a small phone icon |

Behaviour of the shortcut:

- Visible on all screen sizes (desktop Chrome and Edge can install PWAs too).
- **Hidden** when the page is already running as the installed app (`display-mode: standalone`, or `navigator.standalone`
  on iOS).
- Tracked with the existing analytics helper (`trackEvent("cta_click", { cta: "install_app", from: ... })`) on the landing
  page, like other landing CTAs.

### 3.2 The shared "Install the mobile app" page

- A public route (for example `/install`) used by both shortcuts, also listed for SEO and the sitemap
  (`frontend/src/config/publicMarketingPaths.ts`, `frontend/scripts/generate-sitemap.ts`). A route is preferred over a modal
  so the link can be sent by email or WhatsApp to staff and customers.
- Detects the platform and shows the right section first:
  - **Android / desktop Chrome / Edge:** an **Install** button. If the captured `beforeinstallprompt` event exists, the tap
    calls `prompt()` (the native install dialog). If not (already installed, other browser, or Chrome has not offered it
    yet), show the manual menu steps from section 2.
  - **iPhone / iPad:** illustrated Share → Add to Home Screen → Open as Web App steps. iOS never shows a prompt. If the page
    is opened in Chrome or another iOS browser, a note suggests Safari.
  - **Already installed:** "You are using the app" with a link to sign in.
- Explains in one sentence that updates are automatic and no store is needed.

### 3.3 Constraints

- Public, unauthenticated page: no tenant name, company code, session state or API calls (security criterion S10).
- Uses only static content; works for marketing visitors, staff and portal users alike.
- Help & Tutorials: add or update the matching article in `frontend/src/data/tutorials/sections/` (routes, steps,
  screenshots, `lastUpdated`) in the same change, per `.cursor/rules/tutorials-maintenance.mdc`.
- Behind the same flag as the PWA (section 4): when the flag is off, the shortcuts and the install page are not shown.

## 4. Phased implementation (after approval)

Live-server stability rules apply: additive changes, feature flag off by default, explicit operational impact, rollback
for every phase.

**Feature flag:** build argument `VITE_PWA_ENABLED` (default `false`) controls service-worker registration, the update
banner and the install entry points. With `false`, the site behaves exactly as today.

| Phase | Scope | Main files | Effort | Operational impact | Rollback |
|---|---|---|---|---|---|
| **0. Decisions** | Session length (R6), scan-queue rule on logout (R4), camera policy (R12), staging host for the POC | — | 1–2 days of discussion | None | — |
| **1. Prerequisites** | Enforce CSP after a clean Report-Only week (S1); `no-store` on `/api/`, `/media/`, generic files (S2); clear KPI snapshots / alert dismissals on logout (S5); staff `POST /auth/logout` + admin "sign out all devices" (R2); shared unsaved-changes registry, adoption on key forms, `chunkReload.ts` respects dirty forms | `frontend/nginx.prod.conf`, `backend/app/modules/files/router.py`, `frontend/src/api/authStorage.ts`, `backend/app/modules/auth/router.py`, `frontend/src/components/hr/workspace/useUnsavedChangesGuard.ts` (moved to a shared place), `frontend/src/lib/chunkReload.ts` | 8–9 developer-days + 1 week CSP observation | Header changes need a frontend image deploy; new endpoint is additive | `git revert`; CSP can return to Report-Only by header name |
| **2. PWA core** | Manifest, icons, `offline.html`, `sw.js`, registration + update hook + banner, `version.json`, Nginx cache rules, previous-release asset retention, deploy-script version check and tag restore, kill-switch worker | `frontend/public/`, `frontend/index.html`, `frontend/src/main.tsx`, new `frontend/src/lib/pwa/`, `frontend/nginx.prod.conf`, `frontend/Dockerfile.prod`, `.github/workflows/deploy.yml`, `scripts/deploy_production_remote.sh` | 7–8 developer-days | Flag off by default; new static files only | Flag off and rebuild; or deploy kill-switch `sw.js` |
| **3. Install entry points** | Section 3: landing and login shortcuts, `/install` page, tutorial update, sitemap entry | `Landing.tsx`, `UnifiedLoginPage.tsx`, new install page, `frontend/src/data/tutorials/sections/*` | 1.5–2 developer-days | Visible only with the flag on | Flag off |
| **4. Proof of concept** | Section 5 on a staging HTTPS host | — | 2–3 days | Staging only; needs your approval for the staging deploy | Remove staging stack |
| **5. Rollout** | Flag on in production; announce install link to staff and customers | — | 1 day | Production deploy (your approval) | Flag off + kill switch |
| Optional 6. TWA | Bubblewrap project, signing key custody, `/.well-known/assetlinks.json`, APK download page | separate small repository or `tools/` folder | 2–4 days | APK hosting | Remove download link |
| Later | Web Push (needs backend push service), longer sessions with refresh cookies, offline read-only views | — | Separate proposals | — | — |

Tests to add with each phase (run in Docker / npm as usual): unit tests for the dirty registry, version comparison,
single-reload guard and install-platform detection; header tests for S1–S2; backend tests for logout / device sign-out
(cross-tenant denial: an admin of tenant A cannot sign out a user of tenant B; permission denial for non-admins); existing
`tests/test_auth_session_version.py` must still pass.

## 5. Proof of concept

### 5.1 Goal

Prove on one real Android phone and one real iPhone that Prime7 installs, signs in securely, loads an existing module,
receives a small frontend change automatically, keeps the session, and never loses an unsaved form during an update.

### 5.2 Setup

- **Environment:** a staging deployment with a valid HTTPS certificate (service workers and installation require HTTPS;
  a phone cannot use the local `http://` Docker stack). Same images and compose file as production, `VITE_PWA_ENABLED=true`.
  Deploying staging needs your approval.
- **Devices (record at test time):** device model, OS version, browser and version, network (Wi-Fi / 4G), test date.
  Minimum: one Android phone with current Chrome; one iPhone with current iOS and Safari.
- **Users:** **separate** test users so single-session enforcement does not interfere: User A (Android) and User B
  (iPhone), both staff in the POC tenant; User C (tenant admin) for the lost-device test. Never disable
  `single_session_global` for testing.
- **Builds:** four tags with a visible **frontend-only** change each, for example a small "POC build 1" … "POC build 4"
  label on the dashboard header, plus the matching `version.json`. Do not use the footer version as proof: `AppFooter`
  shows the backend version first (`health?.version || APP_VERSION`, `frontend/src/components/shell/AppFooter.tsx`), so it
  can show a new number while old frontend code is still running.
- **Representative module:** Dashboard (`/app`) and the Customers list (`/app/customers`). **Dirty form:** the New Customer
  form (no financial posting). No vouchers are posted during the POC.
- **Tools:** Android: `chrome://inspect` remote debugging. iPhone: Safari Web Inspector (Mac). Stopwatch. A results sheet
  with one row per trial.

### 5.3 Test procedures and pass/fail criteria

| # | Test | Steps | Pass criteria |
|---|---|---|---|
| P1 | Install on Android | Chrome → staging URL → login page → **Install the app** → Install | Icon on home screen within 60 s; opens without address bar; name "Prime7 ERP"; 3/3 attempts on clean installs |
| P2 | Install on iPhone | Safari → **Get the mobile app** → follow steps | Icon on home screen; opens without Safari bars; 3/3 attempts |
| P3 | Install entry points | Visit landing and login pages in browser, then inside the installed app | Shortcuts visible in browser, open `/install`; hidden inside the installed app; no API calls on `/install` (network log) |
| P4 | Secure login | Sign in User A on Android, User B on iPhone | HTTPS with valid certificate; sign-in under 5 s on Wi-Fi; lands on `/app`; no token in any URL; S1 and S2 headers present (`curl -I`) |
| P5 | Existing module | Open Dashboard, then Customers; search; open a row's Actions menu | Each screen interactive in under 5 s on Wi-Fi; data equals desktop; no console errors; Actions menu usable |
| P6 | Session persistence | Force-close the app, wait 5 min, reopen (3 times per device) | Still signed in 3/3; after token expiry (over 60 min): login page with "session expired", no crash |
| P7 | Same-user replacement | Sign in User A on the iPhone too | Android shows "signed in on another device" (`session_replaced`) at its next request |
| P8 | Update on reopen | Close the app; deploy build 2; reopen | The POC label shows build 2 on the first launch: **5/5** trials per device |
| P9 | Update on resume | App in background during deploy of build 3; resume after 5+ minutes, no form open | Build 3 applied within 30 s of resume: **at least 9/10** trials per device; never more than one reload |
| P10 | Update in foreground | App open on Customers list; deploy build 4 | Banner within 10 min; new build applied on the next page change: 3/3 |
| P11 | Unsaved form is safe | Type into New Customer (not saved); deploy a new build; wait 15 min with the app in front; also press Back | No reload while dirty; banner shown; all typed values still there: **5/5** trials per device, **0** data loss; Back shows the leave warning; after Save, the update applies |
| P12 | Old client, unvisited page | With build N open and clean, deploy N+1 and within 1 minute open a page never visited in that session (for example Reports) | Page renders from retained N assets; no 404 in the network log; no error screen: 3/3 |
| P13 | Two deploys while open | Keep a dirty form open across two deploys, then try to open an unvisited page | No blank screen; banner asks to save; form data kept; at most one reload after Save: 3/3, 0 data loss |
| P14 | Cache inspection | After P4–P11, inspect Cache Storage; sign out; flight mode; open a document URL seen before | Cache Storage holds only `/assets/*`, icons, `offline.html`; the document does **not** display; KPI snapshots gone from `localStorage` (S3, S4, S5) |
| P15 | Poor network | Flight mode: open the app; then online with a dirty form, go offline and press Save | Offline page within 5 s; Save shows a clear error, form kept; after reconnect **no** record exists on the server until Save is pressed again |
| P16 | Scan queue (separate) | On the scan station, queue 3 scans offline, reconnect | 3 accepted, 0 duplicates; logout with unsent scans follows the approved rule |
| P17 | Lost device | User C deactivates User B (or resets the password) | iPhone is sent to login at its next request; reactivate afterwards |
| P18 | Rollback | Deploy the previous tag pair; then deploy the kill-switch worker to staging | Both devices on the previous build at next launch 5/5; `/health` and `/version.json` versions match the tag; after the kill switch, the worker is unregistered and Cache Storage empty within one launch, app still works as a website |

### 5.4 Go / no-go

- **Go** when P1–P18 pass and security criteria S1–S10 (`SECURITY-AND-RISK-ASSESSMENT.md` section 5) pass, with results
  recorded per device and trial.
- **No-go** on any data loss in P11 or P13, any authenticated content in Cache Storage or the disk cache (P14), any
  cross-tenant or permission regression, or update success below the thresholds.
- **Sign-off roles:** Product owner (business acceptance of install and update experience), Engineering lead (tests and
  thresholds), Security reviewer (S1–S10), QA tester (executes and records P1–P18), Operations (deploy, rollback, kill
  switch). One person may hold more than one role, but the tester and the security reviewer should not be the developer
  who built the feature.

## 6. Operational impact and rollback (summary)

- **Required env changes:** none. New build argument `VITE_PWA_ENABLED` defaults to `false`.
- **Manual steps:** approve and run staging and production deploys; verify the host Nginx does not cache HTML, `sw.js` or
  `version.json` and has HSTS.
- **Downtime:** none expected (static files and headers).
- **Blast radius:** every browser user once the flag is on (the service worker registers on the public site too). This is
  why the kill switch, network-first HTML and the POC come first.
- **Rollback:** flag off and redeploy; or deploy the kill-switch `sw.js`; or `git revert` and redeploy the previous tag pair.
  No database rollback is involved.

## 7. Decisions (answered 2026-11-11)

1. PWA approved as the primary architecture; TWA (Android APK) to be planned later as Phase 6.
2. Mobile session length stays **60 minutes**.
3. Unsent production scans: the recommended rule — kept per company and user, never deleted silently, Logout warns first.
4. In-page camera allowed for our own origin only (`camera=(self)`).
5. Staging HTTPS host: needed for Phase 4 only; options are listed in section 8.

### Decision update (2026-11-11, afternoon)

- **Android only for now.** iPhone/iPad visitors see no install links; `/install` shows them a short note.
- **Google Play allowed after all:** the owner has a Play Console account. Start on the **Internal testing** track
  (private), with **Play App Signing**. The direct download on the website is the **Google-signed universal APK** from
  Play Console, so Play and website installs share one signature and can update each other.
- **Direct APK** at `https://prime7erp.com/downloads/prime7erp-android.apk`; buttons appear only when the GitHub
  repository variables `VITE_ANDROID_APK_URL` / `VITE_PLAY_STORE_URL` are set.
- **Account deletion page** `/account-deletion` (Google Play requirement), sent through the website lead form.

## 8. Progress

### Phase 1 — prerequisites (done locally 2026-11-11, not committed or deployed)

| Item | Status | Where |
|---|---|---|
| Server logout | Done | `POST /api/v1/auth/logout` in `backend/app/modules/auth/router.py`; called by `AuthContext.logout` via `authApi.logout` (4 s timeout, works offline) |
| Admin "Sign out devices" | Done | `POST /api/v1/settings/users/{id}/sign-out-devices` in `backend/app/modules/settings/router.py`; **Settings → User Mgmt → Actions → Sign out devices** |
| `no-store` on API and files (S2) | Done | `backend/app/common/cache_headers.py`, `backend/app/modules/files/router.py` |
| Clear company figures at sign-out (S5) | Done | `frontend/src/api/authStorage.ts` |
| Per-user scan queues + logout warning | Done | `frontend/src/pages/app/production/scan/scanQueue.ts`, `ScanStationPage.tsx`, `frontend/src/context/AuthContext.tsx` |
| App-wide unsaved-changes registry | Done | `frontend/src/lib/unsavedChanges.ts`, `frontend/src/hooks/useUnsavedChangesGuard.ts` (HR file re-exports it) |
| Stale-chunk reload waits for unsaved forms | Done | `frontend/src/lib/chunkReload.ts` |
| Camera policy | Done | `frontend/nginx.prod.conf` |
| Help & Tutorials | Done | `settings-users-invitations`, `gs-session-replaced`, scan station article |
| Adopt the guard on vouchers, GRN, PO, orders, BOM, payroll, quotations | **Open** | Per-form work; do with Phase 2 |
| Enforce CSP (S1) | **Open** | Needs one clean week of Report-Only violations from the live site before switching; switching blind could break pages |

Tests run (all passed): backend full suite in Docker (1292 passed, 4 skipped) including
`tests/test_auth_logout_and_device_signout.py`; frontend `npx tsc -b`, ESLint on changed files, full `npx vitest run`
(58 files, 323 tests); tutorial check `npm run check` in `tools/tutorial-capture`.

**Operational impact when deployed:** no env change, no migration, no downtime. New behaviour users notice: Logout ends the
session on the server; the warning for unsent scans; admins get **Sign out devices**; images served through the file
route are no longer kept in the browser cache. **Rollback:** `git revert` of the Phase 1 commit and redeploy.

### Phases 2, 3, 4 and 6 (done locally 2026-11-11, not committed or deployed)

Everything is behind the build switch `VITE_PWA_ENABLED` (default `false`; live switch = GitHub repository variable).

| Phase | What | Where |
|---|---|---|
| 2 | Manifest, icons (from `favicon.png`), offline page, small service worker, kill switch | `frontend/public/manifest.webmanifest`, `frontend/public/icons/`, `frontend/public/offline.html`, `frontend/public/sw.js`, `frontend/pwa/sw-kill-switch.js` |
| 2 | Manifest / iPhone tags only when switched on; `version.json` on every build | `p7MobileAppPlugin` in `frontend/vite.config.ts` |
| 2 | Update detection, safe switching (never while a form is dirty), update banner | `frontend/src/lib/pwa/appUpdate.ts`, `frontend/src/components/shell/AppUpdateBanner.tsx`, `frontend/src/main.tsx`, `frontend/src/App.tsx` |
| 2 | Nginx: never cache HTML, `sw.js`, manifest, `version.json`, `offline.html`; manifest content type | `frontend/nginx.prod.conf` |
| 2 | Image keeps the live release's hashed files; switch build argument | `frontend/Dockerfile.prod`; `.github/workflows/deploy.yml` and `docker-build.yml` (step "Resolve previous frontend image") |
| 2 | Deploy script: previous release saved, version check, printed rollback command | `scripts/deploy_production_remote.sh` |
| 3 | "Get the mobile app" (landing Explore More + final CTA), "Install the app" (login footer), `/install` page (noindex) | `frontend/src/components/public/InstallAppLink.tsx`, `frontend/src/pages/public/InstallAppPage.tsx`, `Landing.tsx`, `UnifiedLoginPage.tsx`, `app/router.tsx`, `config/seo.ts`, `utils/seoRobots.ts` |
| 3 | Help article `gs-install-mobile-app` | `frontend/src/data/tutorials/sections/getting-started.ts` |
| 4 | Local and phone test guide + helper script | `LOCAL-AND-PHONE-TEST-GUIDE.md`, `scripts/mobile-app-local-test.ps1` |
| 6 | Android APK (TWA) settings, Digital Asset Links template, runbook (no APK built: the signing key must be created and kept by you) | `mobile/android-twa/` |

Verified on this PC (2026-11-11): production build with the switch on (manifest tags in `index.html` and all 43 page
shells, `version.json` written); image final stage keeps previous-release files (new list format, today's images without
a list, missing entries skipped); `nginx -t` passes; response headers checked on the running image; Microsoft Edge
(Playwright): worker registers and controls the page, **installable with no errors**, install links and `/install` work,
Cache Storage holds only `/assets`, icons and `offline.html`, offline page shown, update banner appears when
`version.json` changes and **Reload now** reloads once. Building the full image inside Docker failed on this PC because
`npm ci` crashed ("Exit handler never called", antivirus HTTPS scanning, see `docs/BUILD_VERIFICATION.md`); GitHub
Actions is not affected.

**Operational impact:** no env variable on the server, no migration, no downtime. GitHub: optional repository variable
`VITE_PWA_ENABLED`. **Rollback:** set the variable to `false` and release (the app removes its worker), or deploy the kill
switch, or `git revert`.

### Staging host for the Phase 4 proof of concept (choose later)

| Option | What it needs | Notes |
|---|---|---|
| `staging.prime7erp.com` on the live server | DNS record, host Nginx server block + certificate, a second compose project with its own database | Closest to production; needs your SSH work or approval for me to prepare the files |
| Separate small VPS | Server, DNS, certificate, copy of the compose stack | Fully isolated from production; small monthly cost |
| HTTPS tunnel to a local Docker stack | A tunnel tool (for example Cloudflare Tunnel) on this PC | Fastest; exposes the local stack to the internet while it runs, so use demo data only |
