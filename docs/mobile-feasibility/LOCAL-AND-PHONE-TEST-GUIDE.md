# Local and phone test guide (mobile app)

How to test everything built for the mobile app **on your own PC** before you say "deploy". Each part says what to
do and what you should see. Results to record: device, browser and version, pass/fail, notes.

Background: `RECOMMENDED-IMPLEMENTATION-PLAN.md` (the full proof-of-concept table P1–P18 is in section 5).

## 0. The on/off switch

| Where | Switch | Default |
|---|---|---|
| Local dev server (`docker compose up`) | `VITE_PWA_ENABLED=true` in the repository `.env`, then recreate the `frontend` container | off |
| Local production-like test (part 3) | `scripts/mobile-app-local-test.ps1` turns it on for that test image only | on in the test image |
| Live site (later) | GitHub → Settings → Secrets and variables → Actions → **Variables** → `VITE_PWA_ENABLED` = `true`, then release | off |

With the switch **off**, the site behaves exactly as before: no service worker, no install links, no `/install` page,
and any service worker left from an earlier test is removed automatically.

## 1. Start the dev stack with the new code

```powershell
docker compose up -d
docker compose restart backend   # the backend does not auto-reload; this loads the new logout / no-store code
```

## 2. Phase 1 checks (no switch needed) — http://localhost:5173

| # | Do | Expect |
|---|---|---|
| L1 | Sign in, then your name → **Logout** | Login page. Signing in with the old browser tab's token (open a second tab before logout) shows "signed in on another device" |
| L2 | As tenant admin: **Settings → User Mgmt → Actions → Sign out devices** on a test user who is signed in elsewhere | Confirmation, then green message; the other browser is sent to login at its next click |
| L3 | As a non-admin, the same action | Not available / "Admin access required" |
| L4 | DevTools → Network → any `/api/v1/...` response | Header `Cache-Control: private, no-store` |
| L5 | Open an inventory page (KPI cards), then Logout; DevTools → Application → Local Storage | `p7_inventory_kpi_snapshot` / `p7_inventory_overview_snapshot` are gone |
| L6 | Scan station (`shop_floor_scan_enabled` on): DevTools → Network → Offline, scan two bundles, then **Logout** | "2 production scans not sent yet" question; **Stay signed in** keeps you; **Sign out** keeps the scans for you |
| L7 | Sign in again, open the scan station, go online | The 2 scans are sent (0 duplicates); another user on the same browser never sees them |
| L8 | Open a voucher / GRN / PO / order / BOM / quotation form, type something, click a sidebar link | "Leave without saving?" question; Cancel keeps your typing |
| L9 | HR → Employees → Bangladesh employee photo → **Open webcam** | Browser asks for camera permission (camera is now allowed for our own site) |

## 3. Production-like mobile app test on the PC — http://localhost:8090

This uses the real Nginx configuration and the real update files, next to your dev backend.

```powershell
./scripts/mobile-app-local-test.ps1 -Version local-1
```

| # | Do | Expect |
|---|---|---|
| M1 | Open http://localhost:8090/login in **Chrome or Edge** | Below the form: **Back to Website** and **Install the app** |
| M2 | Open http://localhost:8090/ | **Get the mobile app** in the Explore More row and under the final buttons |
| M3 | Click **Install the app** | `/install` page; on a PC the Android section is first; an **Install Prime7 ERP** button appears after a few seconds |
| M4 | Click **Install Prime7 ERP** → Install | A **Prime7 ERP** window without the address bar; the install links are hidden inside it |
| M5 | Sign in inside the app window; close the window; reopen it from the Start menu | Still signed in (until the 60-minute expiry) |
| M6 | DevTools (F12 in the app window) → Application → Service workers | `/sw.js` activated and running |
| M7 | DevTools → Application → Cache storage | Only `p7-assets-v1` (`/assets/...` files) and `p7-offline-v1` (`/offline.html`, icon). **No** `/api`, `/media`, PDF or export |
| M8 | DevTools → Network → Offline; click a menu link | "You are offline" page, no ERP data; back online → **Try again** works |

### Simulate a deploy (update while the app is open)

1. Leave the installed app open on the dashboard.
2. In a terminal: `./scripts/mobile-app-local-test.ps1 -Version local-2 -Previous local-1`
3. Click into another window and back to the app (or wait 10 minutes).

| # | Expect |
|---|---|
| U1 | Dark strip at the top: **A new version of Prime7 ERP is ready.** with **Reload now** and **Later** |
| U2 | Click a menu link: the page opens on the new version (strip gone); http://localhost:8090/version.json says `local-2` |
| U3 | Repeat with `local-3 -Previous local-2`, but first open **New customer** and type a name: strip says **Save your work first**, **Reload now** is disabled, nothing reloads; clicking a link asks "Leave without saving?" |
| U4 | Save the form: you can now reload; your saved record is there |
| U5 | Close the app window completely, deploy `local-4 -Previous local-3`, reopen | Opens directly on `local-4` |
| U6 | Rollback: run `-Version local-3 -Previous local-4` | The app switches back to `local-3` at the next safe moment |

Stop the test container afterwards: `./scripts/mobile-app-local-test.ps1 -Stop`. Uninstall the test app from the app
window's menu (**⋯ → Uninstall**) so it does not mix with the real one later.

## 4. Phones

Service workers and installing need **HTTPS** or **localhost**. A phone on your Wi-Fi opening `http://192.168.x.x` is
neither, so use one of these:

### Android, via USB (no HTTPS needed)

1. On the phone: Settings → About phone → tap **Build number** 7 times → Developer options → **USB debugging** on.
2. Connect the USB cable. On the PC open `chrome://inspect/#devices` (or `edge://inspect`) and allow the phone.
3. **Port forwarding…** → add `8090` → `localhost:8090` → tick **Enable port forwarding**.
4. On the phone open Chrome → `http://localhost:8090/login` → **Install the app** → **Install Prime7 ERP**.
5. Run M4–M8 and U1–U6 on the phone. Use `chrome://inspect` → **inspect** to see the phone's Cache Storage.

### iPhone (needs HTTPS)

Pick one (decision in `RECOMMENDED-IMPLEMENTATION-PLAN.md` section 8):

- **Temporary HTTPS tunnel** (fastest): install Cloudflare's `cloudflared` on the PC and run
  `cloudflared tunnel --url http://localhost:8090`. Open the printed `https://….trycloudflare.com` address in Safari.
  The local stack is reachable from the internet while it runs: use **demo data only** and stop it afterwards (Ctrl+C).
- **Staging site** with its own HTTPS certificate.

Then in Safari: **Install the app** → follow the steps (Share → Add to Home Screen → Open as Web App → Add) and run
M4–M8 and U1–U6. Safari Web Inspector (Mac) shows the phone's storage.

### Two phones at once

Use **two different users** (single session: the same user on two phones signs the first one out — that is test P7 in
the plan and is expected).

## 5. Go / no-go before "deploy"

- All of L1–L9, M1–M8, U1–U6 pass on PC, and M/U pass on at least one Android phone; iPhone if you tested with a tunnel
  or staging.
- No data loss in U3 and no authenticated content in Cache Storage (M7).
- Then: commit, push, and turn the switch on for the live site only when you want phones to start installing
  (section 0). Deploying with the switch off is safe: the site behaves as before.
