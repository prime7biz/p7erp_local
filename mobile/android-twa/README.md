# Prime7 ERP Android app (Trusted Web Activity)

A small Android app that opens the live Prime7 web app full screen in Chrome. Website releases reach it
automatically; a new app file is needed only when the app's own settings change (name, icon, package).

Decisions (2026-11-11): Android only; Google Play **Internal testing** first with **Play App Signing**; the website
download is the **Google-signed universal APK** from Play Console. Background:
`docs/mobile-feasibility/RECOMMENDED-IMPLEMENTATION-PLAN.md` and `ANDROID-IOS-PRIVATE-DISTRIBUTION.md`.

## What is in this folder

| File | Purpose |
|---|---|
| `twa-manifest.json` | App settings for Google's Bubblewrap tool (package `com.prime7erp.app`, start page `/app`, colours, icons) |
| `assetlinks.template.json` | Template for `https://prime7erp.com/.well-known/assetlinks.json` |
| `.gitignore` | Keeps signing keys and the generated Android project out of Git (the repository is public) |

## Keys: two of them, only one is yours

| Key | Who keeps it | Used for |
|---|---|---|
| **Upload key** (`prime7-upload.keystore`, alias `prime7`) | You: outside the repository, two backups, password in a password manager | Signing the `.aab` you upload to Play. If lost, Play Console support can reset it |
| **App signing key** | Google (Play App Signing) | Signs what users install: Play installs **and** the universal APK you download from Play Console |

## 1. Build the app bundle

Needs the live site to have the mobile app switched on (`https://prime7erp.com/manifest.webmanifest` must open).

```powershell
cd mobile\android-twa
npx @bubblewrap/cli update --skipVersionUpgrade   # (re)creates the Android project from twa-manifest.json
npx @bubblewrap/cli build                          # asks for the upload key password
```

Results: `app-release-bundle.aab` (for Play) and `app-release-signed.apk` (for a quick test on your own phone only).

## 2. Google Play Console (owner)

1. Create the app **Prime7 ERP**, default language English, app, free.
2. **Setup → App integrity:** keep **Play App Signing** (Google-generated key).
3. **Testing → Internal testing:** create a release, upload `app-release-bundle.aab`, add testers (email list), roll out.
4. Store listing, Data safety, App access (demo company login), content rating, privacy policy
   `https://prime7erp.com/legal/privacy`, account deletion `https://prime7erp.com/account-deletion`.

## 3. Link app and website (Digital Asset Links)

1. **Setup → App integrity → App signing:** copy the **SHA-256** of both the **app signing key** and the **upload key**.
2. Put both into `frontend/public/.well-known/assetlinks.json` (copy of `assetlinks.template.json`, two entries in
   `sha256_cert_fingerprints`), release and deploy.
3. Check `https://prime7erp.com/.well-known/assetlinks.json` answers 200 JSON directly. If the link is wrong, the app
   still opens but with an address bar at the top.

## 4. Website download (APK)

1. **Release → App bundle explorer →** the version → **Downloads → Signed, universal APK**.
2. Save it as `frontend/public/downloads/prime7erp-android.apk`, release and deploy.
3. GitHub → repository variables: `VITE_ANDROID_APK_URL=/downloads/prime7erp-android.apk`
   (and later `VITE_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.prime7erp.app`). Release again;
   the sign-in page then shows **Download Android app**.

## Updating the app file later

Raise `appVersionCode` (and `appVersionName`) in `twa-manifest.json`, build, upload to Play, download the new universal
APK and replace the file. Website changes alone never need a new app file.

Android developer verification (Google, 2026–2027): your Play Console account covers it; keep the package
`com.prime7erp.app` registered there.
