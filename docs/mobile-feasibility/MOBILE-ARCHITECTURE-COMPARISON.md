# Mobile architecture comparison

**Status:** research only (2026-11-10). Platform facts were checked against official documentation between 2026-11-08
and 2026-11-10 (sources at the end). Repository facts come from `EXISTING-ERP-AUDIT.md`.

**Decision:** **Option A, an installable Progressive Web App (PWA) served from `https://prime7erp.com`**, is the primary
architecture. Option D (Android Trusted Web Activity) is an optional later add-on for Android only. The reasons follow.

---

## 1. What we need (from the brief)

1. Every web deployment reaches mobile users automatically (highest priority), without reinstalling.
2. No public Google Play or App Store listing.
3. One code base and one deployment pipeline.
4. Works on Android and iPhone.
5. Keeps tenant isolation, RBAC and financial integrity; never loses unsaved ERP work.
6. Lowest ongoing operational burden.

## 2. The options in plain words

| Option | What it is | Where the screens come from |
|---|---|---|
| **A. PWA** | The existing website plus a manifest (name, icons) and a small service worker, installed from the browser to the home screen | Our server, same as today |
| **B. Capacitor, bundled** | A native Android / iOS app that contains a copy of the built React files | Inside the app package |
| **C. Capacitor, remote** | A native app whose WebView opens `https://prime7erp.com` (`server.url`) | Our server |
| **D. Trusted Web Activity (TWA)** | A small Android app (APK) that opens our PWA full screen in Chrome | Our server |
| **E1. Plain responsive web** | No change; users bookmark the site or add a shortcut | Our server |
| **E2. Dedicated native client** | A new React Native, Flutter or Swift/Kotlin app | Inside the app package, new code |

## 3. Option by option

### Option A — PWA (recommended)

- **Android:** Chrome offers "Install app" once the site has a valid manifest (name, 192px and 512px icons, `start_url`,
  `display: standalone`) and HTTPS. On phones with Google services Chrome creates a WebAPK, so the app has a normal icon and
  opens without the browser bar. Other browsers may create a shortcut instead.
- **iPhone / iPad:** Safari → Share → **Add to Home Screen** (keep "Open as Web App" on). There is no automatic install
  prompt. The home-screen app has its own storage, separate from Safari.
- **Icon and splash:** from the manifest and `apple-touch-icon`. Android draws the splash from manifest colours and icon;
  iOS uses the icon and theme colour.
- **Updates:** the app code comes from our server. The browser checks the service worker on each launch and navigation;
  our code also calls `registration.update()` on launch, focus and network return. The new version downloads in the
  background; it is **activated** when the user agrees and no form is dirty (details in `AUTOMATIC-UPDATE-STRATEGY.md`).
  Icon and name changes (manifest metadata) refresh more slowly: Chrome checks at most about once per 24 hours.
- **Login persistence:** the same `localStorage` session as today; survives closing the app, ends at the 60-minute token
  expiry.
- **Push notifications:** possible later. Android: standard Web Push. iOS/iPadOS 16.4+: only for home-screen web apps,
  after a user tap, and every push must show a visible notification. Not part of the first phase.
- **Offline:** we plan only an offline "you are offline" screen. ERP data stays online. The existing scan-station queue
  stays as it is (see audit section 8).
- **Camera and files:** the same as the website today (file input with camera, share-sheet saves). The in-page webcam
  needs the `Permissions-Policy` decision from the audit.
- **Restrictions:** iOS can remove storage of web apps that are not used for a long time; Safari has no install prompt;
  background sync and periodic sync do not exist on iOS.
- **Why it fits:** automatic updates through the existing deploy; no store; zero change to the API, CORS or tenancy; one
  code base; works on both platforms.

### Option B — Capacitor with bundled React

- **Code reuse:** high. The same React build is copied into Android and iOS projects with `npx cap sync`.
- **Required changes:** the app runs on `capacitor://localhost` (iOS) or `https://localhost` (Android), so the relative
  `/api` base no longer works. It needs an absolute API URL, the app origins in `CORS_ORIGINS`, CSP `connect-src` changes,
  and a native secure-storage plugin for tokens. Portal refresh cookies (`SameSite=Strict`) do not work cross-origin.
- **Android distribution:** signed APK from our website (sideload) or a managed store. Each frontend change needs a new APK
  that users install by hand unless an MDM pushes it.
- **iOS distribution:** needs an Apple Developer account and Custom Apps through Apple Business, or Enterprise, or Ad Hoc.
  Custom App acquisition ("Get Apps") is currently not listed for Bangladesh. See `ANDROID-IOS-PRIVATE-DISTRIBUTION.md`.
- **Native build needs:** Android Studio and a release keystore; a Mac with Xcode for every iOS build; signing
  certificates and profiles renewed yearly.
- **Updates:** by default, **every frontend change is a new native release**. Third-party "live update" (OTA) services can
  push new web bundles, but they cost money, add a second release channel, need signed bundles, and on iOS must stay inside
  Apple guideline 2.5.2 (no new features by downloaded code). They also bring back version-skew problems.
- **Security:** better token storage is possible (Keychain / Keystore), but the native bridge raises the impact of any XSS.
- **Verdict:** fails the top priority (automatic updates) unless an OTA service is added; doubles release work.

### Option C — Capacitor loading the production website (`server.url`)

- **Is it supported?** Technically yes. Capacitor's own configuration reference says `server.url` is meant for live-reload
  development servers and is **not intended for production**.
- **Do web deploys appear automatically?** The web content yes; the native shell, plugins and permissions no.
- **Android:** works; the WebView keeps its own cookies and storage; cleartext and mixed content must stay off.
- **iOS:** WKWebView; App Transport Security requires HTTPS (we have it). App Review guideline 4.2 rejects apps that are
  mostly a repackaged website, and 2.5.2 forbids downloaded code changing app features. A Custom App still goes through the
  same review. This is a real rejection risk.
- **Cookies / auth:** the WebView is a separate browser profile; same-origin cookies work; nothing is shared with Safari.
- **Security:** remote pages run inside a WebView that may expose native plugins. If the website were ever compromised, the
  attacker could reach those plugins. Strict navigation allow-lists and minimal plugins are mandatory.
- **Version risk:** native shell version and web version drift apart; old shells must keep working with new web code.
- **Benefit over a PWA:** only native plugins (for example a better barcode scanner) and an MDM-installable package. For
  our needs this is not worth the review risk and the second release channel.
- **Verdict:** possible, not recommended.

### Option D — Android Trusted Web Activity (optional add-on)

- **Relationship to a PWA:** a TWA is a thin Android app that opens **our PWA** in Chrome without the address bar. It needs
  the PWA first.
- **Digital Asset Links:** we publish `https://prime7erp.com/.well-known/assetlinks.json` with the package name and the
  SHA-256 of the signing certificate (served as `application/json`, no redirects). If the check fails, the app still opens
  but as a Custom Tab with a visible browser bar.
- **Private APK:** allowed. Google documents distributing an APK from your own website or email; users allow "Install
  unknown apps" for their browser once.
- **Updates:** web changes appear automatically (it is the website). The APK itself changes rarely (icon, package
  settings); those changes need a new APK installed by the user or an MDM.
- **Android developer verification:** from 2026-09-30 Google requires registered developers for installs on certified
  devices in Brazil, Indonesia, Singapore and Thailand, with a global rollout planned for 2027. Unregistered apps remain
  installable through ADB or an "advanced flow". Apps installed from an organisation's managed store on managed devices
  are exempt. We should plan to register before 2027.
- **Limitations:** Android only; depends on Chrome (or another TWA-capable browser) being installed; cookies and storage
  belong to the browser, not the app.
- **Why it does not solve iOS:** TWA is an Android protocol (Android Custom Tabs, intents, APK). iOS has no equivalent;
  iPhone users still need the PWA (or a native wrapper).
- **Verdict:** useful later if Android users want an APK icon or IT wants an MDM-installable package. Not required.

### Option E1 — Plain responsive web (no change)

- Always current, zero cost, works today. But: no install prompt, Android shortcuts open in a browser tab, no controlled
  update (an open app can be left on old code, and the existing stale-chunk reload can drop typed data), no offline
  screen. It is effectively **step zero of Option A**, not a separate path.

### Option E2 — Dedicated React Native, Flutter or native client

- Rebuilding roughly 480 screens is months of work, creates a second code base and a second release process, and every
  ERP change would need to be built twice. Store or MDM distribution problems are the same as Option B.
- Only justified if a future need cannot run in a browser at all (for example heavy offline shop-floor capture with
  hardware scanners). Not justified now.

## 4. Weighted decision model

Scale: 1 = poor, 5 = excellent. For "initial effort" a higher score means **less** effort. Weighted total =
sum(score × weight) / 5, so the best possible total is 100.

| Criterion | Weight | A PWA | B Cap. bundled | C Cap. remote | D TWA (Android) | E1 Plain web | E2 Native client |
|---|---|---|---|---|---|---|---|
| Automatic **and safe** frontend updates | 25 | 4 | 1 | 4 | 4 | 3 | 1 |
| Private install on Android **and** iOS, app-like | 20 | 4 | 2 | 2 | 2 | 2 | 2 |
| Code reuse / one code base | 10 | 5 | 4 | 5 | 5 | 5 | 1 |
| Ongoing maintenance (high = low burden) | 15 | 4 | 2 | 2 | 3 | 5 | 1 |
| Security posture | 15 | 4 | 3 | 2 | 4 | 4 | 3 |
| Native device features | 5 | 2 | 5 | 4 | 2 | 1 | 5 |
| Initial effort (high = less work) | 10 | 4 | 2 | 3 | 3 | 5 | 1 |
| **Weighted total (of 100)** | 100 | **80** | 45 | 60 | 67 | 71 | 34 |

Scoring notes:

- A gets 4, not 5, for updates because activation waits for the user and a clean form, and iOS gives no timing guarantee.
- D scores 2 for install because it covers Android only; on iOS it scores nothing and must be paired with A.
- E1 gets 3 for updates: always current, but with no control over when old code is replaced and no unsaved-data safety.
- Security: A, D and E1 keep the browser security model and the same-origin API; B and C add a native bridge; C also loads
  remote code into it.

### Sensitivity check

| Scenario | Weights changed | A | B | C | D | E2 | Winner |
|---|---|---|---|---|---|---|---|
| Base | as above | 80 | 45 | 60 | 67 | 34 | A |
| Native features matter much more | updates 10, native 20 | 74 | 57 | 60 | 61 | 46 | A |
| Updates matter even more | updates 40, install 15, native 0, effort 5 | 82 | 39 | 63 | 72 | 29 | A |
| Apple Custom Apps become available in Bangladesh | B, C and E2 install score 4 | 80 | 53 | 68 | 67 | 42 | A |

Option A stays first in every scenario. The ranking would change only if a hard native requirement appeared that a browser
cannot meet; then bundled Capacitor (B) becomes the next candidate, not C.

## 5. Cost and maintenance comparison

Effort assumes one developer who knows this code base. Estimates are planning numbers, not quotes.

| | A PWA | B Cap. bundled | C Cap. remote | D TWA | E1 Plain web | E2 Native client |
|---|---|---|---|---|---|---|
| Initial development | Small: manifest, icons, service worker, update prompt, unsaved guard, install page | Large: two native projects, CORS/CSP/API base, secure storage, signing | Medium: native shells, navigation allow-list, review prep | Small on top of A: Bubblewrap project, signing, `assetlinks.json` | None | Very large: rebuild every screen |
| Android | Yes (Chrome WebAPK; others as shortcut) | Yes | Yes | Yes (needs Chrome or TWA browser) | Yes (browser) | Yes |
| iOS | Yes (Safari Add to Home Screen) | Only via Apple channels | Only via Apple channels, review risk | No | Yes (browser) | Only via Apple channels |
| Private installation | Easy, no account | Android easy; iOS hard (see distribution doc) | Same as B | Easy (sideload APK) | Easy | Same as B |
| Automatic frontend updates | Yes, user-approved activation | No (new binary) unless paid OTA | Web yes, shell no | Yes | Yes, uncontrolled | No |
| Native capabilities | Web APIs only | Full plugins | Full plugins | Web APIs only | Web APIs only | Full |
| Extra hosting | None (same Nginx; small static files) | APK download page; iOS via Apple | Same as B | APK file + `assetlinks.json` | None | Same as B |
| Developer account cost | None | Apple Developer Program USD 99/year (or Enterprise USD 299/year if eligible); Android none for sideload | Same as B | None for sideload; Android developer verification registration expected before the 2027 global rollout | None | Same as B |
| Ongoing maintenance | Very low: part of normal web deploys | High: two native releases per change, yearly certificates, OS upgrades | High: shell upgrades, review | Low: APK rarely changes; keep signing key safe | Lowest | Highest |
| Main security risks | Token in `localStorage`, cache boundaries (fixable) | Bridge + XSS, token storage, signing keys | Remote code in native bridge | Same as A + signing key | Same as A | New attack surface, duplicated auth logic |
| Estimated time | 2–3 weeks incl. two-device proof of concept; security prerequisites 1–2 weeks more | 6–10 weeks, then per release | 4–6 weeks + review | 2–4 days after A | 0 | 6–12+ months |

## 6. Why the alternatives are less suitable

- **B (bundled Capacitor):** fails the automatic-update priority; iOS private distribution is the hard part and is
  currently restricted for Bangladesh; doubles release work.
- **C (remote Capacitor):** officially not for production; App Review risk; remote code next to native plugins; still a
  native shell to distribute and update.
- **D (TWA):** good but Android-only, and it is built **on top of** the PWA, so A is needed anyway.
- **E1 (plain web):** already in place; lacks install experience and safe updates; A is a small step beyond it.
- **E2 (native client):** months of work and a second code base for no current requirement.

## 7. Official sources (accessed 2026-11-08 to 2026-11-10)

- web.dev (Google), "What does it take to be installable?" — https://web.dev/articles/install-criteria
- web.dev (Google), "The service worker lifecycle" — https://web.dev/articles/service-worker-lifecycle
- web.dev (Google), "How Chrome handles updates to the web app manifest" — https://web.dev/articles/manifest-updates
- Android Developers (Google), "Overview of Trusted Web Activities" (updated 2026-02-26) —
  https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- Android Developers, "Trusted Web Activities Quick Start Guide" —
  https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- Android Developers, "Alternative distribution options" —
  https://developer.android.com/distribute/marketing-tools/alternative-distribution
- Android Developers, "Android developer verification" — https://developer.android.com/developer-verification
- Apple Support, "Turn a website into an app in Safari on iPhone" —
  https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- WebKit (Apple), "Web Push for Web Apps on iOS and iPadOS" — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Apple Developer, "App Review Guidelines" (2.5.2, 4.2) — https://developer.apple.com/app-store/review/guidelines/
- Apple Developer, "Apple Developer Program" — https://developer.apple.com/programs/
- Apple Developer, "Apple Developer Enterprise Program" — https://developer.apple.com/programs/enterprise/
- Apple Support, "Apple Business feature availability" (published 2026-04-14) —
  https://support.apple.com/guide/business/feature-availability-axmef1c47twq/web
- Capacitor (Ionic), "Capacitor Configuration" (`server.url`) — https://capacitorjs.com/docs/config
- Capacitor (Ionic), "Security" — https://capacitorjs.com/docs/guides/security
