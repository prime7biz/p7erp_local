# Google Play Console — step by step (owner)

For the app `com.prime7erp.app` (Prime7 ERP). Start on **Internal testing** (private; only the testers you add can
install). The file to upload is `C:\p7-android\release\1.0.0-1\prime7erp-1.0.0-1.aab`, made by
`mobile/android-twa/build-android.ps1` (see `README.md`).

## 1. Create the app

Play Console → **Create app**

| Field | Value |
|---|---|
| App name | Prime7 ERP |
| Default language | English (United States) or English (United Kingdom) |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick the developer programme policies and US export laws boxes |

## 2. Keep Play App Signing

**Test and release → Setup → App signing:** keep **"Use Google-generated key"** (default). Your file
`prime7-upload.keystore` is only the **upload key**.

## 3. Internal testing release

1. **Test and release → Testing → Internal testing → Create new release.**
2. Upload `prime7erp-1.0.0-1.aab`.
3. Release name: `1.0.0 (1)`. Release notes: `First internal test of the Prime7 ERP Android app.`
4. **Testers** tab → create an email list (your staff testers' Google accounts) → save → copy the **opt-in link** and
   send it to them.
5. **Save → Review release → Start rollout to Internal testing.**

## 4. App content (left menu: Policy → App content)

| Item | Answer |
|---|---|
| Privacy policy | `https://prime7erp.com/legal/privacy` |
| App access | **All or some functionality is restricted** → add instructions (below) |
| Ads | No, my app does not contain ads |
| Content rating | Questionnaire → category **Utility, Productivity, Communication, or Other**; answer **No** to violence, sexual content, gambling, drugs etc.; user interaction: users can share content inside their company |
| Target audience | 18 and over |
| News app | No |
| Government app | No |
| Financial features | Choose **none apply** unless Play asks specifically about accounting software; Prime7 does not move money or give loans |
| Data safety | See section 6 (draft, check against your privacy policy) |
| Account deletion | Web link: `https://prime7erp.com/account-deletion` |

### App access instructions for Google's reviewers (paste and fill in)

```
Prime7 ERP is a business ERP for garment manufacturers. Sign-in requires a company account.
1. Open the app. On the sign-in page enter:
   Company Code: <DEMO COMPANY CODE>
   Login as: Staff
   Email: <DEMO USER EMAIL>
   Password: <DEMO PASSWORD>
2. Tap Sign In. The dashboard opens; menus: Merchandising, Inventory, Finance, HR.
The account contains sample data only.
```

Create a **demo company with sample data only** for this. Never give reviewers a real customer's login.

## 5. Store listing (Grow → Store presence → Main store listing)

**Short description (max 80 characters):**

```
ERP for garment factories and buying houses: orders, inventory, finance, HR.
```

**Full description:**

```
Prime7 ERP brings your garment business to your Android phone.

• Merchandising: styles, BOMs, orders and time & action calendars
• Inventory: purchase orders, goods receiving, stock and gate passes
• Production: line plans, hourly output and bundle scanning
• Finance: vouchers, approvals and reports
• HR: employees, attendance, leave and payroll
• Approvals on the go, with the same permissions as on your computer

The app is for companies that use Prime7 ERP. Sign in with your company code, email and password.
Updates arrive automatically. If a form is open, the app waits until you save.

Prime7 ERP — https://prime7erp.com
```

**Graphics:**

| Asset | Size | Source |
|---|---|---|
| App icon | 512 × 512 PNG | `frontend/public/icons/icon-512.png` |
| Feature graphic | 1024 × 500 | Make from the logo on an orange (#EA580C) or white background |
| Phone screenshots | at least 2, e.g. 1080 × 1920 | Screenshots of the installed app (login, dashboard, a list) using demo data |

Category: **Business**. Contact email: `support@prime7erp.com`. Website: `https://prime7erp.com`.

## 6. Data safety (draft — confirm against the privacy policy before submitting)

The Android app shows the Prime7 website, so declare what the website collects.

| Question | Draft answer |
|---|---|
| Does your app collect or share user data? | Yes |
| Is all data encrypted in transit? | Yes (HTTPS only) |
| Can users request deletion? | Yes — `https://prime7erp.com/account-deletion` |
| **Personal info:** name, email address, phone number, user IDs | Collected; not shared; required for app functionality and account management |
| **Financial info:** other financial info (business vouchers, payroll entered by the company) | Collected; not shared; app functionality |
| **Photos and files:** photos, files and documents uploaded by users (employee photos, documents) | Collected; optional; app functionality |
| **App activity:** in-app actions (audit log of changes) | Collected; app functionality, fraud prevention / security |
| **App info and performance:** diagnostics / crash logs | Collected; analytics / app functionality |
| Location, contacts, messages, health, audio | Not collected |
| Data shared with third parties | No sharing; service providers that process data for Prime7 (hosting, email, optional AI features) count as processing, not sharing — check your privacy policy says so |

## 7. After the first release is processed

1. **Test and release → Setup → App signing:** copy both **SHA-256 certificate fingerprints** (App signing key and
   Upload key) and send them to the developer for `/.well-known/assetlinks.json`.
   Upload key (already known): `C7:EA:14:64:09:A7:20:E7:11:10:C0:90:F9:32:63:B5:5E:DB:81:E9:33:CD:5E:CE:F8:10:10:6F:DA:78:6C:99`
2. **Test and release → App bundle explorer** → version 1 → **Downloads** → **Signed, universal APK** → download and
   send it to the developer as the website APK.
3. Testers install via the opt-in link (Play) or the website APK.

## 8. Later

- Closed testing → Production when you are ready for more users (each step is reviewed by Google).
- When the listing is public, set the GitHub variable
  `VITE_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.prime7erp.app` and release.
