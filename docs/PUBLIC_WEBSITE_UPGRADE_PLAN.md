# P7 ERP Public Website Upgrade – Implementation Plan

**Context:** Compare current frontend public site with Replit legacy reference (`replit-legacy/primeX-ERP/client/src/pages/public/` and `components/public/`). Goals: (1) Compare legacy vs current content and structure. (2) Fix content drift: copy, contact info, branding (Prime7 vs P7). (3) SEO: per-page title/description/canonical; ensure Seo/Helmet and config exist and are used on all public routes; improve design flow. (4) Polish: typography, spacing, primary (orange) theme, modern look.

**Deliverable:** Single actionable implementation plan (numbered tasks + file-level checklist). No code—plan only for implementing agents.

---

## Task 1: Comparison – what to compare (page list, content/structure checklist)

**Objective:** Before making changes, systematically compare legacy and current so content fix and SEO tasks are accurate.

### 1.1 Page mapping (legacy → current)

| Legacy route / file | Current route / file | Notes |
|--------------------|----------------------|--------|
| `/` landing.tsx | `/` Landing.tsx | Hero, modules, workflow, AI/security, FAQ, CTAs |
| `/about` about.tsx | `/about` AboutPage.tsx | Values, team bios (CEO, CTO, Head of Product, Head of Customer Success) |
| `/contact` contact.tsx | `/contact` ContactPage.tsx | Form fields, company-size options, contact block |
| `/features` features.tsx | `/features` FeaturesPage.tsx | Module titles and short descriptions |
| `/pricing` pricing.tsx | `/pricing` PricingPage.tsx | Plan names, price copy, CTA text |
| `/garments-erp` garments-erp.tsx | `/garments-erp` GarmentsErpPage.tsx | Sections and copy |
| `/buying-house-erp` buying-house-erp.tsx | `/buying-house-erp` BuyingHouseErpPage.tsx | Sections and copy |
| `/how-it-works` how-it-works.tsx | `/how-it-works` HowItWorksPage.tsx | Steps and copy |
| `/security` security.tsx | `/security` SecurityPage.tsx | Trust/security copy |
| `/erp-software-bangladesh` erp-software-bangladesh.tsx | `/erp-bangladesh` ErpBangladeshPage.tsx | URL differs; align copy |
| `/erp-comparison` erp-comparison.tsx | `/erp-comparison` ErpComparisonPage.tsx | Comparison messaging |
| `/resources` resources.tsx (+ slug) | `/blog` BlogPage.tsx | Legacy = full articles; current = “Coming soon” |
| — (Support → /contact#support) | `/support` SupportPage.tsx | Decide: keep page or match legacy anchor |
| `/privacy` privacy.tsx | `/privacy` PrivacyPage.tsx | Legal copy |
| `/terms` terms.tsx | `/terms` TermsPage.tsx | Legal copy |
| Legacy modules/* (e.g. merchandising, inventory) | — | Current links to /features or #anchors |

### 1.2 Content/structure checklist (per page)

For each row in the table above, compare and tick:

- [ ] **Headings** – Same or equivalent H1/H2/H3 order and wording.
- [ ] **Body copy** – Value props, paragraphs, and bullet lists aligned (no unintended shortening or rewrites).
- [ ] **Contact block** – Where present: email (info@prime7erp.com; support@prime7erp.com for support context), phone (+880 1892-787220), WhatsApp (https://wa.me/8801892787220), Facebook (e.g. legacy URL), address (Gulshan-2, Dhaka 1212, Bangladesh).
- [ ] **Branding** – “Prime7” vs “P7 ERP” used consistently (e.g. “Prime7 ERP” in footer/legal; “P7 ERP” in product UI/titles where already established).
- [ ] **CTAs** – Same primary/secondary actions (e.g. “Start Free Trial”, “Book a Demo”) and link targets.
- [ ] **Footer/nav links** – Same link groups and URLs (Get Started, Login, ERP Bangladesh, Blog/Resources, Support, Modules, Privacy, Terms, Security).

### 1.3 Legacy-only reference (no direct current page)

- **Modules:** `replit-legacy/.../public/modules/` (merchandising, inventory, accounting, production, lc-processing, quality-management, hr-payroll, reports-analytics, crm-support). Current site links these to `/features` or anchors; document whether to add `/modules/:slug` routes later.
- **Resources articles:** Legacy has article list + `/resources/:slug`. Current Blog is placeholder; decide Blog vs Resources URL and content (see Task 2).

---

## Task 2: Content fix – which files need copy/contact/branding changes

**Objective:** Align page copy, contact details, and branding with legacy; standardize Prime7/P7 and contact info (info@prime7erp.com, support@prime7erp.com, phone, address).

### 2.1 Contact details (brand consistency)

- **`frontend/src/pages/public/ContactPage.tsx`**  
  - Use contact email **info@prime7erp.com** (and **support@prime7erp.com** where a support-specific contact is shown). Remove any placeholder (e.g. info@p7erp.com).
- **`frontend/src/components/public/PublicLayout.tsx`** (footer)  
  - Replace placeholder contact block with full block matching legacy: **Email** info@prime7erp.com, **Phone** +880 1892-787220, **WhatsApp** https://wa.me/8801892787220, **Facebook** (e.g. https://www.facebook.com/share/1Cc3vRoqye/), **Address** “Gulshan-2, Dhaka 1212, Bangladesh”. Use icons (Mail, Phone, MessageCircle, MapPin, optional SiFacebook). Match legacy `footer.tsx` layout and styling (e.g. orange accent for icons).

### 2.2 About page

- **Reference:** `replit-legacy/primeX-ERP/client/src/pages/public/about.tsx`  
- **Current:** `frontend/src/pages/public/AboutPage.tsx`  
- **Action:** Align section order, values (Innovation, Reliability, Industry Focus, Customer Success), and team bios. Keep “Prime7” / “P7 ERP” consistent.

### 2.3 Contact page

- **Reference:** `replit-legacy/primeX-ERP/client/src/pages/public/contact.tsx`  
- **Current:** `frontend/src/pages/public/ContactPage.tsx`  
- **Action:** Ensure contact info block and form fields (including company-size options) match legacy. Add validation toasts for required fields if missing.

### 2.4 Blog / Resources

- **Legacy:** `/resources` with article list and `/resources/:slug`.  
- **Current:** `BlogPage.tsx` at `/blog` is “Coming soon”.  
- **Action:** Either (a) add `/resources` and port legacy Resources (list + slug), with `/blog` alias or redirect, or (b) keep `/blog` and port content into BlogPage. Standardize nav/footer link to chosen URL.

### 2.5 Support

- **Legacy:** “Support” → `/contact#support`.  
- **Current:** `SupportPage.tsx` at `/support`.  
- **Action:** Either keep Support page and link footer “Support” to `/support`, or remove SupportPage and link “Support” to `/contact#support`; document decision.

### 2.6 ERP Bangladesh URL and copy

- **Legacy:** `/erp-software-bangladesh`; footer “ERP Bangladesh” → that URL.  
- **Current:** `/erp-bangladesh`, ErpBangladeshPage.tsx.  
- **Action:** Add route alias `/erp-software-bangladesh` → same component for SEO parity, or standardize on one URL and update links. Align page copy with legacy erp-software-bangladesh.tsx.

### 2.7 Other public pages (copy pass)

- **Landing:** `frontend/src/pages/Landing.tsx` vs legacy `landing.tsx` — Hero, subhead, modules, workflow, AI/security, FAQ, CTAs; Prime7/P7 wording.
- **Features:** `frontend/src/pages/public/FeaturesPage.tsx` vs legacy `features.tsx` — Module titles and descriptions.
- **Pricing:** `frontend/src/pages/public/PricingPage.tsx` vs legacy `pricing.tsx` — Plan names, price copy, CTAs.
- **Garments ERP:** `frontend/src/pages/public/GarmentsErpPage.tsx` vs legacy `garments-erp.tsx`.
- **Buying House ERP:** `frontend/src/pages/public/BuyingHouseErpPage.tsx` vs legacy `buying-house-erp.tsx`.
- **How it works:** `frontend/src/pages/public/HowItWorksPage.tsx` vs legacy `how-it-works.tsx`.
- **Security:** `frontend/src/pages/public/SecurityPage.tsx` vs legacy `security.tsx`.
- **ERP Comparison:** `frontend/src/pages/public/ErpComparisonPage.tsx` vs legacy `erp-comparison.tsx`.
- **Privacy:** `frontend/src/pages/public/PrivacyPage.tsx` vs legacy `privacy.tsx`.
- **Terms:** `frontend/src/pages/public/TermsPage.tsx` vs legacy `terms.tsx`.

### 2.8 Footer link consistency

- **`frontend/src/components/public/PublicLayout.tsx`**  
  - Get Started / Start Free Trial → `/signup` (or legacy `/app/register` per router).  
  - Login → `/login` (or `/app/login` per router).  
  - ERP Bangladesh → chosen canonical URL (`/erp-bangladesh` or `/erp-software-bangladesh`).  
  - Blog & Articles → `/blog` or `/resources` per 2.4.  
  - Support → `/support` or `/contact#support` per 2.5.  
  - Modules → `/modules/...` if routes exist, else `/features` or `#anchors`; document decision.

---

## Task 3: SEO & design flow – meta/titles, structure, flow

**Objective:** Per-page title, description, canonical; Open Graph/Twitter where useful; ensure existing Seo/Helmet and config are used on all public routes; improve structure/flow.

### 3.1 Existing SEO setup

- **Current:** `frontend/src/components/Seo.tsx` (Helmet) and `frontend/src/config/seo.ts` (SEO_BY_PATH) are used in App.tsx. All public routes already have entries in SEO_BY_PATH.
- **Action:** Keep using this pipeline; extend for canonical and OG/Twitter (see 3.2). Ensure no public route is missing from `config/seo.ts` and that Seo runs for all public layouts.

### 3.2 Extend SEO (canonical, OG, optional JSON-LD)

- **`frontend/src/config/seo.ts`**  
  - Add optional `canonical?: string` (or derive from path). Add helper e.g. `buildCanonical(path: string): string` (e.g. `https://prime7erp.com` + path, no trailing slash except `/`).
- **`frontend/src/components/Seo.tsx`**  
  - For each route: set canonical `<link rel="canonical">`; add meta for og:title, og:description, og:type, og:image, og:site_name; twitter:card, twitter:title, twitter:description. Optional: keywords, noIndex, breadcrumbs (BreadcrumbList JSON-LD).
- **Landing:** Optional JSON-LD already present (Organization, SoftwareApplication); add LocalBusiness if desired (reference legacy landing).
- **Other pages:** Add JSON-LD only where it adds value (e.g. FAQ on landing, BreadcrumbList on inner pages).

### 3.3 index.html base

- **`frontend/index.html`**  
  - Default `<title>` e.g. “Prime7 ERP | AI-Powered Garment & Buying House ERP”. Default `<meta name="description" content="...">`. Keep lang, viewport, charset.

### 3.4 Design flow (structure)

- **Navbar:** Active state per route (e.g. `location.pathname === link.to` → `text-primary bg-primary/5`). Nav links aligned with legacy: Features, Garments ERP, Buying House, Pricing, Resources/Blog, Contact; CTAs: Book a Demo, Login, Start Free Trial. Optional: currency selector (BDT, USD, etc.) if pricing multi-currency.
- **Footer:** First column = logo, tagline, then contact block (email, phone, WhatsApp, Facebook, address). Link columns: Product, Modules, Resources, Get Started; bottom bar: copyright, Privacy | Terms | Security. Match legacy `footer.tsx` structure.
- **PublicLayout:** Consider extracting footer to `PublicFooter.tsx` for maintainability; ensure single source for contact block and link groups.

---

## Task 4: Polish – typography, spacing, primary theme, CTAs

**Objective:** Consistent typography, spacing, primary (orange) theme, and clear CTAs across landing and all public pages.

### 4.1 Theme and primary color

- **`frontend/tailwind.config.js`**  
  - Confirm `primary` is brand orange (e.g. orange-500/orange-600). Use `primary` for buttons, links, and accents; avoid ad-hoc blue/indigo for key CTAs.

### 4.2 Typography and spacing

- **Global:** Consistent heading scale (h1: 4xl–6xl, h2: 3xl–4xl, h3: 2xl); body base/lg, gray-600 for secondary.
- **Sections:** Standard vertical rhythm (e.g. py-16 lg:py-24); container `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`.
- **Landing:** `Landing.tsx` and `frontend/src/components/public/landing/LandingEnhancements.tsx` — Hero, module grid, process flow, trust/AI/security: consistent padding and heading sizes; primary on CTAs and highlights.

### 4.3 CTAs

- Primary: `bg-primary hover:bg-primary/90`; secondary/outline: border and text primary. Use “Start Free Trial” and “Book a Demo” consistently; at least one clear CTA per public page.

### 4.4 Landing-specific

- Hero: strong headline and subhead; primary CTA; optional secondary. Sticky CTA bar / floating WhatsApp: match legacy styling (orange). FAQ accordion and trust badges: spacing and alignment.

### 4.5 Public inner pages

- Pattern: Hero (gradient or subtle bg, title + short description) then content. Same section padding and container; `text-primary` for key phrases and buttons. FeaturesPage: module cards with consistent spacing and primary accents. PricingPage: clear plan cards and primary CTA per plan. ContactPage: form and contact block balanced; primary submit button.

---

## File-level checklist (path + one-line action)

| # | File path | Action |
|---|-----------|--------|
| 1 | `frontend/src/config/seo.ts` | Extend: add canonical (or buildCanonical), optional og/twitter fields in SeoMeta; ensure all public paths covered. |
| 2 | `frontend/src/components/Seo.tsx` | Add canonical link; og:* and twitter:* meta; optional JSON-LD/breadcrumbs per route. |
| 3 | `frontend/index.html` | Set default title and meta description; keep lang/viewport. |
| 4 | `frontend/src/pages/Landing.tsx` | Align copy with legacy; ensure SEO driven by config; optional JSON-LD. |
| 5 | `frontend/src/components/public/PublicLayout.tsx` | Nav active state; full footer with contact block (info@prime7erp.com, phone, WhatsApp, Facebook, address); footer link columns per legacy. |
| 6 | `frontend/src/components/public/PublicFooter.tsx` | Optional: extract footer from PublicLayout; implement contact block + link columns. |
| 7 | `frontend/src/pages/public/AboutPage.tsx` | Align values/team copy with legacy; branding consistent. |
| 8 | `frontend/src/pages/public/ContactPage.tsx` | Contact email info@prime7erp.com (support@prime7erp.com where relevant); align form and contact block with legacy. |
| 9 | `frontend/src/pages/public/FeaturesPage.tsx` | Align feature copy with legacy. |
| 10 | `frontend/src/pages/public/PricingPage.tsx` | Align plans/copy with legacy. |
| 11 | `frontend/src/pages/public/GarmentsErpPage.tsx` | Align copy with legacy garments-erp. |
| 12 | `frontend/src/pages/public/BuyingHouseErpPage.tsx` | Align copy with legacy buying-house-erp. |
| 13 | `frontend/src/pages/public/HowItWorksPage.tsx` | Align steps/copy with legacy. |
| 14 | `frontend/src/pages/public/SecurityPage.tsx` | Align copy with legacy. |
| 15 | `frontend/src/pages/public/ErpBangladeshPage.tsx` | Align copy with legacy; add route alias /erp-software-bangladesh if desired. |
| 16 | `frontend/src/pages/public/ErpComparisonPage.tsx` | Align copy with legacy. |
| 17 | `frontend/src/pages/public/PrivacyPage.tsx` | Align legal copy with legacy. |
| 18 | `frontend/src/pages/public/TermsPage.tsx` | Align legal copy with legacy. |
| 19 | `frontend/src/pages/public/BlogPage.tsx` | Decide Blog vs Resources; port content or keep “Coming soon”. |
| 20 | `frontend/src/pages/public/SupportPage.tsx` | If kept: ensure SEO and copy; else remove and point footer to /contact#support. |
| 21 | `frontend/src/app/router.tsx` | Add /erp-software-bangladesh → ErpBangladeshPage if alias desired; add /resources if used. |
| 22 | `frontend/src/components/public/landing/LandingEnhancements.tsx` | Polish typography, spacing, primary color. |
| 23 | `frontend/tailwind.config.js` | Confirm primary = brand orange. |
| 24 | `frontend/public/images/` | Ensure logo.png (header) and logo-white (footer) exist. |
| 25 | `frontend/src/hooks/useCurrency.ts` | Add only if currency selector implemented; persist in localStorage. |

---

## Summary

- **Task 1 (Comparison):** Page mapping table and content/structure checklist so implementers know exactly what to compare (headings, copy, contact block, branding, CTAs, footer/nav).
- **Task 2 (Content fix):** Contact details (info@prime7erp.com, support@prime7erp.com, phone, WhatsApp, address, Facebook); About, Contact, Blog/Resources, Support, ERP Bangladesh; copy pass on Landing, Features, Pricing, Garments, Buying House, How it works, Security, Comparison, Privacy, Terms; footer link consistency.
- **Task 3 (SEO & design flow):** Extend existing Seo + config with canonical, OG, Twitter; default title/description in index.html; navbar active state and footer structure/flow per legacy.
- **Task 4 (Polish):** Primary (orange) theme, typography, spacing, CTAs across landing and public pages.

Implementing agents can follow Task 1 first for comparison, then Task 2 (content) and Task 3 (SEO/layout) in parallel where possible; Task 4 applies throughout. Use the file-level checklist for execution order and dependencies.
