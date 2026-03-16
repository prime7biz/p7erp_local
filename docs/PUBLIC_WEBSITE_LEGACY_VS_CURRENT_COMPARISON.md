# Public Website: Legacy vs Current Comparison

Reference for parity between **Replit legacy** (PrimeX) and **current** (p7erp_local) public site.

- **Legacy:** `replit-legacy/primeX-ERP/client/src/pages/public/` + `components/public/` (navbar, footer, SEOHead).
- **Current:** `frontend/src/pages/Landing.tsx`, `frontend/src/pages/public/*.tsx`, `frontend/src/components/public/PublicLayout.tsx`.

---

## Contact info (aligned)

| Channel   | Legacy              | Current (after fixes)   |
|----------|---------------------|--------------------------|
| Main     | info@prime7erp.com  | info@prime7erp.com       |
| Support  | support@prime7erp.com | support@prime7erp.com  |
| Phone    | +880 1892-787220    | +880 1892-787220         |
| Address  | Gulshan-2, Dhaka 1212, Bangladesh | Same |
| WhatsApp | wa.me/8801892787220 | wa.me/8801892787220      |

---

## Branding

- **Legacy:** Prime7, Prime7 ERP.
- **Current:** Public and marketing copy use **Prime7 ERP**; SEO config and JSON-LD use **Prime7 ERP**. App shell (login, signup, sidebar) uses "Prime7 ERP".

---

## SEO

| Feature        | Legacy                    | Current (after fixes)                          |
|----------------|---------------------------|------------------------------------------------|
| Title/description | SEOHead per page       | Seo.tsx + config/seo.ts for all public routes  |
| Canonical      | Yes                       | Yes (Seo.tsx, SITE_URL)                        |
| Open Graph     | og:title, og:description, og:url, og:site_name | Yes in Seo.tsx        |
| Twitter        | twitter:card, title, description | Yes in Seo.tsx                    |
| JSON-LD        | Landing (Org, LocalBusiness, SoftwareApplication, FAQPage); Contact (LocalBusiness); Features/Pricing (FAQPage) | Landing: Organization + SoftwareApplication; Contact: LocalBusiness |

---

## Page mapping

| Page           | Legacy path                    | Current path / file           |
|----------------|--------------------------------|-------------------------------|
| Landing        | landing.tsx                    | Landing.tsx                   |
| About          | about.tsx                      | public/AboutPage.tsx          |
| Features       | features.tsx                   | public/FeaturesPage.tsx       |
| Pricing        | pricing.tsx                    | public/PricingPage.tsx        |
| Contact        | contact.tsx                    | public/ContactPage.tsx        |
| Garments ERP   | garments-erp.tsx               | public/GarmentsErpPage.tsx    |
| Buying House   | buying-house-erp.tsx           | public/BuyingHouseErpPage.tsx |
| Security       | security.tsx                   | public/SecurityPage.tsx      |
| How it works   | how-it-works.tsx               | public/HowItWorksPage.tsx     |
| ERP Bangladesh | erp-software-bangladesh.tsx    | public/ErpBangladeshPage.tsx  |
| ERP Comparison | erp-comparison.tsx             | public/ErpComparisonPage.tsx  |
| Blog/Resources | resources.tsx (+ article slugs)| public/BlogPage.tsx           |
| Support        | (footer → /contact#support)    | public/SupportPage.tsx        |
| Privacy        | privacy.tsx                    | public/PrivacyPage.tsx       |
| Terms          | terms.tsx                      | public/TermsPage.tsx          |

---

## Structure gaps (current vs legacy)

- **Modules:** Legacy has `/modules/merchandising`, `/modules/inventory`, etc. Current footer links all to `/features`.
- **Resources:** Legacy has full blog + article slugs (`/resources/...`). Current has Blog "Coming soon" at `/blog`.
- **ERP Comparison:** Legacy has competitor table (Prime7 vs SAP vs Oracle vs Tally). Current has "What sets us apart" bullets only.
- **How it works:** Legacy has 4-week timeline and support block. Current has 3 steps + CTA only.
- **ERP Bangladesh:** Legacy has value-props grid and industries. Current has shorter single block.

---

## Related docs

- **Plan:** [PUBLIC_WEBSITE_UPGRADE_PLAN.md](PUBLIC_WEBSITE_UPGRADE_PLAN.md) – implementation tasks and file checklist.
