# Existing ERP audit for mobile delivery

**Status:** research only (2026-11-10). No production code, schema, dependency, build or deployment was changed.
**Question answered:** can the current Prime7 ERP work well on phones without major changes, and what must be true
before it is installed as a mobile app?

How to read the labels in this document:

- **[VERIFIED]** checked in the repository (file and line given).
- **[UNVERIFIED]** cannot be checked from the repository (for example the live host Nginx) or needs a real phone.
- **[GAP]** something missing that matters for mobile.

Line numbers are correct on 2026-11-10 and will drift as the code changes; the file and symbol names are the stable part.

---

## 1. Short answer

Prime7 already works as a **mobile-responsive online web application**. It is **not yet an installable app (PWA)**:
there is no web app manifest and no service worker. The phone shell (bottom navigation, More drawer, safe areas,
downloads, printing) was fixed on 2026-11-09 (`docs/MOBILE_RESPONSIVE_AUDIT.md`), with 0 high and 0 medium issues on 26
audited routes. What remains for phones is mainly **dense tables and wide editing grids**, **unsaved-form protection**,
and **session and cache hardening**.

| Area | Mobile readiness today | Main reason |
|---|---|---|
| Navigation, login, dashboards, simple forms | Good | Responsive shell, 44px targets, mobile login |
| Lists and reports | Usable with sideways scrolling | Tables need 720–1400px width |
| Complex editing grids (BOM, quotations, consumption) | Hard on a phone | Very wide grids, small targets |
| File upload, camera, download, print | Good, needs device testing | `fileSave.ts`, camera capture, print CSS |
| Install to home screen | Not available | No manifest or service worker |
| Offline use | Only the production scan station | One local queue; no offline app start |
| Unsaved changes protection | Mostly missing | One HR-only guard; no app-wide dirty state |
| Session on a phone | Works, re-login every 60 minutes | Staff token lifetime, no refresh |

---

## 2. Stack, build and routing

- **[VERIFIED]** React 18.3, React Router 7, Vite 6, TypeScript 5.6, TanStack Query 5 (`frontend/package.json:19-61`).
- **[VERIFIED]** Build: `tsc -b && vite build && tsx scripts/inject-static-route-html.ts` (`frontend/package.json:10`). The last
  step writes extra static HTML shells for public marketing routes (`frontend/scripts/inject-static-route-html.ts`).
- **[VERIFIED]** `BrowserRouter` entry point; stale-chunk recovery is installed before React starts (`frontend/src/main.tsx`).
- **[VERIFIED]** Pages are lazy-loaded and split into hashed files (`frontend/src/app/router.tsx`; manual chunks in
  `frontend/vite.config.ts:35-59`). A local build on 2026-11-10 had 531 files (517 JavaScript) totalling 6.7 MB
  uncompressed in `frontend/dist/assets`. This is good for phones (small first download) but it matters for updates: an old open
  app can ask for an old chunk after a deploy (see `AUTOMATIC-UPDATE-STRATEGY.md`).
- **[VERIFIED]** One code base serves the marketing site, the staff ERP (`/app/*`) and the customer, financier and supplier
  portals (`/portal/*`). A mobile app built from this code covers all of them.

## 3. Responsive design and phone usability

What already works **[VERIFIED]**:

- Viewport with `viewport-fit=cover` and a theme colour (`frontend/index.html:6-7`).
- Desktop sidebar hidden below the `lg` breakpoint; content gets bottom padding for the phone menu
  (`frontend/src/components/Layout.tsx`).
- Five-tab bottom navigation with a searchable More drawer and safe-area insets
  (`frontend/src/components/navigation/AppBottomNav.tsx`); the drawer and the desktop sidebar share the same permission
  filter (`filterVisibleMenuSections` in `frontend/src/components/shell/sidebarNavUtils.ts`).
- Mobile login with 44px fields (`frontend/src/pages/UnifiedLoginPage.tsx:180-296`).
- Row Actions menus float above sideways-scrolling tables on phones (`RowActionsMenu.tsx`).
- Inputs are 16px below 1024px width so iPhone does not zoom in; tall dialogs scroll (`frontend/src/index.css`).
- Card view on narrow screens for seven inventory lists (`frontend/src/hooks/useInventoryListView.ts`,
  `frontend/src/components/inventory/InventoryMobileList.tsx`) and for HR employees (`HrEmployeesPage.tsx`).
- The app is light-only on purpose (`frontend/src/lib/theme.ts`, `frontend/public/theme-init.js`).
- Repeatable phone audit: `node tools/tutorial-capture/mobile-audit.mjs` (360px and 390px).

What is still weak **[GAP]**:

- The shared data grid has a 720px minimum width (`frontend/src/components/app/data-grid/DataGrid.tsx:285-288`).
- Some core pages need 900–1400px: quotations (`QuotationsPage.tsx:255`), styles (`StylesPage.tsx:396`), consumption
  reconciliation (`ConsumptionReconciliationPage.tsx:741` and `1257`), BOM materials (`BomMaterialsTable.tsx:56`).
- Small tap targets remain in dense tables (2026-11-09 audit: 116 targets under 32px on the trial balance, 65 on HR
  employees, 39 on orders).
- The table fallback in `frontend/src/index.css:205-217` uses CSS `:has()`. Current Safari and Chrome support it; very old
  Android WebViews may not.

**Conclusion:** phones are fine for approvals, dashboards, look-ups, shop-floor screens and simple entry. Wide editing
grids are usable but slow. A mobile app does not fix this; it is the same web UI either way.

## 4. Authentication and sessions

- **[VERIFIED]** Staff login: company code + role + email + password (`UnifiedLoginPage.tsx:84-124`).
- **[VERIFIED]** The staff access token and tenant id are stored in `localStorage` (`p7_token`, `p7_tenant_id`;
  `frontend/src/api/core.ts:19-33`, keys in `frontend/src/api/authStorage.ts:11-12`).
- **[VERIFIED]** Staff token lifetime is 60 minutes (`backend/app/config.py:10`, `jwt_expire_minutes`). The staff auth router
  has a `/login` route (`backend/app/modules/auth/router.py:183`) but **no staff refresh and no server-side logout route**.
  Logout only deletes the browser copy (`clearAuth`, `core.ts:36-39`).
- **[VERIFIED]** One user, one device: each login raises `users.auth_session_version` (`auth/router.py:305`, also 351 and
  573); older devices get `401 session_superseded` and are sent to `/login?reason=session_replaced`
  (`core.ts:46-60`). Default on (`single_session_global`, `config.py:50`).
- **[VERIFIED]** A 401 clears credentials and redirects to login, keeping the page path in `next`
  (`handleSessionExpiredUnauthorized`, `core.ts:46-60`).
- **[VERIFIED]** Portals (customer, financier, supplier) have their own token, a 45-minute lifetime
  (`config.py:19`) and a refresh flow; the refresh token can be an HttpOnly cookie when
  `AUTH_REFRESH_COOKIE_ENABLED` is on (default off, `config.py:24`; `frontend/src/api/externalClient.ts`).
- **[VERIFIED]** A new login wipes every older session and the query cache (`clearAllSessionsForNewLogin`,
  `authStorage.ts:80-85`).

Mobile impact: `localStorage` survives closing and reopening a home-screen app, so users stay signed in **until the
60-minute token expires**, then they must sign in again. Remote sign-out of a lost phone is not possible today. See
`SECURITY-AND-RISK-ASSESSMENT.md`.

## 5. API communication, tenancy and permissions

- **[VERIFIED]** All staff calls go through `request`, `requestWithTotal`, `requestBlob` and `requestText` in
  `frontend/src/api/core.ts`, sending `Authorization: Bearer` and `X-Tenant-Id`.
- **[VERIFIED]** The API base is same-origin `/api` in Docker (`frontend/src/api/apiBase.ts`; used at `core.ts:120`).
  An app served from `https://prime7erp.com` needs **no CORS change**. An app served from another origin (a native
  wrapper uses `capacitor://localhost` or `https://localhost`) would need an absolute API URL, a `CORS_ORIGINS` entry and a
  CSP `connect-src` entry.
- **[VERIFIED]** The server, not the screen, enforces tenancy: the token's tenant must equal the user's tenant
  (`backend/app/common/auth.py:201-203`), `require_tenant` rejects a mismatched `X-Tenant-Id`
  (`backend/app/common/tenant.py:69-73`), and files take the tenant from the token only
  (`backend/app/modules/files/router.py:68-71`). Role and permission checks run on the server
  (`backend/app/common/permissions.py`; route guard test `backend/tests/test_route_permission_inventory.py`).
- **[VERIFIED]** No request timeout, abort or retry layer in the API helpers (`core.ts:105-136`). On a weak mobile
  network a request can hang until the browser gives up.
- **[VERIFIED]** TanStack Query keeps data in memory only; no persisted cache (`frontend/src/lib/queryClient.ts`).

Mobile impact: tenant isolation and RBAC do not depend on the device. Any mobile option that keeps the same API keeps
the same protection.

## 6. Files, camera, PDF and printing

- **[VERIFIED]** Every user download uses `saveBlob` / `openOrSaveBlob` (`frontend/src/lib/fileSave.ts`): normal download
  on desktop and Android, share sheet ("Save to Files") on iPhone and iPad, link kept alive 60 seconds.
- **[VERIFIED]** Camera: `getUserMedia` with feature checks and `playsInline` (`frontend/src/components/hr/bd/EmployeePhotoCapture.tsx`);
  file inputs with `capture` for documents (`EmployeeDocumentUpload.tsx`).
- **[VERIFIED]** Uploads use `FormData` without forcing JSON (`core.ts:111-115`). AI extraction checks file type and a
  10 MB limit (`frontend/src/components/ai-extract/FileImportCard.tsx`). Nginx allows 50 MB bodies
  (`frontend/nginx.prod.conf:4`).
- **[VERIFIED]** Print uses the browser print dialog with `@media print` rules (`frontend/src/index.css`,
  `frontend/src/components/print/PrintPreviewModal.tsx`).
- **[VERIFIED] [GAP]** The production `Permissions-Policy` header is `camera=(), microphone=(), geolocation=()`
  (`frontend/nginx.prod.conf:35`, sent at line 40). Under that policy the browser refuses `getUserMedia`, so the live
  in-page webcam ("Open webcam" in `EmployeePhotoCapture.tsx:70-91`) cannot start on any device. The file-input path
  ("Take photo with phone", which opens the phone's own camera app) is not governed by this header and keeps working.
  This is a current issue on every device, not a mobile-only one; it should be decided (for example `camera=(self)`)
  before in-page camera features are promised on phones. **[UNVERIFIED]** whether the host Nginx overrides the header.
- **[UNVERIFIED]** PDFs opened in a new tab and printing from a phone depend on each browser and printer; must be tested
  on real devices.

## 7. Browser-dependent features

- **[VERIFIED]** No service worker, no web app manifest, no `beforeinstallprompt` handling anywhere in `frontend/`
  (repository search on 2026-11-10).
- **[VERIFIED]** No application WebSocket or Server-Sent Events client. The only WebSocket is Vite's development hot
  reload (`frontend/vite.config.ts:60-81`). Notifications and dashboards poll over HTTP.
- **[VERIFIED]** Clipboard use is not always guarded (for example `frontend/src/pages/SignUp.tsx:96-99`).
- **[VERIFIED]** Native `window.confirm` and pop-ups are used in places; behaviour differs between iOS and Android.

## 8. Data kept on the device today (local storage and offline)

Prime7 is **not** offline-free today. This is the full inventory found on 2026-11-10 (search for
`localStorage.setItem` in `frontend/src`).

| Key | Content | Cleared at logout / new login? | Risk on a shared phone |
|---|---|---|---|
| `p7_token`, `p7_tenant_id` | Staff access token, tenant id | Yes (`authStorage.ts:39-42`) | High while signed in |
| `p7_ext_*` | Portal token, refresh token (when not cookie), tenant, role | Yes at new login (`authStorage.ts:44-52`) | High while signed in |
| `p7_scan_queue`, `p7_scan_problems`, `p7_scan_device_id` | **Offline production scans** (barcode, operation, operator code, line) | **No** | Medium: next user could send or see them |
| `p7_scan_station` | Scan station line / order / operator choice | No | Low |
| `p7_inventory_kpi_snapshot`, `p7_inventory_overview_snapshot` | Last inventory KPI counts (open POs, GRNs, stock items) | **No**, and not keyed by tenant | Low to medium: business counts of the last tenant stay on the device |
| `p7_owner_cost_alerts_dismissed` | Dismissed alert ids | No, not keyed by tenant | Low |
| `p7_nav_favorites_<userId>`, `p7_onboarding_dismissed:<tenant>` | Preferences | No, keyed per user / tenant | Low |
| `p7_ai_last_session_id` | Last AI chat id | Yes | Low |
| `lastCompanyCode`, `p7_grid:*`, view / page-size / language / sidebar / gate / cheque offset | Preferences | No | Low (company code reveals the tenant) |

The scan queue is the **only offline write path** (`frontend/src/pages/app/production/scan/scanQueue.ts`): each scan gets a
unique `client_key` so a resend cannot double-count, the queue is capped at 5000, and the station retries every 15
seconds when online (`ScanStationPage.tsx`). Without a service worker it works only while the page is already loaded;
the app cannot start offline.

**[GAP]** The scan queue and KPI snapshots are not removed or tenant-keyed at logout or user change. On a shared factory
phone this can leave the previous user's unsent scans or the previous tenant's counts. Any mobile plan must decide:
remove, key by tenant and user, or keep with a warning. The recommendation does **not** add any new offline ERP writes.

## 9. Unsaved form protection

- **[VERIFIED]** One guard exists: `useUnsavedChangesGuard` in
  `frontend/src/components/hr/workspace/useUnsavedChangesGuard.ts` (tested in `useUnsavedChangesGuard.test.ts`). Because the
  app uses `<BrowserRouter>` (`frontend/src/main.tsx:19`), React Router's data-router `useBlocker` is not available, so the
  hook covers `beforeunload`, in-app link clicks (capture phase) and the Back button (an extra history entry). It is used
  only by the HR employee workspace (`EmployeeWorkspace.tsx`) and asks with `window.confirm`.
- **[VERIFIED] [GAP]** Every other form (vouchers, GRN, orders, payroll, BOM) has no guard. Two components track a local
  `dirty` flag for their own save button only: `frontend/src/components/logistics/PackingCartonsEditor.tsx` and
  `frontend/src/components/orders/OrderColorSizeMatrix.tsx`. There is no app-wide record of "a form is dirty right now",
  so an update or reload mechanism cannot ask whether it is safe.
- Phones make this worse: the back gesture, switching apps (the system can unload the page), session expiry and an
  automatic update reload can all drop typed data.
- **[VERIFIED]** The existing stale-chunk recovery reloads the page once when a deploy removed a chunk
  (`frontend/src/lib/chunkReload.ts:54-63`). That reload also drops unsaved typing today.

This is a prerequisite for any automatic-update design (`AUTOMATIC-UPDATE-STRATEGY.md`).

## 10. Docker, Nginx and HTTPS

- **[VERIFIED]** Production frontend is a static Nginx image built by `frontend/Dockerfile.prod` (multi-stage), mapped to
  host port `5173:80` (`docker-compose.prod.yml:257-258`). The host Nginx owns ports 80/443.
- **[VERIFIED]** Hashed `/assets/` are cached one year as `immutable`, and a missing asset returns 404, not HTML
  (`frontend/nginx.prod.conf:45-54`).
- **[VERIFIED]** Only the exact `/index.html` is `no-cache, no-store` (`nginx.prod.conf:57-64`). Generated route shells such
  as `/pricing/index.html` and other public files (`theme-init.js`, images) have no explicit cache rule.
- **[VERIFIED]** CSP is **Report-Only** (blocks nothing) and already allows `worker-src 'self' blob:` and
  `manifest-src 'self'` (`nginx.prod.conf:34-41`). A future service worker and manifest are therefore not blocked.
- **[VERIFIED]** No `Cache-Control` on `/api/` or `/media/` from Nginx (`nginx.prod.conf:66-121`). In the backend only HR
  payroll and HR employee files send `private, no-store` (`backend/app/modules/hr_payroll/register_router.py`,
  `backend/app/modules/hr/employee_files_router.py`); the generic file route sends only `nosniff`
  (`backend/app/modules/files/router.py:81-90`).
- **[VERIFIED]** The inner Nginx sets `X-Forwarded-Proto $scheme` (normally `http` behind the host proxy)
  (`nginx.prod.conf:73`).
- **[VERIFIED]** `/health` returns HTTP 200 even when the database or Redis is "degraded", and returns the backend
  `version` (`backend/app/main.py:548-586`).
- **[UNVERIFIED]** The host Nginx for `prime7erp.com` (TLS certificate, HTTP→HTTPS redirect, HSTS, WebSocket upgrade)
  is not in the repository.

## 11. GitHub Actions and deployment

- **[VERIFIED]** Push to `main` or a `v*` tag runs the shared tests, then builds and pushes backend and frontend images
  tagged `latest` and the ref name; the frontend gets `VITE_APP_VERSION` at build time
  (`.github/workflows/deploy.yml:16-70`). A second workflow (`docker-build.yml`) pushes the same tags.
- **[VERIFIED]** Production is updated manually over SSH with `scripts/deploy_production_remote.sh <tag>`: it writes the
  image tags into `.env`, runs `docker compose pull` and `up -d`, waits for `/health`, and prints `alembic current`
  (`scripts/deploy_production_remote.sh:31-68`). It does not restore the previous tags on failure and does not check that
  the running version equals the tag.
- **[VERIFIED]** The `deploy.update_config` / `failure_action: rollback` blocks (`docker-compose.prod.yml:185-187`,
  `266-268`) apply to Docker Swarm, not to plain `docker compose up`, so they do not give automatic rollback here.
- **[VERIFIED]** There is no app store step anywhere. A web deploy already reaches every browser user.

## 12. Verdict

The current ERP **can** be delivered to phones with modest work, because the hard parts (responsive shell, downloads,
camera, print, same-origin API, server-side security) already exist. The work that is required before calling it a
mobile app:

1. Add installability (manifest, icons, minimal service worker) — not present today.
2. Generalise the HR unsaved-changes guard into an app-wide one and adopt it on transactional forms.
3. Make updates safe (HTML / service worker cache rules, version check, asset continuity) — partly present.
4. Harden sessions and caching (CSP enforcement, `no-store` on authenticated responses, session revoke) — see security doc.
5. Decide what happens to on-device scan queue and KPI snapshots at logout.
6. Continue screen-by-screen work on wide grids (independent of the delivery option).
