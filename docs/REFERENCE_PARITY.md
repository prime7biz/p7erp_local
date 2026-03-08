# P7 ERP – Reference parity with PrimeX (replit-legacy)

Goal: Make P7 **structurally and behaviorally the same** as the reference (PrimeX) using our stack (Python FastAPI + React), then develop more. The reference is in `replit-legacy/primeX-ERP/`.

---

## 1. Auth (match reference)

- **Login:** Company Code + Username + Password (reference). We support both: Company Code (resolve tenant by `company_code`) or Tenant ID, and Username or Email for user lookup.
- **Register:** Tenant registration (company name → tenant with `company_code`) + first user. Reference has approval status (PENDING/APPROVED/REJECTED); we can add later.
- **Session:** Reference uses cookie; we use JWT in header. Response shape: return user + tenant info (name, companyCode, businessType) on login/me.

---

## 2. Public website (same routes and structure)

| Route | Reference | P7 |
|-------|-----------|-----|
| `/` | Landing (hero, modules, workflow, AI, security, pricing, FAQ, CTA) | **Done** – same structure, P7 branding |
| `/features` | Public features page | Done (content page) |
| `/pricing` | Pricing | Done (placeholder) |
| `/about` | About | Done |
| `/contact` | Contact | Done |
| `/garments-erp` | SEO/landing | Done (placeholder) |
| `/buying-house-erp` | SEO/landing | Done (placeholder) |
| `/modules/*` | Module marketing pages | Optional later |
| `/resources`, `/resources/:slug` | Blog/resources | Optional later |

Public layout: navbar (Features, Pricing, About, Contact, Log in, Sign up) + footer.

---

## 3. App area – sidebar and routes (same as reference)

App lives under `/app`. Sidebar sections must match reference (visibility by tenant type: manufacturer / buying_house / both where applicable).

### Sections and main routes

| Section | Reference path examples | P7 route (under /app) |
|---------|-------------------------|------------------------|
| Dashboard | `/`, `/dashboard` | `/app`, `/app/dashboard` |
| Merchandising | `/customers`, `/inquiries`, `/quotations`, `/orders`, `/merchandising/styles`, `/bom`, `/commercial`, `/followup`, `/parties`, `/flow` | Same paths under `/app` |
| Export & Import | `/commercial/export-cases`, `/commercial/proforma-invoices`, `/commercial/btb-lcs`, `/logistics` | Same under `/app` |
| Inventory | `/inventory`, `/inventory/warehouses`, `/inventory/purchase-orders`, `/inventory/goods-receiving`, etc. | Same under `/app` |
| Manufacturing | `/samples`, `/tna/*`, `/production`, `/production/planning`, `/production/cutting`, `/production/sewing`, `/production/finishing-packing`, `/production/ie` | Same under `/app` (visible for manufacturer / both) |
| Quality | `/quality/dashboard`, `/quality/inspections`, `/quality/lab-tests`, `/quality/capa`, `/quality/returns` | Same under `/app` |
| AI Tools | `/ai/assistant`, `/ai/automation`, `/ai/predictions` | Same under `/app` |
| HR | `/hr/employees`, `/hr/payroll`, `/hr/performance`, `/hr/attendance` | Same under `/app` |
| Finance | `/accounts`, `/accounts/vouchers`, `/accounts/reports/*`, `/finance/*`, `/banking/*`, etc. | Same under `/app` |
| Workflow | `/approvals` | `/app/approvals` |
| Reports | `/reports`, etc. | `/app/reports` |
| Settings | `/settings`, user management, roles, tenant, currency, departments, accounting periods, backup, activity logs | Same under `/app/settings` |

Implementation order: first **scaffold all routes** with placeholder pages (title + “Coming soon” or empty state). Then fill modules one by one (same workflow as reference).

---

## 4. Backend API (match reference)

- **Tenant:** Resolve by `company_code` (login, optional on other APIs). All tenant-scoped tables have `tenant_id`; every query filtered by tenant.
- **Modules:** Each reference API prefix has a corresponding P7 module under `backend/app/modules/` (e.g. inquiries, quotations, orders, inventory, production, accounts, …). Start with CRUD and key flows from reference.

---

## 5. Phases

- **Phase 1 (current):** Auth (company code + username login), public pages (Features, Pricing, Contact, About), full app sidebar with all sections and placeholder routes. Register: ensure tenant has `company_code` (from signup or generated).
- **Phase 2:** Core merchandising (Customers, Inquiries, Quotations, Orders) – backend + frontend matching reference flows.
- **Phase 3:** Inventory (items, warehouses, PO, GRN, stock), then Manufacturing (samples, TNA, production), then Quality, then Finance/Accounts.
- **Phase 4:** Commercial (export cases, PI, BTB LCs), HR, Reports, remaining settings and workflows.

---

## 6. Reference sources

- **Frontend routes:** `replit-legacy/primeX-ERP/client/src/App.tsx`, `AppArea.tsx`, `components/layout/sidebar.tsx`
- **Backend routes:** `replit-legacy/primeX-ERP/server/routes.ts`
- **Auth:** `server/auth-routes.ts`, `pages/auth/login.tsx`
- **Public:** `pages/public/landing.tsx`, `components/public/public-layout.tsx`
