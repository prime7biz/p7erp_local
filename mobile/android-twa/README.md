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
./mobile/android-twa/build-android.ps1
```

Results in `C:\p7-android\release\<version>\`: `prime7erp-<version>.aab` (upload this to Play) and
`...-upload-signed-TEST-ONLY.apk` (only for a quick test on your own phone; it is signed with the upload key, so it
cannot be updated by the Play / website version).

One-time tool setup on this PC (done 2026-11-11): Java 17 (Eclipse Temurin) in `%USERPROFILE%\.bubblewrap\jdk`, Android
command-line tools + `build-tools;36.1.0` + `platforms;android-36` in `%USERPROFILE%\.bubblewrap\android_sdk`, Bubblewrap
CLI 1.27 in `%USERPROFILE%\.bubblewrap\cli`, folder links `C:\p7-android\jdk`, `C:\p7-android\sdk` and
`android_sdk\tools` (Bubblewrap needs space-free paths and the old `tools` folder name). The script builds in
`C:\p7-android\build` because antivirus folder protection on Documents removed generated Gradle files.

Upload key: `Documents\Prime7-Keys\prime7-upload.keystore`, alias `prime7`, password in `PRIME7-UPLOAD-KEY.txt` (move it to
a password manager). SHA-256: `C7:EA:14:64:09:A7:20:E7:11:10:C0:90:F9:32:63:B5:5E:DB:81:E9:33:CD:5E:CE:F8:10:10:6F:DA:78:6C:99`.

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

Raise `appVersionCode` (and `appVersion`, the version name) in `twa-manifest.json`, build, upload to Play, download the new universal
APK and replace the file. Website changes alone never need a new app file.

Android developer verification (Google, 2026–2027): your Play Console account covers it; keep the package
`com.prime7erp.app` registered there.
