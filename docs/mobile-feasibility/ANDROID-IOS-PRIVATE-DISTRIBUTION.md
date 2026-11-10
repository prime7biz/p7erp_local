# Android and iOS private distribution

**Status:** research only (2026-11-10). Every platform rule below comes from official Google, Apple or Capacitor
documentation, accessed 2026-11-08 to 2026-11-10 (sources at the end). Platform policies change; re-check the sources
before each rollout decision.

**Constraint from the brief:** no public Google Play or App Store listing. Users are private employees, managers,
administrators and authorised customers.

---

## 1. Summary table

Legend: **Possible** = technically works. **Permitted** = allowed by Google/Apple rules for our use. **Practical** = fits a
private ERP with mixed staff and customer devices.

| Method | Possible | Permitted | Practical for Prime7 | Paid account | Renewal / manual steps |
|---|---|---|---|---|---|
| Android PWA install (Chrome) | Yes | Yes | **Yes** | No | None; one tap to install |
| Android signed APK from our website | Yes | Yes | Yes, for staff | No (see verification note) | User allows "Install unknown apps"; each APK update installed by the user unless an MDM pushes it |
| Android TWA APK (website or MDM) | Yes | Yes | Optional | No (see verification note) | Same as APK; web content updates itself |
| Android managed store / MDM | Yes | Yes | Only if the company runs an EMM | EMM licence | IT assigns the app |
| iPhone Safari Add to Home Screen | Yes | Yes | **Yes** | No | User adds once by hand |
| Apple Business Custom Apps | Yes | Yes | **Not today in Bangladesh** | Apple Developer Program USD 99/year | Apple reviews every version; needs "Get Apps" in Apple Business |
| Apple Developer Enterprise Program | Yes | Only if all eligibility rules are met | Unlikely | USD 299/year | Annual re-verification, certificate and profile renewal |
| Ad Hoc distribution | Yes | For development and testing | **No** for production | USD 99/year | 100 iPhones + 100 iPads per membership year, device registration, yearly re-signing |
| TestFlight | Yes | For beta testing | No for production | USD 99/year | Builds expire after 90 days |

**Practical conclusion:** the PWA is the only route that works on both platforms, needs no paid account, needs no
renewal, and updates itself. Android APK/TWA is a permitted optional extra. Every native iOS route is either unavailable in
Bangladesh today, restricted to large organisations, or meant for testing.

## 2. Android

### 2.1 PWA installation (recommended)

- **Requirements (Chrome):** HTTPS; a web app manifest with `name` or `short_name`, 192px and 512px icons, `start_url`,
  and `display` set to `standalone`, `fullscreen` or `minimal-ui`; the user has interacted with the site.
- **How it installs:** Chrome shows **Install app** (menu or our own button using `beforeinstallprompt`). On phones with
  Google Mobile Services, Chrome creates a **WebAPK**: a real launcher icon, appears in the app list, opens without the
  address bar. Other browsers (Samsung Internet, Edge, Firefox) install it as a home-screen shortcut or their own WebAPK.
- **Updates:** app code comes from our server on every launch (see `AUTOMATIC-UPDATE-STRATEGY.md`). Name, icon and colour
  changes are picked up when Chrome re-checks the manifest, at most about once every 24 hours after a launch.
- **Cost / renewal:** none.

### 2.2 Private APK download (sideloading)

- **Permitted:** Google's "Alternative distribution options" and "Publish your app" pages explicitly allow hosting a
  release APK on your own website or private server, or sending it by email.
- **Install:** on Android 8+ the user grants "Install unknown apps" to the browser or file manager once. Some mobile
  networks or company policies block this.
- **Update rules:** a new APK replaces the installed one only if the **package name** is the same, it is signed with the
  **same key** (or a valid rotated key), and the **version code** is higher or equal. Otherwise the user must uninstall
  first, which deletes the app's local data. **The release keystore must be backed up and protected for the life of the
  app.** Android keys do not expire yearly like Apple certificates.
- **No automatic updates:** a website-hosted APK has no Play-style updater. Users install each new APK by hand unless an
  MDM pushes it. This is why a bundled native app (Capacitor Option B) fails the automatic-update priority.

### 2.3 Trusted Web Activity (TWA)

- **What it is:** a thin Android app (made with Google's Bubblewrap tool) that opens our PWA in Chrome full screen.
- **Digital Asset Links:** we publish `https://prime7erp.com/.well-known/assetlinks.json` listing the package name and the
  SHA-256 fingerprint of the signing certificate. It must be served over HTTPS, as `application/json`, **without
  redirects**. Today our inner Nginx would serve that path from the static folder; the host Nginx must not redirect it.
- **If verification fails:** the app still opens but as a **Custom Tab with a visible address bar**. This is the most common
  TWA problem (usually a wrong fingerprint).
- **Private distribution:** the TWA APK follows the same sideload rules as 2.2. It does not need a Play listing.
- **Updates:** website changes appear without a new APK. Only shell changes (icon, package, splash) need a new APK.
- **Limitations:** Android only; needs Chrome or another TWA-capable browser; storage and cookies belong to the browser.

### 2.4 Managed devices (EMM / MDM)

- If Prime7 customers manage company phones with an EMM, a private app can be assigned through the organisation's
  managed store, including silent updates. This is optional and depends on each customer's IT.

### 2.5 Android developer verification (changing in 2026–2027)

- From **2026-09-30**, apps must be registered by verified developers to be installed and updated on certified Android
  devices in **Brazil, Indonesia, Singapore and Thailand** when installed from participating stores. Google plans a
  **global rollout in 2027**.
- Unregistered apps can still be installed with **ADB** or a one-time **advanced flow** (launched August 2026) that adds
  safety steps. Apps from an organisation's managed store on **managed devices are exempt**.
- A "limited distribution" account allows sharing with up to 20 devices without ID verification (for students and
  hobbyists, not for us).
- **Impact for Prime7:** a PWA is not affected (no APK). If we ever ship an APK or TWA, register the developer identity
  and app before the 2027 global rollout so staff do not face the advanced flow.

## 3. iPhone and iPad

### 3.1 Safari Add to Home Screen (recommended)

- **Steps (current Apple guide):** open the site in Safari → tap **Share** → **Add to Home Screen** → keep **Open as Web
  App** on → **Add**. With our manifest `display: standalone`, it opens without Safari's bars.
- **No install prompt:** iOS never offers installation by itself. Our install page must show these steps (see the install
  entry points in `RECOMMENDED-IMPLEMENTATION-PLAN.md`).
- **Storage:** the home-screen app has its own cookies and storage, separate from Safari. A user signed in in Safari must
  sign in again in the home-screen app. iOS may delete storage of web apps that are not used for a long time.
- **Updates:** app code comes from our server; no App Review. Apple publishes no fixed timing for when a home-screen web
  app re-checks, so we measure it in the proof of concept instead of promising a number.
- **Web Push:** iOS/iPadOS 16.4+ only, only for home-screen web apps, permission only after a user tap, and every push must
  show a visible notification (silent push is not allowed). No Apple Developer account needed.
- **Other browsers on iOS:** Chrome, Edge and Firefox on iOS use WebKit; recent iOS versions also allow Add to Home Screen
  from them, but Safari is the reference path for our instructions.
- **Cost / renewal:** none.

### 3.2 Apple Business Custom Apps

- **What it is:** a private App Store app visible only to organisations we name, distributed through Apple Business
  (Apps and Books) to managed devices or with redemption codes.
- **Requirements:** Apple Developer Program (USD 99/year); App Store Connect submission with "Private" distribution;
  **Apple reviews the first version and every update** under the same App Review Guidelines (typically 1–2 days); demo
  login and sample data for reviewers.
- **Policy risk for a wrapped website:** guideline 4.2 expects more than a repackaged website; guideline 2.5.2 forbids
  downloaded code that adds or changes features. A Capacitor app loading our site (Option C) is at risk.
- **Bangladesh limitation (material):** Apple's "Apple Business feature availability" page (published 2026-04-14) lists
  Bangladesh with Brand and Location Management, Branded Mail, built-in device management, Managed Apple Accounts and
  zero-touch deployment, but **not "Get Apps"**. Without Get Apps, a Bangladeshi organisation cannot acquire Custom Apps
  through Apple Business. Enrolling in the Apple Developer Program is a separate thing and is possible; the blocker is the
  customer organisation's Apple Business region. **Account-level confirmation with Apple is required** before planning on
  this route. Customers registered in a region with Get Apps (for example India or Singapore) could use it.

### 3.3 Apple Developer Enterprise Program

- **Eligibility (all required):** legal entity (no DBAs or branches); **100 or more employees**; proprietary apps for
  **internal use by employees only**; systems ensuring only employees can download; pass Apple's verification interview
  and continuous evaluation; D-U-N-S number. Apple accepts it only for cases **not adequately addressed** by the App Store,
  Custom Apps, Ad Hoc or TestFlight.
- **Fee:** USD 299 per membership year.
- **Fit for Prime7:** poor. Prime7 is a SaaS vendor; an Enterprise app may not be given to **customers' employees or
  external portal users**. Distributing it to tenants would breach the programme terms.
- **Renewal:** yearly re-verification; distribution certificates and provisioning profiles must be renewed and apps
  re-signed; if membership lapses, new installs stop.

### 3.4 Ad Hoc distribution

- **Purpose:** development and testing.
- **Limits:** up to **100 devices per product family per membership year** (100 iPhones and, separately, 100 iPads);
  disabling a device does not free its slot until the next membership year; each device's identifier must be registered.
- **Renewal:** provisioning profiles expire yearly; apps must be re-signed and reinstalled.
- **Fit for Prime7:** useful only to test a native build on a few devices. Not a production channel.

## 4. Capacitor (if a native wrapper is ever needed)

- Capacitor's production model is **bundled web assets** (`webDir` copied into the native projects by `npx cap sync`).
- `server.url` loads a remote site; the configuration reference says it is intended for live-reload servers and **not for
  production**. Capacitor's security guide requires HTTPS-only endpoints and says cleartext / mixed content are development
  options.
- Either Capacitor option still needs the Android and iOS distribution routes above; it does not remove any of them.

## 5. What Prime7 should do

1. **Android:** install the PWA from Chrome (our install page triggers the prompt). Optional later: a TWA APK hosted on our
   site for users or IT who want an APK; register as a verified Android developer before the 2027 rollout if we do.
2. **iPhone / iPad:** Safari → Share → Add to Home Screen, guided by our install page.
3. **Do not** use Enterprise (ineligible for tenant users) or Ad Hoc (testing only) for production.
4. **Re-check** Apple Business "Get Apps" availability for Bangladesh once a year; if it becomes available and a hard native
   need appears, Custom Apps with a **bundled** Capacitor build becomes the path, accepting Apple review per release.

## 6. Official sources (accessed 2026-11-08 to 2026-11-10)

Google / Android:

- web.dev, "What does it take to be installable?" — https://web.dev/articles/install-criteria
- web.dev, "Installation" — https://web.dev/learn/pwa/installation
- web.dev, "How Chrome handles updates to the web app manifest" — https://web.dev/articles/manifest-updates
- Android Developers, "Alternative distribution options" — https://developer.android.com/distribute/marketing-tools/alternative-distribution
- Android Developers, "Publish your app" — https://developer.android.com/studio/publish
- Android Developers, "Overview of Trusted Web Activities" (updated 2026-02-26) —
  https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- Android Developers, "Trusted Web Activities Quick Start Guide" —
  https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- Android Developers, "Configure website associations and dynamic rules" —
  https://developer.android.com/training/app-links/configure-assetlinks
- Android Developers, "Android developer verification" — https://developer.android.com/developer-verification
- Android Developers, "Android developer verification — guides" and FAQ (FAQ entries updated 2025-09 to 2026-09-30) —
  https://developer.android.com/developer-verification/guides and https://developer.android.com/developer-verification/guides/faq

Apple:

- Apple Support, "Turn a website into an app in Safari on iPhone" —
  https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- WebKit, "Web Push for Web Apps on iOS and iPadOS" — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Apple Developer, "Sending web push notifications in web apps and browsers" —
  https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- Apple Support, "Learn about Custom Apps in Apple Business" (published 2026-04-14) —
  https://support.apple.com/en-gb/guide/business/axm58ba3112a/web
- Apple Developer, "Distributing Apps on Apple Business Manager and Apple School Manager" —
  https://developer.apple.com/support/volume-purchase-and-custom-apps
- Apple Support, "Apple Business feature availability" (published 2026-04-14) —
  https://support.apple.com/guide/business/feature-availability-axmef1c47twq/web
- Apple Developer, "Apple Developer Program" — https://developer.apple.com/programs/
- Apple Developer, "Apple Developer Enterprise Program" — https://developer.apple.com/programs/enterprise/
- Apple Support, "Distribute proprietary in-house apps to Apple devices" (published 2026-11-03) —
  https://support.apple.com/guide/deployment/distribute-proprietary-in-house-apps-depce7cefc4d/web
- Apple Developer, "Devices overview" (Ad Hoc device limits) — https://developer.apple.com/help/account/devices/devices-overview/
- Apple Developer, "App Review Guidelines" — https://developer.apple.com/app-store/review/guidelines/

Capacitor (Ionic):

- "Capacitor Configuration" — https://capacitorjs.com/docs/config
- "Development Workflow" — https://capacitorjs.com/docs/basics/workflow
- "Security" — https://capacitorjs.com/docs/guides/security
