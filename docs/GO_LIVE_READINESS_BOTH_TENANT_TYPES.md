# Go-Live Readiness — Manufacturer & Buying House

**Purpose:** One practical checklist before real users start on production.  
**Audience:** Business owner, operations lead, and technical team.  
**Last updated:** 2026-06-05

---

## How to use this document

1. Pick your **tenant type** (see table below).
2. Complete **Section A** (platform) — required for everyone.
3. Complete **Section B** (shared business modules) — required for everyone.
4. Complete **Section C** (manufacturer) and/or **Section D** (buying house) as applicable.
5. If tenant type is **`both`**, complete **C + D**.
6. Mark each box: `[x]` Pass · `[ ]` Fail · `[N/A]` Not in scope for this go-live.
7. Use the **Decision matrix** at the end for GO / NO-GO.

| Tenant type | What it means | Extra sections |
|-------------|---------------|----------------|
| `manufacturer` | Factory / production company | Section C only |
| `buying_house` | Sourcing / export-import office | Section D only |
| `both` | Company does manufacturing **and** buying house work | Sections C **and** D |

**Out of scope (do not block go-live):** retail POS, consumer e-commerce (Shopify), global multi-country tax engines, GPS fleet tracking.

**Engineering evidence (2026-06-05):** `docs/GO_LIVE_UAT_EVIDENCE.md` — 342 pytest passed, new HR/trade/inventory HTTP tests passed.

**Related deep-dive docs:**

| Area | Document |
|------|----------|
| UAT evidence | `docs/GO_LIVE_UAT_EVIDENCE.md` |
| Production hardening | `docs/GO_LIVE_PRODUCTION_HARDENING.md` |
| Cutover runbook | `docs/GO_LIVE_CUTOVER_RUNBOOK.md` |
| Platform & deploy | `docs/PRODUCTION_READINESS_AUDIT.md`, `docs/BUILD_VERIFICATION.md` |
| Finance | `docs/FINANCE_GO_LIVE_CRITERIA.md`, `docs/FINANCE_UAT_CHECKLIST.md`, `docs/FINANCE_UAT_TEST_CASES.md` |
| HR | `docs/HR_GO_LIVE_CRITERIA.md`, `docs/HR_UAT_CHECKLIST.md`, `docs/HR_UAT_TEST_CASES.md` |
| Trade (buying house) | `docs/TRADE_GO_LIVE_CRITERIA.md`, `docs/TRADE_UAT_CHECKLIST.md` |
| Inventory ↔ Finance | `docs/INVENTORY_FINANCE_UAT.md` |
| Finance cutover | `docs/FINANCE_CUTOVER_PLAN.md` |
| HR cutover | `docs/HR_CUTOVER_PLAN.md` |

---

## Section A — Platform & security (all tenant types)

### A1. Build and deploy

- [ ] `docker compose build` succeeds (cached build; avoid `--no-cache` unless debugging).
- [ ] `docker compose exec backend alembic upgrade head` runs with no errors on staging/production DB.
- [ ] Frontend production build succeeds (`npm run build` or frontend Docker image build).
- [ ] `VITE_API_BASE_URL` at build time points to the **live** API URL.
- [ ] Host Nginx / TLS: users access the app over **HTTPS**; API CORS lists only real origins.

### A2. Secrets and bootstrap

- [ ] Strong unique `JWT_SECRET` in production `.env` (never committed to Git).
- [ ] `DATABASE_URL` is production credentials; backup enabled.
- [ ] First-user registration is **not** open on the public internet (`BOOTSTRAP_REGISTRATION_KEY` or per-tenant bootstrap token).
- [ ] Redis / Celery (if used): URLs set and services healthy.

### A3. Operations

- [ ] Backup schedule + **restore drill** documented (who / when / result).
- [ ] Rollback plan agreed: `git revert`, `alembic downgrade`, feature-flag off.
- [ ] Support path: users know how to open tickets; ops can read API logs.
- [ ] Post-deploy smoke (production tenant):
  - [ ] Login with company code + user + password
  - [ ] Open one list (e.g. Customers) — no 500 errors
  - [ ] One small create/edit works
  - [ ] Logout and login again

**Hard gate:** All A1–A3 items must pass before business modules go live.

---

## Section B — Shared business foundation (all tenant types)

These modules appear for **manufacturer**, **buying_house**, and **both**.

### B1. Tenant setup

- [ ] Company name, `company_code`, and tenant type (`manufacturer` | `buying_house` | `both`) are correct.
- [ ] At least one **admin** and one **manager** user exist; roles reviewed in **Settings → Roles**.
- [ ] Currency and exchange rates configured (**Settings → Currency** or **Finance → Multi-Currency**).
- [ ] Departments / cost centers created if finance or trade will use them.

### B2. Merchandising chain (core B2B flow)

Run end-to-end on a **staging or pilot tenant** (or Lakhsma demo tenant for practice):

- [ ] **Customer** — create / edit / list
- [ ] **Inquiry** — create, link customer, target price
- [ ] **Quotation** — costing lines, materials/CM/other costs, submit
- [ ] **Order** — convert from quotation; order pipeline shows correct stage
- [ ] **Garment style + BOM** — style linked; BOM approved or frozen before planning handoff
- [ ] **Consumption plan** — material requirement visible for order
- [ ] **Merch control tower** — summary loads for active orders
- [ ] **Critical alerts** — scan runs; alerts assignable
- [ ] **Follow-up / TNA** — plan exists; milestones trackable
- [ ] **Parties** — intermediaries and customer links (if you use agents/buying houses)
- [ ] **Document flow** — inquiry → quotation → order → PI/trade links visible

**Hard gate:** At least one full chain **Customer → Inquiry → Quotation → Order** passes without data loss or wrong tenant data.

### B3. Export & commercial (shared)

- [ ] **Export case** — create and link to order
- [ ] **Proforma invoice (PI)** — create from order/quotation
- [ ] **BTB LC** — create; links to commercial context
- [ ] **Master contracts** — create if your process uses them

### B4. Inventory

- [ ] **Stock master** — items, units, warehouses, stock groups
- [ ] **Vendors** — supplier master
- [ ] **Purchase order** → **GRN** — receive stock; PO partial/close rules OK
- [ ] **Stock movements** — summary and ledger match physical expectation
- [ ] **Warehouse transfer** — OUT/IN paired correctly
- [ ] **Stock adjustment** — signed qty posts correctly
- [ ] **Delivery challan** — draft → posted; stock OUT validated
- [ ] **Gate pass** — issue and link to movement/challan as per your process
- [ ] **Consumption control** — issue against order/BOM where used
- [ ] **FIFO rebuild** run once if using inventory–finance integration (`docs/INVENTORY_FINANCE_UAT.md`)

### B5. Quality

- [ ] QC dashboard loads
- [ ] Inspection create / complete
- [ ] Lab tests (quality checks with lab type)
- [ ] CAPA and returns (if used in your process)

### B6. Finance (if enabling on day one)

Engineering readiness: `docs/FINANCE_UAT_CLOSURE_REPORT.md` (code mapped).  
Business must still execute UAT and sign off.

- [ ] Chart of accounts + account groups seeded or migrated
- [ ] Opening balances approved
- [ ] Active accounting period for go-live month
- [ ] Voucher workflow: draft → submit → approve → post
- [ ] AP/AR bills and allocation smoke test
- [ ] Banking: bank account linked to GL; one payment run test
- [ ] Core reports: Day Book, Trial Balance, Ledger Activity — CSV/print OK
- [ ] **All critical `FIN-UAT-*` cases marked Pass** (`docs/FINANCE_GO_LIVE_CRITERIA.md`)
- [ ] Inventory–finance GL posting smoke (`docs/INVENTORY_FINANCE_UAT.md` U1–U7) if stock posts to GL

**Hard gate (if finance live):** 100% pass on critical finance UAT cases; 0 open High defects on posting/balances/tenant isolation.

### B7. HR (if enabling on day one)

Engineering readiness: `docs/HR_UAT_CLOSURE_REPORT.md` (35/35 automated critical path).  
Business should still validate payroll rules for your company.

- [ ] Departments, designations, employees
- [ ] Attendance entry + regularization (if used)
- [ ] Leave request + approval
- [ ] Payroll: components, structures, period, run, approval, payslip
- [ ] Payroll posts to finance voucher (period lock respected)
- [ ] ESS: employee can see own attendance/leave/payslip only

**Hard gate (if HR live):** Critical HR UAT 100% pass; payroll–finance reconciliation sample approved.

### B8. Workflow & approvals

- [ ] **All Approvals** hub shows pending vouchers, leave, payroll, payment runs, etc.
- [ ] Restricted user cannot approve via UI **or** direct API

### B9. AI (optional — do not block core go-live)

- [ ] Document extract on customer/inquiry/quotation forms (if `GEMINI_ENABLED` or tier-1 AI configured)
- [ ] AI assistant / predictions — smoke test only if you plan to train users on day one

### B10. External portals (optional)

Enable in **Settings → External access** only when ready:

- [ ] `customer_portal_enabled` — customer login, orders, shipments
- [ ] `financier_portal_enabled` — financier login, order book, facilities
- [ ] Demo verification: `seed_financier_full_demo.py` (see `docs/BUILD_VERIFICATION.md`)

---

## Section C — Manufacturer go-live

**Sidebar:** Manufacturing section visible for `manufacturer` and `both`.  
**Not required:** Trade Cases, Trade Control Tower, Logistics (buying-house menus).

### C1. Production setup

- [ ] **Production setup** — lines, sections, shifts configured
- [ ] **Factory calendar** — working days / holidays
- [ ] **Production units** — enable only units you use (knitting, dyeing, printing, etc.) in tenant production settings
- [ ] Optional unit feature flags: `knitting_enabled` etc. if using specialized units

### C2. Planning & orders

- [ ] **Manufacturing orders** — create from order/BOM path you use
- [ ] **Production planning** — pipeline / what-if loads
- [ ] **Line plan board** — plan visible for at least one order
- [ ] Order pipeline stage **BOM_CREATED** requires approved/frozen BOM (governance)

### C3. Shop floor (enable only what you use)

- [ ] Cutting — shop floor + hourly entry
- [ ] Sewing — shop floor + hourly entry
- [ ] Finishing / packing
- [ ] Daily crew sheet + weekly roster
- [ ] Shop-floor QC
- [ ] Optional departments: dyeing, knitting, printing, embroidery, washing, etc.

### C4. IE (if used)

- [ ] Operations library
- [ ] Operation bulletins
- [ ] Line balancing

### C5. Samples & TNA (manufacturing sidebar)

- [ ] Sample requests (`/samples/requests`)
- [ ] TNA dashboard, templates, plans

### C6. Production → inventory decision

- [ ] Business rule documented: when MO/process order completes, how finished goods hit stock (explicit GRN vs auto-post — see `docs/INVENTORY_MODULE_ADVANCEMENT_PLAN.md` §2.6)
- [ ] Process orders for subcontract / processing tested if applicable

### C7. Manufacturer reports

- [ ] Production efficiency report
- [ ] QC summary report
- [ ] Gate passes and challans reports (outbound)

**Manufacturer hard gate:** At least one order flows **Order → BOM → PO/GRN → Production entry → QC → Delivery challan** without manual spreadsheet workaround.

---

## Section D — Buying house go-live

**Sidebar:** Export & Import includes Trade Cases, Trade Control Tower, Logistics when `trade_enabled` is not false.  
**Not required:** Full shop-floor hourly tracking unless tenant type is `both` and you also run a factory.

### D1. Trade module configuration

- [ ] Tenant type is `buying_house` or `both`
- [ ] `tenants.feature_flags.trade_enabled` is **not** `false` (or toggle **Enable Trade** in Settings)
- [ ] Trade RBAC: `trade.create`, `trade.transition`, `trade.document.upload` reviewed on roles
- [ ] Stage flow and required documents match your SOP (`docs/TRADE_MODULE_SOP.md`)

### D2. Trade workflow UAT

Execute `docs/TRADE_UAT_CHECKLIST.md` (minimum):

- [ ] TRADE-UAT-001 — Create trade case from order
- [ ] TRADE-UAT-002 — Add shipment (Logistics)
- [ ] TRADE-UAT-003 — Upload required documents
- [ ] TRADE-UAT-004 — Stage transitions through shipped/docs
- [ ] TRADE-UAT-009 to 013 — Finance linkage (cost center, BTB cap, lifecycle posting, voucher trace, alerts)

### D3. Commercial & finance linkage

- [ ] BTB LC lifecycle posts to correct CoA accounts (LC liability, blocked facility, import bill, payment)
- [ ] LC outstanding report matches business expectation
- [ ] BTB maturity report reviewed
- [ ] Trade overview report (`/app/reports/trade-overview`)

### D4. Logistics & document control

- [ ] Logistics page: shipment linked to trade case
- [ ] Document storage path in backup plan (`media/trade_docs/` or S3)
- [ ] Shipments report

### D5. Parties & buying-house network

- [ ] Parties: buying houses, agents, customer–intermediary links
- [ ] Document flow shows full commercial chain per order

### D6. Financier portal (if used)

- [ ] Financier principal and facility configured
- [ ] Financier can log in and see order book / pipeline / goods movement
- [ ] Financial summary and projections flags set if needed

**Buying house hard gate:** At least one order flows **Customer → Inquiry → Quotation → Order → PI → BTB LC → Trade case → Shipment → Finance posting** with traceable vouchers.

---

## Section E — Tenant type `both` (manufacturer + buying house)

When a single company does **factory work and buying house work**:

- [ ] Complete **Section C** and **Section D** in full
- [ ] Confirm sidebar shows **Manufacturing** and **Trade** menus without confusion
- [ ] Users have role separation: merchandising vs production vs trade vs finance
- [ ] Cost centers / order attribution clear between export cases and factory orders
- [ ] Control towers: Merch control tower + Trade control tower (+ optional Operations control tower if `control_tower_enabled`)
- [ ] One integrated demo order tested across **both** paths (factory production + export/trade docs)

**Both-type hard gate:** No tenant data leak between modules; same `tenant_id` on order, BOM, trade case, vouchers, and inventory movements.

---

## Practice demo (staging / training)

Use Docker seeds to rehearse before production cutover:

```powershell
# Full merchandising → order → PI → LC chain
docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py

# Trade + shipments (set your company code)
docker compose exec backend python scripts/seed_trade_import_export_workflow_demo.py --tenant-code <COMPANY_CODE>

# Inventory QR documents (after interconnected seed)
docker compose exec backend python scripts/seed_document_qr_demo.py

# Financier portal (optional)
docker compose exec backend python scripts/seed_financier_full_demo.py --company-code <COMPANY_CODE>
```

Default Lakhsma company code: `LAKH806201` (override with your tenant).

---

## Readiness scorecard (fill before decision)

**Automated engineering (2026-06-05):** A ✅ B ✅ C ✅ (code) D ✅ (HTTP test) — see `GO_LIVE_UAT_EVIDENCE.md`. Business sign-off rows still require manual UAT.

| Layer | Manufacturer | Buying house | Both |
|-------|:------------:|:------------:|:----:|
| A — Platform | ✅ | ✅ | ✅ |
| B — Shared modules | ✅ | ✅ | ✅ |
| C — Manufacturing | ✅ | N/A | ✅ |
| D — Trade / export | N/A | ✅ | ✅ |
| E — Combined (`both`) | N/A | N/A | ☐ manual |
| Finance sign-off (if live) | ☐ | ☐ | ☐ |
| HR sign-off (if live) | ☐ | ☐ | ☐ |

---

## Decision matrix

| Condition | Result |
|-----------|--------|
| All **hard gates** for your tenant type pass | **GO** |
| Any **hard gate** fails | **NO-GO** — fix and re-run checklist |
| Hard gates pass; some **soft** items open (reports polish, optional AI) | **GO with risk acceptance** — business owner signs written acceptance |
| Phased go-live (e.g. merchandising + inventory first; finance week 2) | **GO phased** — document which sections are live and date for next wave |

### Hard gates summary

1. Platform smoke (Section A) — **always**
2. Merch chain Customer → Inquiry → Quotation → Order (Section B2) — **always**
3. Inventory PO → GRN → stock movement (Section B4) — **always**
4. Manufacturer production path (Section C) — **`manufacturer` / `both`**
5. Trade case + shipment + finance linkage (Section D) — **`buying_house` / `both`**
6. Finance critical UAT — **if finance live day one**
7. HR critical UAT + payroll posting — **if HR live day one**

---

## Sign-off sheet

### Technical lead

- Name:
- Date:
- Tenant type(s) going live: `manufacturer` / `buying_house` / `both`
- Modules enabled day one: Merch / Inventory / Mfg / Trade / Finance / HR / Portals
- Decision: GO / NO-GO / GO phased / GO with risk acceptance
- Notes:

### Business owner

- Name:
- Date:
- Decision:
- Approved go-live date:
- Phased scope (if any):

### Project owner (final)

- Name:
- Date:
- Final decision:

---

## Revision history

| Date | Change |
|------|--------|
| 2026-06-05 | Initial checklist for manufacturer, buying house, and both |
